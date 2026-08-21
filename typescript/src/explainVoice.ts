// 説明の文（語彙ではなく**言い回し**）を、言語ごとに1か所に集めた表。
//
// なぜ要るか: `explain` は「DSL を知らない人がレビューするための出力」なので、読む人の
// 言葉でないと役に立たない。日本語で書いた業務システムを英語話者がレビューする場面は
// 実際にあるし、AI に読ませるときも英語のほうが安いモデルで通ることがある。
//
// 決めごと3つ。
//
// 1. **語彙（DSL の値の言い方）は [explainPhrases]、言い回しはここ。** 語彙の正は
//    `spec/vocabulary.json` で、そこに `en` が先に置かれていた（出力する側が無かった）。
//    ここはその出力する側。
// 2. **日本語と英語を1行ずつ並べて持つ。** [pair] で両方を同じ型に縛るので、片方だけ
//    書き足すと**コンパイルが通らない**（訳し忘れが残らない）。
// 3. **語順は言語ごとに変える。** 「{条件}だけ必須」と "required only when {条件}" は
//    語順が違う。差し込みだけの表（`{value}` の置換）ではこれが書けないので、値を取る
//    ものは関数で持つ。

import type { Lang } from "./explainPhrases.js";

/** 日本語と英語の対。両側が同じ型になるので、片方だけ直すと型が合わない。 */
interface Pair<T> {
  ja: T;
  en: T;
}

const pair = <T,>(ja: T, en: T): Pair<T> => ({ ja, en });

const list = (items: string[]): string => items.join(" / ");

/**
 * 英語の数え方（`1 filter` / `2 filters`）。
 *
 * 日本語には要らない区別だが、英語で `1 filters` と出ると**機械が書いた文**に見えて、
 * 読む人がその1枚を信じなくなる。
 */
const many = (count: number, one: string, more = `${one}s`): string =>
  `${count} ${count === 1 ? one : more}`;

/**
 * 言い回しの表。**この表がそのまま出力の言葉**なので、直すときは両側を見ること。
 *
 * 名前は「どこで使うか」ではなく「何を言うか」で付ける（同じ言い方を2か所で使える）。
 */
