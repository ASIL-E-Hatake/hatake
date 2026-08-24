// 助言を**そのまま定義に当てる**。
//
// [findAdvice] は「書いていないから不便かもしれない所」を挙げるところまでで、直すのは
// 読んだ人（AI）の仕事だった。ところが YAML を手で書き足すのは、AI がいちばん転ぶ所
// ＝字下げを間違える・隣のキーを巻き込む・配列の何番目かを取り違える。**どこに書くかは
// 機械のほうが正確**なので、そこだけ機械に寄せる。
//
// ここが決めないもの: **書く値**。助言は好みの話で、値（絞り込みに何を出すか・確認の文・
// 1回に何件まで・誰に見せるか）は業務の決めごとなので、機械が決めると嘘になる。
// なので口はこうなっている:
//
//   当てるかどうか … 呼ぶ側が選ぶ（`picks`。全部当てる口は作らない）
//   何を書くか     … 呼ぶ側が渡す（`value`。**定義から決まるものだけ**既定値を持つ）
//   どこに書くか   … ここが決める
//   書けたか       … ここが確かめる
//
// 確かめ方（[fixSource] と同じ考え方。ただし助言は警告ではないので「診断が減る」ではなく
// **「診断が悪くならない」**を条件にする）:
//   1. 1件ずつ文字列に当てて、当てた文字列をもう一度読む
//   2. 定義として読めること・診断が悪くなっていないこと
//   3. **その助言が消えていること**（消えていない＝書いた場所が違う。当てない）
//   4. どれか1つでも駄目なら、その1件を当てずに理由を残す（他は当てる）

import { parseDocument, parse as parseYamlText } from "yaml";
import { type Advice, findAdvice } from "./advise.js";
import { type AdviceRules, BUILTIN_RULES, DEFAULT_RULES } from "./adviseRules.js";
import { ActionScopes } from "./definition.js";
import { diagnoses, notWorse, readable } from "./diagnose.js";
import { type DefinitionRegistry } from "./refs.js";
import { type Path, parsePath, valueAt } from "./shrink.js";
import { applySpans } from "./yamlSpans.js";
import { addKeyAt, appendItemAt, flowText, type Write } from "./yamlWrite.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 当てる助言1件の指定。 */
export interface AdvicePick {
  /** 規則名（`hatake advise` / `hatake_advise` が返す `rule`）。 */
  rule: string;
  /** app のとき、どの画面の助言か。 */
  page?: string;
  /** 同じ規則が2件以上出ているときの絞り込み（助言の `where` をそのまま）。 */
  where?: string;
  /** 書く値。**業務の決めごとは省略できない**（既定値があるものだけ省ける）。 */
  value?: unknown;
}

/** 当てた1件。 */
export interface AppliedAdvice {
  rule: string;
  where: string;
  /** 実際に書き足した文字（1行）。 */
  wrote: string;
  /** そのまま人に見せる1行。 */
  message: string;
}

/** 当てなかった1件（黙って飛ばさない）。 */
export interface SkippedAdvice {
  rule: string;
  where: string;
  reason: string;
}

/** 当てたあとに残っている助言1件（次の1往復で渡す形）。 */
export interface RemainingAdvice {
  rule: string;
  where: string;
  page?: string;
  /** 何を書き足すか（助言の言葉のまま）。 */
  add: string;
}

export interface AdviceApplyResult {
  /** 当てたあとの定義（1件も当てられなければ元のまま）。 */
  source: string;
  applied: AppliedAdvice[];
  skipped: SkippedAdvice[];
  remaining: RemainingAdvice[];
}

/** 書き足し1件の計画（`key` = その道に書く / `append` = その配列の後ろに足す）。 */
interface Plan {
  path: Path;
  kind: "key" | "append";
  value: unknown;
}

/** 助言の道から、その画面の道を取る（`app.pages[2].actions[0].confirm` → `app.pages[2]`）。 */
const pagePathOf = (at: Path): Path => (at[0] === "app" ? at.slice(0, 3) : ["page"]);

/** 名前で場所を選ぶときの候補（どの列・どの項目か）。 */
interface Spot {
  field: string;
  path: Path;
}

const spotsOf = (raw: Dict, at: Path): Spot[] =>
  list(valueAt(raw, at)).flatMap((one, index) => {
    const field = isDict(one) ? str(one.field) : undefined;
    return field === undefined ? [] : [{ field, path: [...at, index] }];
  });

