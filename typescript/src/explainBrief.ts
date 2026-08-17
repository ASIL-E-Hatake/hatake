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
import { parsePageYaml } from "./parse.js";

/** ページ種別 → 1行に収まる見出し語。 */
const SHORT_KINDS: Record<string, string> = {
  crud: "検索＋一覧＋登録・修正・削除",
  master: "マスタ保守",
  search: "照会（読み取り専用）",
  detail: "1件の照会",
  form: "1件の入力",
  wizard: "段階入力",
  dashboard: "数字とグラフ",
  report: "帳票",
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
}

/** 条件が1つでも付いている項目は「出し分け」がある（読む前に知りたい合図）。 */
const CONTROLLED = (field: FieldDefinition): boolean =>
  field.visibleWhen !== undefined ||
  field.enabledWhen !== undefined ||
  field.readOnlyWhen !== undefined ||
  field.requiredWhen !== undefined;

export function briefPage(page: PageDefinition): PageBrief {
  const counts: Record<string, number> = {};
  const parts: string[] = [];
  const count = (key: string, value: number): number => {
    if (value > 0) counts[key] = value;
    return value;
  };

  if ("search" in page && page.search !== undefined) {
    const filters = count("filters", page.search.filters.length);
    if (filters > 0) parts.push(`条件 ${filters}`);
  }
  if ("table" in page) {
    const columns = count("columns", page.table.columns.length);
    if (columns > 0) parts.push(`列 ${columns}`);
  }
  if ("form" in page) {
    const fields = formFields(page.form);
    const sections = count("sections", page.form.sections.length);
    const required = count("required", fields.filter((f) => f.required).length);
    count("fields", fields.length);
    parts.push(
      `${sections > 1 ? `${sections} 枠に` : ""}項目 ${fields.length}` +
        (required > 0 ? `（必須 ${required}）` : ""),
    );
    count("controlled", fields.filter(CONTROLLED).length);
  }
  if ("steps" in page) {
    const steps = count("steps", page.steps.length);
    const fields = page.steps.flatMap((step) => step.fields);
    count("fields", fields.length);
    count("controlled", fields.filter(CONTROLLED).length);
    parts.push(`ステップ ${steps}（項目 ${fields.length}）`);
  }
  if ("items" in page) {
    const cards = count("cards", page.items.length);
    parts.push(`カード ${cards}`);
  }
  const actions = count("actions", page.actions.length);
  if (actions > 0) parts.push(`ボタン ${actions}`);
  if (counts.controlled !== undefined) {
    parts.push(`条件で出し分け ${counts.controlled} 項目`);
  }
  if (hasRoles(page)) parts.push("権限で出し分けあり");
  if ("repository" in page && page.repository !== undefined) {
    parts.push(`${page.repository} から`);
  }

  const what = SHORT_KINDS[page.kind] ?? page.kind;
  return {
    id: page.id,
    title: page.title,
    kind: page.kind,
    what,
    parts,
    counts,
    line: `${page.title}（${page.id}）… ${what}${parts.length === 0 ? "" : `。${parts.join("、")}`}`,
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
): AppBrief => ({
  headline: `${app.title}（${app.id}）— 画面 ${pages.length} 枚`,
  pages: pages.map(briefPage),
});

/** 定義の文字列から。[options.page] を渡すと app の中のその1枚だけ。 */
export function briefSource(
  source: string,
  options: { page?: string } = {},
): PageBrief | AppBrief {
  if (!isAppSource(source)) {
    return briefPage(parsePageYaml(source, { strict: true }));
  }
  const { app, pages } = parseAppSource(source);
  if (options.page === undefined) return briefApp(app, pages);
  const found = pages.find((page) => page.id === options.page);
  if (found === undefined) {
    throw noSuchPage(
      options.page,
      pages.map((page) => page.id),
    );
  }
  return briefPage(found);
}

/** 人が読む形。app は id と画面名を揃えて並べる（そのまま表として貼れる）。 */
export function renderBrief(brief: PageBrief | AppBrief): string {
  if (!("pages" in brief)) return brief.line;
  const out = [brief.headline, ""];
  const idWidth = Math.max(...brief.pages.map((page) => width(page.id)), 0);
  const titleWidth = Math.max(...brief.pages.map((page) => width(page.title)), 0);
  for (const page of brief.pages) {
    const tail = page.parts.length === 0 ? "" : `。${page.parts.join("、")}`;
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
