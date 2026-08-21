// 「定義が要求している登録」の一覧＝配線を書く道具の共通の表。
//
// なぜ表を1つにするか: 下書きを**出す**（[wireApp]）のと、既にある配線に**足す**
// （[mergeWiring]）のは同じ知識を使う。別々に持つと必ずズレて、「wire が出す名前と
// merge が探す名前が違う」＝道具どうしが嘘をつく形になる。
//
// ここに書くのは「何という引数に、どんな形で並ぶか」だけ。**中身は書かない**
// （何をするかは業務、どう繋ぐかは環境）。

import type { RefKind } from "./refs.js";

/** 登録1種類ぶん。 */
export interface WireKind {
  /** `refsNeedingRegistration` が返すキー。 */
  need: RefKind;
  /** Dart 側の引数名（`actions` / `formatters` …）。 */
  field: string;
  /** レジストリの構築子。素の map で渡すものは undefined。 */
  registry?: string;
  /** どこに並ぶか。`renderer` は `MaterialRenderer(...)` の中。 */
  where: "scope" | "renderer";
  /** 1件ぶんの値（埋めるまでは実行時に落ちる形）。 */
  stub: (name: string) => string;
  /** 無い所に足すときの見出し。`renderer` の中には付けない（既定が無いので）。 */
  comment: string[];
}

/**
 * 並ぶ順番も含めてこの表が正。
 *
 * 順番を変えると生成物が変わる（コミットしてある下書き2枚と CI が diff で比べている）
 * ので、足すときは**末尾ではなく意味のある位置**に入れること。
 */
export const WIRE_KINDS: WireKind[] = [
  {
    need: "plugins",
    field: "actions",
    registry: "ActionRegistry",
    where: "scope",
    stub: (name) => `(ctx) async => throw UnimplementedError('${name}: 何をするか')`,
    comment: ["// `type: plugin` のボタンの中身＝業務。定義には書けない所。"],
  },
  {
    need: "validators",
    field: "validators",
    registry: "ValidatorRegistry",
    where: "scope",
    stub: (name) =>
      `(value, definition) => throw UnimplementedError('${name}: 検証の中身')`,
    comment: ["// 組み込みに無い検証。null を返せば OK、文字列を返せばそれがエラー。"],
  },
  {
    need: "converters",
    field: "converters",
    registry: "ConverterRegistry",
    where: "scope",
    stub: (name) =>
      `(value, options) => throw UnimplementedError('${name}: 正規化の中身')`,
    comment: ["// 組み込みに無い正規化（保存の前に値を直す）。"],
  },
  {
    need: "aggregates",
    field: "aggregates",
    registry: "AggregateRegistry",
    where: "scope",
    stub: (name) =>
      `(rows, field) => throw UnimplementedError('${name}: 集約の中身')`,
    comment: ["// 組み込みに無い集約（ダッシュボードと帳票の合計欄）。"],
  },
  {
    need: "computedOps",
    field: "computeds",
    registry: "ComputedRegistry",
    where: "scope",
    stub: (name) =>
      `(computed, record) => throw UnimplementedError('${name}: 計算の中身')`,
    comment: ["// 組み込みに無い計算（入力から自動で埋める項目）。"],
  },
  {
    need: "formatters",
    field: "formatters",
    registry: "FormatterRegistry",
    where: "renderer",
    stub: (name) =>
      `(value, options) => throw UnimplementedError('${name}: 見せ方')`,
    comment: [],
  },
  {
    need: "fieldTypes",
    field: "fieldBuilders",
    where: "renderer",
    stub: (name) => `(ctx) => throw UnimplementedError('${name}: 入力の見た目')`,
    comment: [],
  },
  {
    need: "dashboardItemTypes",
    field: "dashboardItemBuilders",
    where: "renderer",
    stub: (name) => `(ctx) => throw UnimplementedError('${name}: カードの中身')`,
    comment: [],
  },
];

/** 出す口（`exportSink` / `printSink`）。map ではなく関数1つなので別扱い。 */
export const WIRE_SINKS: Record<string, { comment: string[]; body: string[] }> = {
  exportSink: {
    comment: [
      "// CSV は Framework が文字列まで作る。書くのはアプリ（web なら",
      "// ダウンロード、デスクトップなら保存ダイアログ）。",
    ],
    body: [
      "exportSink: (request) async =>",
      "    throw UnimplementedError('${request.filename} を書き出す'),",
    ],
  },
  printSink: {
    comment: [
      "// 紙の中身までが Framework。PDF にするのは opt-in の hatake_print、",
      "// 送るのはアプリ。",
    ],
    body: [
      "printSink: (request) async =>",
      "    throw UnimplementedError('${request.filename} を刷る'),",
    ],
  },
};
