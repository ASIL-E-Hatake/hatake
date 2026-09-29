import { RecordKey } from "@hatake-fw/api/internal";
import type { DataRecord, PageResult, Repository, RepositoryQuery } from "@hatake-fw/runtime";

import {
  RepositoryHttpError,
  RepositoryShapeError,
  RepositoryUnauthorizedError,
  RepositoryValidationError,
} from "./failure.js";

/** 1回ぶんの呼び出し（送るのはアプリ。`fetch` でもモックでもよい）。 */
export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

/** 送る口。**枠組みは送らない**（認証・再試行・計測はアプリの都合）。 */
export type HttpSend = (request: HttpRequest) => Promise<HttpResponse>;

/** 呼び出しごとに足す見出し（トークン・テナント・追跡 id）。 */
export type HttpHeaders = () => Promise<Record<string, string>> | Record<string, string>;

/**
 * 定義が既に書いている REST をそのまま叩く [[Repository]]。
 *
 * `hatake openapi` が画面から出す OpenAPI と**同じものを喋る**ので、API の契約と
 * 呼ぶ側が「二度書いた同じ文」になる（二つの推測ではなく）:
 *
 * ```
 * GET    <collection>?page=&pageSize=&sortField=&sortAscending=&<条件…>  → {items, totalCount}
 * POST   <collection>                                                    → 作ったレコード
 * GET    <collection>/{key}                                              → レコード（404 → null）
 * PUT    <collection>/{key}                                              → 直したレコード
 * DELETE <collection>/{key}                                              → 204
 * ```
 *
 * **送るのはここではない**（[[HttpSend]]）。失敗も型を付けるだけで解釈しない。
 *
 * 違う形を返すサーバのためにここを曲げない。**Repository を手で書けばよい**
 * （5つのメソッドしかないし、枠組みはそもそも HTTP を知らない）。
 */
export class RestRepository implements Repository {
  readonly collection: string;
  private readonly _send: HttpSend;
  private readonly _headers?: HttpHeaders;

  constructor(options: { collection: string; send: HttpSend; headers?: HttpHeaders }) {
    // 末尾の `/` は道を組むときに二重になるので、ここで落とす。
    this.collection = options.collection.replace(/\/+$/, "");
    this._send = options.send;
    this._headers = options.headers;
  }

