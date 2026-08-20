import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDto, parsePageJson, toOpenApi } from "../src/index.js";

// Shared OpenAPI emitter fixture (spec/conformance), consumed identically by the
// Java edition. Scalars are compared as strings so numeric representations
// cannot diverge between languages.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dto_openapi.json", "utf8"),
);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        canonical(v),
      ]),
    );
  }
  return String(value);
}

describe("conformance: OpenAPI emitter", () => {
  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const page = parsePageJson(JSON.stringify(c.page));
      const doc = toOpenApi(deriveDto(page), c.options);
      expect(canonical(doc)).toEqual(canonical(c.expected));
    });
  }
});

/// 宣言している問い合わせの名前と、REST クライアントが実際に送る名前。
///
/// 名前は必然的に2箇所にある（サーバが実装する OpenAPI と、送るクライアント）。
/// 片方だけ直しても**失敗しない**のが厄介な所で、サーバは知らない名前を無視する
/// ＝画面は出るのに絞り込みや並びが効かず、どこにもエラーが出ない。
describe("conformance: REST の問い合わせの契約", () => {
  const rest = JSON.parse(
    readFileSync("../spec/conformance/rest_query.json", "utf8"),
  ) as { contract: string[] };

  it("一覧の口が宣言する page / pageSize / sortField / sortAscending", () => {
    const page = parsePageJson(
      JSON.stringify({
        page: {
          type: "search",
          id: "customers",
          title: "顧客照会",
          repository: "customerRepository",
          keyField: "code",
          table: { columns: [{ field: "code", label: "コード" }] },
        },
      }),
    );
    const doc = toOpenApi(deriveDto(page), { basePath: "/api/customers" }) as any;
    const declared = (doc.paths["/api/customers"].get.parameters as any[]).map(
      (p) => p.name as string,
    );
    // 絞り込みの名前は定義ごとに変わるが、契約の4つは必ず在る。
    for (const name of rest.contract) {
      expect(declared, name).toContain(name);
    }
  });
});
