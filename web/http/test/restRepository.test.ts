import { RecordKey } from "@hatake-fw/api/internal";
import { describe, expect, it } from "vitest";

import {
  RepositoryShapeError,
  RepositoryUnauthorizedError,
  RepositoryValidationError,
} from "../src/failure.js";
import { RestRepository, restRepositories, type HttpRequest } from "../src/restRepository.js";

/**
 * **定義が書いている REST と同じものを喋るか。**
 *
 * `hatake openapi` が画面から出す文書と1文字ずつ合わせる所なので、道と問い合わせの
 * 組み立て方を字で見る。送る所は差し替えるので、本物の通信はしない。
 */
const spy = (answer: (request: HttpRequest) => { status: number; body: string }) => {
  const seen: HttpRequest[] = [];
  return {
    seen,
    send: async (request: HttpRequest) => {
      seen.push(request);
      return answer(request);
    },
  };
};

const page = (items: unknown[], totalCount = items.length) =>
  JSON.stringify({ items, totalCount });

describe("一覧（search）", () => {
  it("ページと並べ替えを、OpenAPI が宣言する名前で渡す", async () => {
    const http = spy(() => ({ status: 200, body: page([{ id: 1 }]) }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });

    const result = await repo.search({
      filters: {},
      page: 2,
      pageSize: 25,
      sortField: "code",
      sortAscending: false,
    });

    const url = new URL(http.seen[0].url, "http://x");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(url.searchParams.get("sortField")).toBe("code");
    expect(url.searchParams.get("sortAscending")).toBe("false");
    expect(result.totalCount).toBe(1);
  });

  it("**空の条件は送らない**（`?status=` は「空文字の行」を訊くことになる）", async () => {
    const http = spy(() => ({ status: 200, body: page([]) }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await repo.search({ filters: { status: "", name: null, code: "C-1" }, page: 0, pageSize: 10, sortAscending: true });

    const url = new URL(http.seen[0].url, "http://x");
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("name")).toBe(false);
    expect(url.searchParams.get("code")).toBe("C-1");
  });

  it("並びは同じキーを繰り返す（OpenAPI の配列の書き方）", async () => {
    const http = spy(() => ({ status: 200, body: page([]) }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await repo.search({ filters: { rank: ["A", "B"] }, page: 0, pageSize: 10, sortAscending: true });

    const url = new URL(http.seen[0].url, "http://x");
    expect(url.searchParams.getAll("rank")).toEqual(["A", "B"]);
  });

  it("形が違ったら**黙って空にしない**", async () => {
    const http = spy(() => ({ status: 200, body: JSON.stringify([{ id: 1 }]) }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await expect(repo.search({ filters: {}, page: 0, pageSize: 10, sortAscending: true })).rejects.toBeInstanceOf(
      RepositoryShapeError,
    );
  });
});

describe("1件（findByKey）", () => {
  it("鍵を道に逃がす（スラッシュや空白の入ったコードで別の道を叩かない）", async () => {
    const http = spy(() => ({ status: 200, body: JSON.stringify({ code: "A/B" }) }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await repo.findByKey("A/B 1");
    expect(http.seen[0].url).toBe("/api/customers/A%2FB%201");
  });

  it("複合キーは宣言した順に道の区切りにする", async () => {
    const http = spy(() => ({ status: 200, body: JSON.stringify({ orderNo: "SO-1" }) }));
    const repo = new RestRepository({ collection: "/api/lines", send: http.send });
    await repo.findByKey(new RecordKey({ orderNo: "SO-1", lineNo: 2 }));
    expect(http.seen[0].url).toBe("/api/lines/SO-1/2");
  });

  it("**404 は答え**（失敗ではない）", async () => {
    const http = spy(() => ({ status: 404, body: "" }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    expect(await repo.findByKey("居ない")).toBeNull();
  });
});

describe("失敗の分け方", () => {
  it("401 は「誰が見ているか」の話として分ける", async () => {
    const http = spy(() => ({ status: 401, body: "" }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await expect(repo.findByKey("C-1")).rejects.toBeInstanceOf(RepositoryUnauthorizedError);
  });

  it("400 は項目ごとの文言にほどく（入力欄にそのまま貼れる）", async () => {
    const http = spy(() => ({
      status: 400,
      body: JSON.stringify({ valid: false, errors: [{ field: "code", message: "必須です" }] }),
    }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await expect(repo.create({ code: "" })).rejects.toMatchObject({
      name: "RepositoryValidationError",
      errors: { code: "必須です" },
    });
  });

  it("中身の無い 400 でも 400 のまま（項目名を作り出さない）", async () => {
    const http = spy(() => ({ status: 400, body: "なにか" }));
    const repo = new RestRepository({ collection: "/api/customers", send: http.send });
    await expect(repo.create({})).rejects.toSatisfy(
      (error: unknown) => error instanceof RepositoryValidationError && Object.keys(error.errors).length === 0,
    );
  });
});

describe("まとめて作る（restRepositories）", () => {
  it("定義の名前を道に結ぶ（対応は API の都合で、定義の話ではない）", async () => {
    const http = spy(() => ({ status: 200, body: page([]) }));
    const made = restRepositories({
      baseUrl: "/api/",
      send: http.send,
      collections: { customerRepository: "customers", orderRepository: "orders" },
    });
    expect(Object.keys(made).sort()).toEqual(["customerRepository", "orderRepository"]);

    await made.orderRepository.search({ filters: {}, page: 0, pageSize: 10, sortAscending: true });
    // 末尾の `/` が二重にならない。
    expect(http.seen[0].url.startsWith("/api/orders?")).toBe(true);
  });
});
