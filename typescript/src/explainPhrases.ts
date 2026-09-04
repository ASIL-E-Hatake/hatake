// 説明に使う語彙（DSL の値 → 人に見せる言い方）。**日本語と英語の両方**を持つ。
//
// **正は [`spec/vocabulary.json`](../../spec/vocabulary.json)** で、ここはその転記。
// 語彙を実装の中だけに持つと、Dart 版で説明を出したいとき・英語版を出したいときに二重管理に
// なるので、言葉は spec に置いた。ここに写しを持つ理由は、説明を**依存ゼロの純粋な関数**の
// ままにしておきたいから（spec/ を読めない場所でも `explain` は動く）。
//
// 写しがズレないように、`vocabulary.test.ts` が見る:
//   1. この表と `spec/vocabulary.json` が**両方の言語で完全に一致**すること
//   2. `spec/reference.json` の組み込みの値に**全部語がある**こと（値を増やしたら語も要る）
//   3. 語彙に**居ない値が無い**こと（DSL から消えた値の語が残らない）
//
// `{value}` は差し込み位置（[fill] で埋める）。

/** 説明を出す言語。 */
export type Lang = "ja" | "en";

/** 1つの言い方。言語を増やすときはここに足す（表の形は変えない）。 */
export interface Phrase {
  ja: string;
  en: string;
}

/** その言語の言い方を取る。 */
export const pick = (phrase: Phrase, lang: Lang): string => phrase[lang];

/**
 * ページ種別 → その画面が何をするものか。
 *
 * `what` は説明の全文で使う言い方、`short` は1行の要約（[briefPage]）と画面の索引で使う
 * 見出し語。1行に収めるには文ではなく見出し語が要るので、同じ種別に2つの言い方がある。
 */
export const PAGE_KINDS: Record<
  string,
  { what: Phrase; short: Phrase; cannot: Phrase[] }
> = {
  crud: {
    what: { ja: "検索して一覧に出し、その場で登録・修正・削除までできる画面", en: "search, list, and create/update/delete in place" },
    short: { ja: "検索＋一覧＋登録・修正・削除", en: "search + list + create/update/delete" },
    cannot: [],
  },
  master: {
    what: { ja: "マスタをメンテナンスする画面（検索・一覧・登録・修正・削除）", en: "master maintenance (search, list, create/update/delete)" },
    short: { ja: "マスタ保守", en: "master maintenance" },
    cannot: [],
  },
  search: {
    what: { ja: "検索して一覧を見るだけの画面", en: "search and list only" },
    short: { ja: "照会（読み取り専用）", en: "read-only list" },
    cannot: [
      { ja: "登録・修正・削除はできない（照会専用）", en: "cannot create, update or delete (read-only)" },
    ],
  },
  detail: {
    what: { ja: "1件の内容を読むだけの画面", en: "reads one record" },
    short: { ja: "1件の照会", en: "reads one record" },
    cannot: [
      { ja: "この画面では書き換えられない（読み取り専用）", en: "nothing can be changed here (read-only)" },
    ],
  },
  form: {
    what: { ja: "1件を入力する画面（新規と編集の両方）", en: "enters one record (both create and edit)" },
    short: { ja: "1件の入力", en: "one record input" },
    cannot: [
      { ja: "一覧は無い（開く先は呼び出し側が決める）", en: "there is no list (the caller decides what to open)" },
    ],
  },
  wizard: {
    what: { ja: "入力をステップに分けた画面", en: "input split into steps" },
    short: { ja: "段階入力", en: "stepped input" },
    cannot: [
      { ja: "途中では保存しない（最後にまとめて1回）", en: "nothing is saved midway (once, at the end)" },
    ],
  },
  dashboard: {
    what: { ja: "数字とグラフのカードを並べて見せる画面", en: "a grid of number and chart cards" },
    short: { ja: "数字とグラフ", en: "numbers and charts" },
    cannot: [
      { ja: "ここからデータは書き換えられない", en: "data cannot be changed from here" },
    ],
  },
  report: {
    what: { ja: "印刷向けの帳票", en: "a printable report" },
    short: { ja: "帳票", en: "printable report" },
    cannot: [
      { ja: "画面から書き換えはできない", en: "nothing can be changed from the screen" },
    ],
  },
};

