// 規則1つにつき「**その規則を実際に出す最小の定義**」を1つ持つ（`hatake rules` が添える）。
//
// なぜ要るか: 規則の表（[WARNING_RULES] / [ADVICE_RULES]）は**名前の集合**までは機械が
// 突き合わせている（実装が出しうる名前と表の鍵が完全一致）。けれど**説明が中身と
// 合っているか**は誰も見ていない ── 「こう書くと、こうなります」の文だけが古くなって
// いても、名前が揃っている限り CI は緑のままになる。
//
// 転ぶ定義を1つ持てば、そこまで機械で言える:
//   ・その定義をかけると、**本当にその規則が出る**（出なければ落とす）
//   ・規則を消した／条件を変えたのに表を直していなければ、そこで落ちる
//   ・AI は「規則の説明」と「転ぶ実例」を**1回で引ける**（`hatake rules <規則>`）
//
// 決めごと:
//   ・**出どころは2つ**で、優先順位を決める（同じ規則に2つ持たない）:
//       1. `spec/rule-cases.json` … この仕掛けのために書いた最小の定義
//       2. `spec/failures.json`   … 実際に転んだ記録（`diagnosis.warnings`）
//     実例が在る規則に最小の定義を足す必要は無い（**実例のほうが人に効く**）。
//   ・**「出た」は規則名で見る。** 文言では見ない（言い回しを直しただけで落ちると、
//     誰も文言を直さなくなる）。
//   ・**覆えていない規則は数えて出す。** 黙って「全部見ています」と言わない。
//   ・助言は `findAdvice`、警告は `findWarnings`＝**判定は本物**（試験用の別実装を
//     作らない）。

import { parse as parseYamlText, stringify as toYaml } from "yaml";

import { findAdvice } from "./advise.js";
import type { FailureCatalog } from "./failures.js";
import type { DefinitionRegistry } from "./refs.js";
import type { RuleEntry, RulesCatalog } from "./rules.js";
import { findWarnings, type WarningOptions } from "./warnings.js";

type Dict = Record<string, unknown>;

/** 転ぶ定義1件（`spec/rule-cases.json`）。 */
export interface RuleCase {
  /** どの規則を出す定義か。 */
  rule: string;
  /** なぜこう書くと出るか（1行。人が読む所）。 */
  why?: string;
  /** 画面1枚で出せる規則はこちら（`page:` の中身）。 */
  page?: Dict;
  /** アプリの外枠が要る規則はこちら（`app:` を含む document まるごと）。 */
  document?: Dict;
  /**
   * その定義が**読み手に通るか**（既定 true）。
   *
   * false = 解析の時点で断られる書き方（`validators: [required]` のように、型が
   * 違うもの）。その規則は**素の YAML を見る道具**（`advise` / `check`）だけが言う。
   * 読み手が通すようになったら試験が落ちる＝印の置きっぱなしを防ぐ。
   */
  readable?: boolean;
  /** 外との辻褄を見る規則（`unknown-*`）に要る登録済み一覧。 */
  registry?: DefinitionRegistry;
  /** その一覧が動いているアプリの申告か。 */
  registryFromApp?: boolean;
}

export interface RuleCaseCatalog {
  $comment?: string;
  cases: RuleCase[];
}

/** どの紙から来た定義か（人が辿れるように必ず持つ）。 */
export type RuleCaseSource = "rule-cases" | "failure";

/** 走らせる形にした1件。 */
export interface RuleCaseEntry {
  rule: string;
  kind: RuleEntry["kind"];
  source: RuleCaseSource;
  /** その紙の中の id（実例なら `failures.json` の id）。 */
  from?: string;
  why?: string;
  /** 読み手に通る定義か（[RuleCase.readable]）。 */
  readable: boolean;
  document: Dict;
  options: WarningOptions;
}

