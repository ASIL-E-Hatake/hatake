// 「項目間の検証（`compare`）を足しませんか」と言う。
//
// `compare` は書けるようになった。しかし**書き忘れる**。書き忘れても定義は通り、画面も
// 動き、間違ったデータだけが入る（終了日が開始日より前の予約・明細と合わない合計）。
// 書いていないものは警告にできない（書いていないから）ので、ここは助言の担当。
//
// 見つけ方は**名前**。`endDate` の隣に `startDate` が居る、`total` の隣に明細が居る、
// という形は業務システムでほぼ同じ言葉で書かれる。名前からの推測なので `guess` を立てて
// 「外れることがある」と言う＝押し付けない。
//
// 型では決めない。`priceFrom` / `priceTo` のような組にも同じ話（大小の向き）が要るので、
// 日付に限る理由がない。

import { type Advice } from "./advise.js";
import { type AdviceRules, enabled, knob } from "./adviseRules.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 「始まり」を表す語（既定）。 */
export const START_WORDS = ["start", "from", "begin", "開始", "自", "起算"];

/** 「終わり」を表す語（既定）。`to` は短いので、区切りの直後だけを見る。 */
export const END_WORDS = ["end", "to", "till", "until", "終了", "至", "満了"];

/** 「合計」を表す語（既定）。 */
export const TOTAL_WORDS = ["total", "sum", "合計", "総額", "計"];

/** その項目に `compare` が書いてあるか。 */
const hasCompare = (field: Dict): boolean =>
  dicts(field.validators).some((rule) => str(rule.type) === "compare");

/** 名前に語が含まれるか（大文字小文字は無視）。 */
const contains = (name: string, word: string): boolean =>
  name.toLowerCase().includes(word.toLowerCase());

/**
 * 対になる名前を作る。`endDate` の `end` を `start` に替えて `startDate`。
 *
 * 元の綴りの大小は保たない（`EndDate` → `startDate` になる）。突き合わせる側も
 * 小文字で比べるので、これで拾える。
 */
function pairedNames(name: string, from: string, to: string[]): string[] {
  const lower = name.toLowerCase();
  const at = lower.indexOf(from.toLowerCase());
  if (at < 0) return [];
  return to.map(
    (word) => name.slice(0, at) + word + name.slice(at + from.length),
  );
}

/**
 * 明細（`subTable`）の中で、合計に足せそうな項目。
 *
 * 入力の項目（`fields`）を先に見て、無ければ表示の列（`columns`）を見る。読み取り専用の
 * 明細は列しか持たないが、合計と突き合わせる話は同じように在る。
 */
function sumCandidate(field: Dict): string | undefined {
  for (const rows of [dicts(field.fields), dicts(field.columns)]) {
    const numeric = rows.find((row) => str(row.type) === "number");
    if (numeric !== undefined) return str(numeric.field);
  }
  return undefined;
}

/**
 * `compare` を勧める。[fields] は同じ入力の中の項目（そこが `compare` の見える範囲）。
 *
 * 場所（`where`）は項目名まで書く。フォームの中の道は入れ子で長くなるので、警告と同じ
 * 「…」の書き方に合わせる。
 */
export function checkCompare(
  page: Dict,
  path: string,
  fields: Dict[],
  found: Advice[],
  rules: AdviceRules,
): void {
  const names = new Map(
    fields
      .map((field) => [str(field.field)?.toLowerCase(), field] as const)
      .filter((one): one is [string, Dict] => one[0] !== undefined),
  );
  const labelOf = (field: Dict): string =>
    str(field.label) ?? str(field.field) ?? "";

  // 「開始 ≤ 終了」の組が居るのに、向きを縛っていない。
  if (enabled(rules, "dates-without-compare")) {
    const starts: string[] = knob(
      rules,
      "dates-without-compare",
      "startWords",
      START_WORDS,
    );
    const ends: string[] = knob(
      rules,
      "dates-without-compare",
      "endWords",
      END_WORDS,
    );
    for (const field of fields) {
      const name = str(field.field);
      if (name === undefined || hasCompare(field)) continue;
      for (const word of ends) {
        if (!contains(name, word)) continue;
        const partner = pairedNames(name, word, starts)
          .map((candidate) => names.get(candidate.toLowerCase()))
          .find((one) => one !== undefined && one !== field);
        if (partner === undefined) continue;
        found.push({
          rule: "dates-without-compare",
          where: `${path}.form…${name}.validators`,
          says:
            `「${labelOf(field)}」は「${labelOf(partner)}」より前の値でも保存できます` +
            `（項目ごとの検証は、他の項目を見ません）。`,
          add:
            `\`validators\` に \`{ type: compare, operator: gte, field: ` +
            `${str(partner.field)} }\`。`,
          key: "validators",
          node: "field",
          guess: true,
        });
        break;
      }
    }
  }

  // 合計を手で入れられるのに、明細の和と突き合わせていない。
  if (!enabled(rules, "total-without-compare")) return;
  const words: string[] = knob(
    rules,
    "total-without-compare",
    "words",
    TOTAL_WORDS,
  );
  const details = fields.filter((field) => str(field.type) === "subTable");
  if (details.length === 0) return;
  for (const field of fields) {
    const name = str(field.field);
    if (name === undefined || hasCompare(field)) continue;
    // 計算項目は明細から出しているので、突き合わせる相手が自分になる。
    if (field.computed !== undefined) continue;
    if (str(field.type) !== "number" && field.format === undefined) continue;
    if (!words.some((word) => contains(name, word))) continue;
    for (const detail of details) {
      const of = sumCandidate(detail);
      if (of === undefined) continue;
      found.push({
        rule: "total-without-compare",
        where: `${path}.form…${name}.validators`,
        says:
          `「${labelOf(field)}」は手で入れられるので、明細「${labelOf(detail)}」の` +
          `合計と合っていなくても保存できます。`,
        add:
          `\`validators\` に \`{ type: compare, operator: equals, field: ` +
          `${str(detail.field)}, aggregate: sum, of: ${of} }\`` +
          `（自動で埋めるなら \`computed\`）。`,
        key: "validators",
        node: "field",
        guess: true,
      });
      break;
    }
  }
}