const WORDS = {
  // ── 節の見出し ────────────────────────────────────────────────
  data: pair("データ", "Data"),
  filters: pair("絞り込める条件", "Filters"),
  listColumns: pair("一覧に出る列", "Columns in the list"),
  printColumns: pair("印刷する列", "Columns on the paper"),
  formFields: pair("入力する項目", "Fields"),
  inputOrder: pair("入力の順番", "Input order"),
  actions: pair("できる操作", "What can be done"),
  rowActions: pair("行ごとの操作（一覧の各行に出る）", "Per-row actions (on every row)"),
  gatedByRoles: pair("画面の中で隠れるもの（権限）", "Hidden by role"),
  cannotDo: pair("この画面でできないこと", "What this screen cannot do"),
  dashboardCards: pair("並ぶカード", "Cards"),
  reportLayout: pair("帳票の体裁", "Paper layout"),
  menu: pair("メニュー", "Menu"),
  screens: pair("画面", "Screens"),
  firstScreen: pair("最初に開く画面", "Opens first"),
  look: pair("見た目", "Look and feel"),
  readOneByOne: pair("1枚ずつ詳しく読むには", "To read one screen in full"),

  // ── データ ────────────────────────────────────────────────────
  repositoryIs: pair(
    (name: string) => `データの出どころは ${name}（アプリ側が用意する）。`,
    (name: string) => `Data comes from ${name} (the application provides it).`,
  ),
  keyIs: pair(
    (name: string) => `1件を指すキーは ${name}。`,
    (name: string) => `One record is addressed by ${name}.`,
  ),

  // ── 条件（`visibleWhen` などの文） ────────────────────────────
  // 英語は「when」を**包む側**が付ける（"required only when creating"）。日本語は
  // 「…のとき」で文が完結するので、包む側は付けない。
  onCreate: pair("新規のとき", "creating"),
  onEdit: pair("編集のとき", "editing"),
  allJoiner: pair("、かつ ", " and "),
  anyJoiner: pair("、または ", " or "),
  negated: pair(
    (inner: string) => `${inner}の逆`,
    (inner: string) => `not (${inner})`,
  ),
  conditionUnusable: pair(
    (label: string, operator: string) =>
      `${label} の条件（${operator} は条件では使えません）`,
    (label: string, operator: string) =>
      `a condition on ${label} (${operator} cannot be used in a condition)`,
  ),

  // ── 絞り込み ──────────────────────────────────────────────────
  choicesAre: pair(
    (items: string[]) => `選べるのは ${list(items)}`,
    (items: string[]) => `one of ${list(items)}`,
  ),
  narrowedByFilter: pair(
    (label: string) => `${label}を選ぶと、それに合うものだけになる`,
    (label: string) => `picking ${label} narrows these choices`,
  ),
  choicesFrom: pair(
    (repository: string) => `選択肢は ${repository} から引く`,
    (repository: string) => `choices come from ${repository}`,
  ),
  /** 文のうしろに句を足すときの区切り（日本語は句点、英語はセミコロン）。 */
  clause: pair(
    (text: string) => `。${text}`,
    (text: string) => `; ${text}`,
  ),

  // ── 列 ────────────────────────────────────────────────────────
  shownAs: pair(
    (how: string) => `${how}見せる`,
    (how: string) => `shown ${how}`,
  ),
  formatFallback: pair(
    (name: string) => `${name} で`,
    (name: string) => `by ${name}`,
  ),
  sortable: pair("並べ替えできる", "sortable"),
  paginates: pair(
    (size: number) => `${size} 件ずつページングする`,
    (size: number) => `paged ${size} rows at a time`,
  ),
  noPaging: pair(
    "ページングしない（全件そのまま出す）",
    "no paging (every row at once)",
  ),

  // ── 枠と項目 ──────────────────────────────────────────────────
  sectionWhen: pair(
    (title: string, when: string) => `${title}（${when}だけ出る枠）`,
    (title: string, when: string) => `${title} (a group shown only when ${when})`,
  ),
  required: pair("必須", "required"),
  requiredWhen: pair(
    (when: string) => `${when}だけ必須`,
    (when: string) => `required only when ${when}`,
  ),
  readOnly: pair("読み取り専用", "read-only"),
  readOnlyWhen: pair(
    (when: string) => `${when}は直せない`,
    (when: string) => `not editable when ${when}`,
  ),
  visibleWhen: pair(
    (when: string) => `${when}だけ出る`,
    (when: string) => `shown only when ${when}`,
  ),
  enabledWhen: pair(
    (when: string) => `${when}だけ触れる`,
    (when: string) => `editable only when ${when}`,
  ),
  narrowedByField: pair(
    (label: string) => `${label}に合う選択肢だけ出す`,
    (label: string) => `only the choices that match ${label}`,
  ),
  normalizedBy: pair(
    (items: string[]) => `保存前に整える（${items.join("・")}）`,
    (items: string[]) => `tidied before saving (${items.join(", ")})`,
  ),
  computedField: pair(
    "他の項目から自動で計算する（手では入れない）",
    "computed from other fields (not typed in)",
  ),
  subRowIs: pair(
    (items: string[]) => `1行は ${items.join("・")}`,
    (items: string[]) => `each row holds ${items.join(", ")}`,
  ),
  subRowsInline: pair(
    "行はこのレコードと一緒に保存する",
    "rows are saved together with this record",
  ),
  subRowsSeparate: pair(
    (repository: string) => `行は ${repository} に別で持つ（ページングする）`,
    (repository: string) => `rows live in ${repository} (paged separately)`,
  ),
  visibleToRoles: pair(
    (roles: string[]) => `${list(roles)} だけに見える`,
    (roles: string[]) => `visible to ${list(roles)} only`,
  ),

  // ── 検証 ──────────────────────────────────────────────────────
  unknownRule: pair(
    (type: string) => `${type} の規則`,
    (type: string) => `the ${type} rule`,
  ),
  compareNoTarget: pair(
    "他の項目と比べる（比べる相手が書いてありません）",
    "compared with another field (no field to compare with is written)",
  ),
  compareAggregate: pair(
    (label: string, aggregate: string) => `${label} の${aggregate}`,
    (label: string, aggregate: string) => `the ${aggregate} of ${label}`,
  ),
  compareUnusable: pair(
    (shown: string, operator: string) =>
      `${shown} と比べる（${operator} は比べ方として使えません）`,
    (shown: string, operator: string) =>
      `compared with ${shown} (${operator} cannot be used to compare)`,
  ),

  // ── ボタン ────────────────────────────────────────────────────
  goesTo: pair(
    (target: string) => `（${target} へ）`,
    (target: string) => ` (to ${target})`,
  ),
  viaPlugin: pair(
    (name: string) => `（${name}）`,
    (name: string) => ` (${name})`,
  ),
  onSelection: pair(
    "選んだ行に対して実行する",
    "runs on the rows the user checked",
  ),
  onSelectionUpTo: pair(
    (size: number) => `選んだ行に対して実行する（一度に最大 ${size} 件）`,
    (size: number) => `runs on the rows the user checked (at most ${size} at a time)`,
  ),
  asksFor: pair(
    (items: string[]) => `押すと ${list(items)} を聞く`,
    (items: string[]) => `asks for ${list(items)} first`,
  ),
  confirms: pair("押すと確認を出す", "asks for confirmation"),
  confirmsDelete: pair(
    "押すと確認を出す（削除は既定で確認する）",
    "asks for confirmation (deleting always does)",
  ),
  thenGoTo: pair(
    (page: string) => `終わったら ${page} へ移る`,
    (page: string) => `then moves to ${page}`,
  ),
  thenSay: pair(
    (message: string) => `終わったら「${message}」と出す`,
    (message: string) => `then says "${message}"`,
  ),
  onFailSay: pair(
    (message: string) => `失敗したら「${message}」と出す`,
    (message: string) => `on failure says "${message}"`,
  ),
  onlyForRoles: pair(
    (roles: string[]) => `${list(roles)} だけに出る`,
    (roles: string[]) => `shown to ${list(roles)} only`,
  ),
  openEdit: pair("編集を開く", "opens the editor"),
  deleteRow: pair("削除する", "deletes"),
  undeclaredRowAction: pair(
    (id: string) => `${id}（対応するボタンの宣言が無い）`,
    (id: string) => `${id} (no matching action is declared)`,
  ),

  // ── ダッシュボード ────────────────────────────────────────────
  chartOf: pair(
    (kind: string, label: string) => `${kind} のグラフ（${label}ごと）`,
    (kind: string, label: string) => `a ${kind} chart (per ${label})`,
  ),
  cardList: pair(
    (columns: string[]) => `一覧（${columns.join("・")}）`,
    (columns: string[]) => `a list (${columns.join(", ")})`,
  ),
  cardCount: pair("件数", "the number of rows"),
  ofField: pair(
    (label: string) => `（${label}）`,
    (label: string) => ` of ${label}`,
  ),
  fromRepository: pair(
    (repository: string) => `、${repository} から`,
    (repository: string) => `, from ${repository}`,
  ),
  tapRuns: pair(
    (action: string) => `、押すと ${action} を実行`,
    (action: string) => `, tapping runs ${action}`,
  ),

  // ── 帳票 ──────────────────────────────────────────────────────
  paperIs: pair(
    (size: string, landscape: boolean, rows: number) =>
      `用紙は ${size} の${landscape ? "横" : "縦"}、1枚に ${rows} 行`,
    (size: string, landscape: boolean, rows: number) =>
      `${size} ${landscape ? "landscape" : "portrait"}, ${rows} rows per sheet`,
  ),
  printedInOrder: pair(
    (field: string, ascending: boolean) =>
      `${field} の${ascending ? "昇順" : "降順"}で並べて印刷する`,
    (field: string, ascending: boolean) =>
      `printed in ${ascending ? "ascending" : "descending"} order of ${field}`,
  ),
  subtotalAt: pair(
    (label: string, field: string, pageBreak: boolean) =>
      `${label}（${field}）が変わるところで小計を出す` +
      (pageBreak ? "。変わったら改ページする" : ""),
    (label: string, field: string, pageBreak: boolean) =>
      `a subtotal where ${label} (${field}) changes` +
      (pageBreak ? ", starting a new sheet" : ""),
  ),
  totalsAre: pair(
    (items: string[]) => `合計を出すのは ${items.join("、")}`,
    (items: string[]) => `totals for ${items.join(", ")}`,
  ),
  totalOf: pair(
    (field: string, aggregate: string) => `${field}（${aggregate}）`,
    (field: string, aggregate: string) => `${field} (${aggregate})`,
  ),
  takesAtMost: pair(
    (limit: number) => `1回に取るのは ${limit} 行まで`,
    (limit: number) => `at most ${limit} rows per run`,
  ),

  // ── 権限で隠れるもの ──────────────────────────────────────────
  gatedColumn: pair(
    (label: string) => `列「${label}」`,
    (label: string) => `the column "${label}"`,
  ),
  gatedAction: pair(
    (label: string) => `ボタン「${label}」`,
    (label: string) => `the button "${label}"`,
  ),
  gatedField: pair(
    (label: string) => `項目「${label}」`,
    (label: string) => `the field "${label}"`,
  ),
  onlyRoles: pair(
    (roles: string[]) => `${list(roles)} だけ`,
    (roles: string[]) => `${list(roles)} only`,
  ),

  // ── できないこと ──────────────────────────────────────────────
  noCreateButton: pair(
    "新規登録のボタンは無い（入力画面は他から開く）",
    "there is no create button (the input screen is opened from elsewhere)",
  ),
  noDelete: pair(
    "削除はできない（削除のボタンが無い）",
    "nothing can be deleted (there is no delete button)",
  ),
  noFilters: pair(
    "絞り込みの条件は無い（一覧は全件から始まる）",
    "there are no filters (the list starts with every row)",
  ),

  // ── app 全体 ──────────────────────────────────────────────────
  appHeadline: pair(
    (title: string, id: string, pages: number) =>
      `${title}（${id}）— ${pages} 枚の画面をメニューで束ねたアプリ`,
    (title: string, id: string, pages: number) =>
      `${title} (${id}) — an app of ${many(pages, "screen")} tied together by a menu`,
  ),
  pageHeadline: pair(
    (title: string, id: string, what: string) => `${title}（${id}）— ${what}`,
    (title: string, id: string, what: string) => `${title} (${id}) — ${what}`,
  ),
  menuLine: pair(
    (path: string, page: string) => `${path} → ${page}`,
    (path: string, page: string) => `${path} → ${page}`,
  ),
  noMenuTarget: pair("(行き先なし)", "(no target)"),
  noMenu: pair(
    "メニューは無い（ページを直接開く）",
    "there is no menu (pages are opened directly)",
  ),
  titleWithId: pair(
    (title: string, id: string) => `${title}（${id}）`,
    (title: string, id: string) => `${title} (${id})`,
  ),
  screenLine: pair(
    (title: string, id: string, what: string) => `${title}（${id}）… ${what}`,
    (title: string, id: string, what: string) => `${title} (${id}) … ${what}`,
  ),
  homeUnset: pair("指定なし（先頭のページ）", "not set (the first page)"),
  hasTheme: pair(
    "テーマの指定がある（色・明暗・密度など）",
    "a theme is set (colour, brightness, density…)",
  ),
  stepLine: pair(
    (index: number, title: string, fields: number, description?: string) =>
      `${index}. ${title}（${fields} 項目）` +
      (description === undefined ? "" : ` — ${description}`),
    (index: number, title: string, fields: number, description?: string) =>
      `${index}. ${title} (${many(fields, "field")})` +
      (description === undefined ? "" : ` — ${description}`),
  ),
  stepFields: pair(
    (title: string) => `${title}の項目`,
    (title: string) => `Fields of ${title}`,
  ),

  // ── 「主語 … 説明」の区切りと、注記の並び ────────────────────
  subject: pair(
    (subject: string, rest: string) => `${subject} … ${rest}`,
    (subject: string, rest: string) => `${subject} … ${rest}`,
  ),
  notesOf: pair(
    (label: string, notes: string[]) => `${label}（${notes.join("、")}）`,
    (label: string, notes: string[]) => `${label} (${notes.join(", ")})`,
  ),
  noteSeparator: pair("、", ", "),
  ruleSeparator: pair("・", ", "),

  // ── 開ける人（[explainAccess]） ───────────────────────────────
  accessTitle: pair("この画面を開ける人", "Who can open this screen"),
  accessOverviewTitle: pair("画面を開ける人", "Who can open which screen"),
  fromMenu: pair("メニュー", "the menu"),
  fromPage: pair(
    (page: string) => `${page} から`,
    (page: string) => `from ${page}`,
  ),
  anyonePasses: pair("誰でも通れる", "anyone can pass"),
  onlyRolesPass: pair(
    (roles: string[]) => `${list(roles)} だけが通れる`,
    (roles: string[]) => `only ${list(roles)} can pass`,
  ),
  entryLine: pair(
    (label: string, from: string, who: string) => `入口「${label}」（${from}） … ${who}`,
    (label: string, from: string, who: string) => `entry "${label}" (${from}) … ${who}`,
  ),
  opensTo: pair(
    (who: string) => `開けるのは … ${who}`,
    (who: string) => `Can open … ${who}`,
  ),
  openToAnyoneNoMenu: pair(
    "開けるのは … 誰でも（メニューが無いアプリなので、最初に開く画面として開く）",
    "Can open … anyone (the app has no menu, so this is what opens first)",
  ),
  noEntryWritten: pair(
    "入口 … 書かれていない（メニューにも他の画面からの遷移にも出てこない" +
      "＝アプリのコードから開く画面）",
    "Entry … none written (neither the menu nor any screen leads here" +
      "; the application code opens it)",
  ),
  nobodyOpens: pair(
    "開けるのは … 誰も開けない（入口はあるが、権限が食い違っている）",
    "Can open … nobody (there is an entry, but the roles do not line up)",
  ),
  overviewNoEntry: pair(
    "入口が書かれていない（アプリのコードから開く）",
    "no entry is written (opened from the application code)",
  ),
  overviewNobody: pair(
    "誰も開けない（入口の権限が食い違っている）",
    "nobody can open it (the roles on the entries do not line up)",
  ),
  audienceAnyone: pair("誰でも開ける", "anyone"),
  audienceNobody: pair("誰も開けない", "nobody"),
  audienceOnly: pair(
    (roles: string[]) => `${list(roles)} だけ`,
    (roles: string[]) => `${list(roles)} only`,
  ),

  // ── 1行の要約（[briefPage]） ──────────────────────────────────
  briefFilters: pair(
    (count: number) => `条件 ${count}`,
    (count: number) => many(count, "filter"),
  ),
  briefColumns: pair(
    (count: number) => `列 ${count}`,
    (count: number) => many(count, "column"),
  ),
  briefFields: pair(
    (fields: number, sections: number, required: number) =>
      `${sections > 1 ? `${sections} 枠に` : ""}項目 ${fields}` +
      (required > 0 ? `（必須 ${required}）` : ""),
    (fields: number, sections: number, required: number) =>
      `${many(fields, "field")}${sections > 1 ? ` in ${sections} groups` : ""}` +
      (required > 0 ? ` (${required} required)` : ""),
  ),
  briefSteps: pair(
    (steps: number, fields: number) => `ステップ ${steps}（項目 ${fields}）`,
    (steps: number, fields: number) =>
      `${many(steps, "step")} (${many(fields, "field")})`,
  ),
  briefCards: pair(
    (count: number) => `カード ${count}`,
    (count: number) => many(count, "card"),
  ),
  briefActions: pair(
    (count: number) => `ボタン ${count}`,
    (count: number) => many(count, "button"),
  ),
  briefControlled: pair(
    (count: number) => `条件で出し分け ${count} 項目`,
    (count: number) =>
      `${many(count, "field")} shown by condition`,
  ),
  briefHasRoles: pair("権限で出し分けあり", "some things are shown by role"),
  briefFrom: pair(
    (repository: string) => `${repository} から`,
    (repository: string) => `from ${repository}`,
  ),
  briefLine: pair(
    (title: string, id: string, what: string, parts: string[]) =>
      `${title}（${id}）… ${what}${parts.length === 0 ? "" : `。${parts.join("、")}`}`,
    (title: string, id: string, what: string, parts: string[]) =>
      `${title} (${id}) … ${what}${parts.length === 0 ? "" : `. ${parts.join(", ")}`}`,
  ),
  briefHeadline: pair(
    (title: string, id: string, pages: number) => `${title}（${id}）— 画面 ${pages} 枚`,
    (title: string, id: string, pages: number) =>
      `${title} (${id}) — ${many(pages, "screen")}`,
  ),
  briefTail: pair(
    (parts: string[]) => (parts.length === 0 ? "" : `。${parts.join("、")}`),
    (parts: string[]) => (parts.length === 0 ? "" : `. ${parts.join(", ")}`),
  ),

  /** 端末向けの箇条書きの記号。 */
  bullet: pair("  ・", "  - "),

  // ── PR 本文の形（[explainMarkdown]） ─────────────────────────
  countOfLines: pair(
    (count: number) => `（${count} 件）`,
    (count: number) => ` (${count})`,
  ),
} as const;

/** その言語の言い回しひとまとめ。 */
export type Voice = { [K in keyof typeof WORDS]: (typeof WORDS)[K]["ja"] };

/**
 * 言語を選ぶ。
 *
 * 表を作り直さずに1回だけ引く形（`voice(lang).required`）。呼ぶ側が言語を持ち回るのは
 * 意図的で、**同じ実行の中で言語が混ざらない**ことが読み手にとって一番大事。
 */
export function voice(lang: Lang): Voice {
  const found: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(WORDS)) {
    found[key] = (value as Pair<unknown>)[lang];
  }
  return found as Voice;
}

/** 既定は日本語（この枠組みの一次言語）。 */
export const JA = voice("ja");
