// 警告と助言の全部を、引ける形で出す（`hatake rules`）。
//
// 立ち位置は `spec/reference.json` と同じ ── **引けるから仕様書を読まなくていい**。
// いままで「`groupby-without-sort` と言われた。で、それは何か」を引く先が無く、
// AI は仕様書を全文読むか、その警告を出す定義を作って転ばせるしかなかった。
//
// 混ぜないものは混ぜない:
//   ・**警告** … 書いたのに効かない。事実なので CI で落としてよい
//   ・**助言** … 書いていないから不便かもしれない。好みなので終了コードを変えない
// 1枚にするが `kind` で分け、読む人が取り違えないように出力でも毎回言う。
//
// この1枚が嘘をつかないための仕掛けは [ruleNames]。**実装が出しうる規則名**を機械で
// 数えて、表と完全一致することを試験が見る（新しい警告を足したら表に書くまで通らない。
// 消した規則が表に残っていても落ちる）。

import { BUILTIN_RULES } from "./adviseRules.js";
import { ADVICE_RULES, WARNING_RULES, type RuleDoc } from "./warningRules.js";

/** 規則1件（引く形）。 */
export interface RuleEntry extends RuleDoc {
  rule: string;
  /** `warning` = 書いたのに効かない（事実） / `advice` = 書いていないと不便かも（好み）。 */
  kind: "warning" | "advice";
  /**
   * 助言だけが持つつまみ（`--rules` の `options` で変えられる目盛り）。
   * 空の規則は持たない＝**つまみが無い**（切るか切らないかだけ）。
   */
  knobs?: Record<string, "number" | "strings">;
}

/** 引いた結果1式。 */
export interface RulesCatalog {
  warnings: RuleEntry[];
  advice: RuleEntry[];
}

const entry = (
  rule: string,
  kind: RuleEntry["kind"],
  doc: RuleDoc,
  knobs?: Record<string, "number" | "strings">,
): RuleEntry => ({
  rule,
  kind,
  ...doc,
  ...(knobs === undefined || Object.keys(knobs).length === 0 ? {} : { knobs }),
});

/**
 * 全部（名前順）。`only` を渡すとその規則だけ。
 *
 * 知らない名前を渡されたら**空ではなく投げる**（「その規則はありません」と言われないと、
 * 引けなかったのか規則が無いのか分からない）。
 */
export function rulesCatalog(only?: string): RulesCatalog {
  const warnings = Object.entries(WARNING_RULES)
    .map(([rule, doc]) => entry(rule, "warning", doc))
    .sort((a, b) => a.rule.localeCompare(b.rule));
  const advice = Object.entries(ADVICE_RULES)
    .map(([rule, doc]) => entry(rule, "advice", doc, BUILTIN_RULES[rule]))
    .sort((a, b) => a.rule.localeCompare(b.rule));
  if (only === undefined) return { warnings, advice };

  const mine = { warnings: pick(warnings, only), advice: pick(advice, only) };
  if (mine.warnings.length + mine.advice.length === 0) {
    throw new Error(
      `"${only}" という規則はありません（hatake rules で全部を引けます）。`,
    );
  }
  return mine;
}

const pick = (list: RuleEntry[], only: string): RuleEntry[] =>
  list.filter((one) => one.rule === only);

/**
 * **実装が出しうる規則名**の全部。
 *
 * 表と突き合わせる相手。数え方はここが正で、増やす所が増えたらここも増やす
 * （増やし忘れれば、その規則は表に無くても通ってしまう＝試験がその穴を塞げなくなる）。
 * 出どころは4つ:
 *   1. `warnings.ts` にそのまま書いてある規則名
 *   2. 参照の種類ごとの表（`REF_KINDS`）
 *   3. ボタンが効く条件の表（`actionNeeds.ts`）
 *   4. 計算と検証で同じ規則を使い回している所（`${owner}-where-*`）
 * 1〜4 はどれも**ソースから数える**（実行して出たものだけを数えると、たまたま例に
 * 出てこない規則が抜ける）。
 */
export function ruleNames(sources: {
  warnings: string;
  actionNeeds: string;
}): string[] {
  const found = new Set<string>();
  // 1・2: `warn(found, "…"` と、表の中の `rule: "…"`。
  for (const source of [sources.warnings, sources.actionNeeds]) {
    for (const m of source.matchAll(/rule: "([a-z0-9-]+)"/g)) found.add(m[1]);
    for (const m of source.matchAll(/warn\(\s*found,\s*"([a-z0-9-]+)"/g)) {
      found.add(m[1]);
    }
  }
  // 4: `${owner}-…` の owner は計算と検証の2つ（[WHERE_OWNERS] と同じ並び）。
  for (const m of sources.warnings.matchAll(
    /warn\(\s*found,\s*`\$\{owner\}(-[a-z-]+)`/g,
  )) {
    for (const owner of WHERE_OWNERS) found.add(`${owner}${m[1]}`);
  }
  return [...found].sort();
}

/**
 * 同じ規則を使い回している持ち主（`computed-where-mode` / `compare-where-mode`）。
 *
 * [warnings] の `owner` と同じ並び。ここに足したら規則名が2つ増えるので、表にも足す
 * ことになる（試験がそう言う）。
 */
export const WHERE_OWNERS = ["computed", "compare"] as const;

/** 人が読む形。 */
export function renderRules(catalog: RulesCatalog): string {
  const out: string[] = [];
  const section = (title: string, list: RuleEntry[], note: string): void => {
    if (list.length === 0) return;
    out.push(`${title}（${list.length} 個）  ${note}`);
    for (const one of list) {
      out.push("");
      out.push(`# ${one.rule}  ${one.what}`);
      out.push(`  こうなる: ${one.happens}`);
      out.push(`  直し方  : ${one.fix}`);
      if (one.pitfall !== undefined) {
        out.push(`  対照表  : hatake pitfalls ${one.pitfall}`);
      }
      if (one.knobs !== undefined) {
        out.push(
          `  つまみ  : ${Object.entries(one.knobs)
            .map(([name, type]) => `${name}（${type === "number" ? "数" : "文字の並び"}）`)
            .join(" / ")}`,
        );
      }
    }
    out.push("");
  };
  section(
    "警告",
    catalog.warnings,
    "＝書いたのに効かない。事実なので --warn-as-error で落とせます。",
  );
  section(
    "助言",
    catalog.advice,
    "＝書いていないから不便かもしれない。好みなので終了コードは変わりません。",
  );
  out.push(RULES_NOTE);
  return out.join("\n");
}

/** この1枚が何で、何でないかを毎回書く。 */
export const RULES_NOTE =
  "※ ここに出るのは**規則そのもの**の話です。1件ごとの「どこで・何が」は " +
  "hatake validate / hatake advise が定義を見て言います（綴り違いの候補・件数・" +
  "紙の実寸は、その場でしか出せません）。**人が決めること**（排他・採番・端数…）は " +
  "どちらにも出てきません＝それは hatake ask の担当です。";