/** 検索の突合。 */
export const FILTER_OPERATORS: Record<string, Phrase> = {
  equals: { ja: "完全一致", en: "exact match" },
  notEquals: { ja: "一致しないもの", en: "not equal" },
  contains: { ja: "部分一致", en: "contains" },
  startsWith: { ja: "前方一致", en: "starts with" },
  endsWith: { ja: "後方一致", en: "ends with" },
  gt: { ja: "より大きい", en: "greater than" },
  gte: { ja: "以上", en: "at least" },
  lt: { ja: "より小さい", en: "less than" },
  lte: { ja: "以下", en: "at most" },
  between: { ja: "期間・範囲（開始と終了の2つ）", en: "a range (start and end)" },
  in: { ja: "いずれかに一致", en: "one of" },
};

/** 条件の演算子（`{項目} …`）。 */
export const CONDITION_OPERATORS: Record<string, Phrase> = {
  equals: { ja: "が {value} のとき", en: "is {value}" },
  notEquals: { ja: "が {value} でないとき", en: "is not {value}" },
  gt: { ja: "が {value} より大きいとき", en: "is greater than {value}" },
  gte: { ja: "が {value} 以上のとき", en: "is at least {value}" },
  lt: { ja: "が {value} より小さいとき", en: "is less than {value}" },
  lte: { ja: "が {value} 以下のとき", en: "is at most {value}" },
  contains: { ja: "に {value} を含むとき", en: "contains {value}" },
  in: { ja: "が {value} のどれかのとき", en: "is one of {value}" },
  isEmpty: { ja: "が空のとき", en: "is empty" },
  isNotEmpty: { ja: "が入っているとき", en: "is filled in" },
};

/** 項目の型 → 入力の見え方。 */
export const FIELD_TYPES: Record<string, Phrase> = {
  text: { ja: "1行の文字入力", en: "single-line text" },
  textarea: { ja: "複数行", en: "multi-line" },
  number: { ja: "数値", en: "number" },
  select: { ja: "選択", en: "a choice" },
  multiSelect: { ja: "複数選択", en: "several choices" },
  checkbox: { ja: "チェックボックス", en: "checkbox" },
  radio: { ja: "ラジオ", en: "radio buttons" },
  date: { ja: "日付", en: "date" },
  dateTime: { ja: "日時", en: "date and time" },
  time: { ja: "時刻", en: "time" },
  subTable: { ja: "明細（表で複数行）", en: "child rows in a table" },
};

/** 検証 → 何を求めているか。 */
export const VALIDATORS: Record<string, Phrase> = {
  required: { ja: "必須", en: "required" },
  maxLength: { ja: "{value} 文字以内", en: "at most {value} characters" },
  minLength: { ja: "{value} 文字以上", en: "at least {value} characters" },
  min: { ja: "{value} 以上", en: "at least {value}" },
  max: { ja: "{value} 以下", en: "at most {value}" },
  pattern: { ja: "決まった書式", en: "a fixed format" },
  email: { ja: "メールアドレスの形", en: "an email address" },
  postalCode: { ja: "郵便番号の形", en: "a postal code" },
  compare: { ja: "{value}", en: "{value}" },
  unique: {
    ja: "{value} が同じ行は書けない",
    en: "no two rows with the same {value}",
  },
};

/**
 * 項目間の検証（`compare`）の突合。
 *
 * 条件の言い方（[CONDITION_OPERATORS]）とは別に持つ。条件は「が {value} のとき」で文が
 * 終わるが、検証は「{value} 以上」で名詞句になる＝同じ演算子でも言い方が違う。
 */
