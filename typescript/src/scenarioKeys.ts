// シナリオファイルの**知らない鍵**を見る。
//
// 定義には strict が在るのに、シナリオには無かった。そのせいで、こう書いた
// シナリオが**緑になって通り抜けます**:
//
//   { "cases": [ { "name": "税込みを出す", "input": { "amount": 1000 } } ] }
//                                          ^^^^^ 正しくは `record`
//
// 値の入り口は `record` なので、`input` は黙って捨てられ、**空のレコードで**
// 動いて「1 件すべて期待どおり」と出ます。動かして確かめるための道具が、
// **何も入れずに緑を返す**のがいちばん困る（試験が在ることにならない）。
//
// 定義の strict と同じ考え方です ── **綴りが合っているキーしか受け取らない**。
// 違うのは、シナリオは人が手で書くものが多く、下書き（`--draft`）から育てるので、
// 落とすより**言って止める**ほうが直しやすいところ。なので警告ではなくエラーに
// しますが、**1件目で止めずに全部並べます**（1往復で直せるように）。

/** シナリオの束が取る鍵。 */
const FILE_KEYS = new Set(["page", "cases", "$comment"]);

/** 1件が取る鍵。 */
const CASE_KEYS = new Set(["name", "record", "mode", "expect", "$comment"]);

/** 確かめたいことが取る鍵。 */
const EXPECT_KEYS = new Set([
  "errors",
  "computed",
  "enabled",
  "hidden",
  "required",
]);

/** よくある書き間違い（言われて一番早いのは「これでは？」）。 */
const INSTEAD: Record<string, string> = {
  input: "record",
  values: "record",
  data: "record",
  given: "record",
  when: "record",
  then: "expect",
  expected: "expect",
  expects: "expect",
  title: "name",
  label: "name",
  errors: "expect.errors",
  computed: "expect.computed",
  enabled: "expect.enabled",
  hidden: "expect.hidden",
  required: "expect.required",
};

/** 見つけた1件。 */
export interface UnknownScenarioKey {
  /** どこに書いてあるか（`cases[0].input`）。 */
  path: string;
  key: string;
  /** たいてい書きたかったもの。 */
  instead?: string;
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * シナリオファイルの中の知らない鍵を全部返す。**1件目で止めない。**
 *
 * 中身の形（`record` の値・`expect.computed` の値）は見ません。そこは業務の値が
 * 何でも入る所なので、知っているのは**鍵の名前だけ**です。
 */
export function findUnknownScenarioKeys(file: unknown): UnknownScenarioKey[] {
  const found: UnknownScenarioKey[] = [];
  if (!isDict(file)) return found;

  check(file, FILE_KEYS, "", found);
  const cases = Array.isArray(file.cases) ? file.cases : [];
  cases.forEach((one, index) => {
    if (!isDict(one)) return;
    const at = `cases[${index}]`;
    check(one, CASE_KEYS, at, found);
    if (isDict(one.expect)) check(one.expect, EXPECT_KEYS, `${at}.expect`, found);
  });
  return found;
}

function check(
  node: Record<string, unknown>,
  known: Set<string>,
  path: string,
  found: UnknownScenarioKey[],
): void {
  for (const key of Object.keys(node)) {
    if (known.has(key)) continue;
    // `expect` の中に書くものを外側に書いた、は `instead` で名指しできる。
    const instead = INSTEAD[key];
    found.push({
      path: path === "" ? key : `${path}.${key}`,
      key,
      ...(instead === undefined ? {} : { instead }),
    });
  }
}

/** 人に見せる1行。 */
export function describeUnknownScenarioKey(one: UnknownScenarioKey): string {
  const where = `${one.path}: 知らないキー "${one.key}"`;
  return one.instead === undefined
    ? where
    : `${where}（${one.instead} の間違い？）`;
}
