// **アプリ1枚から、サーバの受け口を1つの OpenAPI にする。**
//
// これまで `hatake openapi` は**画面1枚しか読めませんでした**（`onePage`）。
// 業務システムの定義は app（画面が5〜10枚）なので、結局サーバの API 一覧を
// 手で書くことになります。実際、見本1本目では手で書きました。
//
// 集合の名前は `hatake wire` / `hatake probe` と**同じ推測**を使います
// （[collectionOf]）。違う推測をする道具が2つあると、「wire で繋いだのに
// openapi は別の所を書いている」が起きるので。
//
// **同じ Repository を見る画面が2枚あるのは普通**です（受注照会と受注入力）。
// その2枚は同じ集合を指すので、**1つの資源にまとめます**。まとめる時に同じ
// メソッドがぶつかったら、**先に出てきたほうを残して、ぶつかったことを言います**
// （黙って片方を捨てると、書いたはずの口が一覧から消えます）。

import { deriveDto } from "./dto.js";
import { type PageDefinition } from "./definition.js";
import { kOpenApiVersion, type OpenApiOptions, toOpenApi } from "./openApi.js";
import { collectionOf } from "./wire.js";

/** まとめた時にぶつかったもの（人に見せる）。 */
export interface OpenApiClash {
  path: string;
  method: string;
  /** 残したほうの画面 id。 */
  kept: string;
  /** 捨てたほうの画面 id。 */
  dropped: string;
}

export interface OpenApiAppResult {
  document: Record<string, unknown>;
  /** 受け口を持たない画面（ダッシュボード・帳票など）。 */
  skipped: { page: string; why: string }[];
  clashes: OpenApiClash[];
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * app の全画面ぶんを1つの OpenAPI にする。
 *
 * [options.basePath] は**基点だけ**（`/api`）。画面ごとの区切りは Repository 名から
 * 推測します（`orderRepository` → `/api/orders`）。
 */
export function toOpenApiApp(
  pages: PageDefinition[],
  options: OpenApiOptions = {},
): OpenApiAppResult {
  const base = (options.basePath ?? "").replace(/\/$/, "");
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, unknown> = {};
  const skipped: { page: string; why: string }[] = [];
  const clashes: OpenApiClash[] = [];
  /** どの (道, メソッド) をどの画面が先に取ったか。 */
  const owner = new Map<string, string>();

  for (const page of pages) {
    const repository = repositoryOf(page);
    if (repository === undefined) {
      skipped.push({
        page: page.id,
        why: "`repository` を持たない画面（読む口が無い）",
      });
      continue;
    }
    const spec = deriveDto(page);
    const one = toOpenApi(spec, {
      ...options,
      basePath: `${base}/${collectionOf(repository)}`,
    });

    mergeSchemas(schemas, one);
    mergePaths(paths, one, page.id, owner, clashes);
  }

  const document: Record<string, unknown> = {
    openapi: kOpenApiVersion,
    info: {
      title: options.title ?? "hatake",
      version: options.version ?? "1.0.0",
    },
  };
  if (options.basePath !== undefined) document.paths = paths;
  document.components = { schemas };
  return { document, skipped, clashes };
}

function mergeSchemas(
  into: Record<string, unknown>,
  one: Record<string, unknown>,
): void {
  const components = one.components;
  if (!isDict(components) || !isDict(components.schemas)) return;
  for (const [name, schema] of Object.entries(components.schemas)) {
    // 名前は画面 id から作られるので、画面どうしではぶつからない。同じ名前に
    // なるのは全画面で共有する `ValidationError` だけで、中身も同じ。
    into[name] = schema;
  }
}

function mergePaths(
  into: Record<string, Record<string, unknown>>,
  one: Record<string, unknown>,
  pageId: string,
  owner: Map<string, string>,
  clashes: OpenApiClash[],
): void {
  const paths = one.paths;
  if (!isDict(paths)) return;
  for (const [path, operations] of Object.entries(paths)) {
    if (!isDict(operations)) continue;
    into[path] ??= {};
    for (const [method, operation] of Object.entries(operations)) {
      const at = `${method} ${path}`;
      const took = owner.get(at);
      if (took !== undefined) {
        clashes.push({ path, method, kept: took, dropped: pageId });
        continue;
      }
      owner.set(at, pageId);
      into[path][method] = operation;
    }
  }
}

/** その画面が読む Repository（持たない画面もある）。 */
function repositoryOf(page: PageDefinition): string | undefined {
  const raw = (page as unknown as Record<string, unknown>).repository;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}