/** 走らせた結果1件。 */
export interface RuleCaseResult extends RuleCaseEntry {
  /** その規則が本当に出たか。 */
  fired: boolean;
  /** 出た規則の全部（出なかったときに、代わりに何が出たかを見せる）。 */
  got: string[];
}

export interface RuleCaseReport {
  results: RuleCaseResult[];
  /** 転ばなかった＝説明と中身が合っていない（ここが空でなければ落とす）。 */
  broken: RuleCaseResult[];
  /** 表に無い規則名で書いてある定義（消えた規則の置き土産）。 */
  unknown: string[];
  /** まだ転ぶ定義を持っていない規則。 */
  missing: string[];
  /** 覆えた数 / 規則の全部。 */
  covered: number;
  total: number;
}

/** 走らせる document（`page:` だけ書いてあれば包む）。 */
export function caseDocument(one: RuleCase): Dict {
  const body = one.document ?? { page: one.page ?? {} };
  return { dsl_version: "1.0", ...body };
}

/**
 * 転ぶ定義を集める（出どころの優先順位はここが正）。
 *
 * 同じ規則に2つ在っても**先に書いてあるほうだけ**を使う＝走らせる定義と、`rules` が
 * 見せる定義がズレない。
 */
export function ruleCaseEntries(input: {
  rules: RulesCatalog;
  cases?: RuleCaseCatalog;
  failures?: FailureCatalog;
}): { entries: RuleCaseEntry[]; unknown: string[] } {
  const kinds = new Map<string, RuleEntry["kind"]>();
  for (const one of input.rules.warnings) kinds.set(one.rule, "warning");
  for (const one of input.rules.advice) kinds.set(one.rule, "advice");

  const entries: RuleCaseEntry[] = [];
  const unknown: string[] = [];
  const taken = new Set<string>();
  const add = (
    rule: string,
    source: RuleCaseSource,
    document: Dict,
    options: WarningOptions,
    extra: { from?: string; why?: string; readable?: boolean } = {},
  ): void => {
    const kind = kinds.get(rule);
    if (kind === undefined) {
      const where = extra.from === undefined ? source : `${source}/${extra.from}`;
      unknown.push(`${rule}（${where}）`);
      return;
    }
    if (taken.has(rule)) return;
    taken.add(rule);
    entries.push({
      rule,
      kind,
      source,
      readable: extra.readable ?? true,
      document,
      options,
      ...extra,
    });
  };

  for (const one of input.cases?.cases ?? []) {
    add(
      one.rule,
      "rule-cases",
      caseDocument(one),
      {
        ...(one.registry === undefined ? {} : { registry: one.registry }),
        ...(one.registryFromApp === undefined
          ? {}
          : { registryFromApp: one.registryFromApp }),
      },
      {
        ...(one.why === undefined ? {} : { why: one.why }),
        ...(one.readable === undefined ? {} : { readable: one.readable }),
      },
    );
  }
  for (const failure of input.failures?.failures ?? []) {
    for (const rule of failure.diagnosis.warnings ?? []) {
      add(
        rule,
        "failure",
        parseYamlText(`${failure.wrote.join("\n")}\n`) as Dict,
        failure.registry === undefined ? {} : { registry: failure.registry },
        { from: failure.id, why: failure.title },
      );
    }
  }
  return { entries, unknown };
}

/** 走らせる（**判定は本物**＝警告も助言も、いつも使っているものを呼ぶ）。 */
export function runRuleCases(
  entries: RuleCaseEntry[],
  rules: RulesCatalog,
  unknown: string[] = [],
): RuleCaseReport {
  const results: RuleCaseResult[] = entries.map((one) => {
    const got =
      one.kind === "warning"
        ? findWarnings(one.document, one.options).map((w) => w.rule)
        : findAdvice(one.document).map((a) => a.rule);
    return { ...one, got: [...new Set(got)].sort(), fired: got.includes(one.rule) };
  });
  const all = [...rules.warnings, ...rules.advice].map((one) => one.rule);
  const covered = new Set(results.map((one) => one.rule));
  return {
    results,
    broken: results.filter((one) => !one.fired),
    unknown,
    missing: all.filter((one) => !covered.has(one)).sort(),
    covered: covered.size,
    total: all.length,
  };
}