/** 入力できる項目（枠の中とステップの中を区別せず全部）。 */
function fieldSpots(raw: Dict, page: Path): Spot[] {
  const found: Spot[] = [];
  const form = valueAt(raw, [...page, "form"]);
  if (isDict(form)) {
    dicts(form.sections).forEach((_, index) =>
      found.push(...spotsOf(raw, [...page, "form", "sections", index, "fields"])),
    );
  }
  dicts(valueAt(raw, [...page, "steps"])).forEach((_, index) =>
    found.push(...spotsOf(raw, [...page, "steps", index, "fields"])),
  );
  return found;
}

const names = (spots: Spot[]): string =>
  spots.map((one) => one.field).join(" / ") || "なし";

/**
 * 名前で選ぶ規則（どの列・どの項目に書くかは業務の判断なので、名前で受ける）。
 *
 * 知らない名前が混ざっていたら**1件も当てない**（半分だけ書くと、当てた気になって
 * 残りが忘れられる）。
 */
function byField(
  spots: Spot[],
  given: unknown,
  key: string,
  what: string,
): Plan[] | string {
  const wanted = typeof given === "string" ? [given] : given;
  if (
    !Array.isArray(wanted) ||
    wanted.length === 0 ||
    wanted.some((one) => typeof one !== "string")
  ) {
    return (
      `${what}は業務の判断なので、value に項目名を渡してください` +
      `（例 value: ["${spots[0]?.field ?? "orderNo"}"]）。書ける項目: ${names(spots)}`
    );
  }
  const plans: Plan[] = [];
  for (const name of wanted as string[]) {
    const spot = spots.find((one) => one.field === name);
    if (spot === undefined) {
      return `"${name}" という項目はありません（在るのは ${names(spots)}）。`;
    }
    plans.push({ path: [...spot.path, key], kind: "key", value: true });
  }
  return plans;
}

