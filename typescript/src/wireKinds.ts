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
  /** 1件ぶんの値の頭（引数の形。`(ctx) async =>`）。 */
  head: string;
  /**
   * 埋める人が書くもの（1行）。
   *
   * **生成する TODO の文とこの言葉は同じ1か所から出す**（[wireStub]）。別に持つと、
   * 出したコードには「検証の中身」と書いてあるのに、渡した一覧には別のことが
   * 書いてある、が起きる。
   */
  todo: string;
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
    head: "(ctx) async =>",
    todo: "何をするか",
    comment: ["// `type: plugin` のボタンの中身＝業務。定義には書けない所。"],
  },
  {
    need: "validators",
    field: "validators",
    registry: "ValidatorRegistry",
    where: "scope",
    head: "(value, definition) =>",
    todo: "検証の中身",
    comment: ["// 組み込みに無い検証。null を返せば OK、文字列を返せばそれがエラー。"],
  },
  {
    need: "converters",
    field: "converters",
    registry: "ConverterRegistry",
    where: "scope",
    head: "(value, options) =>",
    todo: "正規化の中身",
    comment: ["// 組み込みに無い正規化（保存の前に値を直す）。"],
  },
  {
    need: "aggregates",
    field: "aggregates",
    registry: "AggregateRegistry",
    where: "scope",
    head: "(rows, field) =>",
    todo: "集約の中身",
    comment: ["// 組み込みに無い集約（ダッシュボードと帳票の合計欄）。"],
  },
  {
    need: "computedOps",
    field: "computeds",
    registry: "ComputedRegistry",
    where: "scope",
    head: "(computed, record) =>",
    todo: "計算の中身",
    comment: ["// 組み込みに無い計算（入力から自動で埋める項目）。"],
  },
  {
    need: "formatters",
    field: "formatters",
    registry: "FormatterRegistry",
    where: "renderer",
    head: "(value, options) =>",
    todo: "見せ方",
    comment: [],
  },
  {
    need: "fieldTypes",
    field: "fieldBuilders",
    where: "renderer",
    head: "(ctx) =>",
    todo: "入力の見た目",
    comment: [],
  },
  {
    need: "dashboardItemTypes",
    field: "dashboardItemBuilders",
    where: "renderer",
    head: "(ctx) =>",
    todo: "カードの中身",
    comment: [],
  },
];

/**
 * まだ繋いでいない Repository（`wire` が置く仮の実装）。
 *
 * Repository だけは値が「その場の式」ではなくクラスなので、TODO の目印が
 * `UnimplementedError` ではなくこの名前になる。**埋まったかを数える側
 * （[looksUnfilled]）も同じ名前を見る**＝名前を変えたときに片方だけ残らない。
 */
export const UNWIRED_REPOSITORY = "_UnwiredRepository";

/** 出す口（`exportSink` / `printSink`）。map ではなく関数1つなので別扱い。 */
export const WIRE_SINKS: Record<
  string,
  { comment: string[]; body: string[]; todo: string }
> = {
  exportSink: {
    todo: "作った CSV を書き出す先に繋ぐ（web ならダウンロード、デスクトップなら保存）",
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
    todo: "刷る先に繋ぐ（PDF にするのは opt-in の hatake_print、送るのはアプリ）",
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

/**
 * 1件ぶんの値（埋めるまでは実行時に落ちる形）。
 *
 * 埋める人に渡す一覧（`wire --merge --todo`）も同じ [WireKind.todo] を読む＝出した
 * コードの中の言葉と、渡した一覧の言葉が必ず揃う。
 */
export const wireStub = (kind: WireKind, name: string): string =>
  `${kind.head} throw UnimplementedError('${name}: ${kind.todo}')`;
