// 定義から「どこを叩けば、その画面のデータが来るのか」を出す。
//
// 定義は URL を知らない（知ってはいけない）。ので、基点（`--base`）は人が渡し、
// 集合の名前は `hatake wire` と**同じ推測**で埋める（違う推測をする道具が2つあると、
// 「wire で繋いだのに probe は別の所を見ている」が起きる）。
//
// ここで作るのは要求の形だけ。送るのは [probe] / [attack]。

import type { DtoShape, DtoSpec } from "./dto.js";
import { deriveDto } from "./dto.js";
import type { PageDefinition } from "./definition.js";
import { isAppSource, parseAppSource, parseOnePage, rawDocument } from "./explainSource.js";
import { parsePageYaml } from "./parse.js";
import { type AppAccess, appAccess } from "./appAccess.js";
import { collectionOf } from "./wire.js";

/** 1画面ぶんの叩き先。 */
export interface RestTarget {
  /** ページ id。 */
  page: string;
  /** ページ種別（`search` / `crud` …）。報告の言い方を変えるために持つ。 */
  kind: string;
  /** 定義の `repository:`。 */
  repository: string;
  /** 集合の URL（`http://localhost:8080/api/orders`）。 */
  collection: string;
  /** 一覧を取る URL（問い合わせ文字列つき）。 */
  listUrl: string;
  /** 1回に取る件数（定義に書いてある値）。返ってきた行数を突き合わせる相手。 */
  pageSize: number;
  /** 1件を特定する項目。無い画面（ダッシュボード・帳票）もある。 */
  keyField?: string;
  /** 一覧に出す列（一覧の返りを突き合わせる相手）。 */
  row?: DtoShape;
  /** 1件の返り（1件取得を突き合わせる相手）。 */
  record?: DtoShape;
  /**
   * 書き込むボタン（`create` / `edit` / `delete`）と、それを押せる役割。
   *
   * [attack] は**叩かない**（叩いたら消える）が、「この役割では押せないはずのボタン」を
   * 人が確かめる一覧として出すために持つ。試さなかったことを黙っているほうが危ない。
   */
  writes: WriteAction[];
}

/** 書き込むボタン1つ。`method` は REST 版（hatake_http）が実際に使う方式。 */
export interface WriteAction {
  id: string;
  label: string;
  /** `POST` / `PUT` / `DELETE`。 */
  method: string;
  /** 叩くことになる URL（鍵は `{key}` のまま）。 */
  url: string;
  /** 押せる役割（空＝誰でも）。 */
  roles: string[];
}

export interface RestTargetOptions {
  /** REST の基点。`/api` でも `http://localhost:8080/api` でも。 */
  baseUrl: string;
  /**
   * `repository:` → 集合の名前の上書き（`{orderRepository: "sales-orders"}`）。
   * 推測（複数形）が当たらない所だけ渡す。
   */
  collections?: Record<string, string>;
}

/** 叩けなかった画面と、その理由（黙って飛ばすと「全部見た」に見える）。 */
export interface SkippedPage {
  page: string;
  reason: string;
}

export interface RestTargets {
  targets: RestTarget[];
  skipped: SkippedPage[];
  /** app のときだけ。誰がどの画面を開けるか（[attack] が使う）。 */
  access?: AppAccess;
}

const trimSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

/** 一覧を取るときに必ず送るもの（`RepositoryQuery` の約束。REST 版と同じ綴り）。 */
export function listQuery(pageSize: number): string {
  return `page=0&pageSize=${pageSize}`;
}

/** その画面が1回に取る件数（定義に書いてある値。無ければ既定の 50）。 */
export function pageSizeOf(page: PageDefinition): number {
  if (page.kind === "report") return page.report.limit;
  if ("table" in page) return page.table.pagination.pageSize;
  return 50;
}

const shapeOf = (spec: DtoSpec, role: string): DtoShape | undefined =>
  spec.shapes.find((one) => one.role === role);

/** ボタンの種類 → REST 版が使う方式（`hatake openapi` が宣言している対応）。 */
const WRITE_METHODS: Record<string, string> = {
  create: "POST",
  edit: "PUT",
  delete: "DELETE",
};

function writesOf(
  page: PageDefinition,
  collection: string,
  keyField: string | undefined,
): WriteAction[] {
  const found: WriteAction[] = [];
  for (const action of page.actions) {
    const method = WRITE_METHODS[action.type];
    if (method === undefined) continue;
    found.push({
      id: action.id,
      label: action.label,
      method,
      url:
        method === "POST" || keyField === undefined
          ? collection
          : `${collection}/{${keyField}}`,
      roles: action.roles,
    });
  }
  return found;
}

function targetOf(
  page: PageDefinition,
  options: RestTargetOptions,
): RestTarget | SkippedPage {
  const repository = "repository" in page ? page.repository : undefined;
  if (repository === undefined) {
    // ダッシュボードは `repository:` を省ける（カードごとに書く）。カードを1枚ずつ
    // 叩くと同じ集合を何度も叩くことになるので、画面としては飛ばす。
    return {
      page: page.id,
      reason: "画面に repository が書かれていない（カードごとに書いてある）",
    };
  }
  const base = trimSlash(options.baseUrl);
  const name = options.collections?.[repository] ?? collectionOf(repository);
  const collection = `${base}/${name}`;
  const spec = deriveDto(page);
  const pageSize = pageSizeOf(page);
  return {
    page: page.id,
    kind: page.kind,
    repository,
    collection,
    listUrl: `${collection}?${listQuery(pageSize)}`,
    pageSize,
    keyField: "keyField" in page ? page.keyField : undefined,
    row: shapeOf(spec, "row"),
    record: shapeOf(spec, "response"),
    writes: writesOf(page, collection, "keyField" in page ? page.keyField : undefined),
  };
}

const isSkipped = (one: RestTarget | SkippedPage): one is SkippedPage =>
  "reason" in one;

/**
 * 定義（app でも1枚でも）から叩き先を出す。
 *
 * strict で読む（書き間違いのある定義から叩き先を作ると、**書いたつもりの列**を
 * 「返ってきていない」と言い出す＝サーバのせいにしてしまう）。
 */
export function restTargets(
  source: string,
  options: RestTargetOptions,
): RestTargets {
  const pages: PageDefinition[] = isAppSource(source)
    ? parseAppSource(source).pages
    : [parsePageYaml(source, { strict: true })];
  const found = pages.map((page) => targetOf(page, options));
  return {
    targets: found.filter((one): one is RestTarget => !isSkipped(one)),
    skipped: found.filter(isSkipped),
    access: isAppSource(source) ? appAccess(rawDocument(source)) : undefined,
  };
}

/** app の中の1枚だけを読む（`--page`）。 */
export function restTargetsForPage(
  source: string,
  pageId: string,
  options: RestTargetOptions,
): RestTargets {
  if (!isAppSource(source)) return restTargets(source, options);
  const parsed = parseAppSource(source);
  const raw = parsed.raw.get(pageId);
  if (raw === undefined) {
    throw new Error(
      `ページ "${pageId}" はこの app にありません（${[...parsed.raw.keys()].join(" / ")}）。`,
    );
  }
  const one = targetOf(parseOnePage(raw), options);
  return {
    targets: isSkipped(one) ? [] : [one],
    skipped: isSkipped(one) ? [one] : [],
    access: parsed.access,
  };
}
