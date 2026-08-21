// 定義を1行で言う。
//
// [explainPage] の全文はレビューには要るが、**目次には重い**。README・PR 本文・
// 画面一覧に貼るには「何の画面か」と「どれくらいの規模か」だけあればよく、そこまで
// 短くすると人も AI も一目で読める（AI がコンテキストに積むときも軽い）。
//
// 全文と短い形で語彙を変えている: 全文は「検索して一覧に出し、その場で登録・修正・
// 削除までできる画面」、短い形は「検索＋一覧＋登録・修正・削除」。1行に収めるには
// 文ではなく**見出し語**が要る。

import {
  type AppDefinition,
  type FieldDefinition,
  formFields,
  type PageDefinition,
} from "./definition.js";
import { isAppSource, noSuchPage, parseAppSource } from "./explainSource.js";
import { type Lang, PAGE_KINDS, pick } from "./explainPhrases.js";
import { voice } from "./explainVoice.js";
import { parsePageYaml } from "./parse.js";

/**
 * ページ種別 → 1行に収まる見出し語。
 *
 * 語の正は [`spec/vocabulary.json`](../../spec/vocabulary.json)（`pageKinds[].short`）。
 * ここで書き直さずに引くのは、**同じ語を2か所に持たないため**（Dart 版・Java 版の索引も
 * 同じ語を転記しているので、ズレたら現場と実装で画面の呼び方が変わる）。
 */
export const SHORT_KINDS: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_KINDS).map(([kind, words]) => [kind, pick(words.short, "ja")]),
);

/** その言語の見出し語（`--lang en` のときだけ日本語と違う）。 */
const shortKind = (kind: string, lang: Lang): string => {
  const found = PAGE_KINDS[kind];
  return found === undefined ? kind : pick(found.short, lang);
};

export interface PageBrief {
  id: string;
  title: string;
  kind: string;
  /** 種別の見出し語。 */
  what: string;
  /** 規模の内訳（「条件 4」「列 6」…）。 */
  parts: string[];
  /** そのまま貼れる1行。 */
  line: string;
  /** 数だけ（表を作る・多い画面を探すのに使う）。 */
  counts: Record<string, number>;
}

export interface AppBrief {
  headline: string;
  pages: PageBrief[];
  /** 何語で書いてあるか（[renderBrief] が並べ方を選ぶのに使う）。 */
  lang: Lang;
}

/** 条件が1つでも付いている項目は「出し分け」がある（読む前に知りたい合図）。 */
const CONTROLLED = (field: FieldDefinition): boolean =>
  field.visibleWhen !== undefined ||
  field.enabledWhen !== undefined ||
  field.readOnlyWhen !== undefined ||
  field.requiredWhen !== undefined;

export function briefPage(page: PageDefinition, lang: Lang = "ja"): PageBrief {
  const v = voice(lang);
  const counts: Record<string, number> = {};
  const parts: string[] = [];
  const count = (key: string, value: number): number => {
    if (value > 0) counts[key] = value;
    return value;
  };

  if ("search" in page && page.search !== undefined) {
    const filters = count("filters", page.search.filters.length);
    if (filters > 0) parts.push(v.briefFilters(filters));
  }
  if ("table" in page) {
    const columns = count("columns", page.table.columns.length);
    if (columns > 0) parts.push(v.briefColumns(columns));
  }
  if ("form" in page) {
    const fields = formFields(page.form);
    const sections = count("sections", page.form.sections.length);
    const required = count("required", fields.filter((f) => f.required).length);
    count("fields", fields.length);
    parts.push(v.briefFields(fields.length, sections, required));
    count("controlled", fields.filter(CONTROLLED).length);
  }
  if ("steps" in page) {
    const steps = count("steps", page.steps.length);
    const fields = page.steps.flatMap((step) => step.fields);
    count("fields", fields.length);
    count("controlled", fields.filter(CONTROLLED).length);
    parts.push(v.briefSteps(steps, fields.length));
  }
  if ("items" in page) {
    const cards = count("cards", page.items.length);
    parts.push(v.briefCards(cards));
  }
  const actions = count("actions", page.actions.length);
  if (actions > 0) parts.push(v.briefActions(actions));
  if (counts.controlled !== undefined) {
    parts.push(v.briefControlled(counts.controlled));
  }
  if (hasRoles(page)) parts.push(v.briefHasRoles);
  if ("repository" in page && page.repository !== undefined) {
    parts.push(v.briefFrom(page.repository));
  }

  const what = shortKind(page.kind, lang);
  return {
    id: page.id,
    title: page.title,
    kind: page.kind,
    what,
    parts,
    counts,
    line: v.briefLine(page.title, page.id, what, parts),
  };
}

/** roles が1つでも付いていれば、1行でもそう言う（見せすぎの確認に効く）。 */
function hasRoles(page: PageDefinition): boolean {
  if (page.actions.some((action) => action.roles.length > 0)) return true;
  if ("table" in page && page.table.columns.some((c) => c.roles.length > 0)) {
    return true;
  }
  if ("form" in page && formFields(page.form).some((f) => f.roles.length > 0)) {
    return true;
  }
  return false;
}

export const briefApp = (
  app: AppDefinition,
  pages: PageDefinition[],
  lang: Lang = "ja",
): AppBrief => ({
  headline: voice(lang).briefHeadline(app.title, app.id, pages.length),
  pages: pages.map((page) => briefPage(page, lang)),
  lang,
});

/** 定義の文字列から。[options.page] を渡すと app の中のその1枚だけ。 */
export function briefSource(
  source: string,
  options: { page?: string; lang?: Lang } = {},
): PageBrief | AppBrief {
  const lang = options.lang ?? "ja";
  if (!isAppSource(source)) {
    return briefPage(parsePageYaml(source, { strict: true }), lang);
  }
  const { app, pages } = parseAppSource(source);
  if (options.page === undefined) return briefApp(app, pages, lang);
  const found = pages.find((page) => page.id === options.page);
  if (found === undefined) {
    throw noSuchPage(
      options.page,
      pages.map((page) => page.id),
    );
  }
  return briefPage(found, lang);
}

/** 人が読む形。app は id と画面名を揃えて並べる（そのまま表として貼れる）。 */
export function renderBrief(brief: PageBrief | AppBrief): string {
  if (!("pages" in brief)) return brief.line;
  const out = [brief.headline, ""];
  const idWidth = Math.max(...brief.pages.map((page) => width(page.id)), 0);
  const titleWidth = Math.max(...brief.pages.map((page) => width(page.title)), 0);
  const tailOf = voice(brief.lang).briefTail;
  for (const page of brief.pages) {
    const tail = tailOf(page.parts);
    out.push(
      `  ${pad(page.id, idWidth)}  ${pad(page.title, titleWidth)}  ${page.what}${tail}`,
    );
  }
  return out.join("\n");
}

/** 表示幅（全角は2）。桁を揃えるためだけの目安。 */
const width = (text: string): number =>
  [...text].reduce((sum, c) => sum + (c.charCodeAt(0) > 0xff ? 2 : 1), 0);

const pad = (text: string, to: number): string =>
  text + " ".repeat(Math.max(0, to - width(text)));
