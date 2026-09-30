// 「定義の文字列」から説明のもとを作る層。
//
// CLI・MCP・差分・要約の4箇所が同じ読み方をするための1枚。同じ判断（app か page か、
// strict で読むか、素の document を渡すか）が散ると、道具ごとに結論が違うという
// 一番たちの悪いズレになる。
//
// 常に strict で読む。書き間違いのある定義を説明すると、**書いていないつもりの機能まで
// 説明してしまう**（`witdh` は捨てられるので、幅を指定した気になった説明が出る）。

import { parse as parseYamlText } from "yaml";
import { appAccess, type AppAccess } from "./appAccess.js";
import { parseAppPagesMap, parseAppYaml } from "./appParse.js";
import { type AppDefinition, type PageDefinition } from "./definition.js";
import { type ExplainDocument, explainApp, explainPage } from "./explain.js";
import type { Lang } from "./explainPhrases.js";
import { pageAccess } from "./explainAccess.js";
import { parsePageJson, parsePageYaml } from "./parse.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `app:` の定義か。1つの入り口で両方受けるための判定。
 *
 * JSON（`{ "app": { … } }`）も受ける。定義は YAML でも JSON でも同じものなので、書き方で
 * 道具の答えが変わるのはただの事故（JSON の app を単票として読もうとして落ちる）。行頭か
 * `{` `,` の後ろに出てくるキーを見るのは、JSON では行頭に `{` が来るため。
 */
export const isAppSource = (source: string): boolean =>
  /(^|[{,])\s*"?app"?\s*:/m.test(source);

/** 素の document（YAML でも JSON でも）。 */
export const rawDocument = (source: string): Dict => {
  const parsed = parseYamlText(source);
  return isDict(parsed) ? parsed : {};
};

/** app の中の素のページを、書いてある順に返す。 */
export function rawPagesOf(source: string): Dict[] {
  const app = rawDocument(source).app;
  return isDict(app) && Array.isArray(app.pages)
    ? (app.pages as unknown[]).filter(isDict)
    : [];
}

/**
 * 単票の素のページを、ページ定義として読み直す。
 *
 * **app の中の1枚には使わない**（[[ParsedApp.page]] を引く）。app の語彙
 * （`app.vocabularies`）は1枚だけ読んでも見えないので、`optionsOf` の選択肢が
 * 空になる（0.9.20 まで `explain` の「選べるのは…」が語彙の項目だけ消えていた）。
 */
export const parseOnePage = (raw: Dict): PageDefinition =>
  parsePageJson(JSON.stringify({ page: raw }), { strict: true });

/** 読んだ app と、その中のページ（書いてある順・完全な形）。 */
export interface ParsedApp {
  app: AppDefinition;
  pages: PageDefinition[];
  /**
   * ページ id → ページ定義（**語彙を展開してから読んだもの**＝画面を描く側と同じ）。
   */
  page: Map<string, PageDefinition>;
  /** ページ id → 素のページ（解析後のモデルが落としているものを補う用）。 */
  raw: Map<string, Dict>;
  /**
   * 誰がどの画面を開けるか。
   *
   * 1枚ずつ読んでも出ない値なので、app を読んだここで1度だけ数えて配る（説明・
   * 差分・図・警告が**同じ計算**を使う＝違うことを言わない）。
   */
  access: AppAccess;
}

export function parseAppSource(source: string): ParsedApp {
  const app = parseAppYaml(source, { strict: true });
  const raws = rawPagesOf(source);
  // 画面は**語彙を展開してから**読む（描く側の `parseAppPagesMap` と同じ口）。
  // strict の門番は上の app で1回通しているので、ここでは当てない。
  const page = new Map(Object.entries(parseAppPagesMap(rawDocument(source))));
  return {
    app,
    pages: raws.flatMap((one) => {
      const found = typeof one.id === "string" ? page.get(one.id) : undefined;
      return found === undefined ? [] : [found];
    }),
    page,
    raw: new Map(
      raws
        .filter((page) => typeof page.id === "string")
        .map((page) => [page.id as string, page]),
    ),
    access: appAccess(rawDocument(source)),
  };
}

/** app の中に無いページ id を指されたとき（何があるかまで言う）。 */
export const noSuchPage = (wanted: string, ids: string[]): Error =>
  new Error(
    `ページ "${wanted}" はこの app にありません（${ids.join(" / ")}）。`,
  );

/**
 * 定義1つぶんの説明。[options.page] を渡すと app の中のその1枚だけ。
 *
 * app に `page` を渡すときも app 全体を strict で読む（門番は1箇所でよく、
 * 「隣のページが壊れている app」の1枚だけを説明すると壊れに気づけない）。
 */
export function explainSource(
  source: string,
  options: { page?: string; lang?: Lang } = {},
): ExplainDocument {
  const lang = options.lang ?? "ja";
  if (!isAppSource(source)) {
    return explainPage(
      parsePageYaml(source, { strict: true }),
      (rawDocument(source).page ?? {}) as Dict,
      undefined,
      lang,
    );
  }
  const { app, raw, page, access } = parseAppSource(source);
  if (options.page === undefined) return explainApp(app, access, lang);
  const one = raw.get(options.page);
  const parsed = page.get(options.page);
  if (one === undefined || parsed === undefined) {
    throw noSuchPage(
      options.page,
      app.pages.map((page) => page.id),
    );
  }
  return explainPage(
    parsed,
    one,
    pageAccess(access, options.page),
    lang,
  );
}
