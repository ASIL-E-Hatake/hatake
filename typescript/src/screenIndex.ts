// 画面の索引（「顧客を検索する画面はどれ」に答えるための表）。
//
// 定義が増えると**どこに何があるか**が分からなくなる。人は grep で探せるが、探すのに
// 「その画面が何をするか」は grep では出てこない（YAML を開いて読むことになる）。
//
// 中身は [briefPage] の1行要約を集めたもの＝**説明の道具を再利用**している（索引のために
// 別の語彙を作ると、必ず本文とズレる）。それに「探すための語」を添えるだけ。
//
// 探し方は**語の AND**（`--find "顧客 検索"`）。日本語の文をそのまま投げても当たらないので
// （分かち書きしないと語に切れない）、語を並べる形にしてある。機械が使うなら `--json` を
// そのまま読むほうが速い。

import { type PageBrief, briefPage } from "./explainBrief.js";
import { PAGE_KINDS } from "./explainPhrases.js";
import { isAppSource, parseAppSource } from "./explainSource.js";
import { type PageDefinition } from "./definition.js";
import { formFields } from "./definition.js";
import { parsePageYaml } from "./parse.js";

/** 索引の1行（画面1枚）。 */
export interface ScreenEntry {
  /** どのファイルの中か（app なら1ファイルに複数枚）。 */
  file: string;
  id: string;
  title: string;
  kind: string;
  /** 種別の見出し語（要約と同じ語彙）。 */
  what: string;
  repository?: string;
  /** 規模（項目・列・条件…の数）。並べ替えに使う。 */
  counts: Record<string, number>;
  /** そのまま貼れる1行。 */
  brief: string;
  /** 探すための語（画面名・id・Repository・項目やボタンのラベル）。 */
  words: string[];
}

export interface ScreenIndex {
  screens: ScreenEntry[];
  /** 定義でなかったので飛ばしたファイルの数。 */
  ignored: number;
  /** 読めなかった定義（1件でもあれば索引は**不完全**）。 */
  unreadable: { file: string; reason: string }[];
}

/** 索引に入れる定義1つ。 */
export interface IndexInput {
  file: string;
  source: string;
}

/**
 * 索引を作る。
 *
 * strict では読まない（綴り間違いのある定義も**在る**ので、索引から消すと余計に探せなく
 * なる）。読めない定義は黙って飛ばさず、不完全だと言う。
 */