  async search(query: RepositoryQuery): Promise<PageResult> {
    const params = new URLSearchParams();
    for (const [field, value] of Object.entries(query.filters)) {
      // **空は送らない。** `?status=` は「status が空文字の行」を訊くことになる。
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        // 並びは**同じキーを繰り返す**（OpenAPI が配列をそう宣言する）。
        for (const one of value) {
          if (one !== null && one !== undefined && String(one) !== "") params.append(field, String(one));
        }
        continue;
      }
      if (String(value) === "") continue;
      params.append(field, String(value));
    }
    params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize));
    if (query.sortField !== undefined) {
      params.set("sortField", query.sortField);
      params.set("sortAscending", String(query.sortAscending));
    }

    const url = `${this.collection}?${params.toString()}`;
    const what = `GET ${url}`;
    const json = await this._json(await this._call("GET", url), what);

    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      throw new RepositoryShapeError(what, "{items, totalCount}", shapeOf(json));
    }
    const holder = json as Record<string, unknown>;
    const items = holder["items"];
    const total = holder["totalCount"];
    if (!Array.isArray(items) || typeof total !== "number") {
      throw new RepositoryShapeError(what, "{items: [], totalCount: 0}", `{${Object.keys(holder).join(", ")}}`);
    }
    return { items: items.map((one) => asRecord(one, what)), totalCount: Math.trunc(total) };
  }

  async findByKey(key: unknown): Promise<DataRecord | null> {
    const url = this._item(key);
    const response = await this._call("GET", url);
    // **見つからないのは答えであって失敗ではない。** 契約が null を返すと言っていて、
    // 消したあとに辿り着くのはむしろ普通。
    if (response.status === 404) return null;
    return asRecord(await this._json(response, `GET ${url}`), `GET ${url}`);
  }

  async create(data: DataRecord): Promise<DataRecord> {
    const what = `POST ${this.collection}`;
    return asRecord(await this._json(await this._call("POST", this.collection, data), what), what);
  }

  async update(key: unknown, data: DataRecord): Promise<DataRecord> {
    const url = this._item(key);
    return asRecord(await this._json(await this._call("PUT", url, data), `PUT ${url}`), `PUT ${url}`);
  }

  async delete(key: unknown): Promise<void> {
    const url = this._item(key);
    this._raiseFor(await this._call("DELETE", url), `DELETE ${url}`);
  }

  /**
   * `<collection>/<鍵>`（複合キーは `<collection>/<値1>/<値2>`）。
   *
   * 値は1つずつ逃がす。**取引先コードにスラッシュや空白が入ることは普通に在り**、
   * そのまま貼ると黙って別の道を叩く。
   *
   * 複合キーを宣言した順に道の区切りとして並べるのは、単一キーのときと形を変えない
   * ため（`GET /{key}` の素直な一般化）。順番が変われば別の1件を指すので、`key` の
   * 並びは URL の一部だと思って扱う。
   */
  private _item(key: unknown): string {
    const parts = key instanceof RecordKey ? key.values.map(String) : [String(key)];
    return [this.collection, ...parts.map(encodeURIComponent)].join("/");
  }

  private async _call(method: string, url: string, body?: DataRecord): Promise<HttpResponse> {
    const extra = this._headers === undefined ? {} : await this._headers();
    return this._send({
      method,
      url,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json; charset=utf-8" }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** 2xx でない答えを、それに合う失敗にする。 */
  private _raiseFor(response: HttpResponse, request: string): void {
    if (response.status >= 200 && response.status < 300) return;
    if (response.status === 401 || response.status === 403) {
      throw new RepositoryUnauthorizedError(response.status, request, response.body);
    }
    if (response.status === 400) {
      throw new RepositoryValidationError(response.status, request, fieldErrors(response.body), response.body);
    }
    throw new RepositoryHttpError(response.status, request, response.body);
  }

  private async _json(response: HttpResponse, request: string): Promise<unknown> {
    this._raiseFor(response, request);
    if (response.body.trim() === "") return null;
    try {
      return JSON.parse(response.body);
    } catch (error) {
      throw new RepositoryShapeError(request, "JSON", String(error));
    }
  }
}

/**
 * `{valid, errors: [{field, message}]}` → 項目名 → 文言。
 *
 * それ以外の形なら**空**。中身の無い 400 も 400 のままで、項目名を作り出すと
 * 違う入力欄に文言が付く。
 */
function fieldErrors(body: string): Record<string, string> {
  try {
    const json: unknown = JSON.parse(body);
    if (json === null || typeof json !== "object") return {};
    const errors = (json as Record<string, unknown>)["errors"];
    if (!Array.isArray(errors)) return {};
    const out: Record<string, string> = {};
    for (const one of errors) {
      if (one !== null && typeof one === "object") {
        const each = one as Record<string, unknown>;
        if (typeof each["field"] === "string") out[each["field"]] = String(each["message"] ?? "");
      }
    }
    return out;
  } catch {
    return {};
  }
}

const shapeOf = (json: unknown): string =>
  json === null ? "null" : Array.isArray(json) ? "配列" : typeof json === "object" ? "object" : String(json);

function asRecord(json: unknown, request: string): DataRecord {
  if (json !== null && typeof json === "object" && !Array.isArray(json)) return json as DataRecord;
  throw new RepositoryShapeError(request, "1件のレコード（object）", shapeOf(json));
}

/**
 * 定義が名指ししている Repository ぶんの [[RestRepository]] をまとめて作る。
 *
 * `collections` が定義の `repository:` を道に結ぶ。**この対応は API の都合**で
 * 定義の話ではない（同じ画面が、ある環境では `/api/v2/customers`、別の環境では
 * `/customers` を指すことがある）。
 *
 * ```ts
 * repositories: new RepositoryRegistry(restRepositories({
 *   baseUrl: "/api",
 *   send: fetchSend(),
 *   headers: async () => ({ authorization: `Bearer ${await session.token()}` }),
 *   collections: { customerRepository: "customers", orderRepository: "orders" },
 * }))
 * ```
 */
export function restRepositories(options: {
  baseUrl: string;
  send: HttpSend;
  collections: Readonly<Record<string, string>>;
  headers?: HttpHeaders;
}): Record<string, Repository> {
  const base = options.baseUrl.replace(/\/+$/, "");
  const out: Record<string, Repository> = {};
  for (const [name, path] of Object.entries(options.collections)) {
    out[name] = new RestRepository({
      collection: `${base}/${path}`,
      send: options.send,
      headers: options.headers,
    });
  }
  return out;
}

/** ブラウザの `fetch` で送る口。**これだけは配る**（誰が書いても同じになるので）。 */
export const fetchSend =
  (init: RequestInit = {}): HttpSend =>
  async (request) => {
    const response = await fetch(request.url, {
      ...init,
      method: request.method,
      headers: { ...request.headers, ...(init.headers as Record<string, string> | undefined) },
      body: request.body,
    });
    return { status: response.status, body: await response.text() };
  };