/** 人が読む形。**数が先**（一覧は読まれないが、数は読まれる）。 */
export function renderRuleCases(report: RuleCaseReport): string {
  const out: string[] = [];
  const from = (source: RuleCaseSource): number =>
    report.results.filter((one) => one.source === source).length;
  out.push(
    `規則 ${report.total} 件のうち ${report.covered} 件に「転ぶ定義」があります` +
      `（最小の定義 ${from("rule-cases")}・実際に転んだ記録 ${from("failure")}）。`,
  );
  out.push(
    `その ${report.results.length} 件を**実際にかけました**` +
      `（出た ${report.results.length - report.broken.length}・` +
      `出なかった ${report.broken.length}）。`,
  );
  if (report.broken.length > 0) {
    out.push("");
    out.push("**説明のとおりに転びません**（表と中身が食い違っています）:");
    for (const one of report.broken) {
      const where = one.from === undefined ? one.source : `${one.source}/${one.from}`;
      out.push(
        `  ${one.rule}（${where}）` +
          `   代わりに出たもの: ${one.got.length === 0 ? "なし" : one.got.join(" / ")}`,
      );
    }
  }
  if (report.unknown.length > 0) {
    out.push("");
    out.push("表に無い規則の定義が残っています（規則が消えた／名前が変わった）:");
    for (const one of report.unknown) out.push(`  ${one}`);
  }
  if (report.missing.length > 0) {
    out.push("");
    out.push(
      `まだ転ぶ定義が無い規則が ${report.missing.length} 件あります` +
        "（**この規則は説明が中身と合っているか見ていません**）:",
    );
    out.push(`  ${report.missing.join(" / ")}`);
  }
  out.push("");
  out.push(
    "※ 見ているのは**その規則が出ること**だけです（言い回し・直し方の文が正しいかは" +
      "見ていません）。",
  );
  return out.join("\n");
}

/** その定義を YAML で（**そのまま貼って試せる形**で渡す）。 */
export const ruleCaseYaml = (entry: RuleCaseEntry): string =>
  toYaml(entry.document, { lineWidth: 0 }).trimEnd();

/**
 * 規則1つに添える「転ぶ定義」の見せ方。
 *
 * **その定義が本当にその規則を出すことは CI が確かめている**（[runRuleCases]）ので、
 * ここに出ているものは「たぶんこうなるはず」ではない。
 */
export function renderRuleCase(entry: RuleCaseEntry): string {
  const out: string[] = [];
  out.push(`この規則が出る定義（${entry.source === "failure" ? "実際に転んだ記録" : "最小の例"}${entry.from === undefined ? "" : ` / ${entry.from}`}）:`);
  if (entry.why !== undefined) out.push(`  なぜ: ${entry.why}`);
  if (!entry.readable) {
    out.push(
      "  ※ この書き方は**読み手が先に断ります**（`validate` は解析エラーになる）。" +
        "この規則は素の YAML を見る道具（`advise` / `check`）が言います。",
    );
  }
  if (entry.options.registry !== undefined) {
    out.push(
      `  ※ この規則は**登録済み一覧を渡したときだけ**出ます` +
        `（--registry に ${JSON.stringify(entry.options.registry)}` +
        `${entry.options.registryFromApp === true ? " を、動いているアプリの申告として" : ""}）。`,
    );
  }
  out.push("");
  for (const line of ruleCaseYaml(entry).split("\n")) out.push(`  ${line}`);
  out.push("");
  out.push(
    "この定義をかけると必ずこの規則が出ます（CI が全部の規則について走らせています）。",
  );
  return out.join("\n");
}
