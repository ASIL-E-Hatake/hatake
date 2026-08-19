// 説明に使う語彙（DSL の値 → 人に見せる言い方）。
//
// **正は [`spec/vocabulary.json`](../../spec/vocabulary.json)** で、ここはその日本語の転記。
// 語彙を実装の中だけに持つと、Dart 版で説明を出したいとき・英語版を出したいときに二重管理に
// なるので、言葉は spec に置いた。ここに写しを持つ理由は、説明を**依存ゼロの純粋な関数**の
// ままにしておきたいから（spec/ を読めない場所でも `explain` は動く）。
//
// 写しがズレないように、`vocabulary.test.ts` が3つを見る:
//   1. この表と `spec/vocabulary.json` の `ja` が**完全に一致**すること
//   2. `spec/reference.json` の組み込みの値に**全部語がある**こと（値を増やしたら語も要る）
//   3. 語彙に**居ない値が無い**こと（DSL から消えた値の語が残らない）
//
// `{value}` は差し込み位置（[fill] で埋める）。

/** ページ種別 → その画面が何をするものか。 */
export const PAGE_KINDS: Record<string, { what: string; cannot: string[] }> = {
  crud: {
    what: "検索して一覧に出し、その場で登録・修正・削除までできる画面",
    cannot: [],
  },
  master: {
    what: "マスタをメンテナンスする画面（検索・一覧・登録・修正・削除）",
    cannot: [],
  },
  search: {
    what: "検索して一覧を見るだけの画面",
    cannot: ["登録・修正・削除はできない（照会専用）"],
  },
  detail: {
    what: "1件の内容を読むだけの画面",
    cannot: ["この画面では書き換えられない（読み取り専用）"],
  },
  form: {
    what: "1件を入力する画面（新規と編集の両方）",
    cannot: ["一覧は無い（開く先は呼び出し側が決める）"],
  },
  wizard: {
    what: "入力をステップに分けた画面",
    cannot: ["途中では保存しない（最後にまとめて1回）"],
  },
  dashboard: {
    what: "数字とグラフのカードを並べて見せる画面",
    cannot: ["ここからデータは書き換えられない"],
  },
  report: {
    what: "印刷向けの帳票",
    cannot: ["画面から書き換えはできない"],
  },
};

/** 検索の突合 → 日本語。 */
export const FILTER_OPERATORS: Record<string, string> = {
  equals: "完全一致",
  notEquals: "一致しないもの",
  contains: "部分一致",
  startsWith: "前方一致",
  endsWith: "後方一致",
  gt: "より大きい",
  gte: "以上",
  lt: "より小さい",
  lte: "以下",
  between: "期間・範囲（開始と終了の2つ）",
  in: "いずれかに一致",
};

/** 条件の演算子 → 日本語（`{項目} …`）。 */
export const CONDITION_OPERATORS: Record<string, string> = {
  equals: "が {value} のとき",
  notEquals: "が {value} でないとき",
  gt: "が {value} より大きいとき",
  gte: "が {value} 以上のとき",
  lt: "が {value} より小さいとき",
  lte: "が {value} 以下のとき",
  contains: "に {value} を含むとき",
  in: "が {value} のどれかのとき",
  isEmpty: "が空のとき",
  isNotEmpty: "が入っているとき",
};

/** 項目の型 → 入力の見え方。 */
export const FIELD_TYPES: Record<string, string> = {
  text: "1行の文字入力",
  textarea: "複数行",
  number: "数値",
  select: "選択",
  multiSelect: "複数選択",
  checkbox: "チェックボックス",
  radio: "ラジオ",
  date: "日付",
  dateTime: "日時",
  time: "時刻",
  subTable: "明細（表で複数行）",
};

/** 検証 → 何を求めているか。 */
export const VALIDATORS: Record<string, string> = {
  required: "必須",
  maxLength: "{value} 文字以内",
  minLength: "{value} 文字以上",
  min: "{value} 以上",
  max: "{value} 以下",
  pattern: "決まった書式",
  email: "メールアドレスの形",
  postalCode: "郵便番号の形",
};

/** フォーマッタ → 見え方。**例を見せる**のがレビューには一番早い。 */
export const FORMATTERS: Record<string, string> = {
  currency: "¥1,234,567 のように",
  percent: "12.3% のように",
  date: "2026/07/22 のように",
  wareki: "令和8年7月22日 のように",
  postal: "123-4567 のように",
  mask: "一部を隠して",
};

/** 正規化 → 何をするか。 */
export const CONVERTERS: Record<string, string> = {
  toHankaku: "全角→半角",
  toZenkaku: "半角→全角",
  hiraToKata: "ひらがな→カタカナ",
  kataToHira: "カタカナ→ひらがな",
  trim: "前後の空白を落とす",
  collapseSpaces: "連続した空白を1つに",
  parseNumber: "数値に直す",
};

/** ボタン → 押すと何が起きるか。 */
export const ACTION_TYPES: Record<string, string> = {
  create: "新規入力を開く",
  edit: "編集を開く",
  delete: "削除する",
  navigate: "別の画面へ移る",
  export: "内容をファイルに出す",
  plugin: "アプリ側の処理を呼ぶ",
};

/** 集約 → 何の値か。 */
export const AGGREGATES: Record<string, string> = {
  count: "件数",
  sum: "合計",
  avg: "平均",
  min: "最小",
  max: "最大",
};

/** グラフの種類。 */
export const CHART_KINDS: Record<string, string> = {
  bar: "棒",
  line: "折れ線",
  pie: "円",
};

/** 語彙のひとまとめ（試験と、他のエディションとの突き合わせのため）。 */
export const explainPhrases = {
  pageKinds: PAGE_KINDS,
  filterOperators: FILTER_OPERATORS,
  conditionOperators: CONDITION_OPERATORS,
  fieldTypes: FIELD_TYPES,
  validators: VALIDATORS,
  formatters: FORMATTERS,
  converters: CONVERTERS,
  actionTypes: ACTION_TYPES,
  aggregates: AGGREGATES,
  chartKinds: CHART_KINDS,
};

/** 語彙のカテゴリ名（`spec/vocabulary.json` のキーと同じ）。 */
export type PhraseCategory = keyof typeof explainPhrases;

/**
 * 差し込み。`{value}` を埋めるだけ（テンプレートに凝ると語彙が読めなくなる）。
 *
 * 埋める所が無いテンプレート（`必須` / `が空のとき`）はそのまま返る。
 */
export const fill = (template: string, value: unknown): string =>
  template.replaceAll("{value}", String(value ?? ""));