/** その項目の業務名を定義の中から探す（同じ項目が別の場所に出ていれば、それが正）。 */
function labelOf(node: unknown, field: string): string | undefined {
  if (Array.isArray(node)) {
    for (const one of node) {
      const found = labelOf(one, field);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isDict(node)) return undefined;
  if (str(node.field) === field && str(node.label) !== undefined) return str(node.label);
  for (const value of Object.values(node)) {
    const found = labelOf(value, field);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** 1件を指すキーを一覧に足す（列そのものを1本作るので、業務名が要る）。 */
function keyColumn(raw: Dict, at: Path, given: unknown): Plan[] | string {
  if (isDict(given)) return [{ path: at, kind: "append", value: given }];
  const page = valueAt(raw, pagePathOf(at));
  const field = isDict(page) ? str(page.key) : undefined;
  if (field === undefined) return "1件を指すキー（page.key）が読めません。";
  const label = str(given) ?? labelOf(page, field);
  if (label === undefined) {
    return (
      `列に出す名前（label）が定義の中にありません。value に業務名を渡してください` +
      `（例 value: "受注番号"）。画面に出る言葉は業務のものなので、機械には決められません。`
    );
  }
  return [{ path: at, kind: "append", value: { field, label } }];
}

/**
 * その助言をどこに書くか。文字列（＝当てない理由）を返すこともある。
 *
 * 理由には**次に何を渡せばいいか**まで書く（読んだ側がもう1往復で終われるように）。
 */
function planFor(one: Advice, raw: Dict, given: unknown): Plan[] | string {
  const at = parsePath(one.where);
  const key = (path: Path, value: unknown): Plan[] => [{ path, kind: "key", value }];
  const need = (what: string, example: string): string =>
    `${what}は業務の決めごとなので、value に渡してください（例 value: ${example}）。`;

  // 案件の決めごと（require）。場所が1つに決まるのは「全部に書く」形だけ
  // ＝道の終わりがそのキーになっている。
  if (BUILTIN_RULES[one.rule] === undefined) {
    if (at[at.length - 1] !== one.key) {
      return (
        `どこに書くかが決まりません（決めごとが「どれかに書けばよい」形なので）。` +
        `場所を1つに決めるか、every: true にしてください。`
      );
    }
    return given === undefined
      ? need(`\`${one.key}\` に書く値`, "…")
      : key(at, given);
  }

  switch (one.rule) {
    case "money-without-format":
      return key(at, given ?? "currency");

    case "bulk-destructive-without-danger":
      // 道は `…confirm`。確認そのものが無いときは、先に確認を書く話（別の助言）。
      return isDict(valueAt(raw, at))
        ? key([...at, "danger"], true)
        : "確認そのものがまだありません。先に bulk-without-confirm を当ててください" +
            "（確認の文は業務の言葉なので、機械には書けません）。";

    case "key-not-in-table":
      return keyColumn(raw, at, given);

    case "no-sortable-column":
      return byField(spotsOf(raw, at), given, "sortable", "どの列で並べ替えるか");

    case "no-required-field":
      return byField(
        fieldSpots(raw, pagePathOf(at)),
        given,
        "required",
        "どの項目を必須にするか",
      );

    case "no-search-filter":
      return given === undefined
        ? need("絞り込みに何を出すか", "[{ field: orderNo, label: 受注番号 }]")
        : key([...at, "filters"], given);

    case "open-dangerous-action":
      return given === undefined
        ? need("誰に見せるか", '["manager"]')
        : key(at, given);

    case "bulk-without-confirm":
      return given === undefined
        ? need("確認の文", "{ message: '{count} 件を承認します。よろしいですか？' }")
        : key(at, given);

    case "bulk-without-error-message":
      return given === undefined
        ? need(
            "失敗したときの言い方",
            "{ message: '{count} 件のうち {failed} 件が承認できませんでした' }",
          )
        : key(at, given);

    case "report-without-totals":
      return given === undefined
        ? need("何を合計するか", "[{ field: amount, aggregate: sum }]")
        : key(at, given);

    case "bulk-on-many-rows": {
      // 助言は1件しか出ないが、言っているのは**上限の無い一括ぜんぶ**。
      if (given === undefined) {
        return need("1回に動かして良い件数", "20（役割で変えるなら { default: 20, byRole: { manager: 100 } }）");
      }
      const page = pagePathOf(at);
      const plans: Plan[] = dicts(valueAt(raw, [...page, "actions"])).flatMap(
        (action, index) =>
          str(action.scope) === ActionScopes.selection && action.maxRows === undefined
            ? [
                {
                  path: [...page, "actions", index, "maxRows"] as Path,
                  kind: "key" as const,
                  value: given,
                },
              ]
            : [],
      );
      return plans.length === 0 ? "上限の無い一括がもうありません。" : plans;
    }

    case "bulk-confirm-without-count":
      return (
        "確認の文の書き換えは機械にはできません（どこに件数を入れるかで文が変わる）。" +
        "`confirm.message` を自分で書き直してください（`{count}` は一括で埋まります）。"
      );

    default:
      return (
        "この助言は書く場所を機械が指せません（明細の項目や検査の並びは、道に名前が" +
        "入っていないため）。定義を自分で直してください。"
      );
  }
}

/** 計画を文字列に当てる。当てられなければ null（半端には当てない）。 */
function writeAll(source: string, plans: Plan[]): string | null {
  const document = parseDocument(source);
  const edits: Write[] = [];
  for (const plan of plans) {
    const edit =
      plan.kind === "append"
        ? appendItemAt(document, source, plan.path, plan.value)
        : addKeyAt(document, source, plan.path, plan.value);
    if (edit === null) return null;
    edits.push(edit);
  }
  // 同じ所に2件足すと壊れる（後ろから当てるので位置が重なる）。
  const points = new Set(edits.map((edit) => `${edit.at[0]}:${edit.at[1]}`));
  if (points.size !== edits.length) return null;
  return applySpans(source, edits);
}

const remainingOf = (advice: Advice[]): RemainingAdvice[] =>
  advice.map((one) => ({
    rule: one.rule,
    where: one.where,
    ...(one.page === undefined ? {} : { page: one.page }),
    add: one.add,
  }));

/**
 * 選んだ助言を定義に当てる。
 *
 * `picks` は**呼ぶ側が選んだものだけ**。「全部当てる」口は作らない＝助言は好みなので、
 * 機械が全部当てた時点で警告との区別が消える（そうなると誰も助言を読まなくなる）。
 */
export function applyAdvice(
  source: string,
  picks: AdvicePick[],
  options: { rules?: AdviceRules; registry?: DefinitionRegistry } = {},
): AdviceApplyResult {
  const first = parseYamlText(source) as Dict;
  if (!isDict(first)) throw new Error("定義（map）として読めません。");
  const rules = options.rules ?? DEFAULT_RULES;
  const registry = options.registry;

  let text = source;
  let current = first;
  const applied: AppliedAdvice[] = [];
  const skipped: SkippedAdvice[] = [];

  for (const pick of picks) {
    // 毎回引き直す（当てた分はもう出ていない＝同じ助言を2回当てない）。
    const advice = findAdvice(current, rules);
    const hits = advice.filter(
      (one) =>
        one.rule === pick.rule &&
        (pick.where === undefined || one.where === pick.where) &&
        (pick.page === undefined || one.page === pick.page),
    );
    const at = pick.where ?? "-";
    if (hits.length === 0) {
      skipped.push({
        rule: pick.rule,
        where: at,
        reason:
          "その助言は出ていません（もう書いてある・規則名が違う・場所が違う、のどれか）。",
      });
      continue;
    }
    if (hits.length > 1) {
      skipped.push({
        rule: pick.rule,
        where: at,
        reason:
          `同じ規則が ${hits.length} 件出ています。where か page で1件に絞ってください` +
          `（${hits.map((one) => one.where).join(" / ")}）。`,
      });
      continue;
    }
    const one = hits[0];
    const plans = planFor(one, current, pick.value);
    if (typeof plans === "string") {
      skipped.push({ rule: one.rule, where: one.where, reason: plans });
      continue;
    }
    const next = writeAll(text, plans);
    if (next === null) {
      skipped.push({
        rule: one.rule,
        where: one.where,
        reason:
          "文字列のどこに書けばよいか決められません（書く場所が定義の中に無い、" +
          "すでに書いてある、または1行で書けない値）。",
      });
      continue;
    }
    // 当てた文字列をもう一度読んで確かめる。駄目ならこの1件は当てない。
    const reread = parseYamlText(next) as Dict;
    if (!isDict(reread) || !readable(reread)) {
      skipped.push({
        rule: one.rule,
        where: one.where,
        reason: "当てると定義として読めなくなります（value の形を確かめてください）。",
      });
      continue;
    }
    if (!notWorse(diagnoses(current, registry), diagnoses(reread, registry))) {
      skipped.push({
        rule: one.rule,
        where: one.where,
        reason:
          "当てると別の問題が出ます（知らないキーや、効かない指定になる値）。" +
          "value を確かめてください。",
      });
      continue;
    }
    if (
      findAdvice(reread, rules).some(
        (left) => left.rule === one.rule && left.where === one.where,
      )
    ) {
      skipped.push({
        rule: one.rule,
        where: one.where,
        reason:
          "当てても助言が消えません（書いた場所が違う、または value が空です）。" +
          "書いていないことにされるので、当てていません。",
      });
      continue;
    }
    text = next;
    current = reread;
    const wrote = plans
      .map((plan) => writtenText(plan))
      .filter((one) => one !== "")
      .join(" / ");
    applied.push({
      rule: one.rule,
      where: one.where,
      wrote,
      message: `${one.where} [${one.rule}] に ${wrote} を書きました`,
    });
  }

  return {
    source: text,
    applied,
    skipped,
    remaining: remainingOf(findAdvice(current, rules)),
  };
}

/** 「何を書いたか」を1行で言う（定義に入ったのと同じ文字で見せる）。 */
function writtenText(plan: Plan): string {
  const last = plan.path[plan.path.length - 1];
  const value = flowText(plan.value) ?? JSON.stringify(plan.value);
  return plan.kind === "append" ? `${value} を1件` : `${String(last)}: ${value}`;
}

/** 人が読む形。**当てたものと、当てなかったもの（理由つき）を必ず両方出す**。 */
export function renderAdviceApply(result: AdviceApplyResult): string {
  const out: string[] = [];
  if (result.applied.length === 0) {
    out.push("当てた助言はありません。");
  } else {
    out.push(`${result.applied.length} 件を当てました:`);
    for (const one of result.applied) out.push(`  ${one.message}`);
  }
  if (result.skipped.length > 0) {
    out.push("");
    out.push("当てなかったもの:");
    for (const one of result.skipped) {
      out.push(`  ${one.where} [${one.rule}] ${one.reason}`);
    }
  }
  if (result.remaining.length > 0) {
    out.push("");
    out.push(`まだ書き足せる所が ${result.remaining.length} 件残っています:`);
    for (const one of result.remaining) {
      out.push(`  ${one.where} [${one.rule}] ${one.add}`);
    }
  }
  out.push("");
  out.push(
    "※ 助言を当てても**警告が減るわけではありません**（書いていないことは警告に出ない）。" +
      "当てたあとは hatake validate と hatake explain で読み返してください。",
  );
  return out.join("\n");
}