export function buildIndex(inputs: IndexInput[]): ScreenIndex {
  const screens: ScreenEntry[] = [];
  const unreadable: ScreenIndex["unreadable"] = [];
  let ignored = 0;

  for (const input of inputs) {
    // YAML でも JSON でも定義は定義（`"page":` も見る）。
    if (!/(^|[{,])\s*"?(page|app)"?\s*:/m.test(input.source)) {
      ignored++;
      continue;
    }
    try {
      const pages = isAppSource(input.source)
        ? parseAppSource(input.source).pages
        : [parsePageYaml(input.source, { strict: false })];
      for (const page of pages) screens.push(entryOf(input.file, page));
    } catch (error) {
      unreadable.push({
        file: input.file,
        reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
      });
    }
  }
  // 並びは「ファイル → id」で固定（同じ入力なら同じ索引になる）。
  screens.sort((a, b) => compare(a.file, b.file) || compare(a.id, b.id));
  return { screens, ignored, unreadable };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function entryOf(file: string, page: PageDefinition): ScreenEntry {
  const brief: PageBrief = briefPage(page);
  return {
    file,
    id: page.id,
    title: page.title,
    kind: page.kind,
    what: brief.what,
    ...("repository" in page && page.repository !== undefined
      ? { repository: page.repository }
      : {}),
    counts: brief.counts,
    brief: brief.line,
    words: wordsOf(page),
  };
}

/**
 * 探すための語。
 *
 * **画面に出ている言葉**（ラベル）と**定義の識別子**（id・項目名・Repository）の両方を
 * 入れる。現場は「得意先」で探し、実装側は `customer` で探すので、どちらでも当たらないと
 * 索引の意味が無い。
 */
function wordsOf(page: PageDefinition): string[] {
  // 種別は**説明の語彙のほうの長い言い方**も入れる（`master` を「検索」で探せるように。
  // 要約の見出し語は「マスタ保守」なので、それだけだと現場の言葉で当たらない）。
  const words: string[] = [
    page.id,
    page.title,
    page.kind,
    PAGE_KINDS[page.kind]?.what ?? "",
  ];
  if ("repository" in page && page.repository !== undefined) {
    words.push(page.repository);
  }
  const add = (items: { field: string; label: string }[]): void => {
    for (const item of items) words.push(item.field, item.label);
  };
  if ("search" in page && page.search !== undefined) add(page.search.filters);
  if ("table" in page) add(page.table.columns);
  if ("form" in page) {
    for (const field of formFields(page.form)) {
      words.push(field.field, field.label);
      add(field.rowFields);
      add(field.columns);
    }
  }
  if ("steps" in page) {
    for (const step of page.steps) {
      words.push(step.title);
      add(step.fields);
    }
  }
  if ("items" in page) {
    for (const item of page.items) words.push(item.id, item.title);
  }
  for (const action of page.actions) words.push(action.id, action.label);
  // 重複を落として、書いてある順を保つ（読んだときに追える並び）。
  return [...new Set(words.filter((word) => word !== ""))];
}

/**
 * 索引を引く。[query] は**語の AND**（空白と読点で切る）。
 *
 * 大文字小文字は無視する。語が1つも無ければ全件（並びはそのまま）。
 */
export function searchIndex(
  index: ScreenIndex,
  query?: string,
): ScreenEntry[] {
  const terms = (query ?? "")
    .split(/[\s、,]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term !== "");
  if (terms.length === 0) return index.screens;
  return index.screens.filter((screen) => {
    const haystack = [screen.brief, ...screen.words].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** 規模（大きい画面から見たいときの並べ替えに使う）。 */
export const sizeOf = (screen: ScreenEntry): number =>
  Object.entries(screen.counts)
    // 必須の数は規模ではないので数えない（項目数に含まれている）。
    .filter(([key]) => key !== "required" && key !== "controlled")
    .reduce((sum, [, value]) => sum + value, 0);

/** 人が読む形。id と画面名の桁を揃えて並べる（そのまま貼れる表）。 */
export function renderIndex(
  screens: ScreenEntry[],
  options: { showFile?: boolean; showSize?: boolean } = {},
): string {
  if (screens.length === 0) return "当てはまる画面はありません。";
  const idWidth = Math.max(...screens.map((screen) => width(screen.id)));
  const titleWidth = Math.max(...screens.map((screen) => width(screen.title)));
  const whatWidth = Math.max(...screens.map((screen) => width(screen.what)));
  const lines = screens.map((screen) => {
    const size =
      options.showSize === true ? `${String(sizeOf(screen)).padStart(3)}  ` : "";
    const tail = options.showFile === false ? "" : `  ${screen.file}`;
    return (
      `${size}${pad(screen.id, idWidth)}  ${pad(screen.title, titleWidth)}  ` +
      `${pad(screen.what, whatWidth)}${tail}`
    );
  });
  return [
    `画面 ${screens.length} 枚${options.showSize === true ? "（規模の大きい順）" : ""}:`,
    ...lines,
  ].join("\n");
}

/** 表示幅（全角は2）。桁を揃えるためだけの目安。 */
const width = (text: string): number =>
  [...text].reduce((sum, c) => sum + (c.charCodeAt(0) > 0xff ? 2 : 1), 0);

const pad = (text: string, to: number): string =>
  text + " ".repeat(Math.max(0, to - width(text)));