export const COMPARE_WORDS: Record<string, Phrase> = {
  equals: { ja: "{value} と同じ値", en: "the same value as {value}" },
  notEquals: { ja: "{value} と違う値", en: "a different value from {value}" },
  gt: { ja: "{value} より大きい値", en: "greater than {value}" },
  gte: { ja: "{value} 以上", en: "at least {value}" },
  lt: { ja: "{value} より小さい値", en: "less than {value}" },
  lte: { ja: "{value} 以下", en: "at most {value}" },
};

/** フォーマッタ → 見え方。**例を見せる**のがレビューには一番早い。 */
export const FORMATTERS: Record<string, Phrase> = {
  currency: { ja: "¥1,234,567 のように", en: "as ¥1,234,567" },
  percent: { ja: "12.3% のように", en: "as 12.3%" },
  date: { ja: "2026/07/22 のように", en: "as 2026/07/22" },
  wareki: { ja: "令和8年7月22日 のように", en: "in the Japanese era calendar" },
  postal: { ja: "123-4567 のように", en: "as 123-4567" },
  mask: { ja: "一部を隠して", en: "partly hidden" },
};

/** 正規化 → 何をするか。 */
export const CONVERTERS: Record<string, Phrase> = {
  toHankaku: { ja: "全角→半角", en: "full-width to half-width" },
  toZenkaku: { ja: "半角→全角", en: "half-width to full-width" },
  hiraToKata: { ja: "ひらがな→カタカナ", en: "hiragana to katakana" },
  kataToHira: { ja: "カタカナ→ひらがな", en: "katakana to hiragana" },
  trim: { ja: "前後の空白を落とす", en: "trim surrounding spaces" },
  collapseSpaces: { ja: "連続した空白を1つに", en: "collapse repeated spaces" },
  parseNumber: { ja: "数値に直す", en: "parse as a number" },
};

/** ボタン → 押すと何が起きるか。 */
export const ACTION_TYPES: Record<string, Phrase> = {
  create: { ja: "新規入力を開く", en: "opens a blank form" },
  edit: { ja: "編集を開く", en: "opens the record for editing" },
  delete: { ja: "削除する", en: "deletes" },
  navigate: { ja: "別の画面へ移る", en: "goes to another screen" },
  export: { ja: "内容をファイルに出す", en: "exports to a file" },
  print: { ja: "紙に刷る", en: "prints to paper" },
  plugin: { ja: "アプリ側の処理を呼ぶ", en: "calls the application's own code" },
};

/** 集約 → 何の値か。 */
export const AGGREGATES: Record<string, Phrase> = {
  count: { ja: "件数", en: "the number of rows" },
  sum: { ja: "合計", en: "the total" },
  avg: { ja: "平均", en: "the average" },
  min: { ja: "最小", en: "the smallest" },
  max: { ja: "最大", en: "the largest" },
};

/** グラフの種類。 */
export const CHART_KINDS: Record<string, Phrase> = {
  bar: { ja: "棒", en: "bar" },
  line: { ja: "折れ線", en: "line" },
  pie: { ja: "円", en: "pie" },
};

/** 語彙のひとまとめ（試験と、他のエディションとの突き合わせのため）。 */
export const explainPhrases = {
  pageKinds: PAGE_KINDS,
  filterOperators: FILTER_OPERATORS,
  conditionOperators: CONDITION_OPERATORS,
  fieldTypes: FIELD_TYPES,
  validators: VALIDATORS,
  compareOperators: COMPARE_WORDS,
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

/** 言語を選んでから差し込む（呼ぶ側が2行に分かれるのを避ける）。 */
export const say = (phrase: Phrase, lang: Lang, value?: unknown): string =>
  value === undefined ? phrase[lang] : fill(phrase[lang], value);
