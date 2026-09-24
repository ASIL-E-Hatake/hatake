import { describe, expect, it } from "vitest";

import { deriveDto } from "../src/dto.js";
import { toOpenApi } from "../src/openApi.js";
import { parsePageYaml } from "../src/parse.js";

/**
 * **読むだけの画面も、叩く道を宣言する。**
 *
 * 詳細画面は `findByKey` を呼ぶので `GET <collection>/<鍵>` を必ず叩く。なのに
 * 以前は `hatake openapi` がその画面から**道を1本も出していなかった**（画面は
 * 叩くのに宣言には出てこない）。サーバを書く人は、詳細画面のぶんだけ手で足す
 * ことになっていた。複合キーを入れたときに気づいた。
 */
const detail = (key: string) => `
dsl_version: "1.0"
page:
  type: detail
  id: customer_detail
  title: 顧客詳細
  repository: customerRepository
  key: ${key}
  form:
    sections:
      - fields:
          - { field: customerCode, label: 顧客コード }
          - { field: name, label: 顧客名 }
`;

const specOf = (key = "customerCode") =>
  deriveDto(parsePageYaml(detail(key), { strict: true }));

describe("読むだけの画面の受け口", () => {
  it("返す形を持つ（これが無いと道が1本も出なかった）", () => {
    const roles = specOf().shapes.map((one) => one.role);
    expect(roles).toContain("response");
  });

  it("**書く形は持たない**（定義に無い口を宣言しない）", () => {
    const roles = specOf().shapes.map((one) => one.role);
    expect(roles).not.toContain("request");
  });

  it("返す形の項目は、画面に出している項目そのもの", () => {
    const response = specOf().shapes.find((one) => one.role === "response");
    expect(response?.members.map((one) => one.name)).toEqual([
      "customerCode",
      "name",
    ]);
  });

  it("出る道は GET だけ（読むだけの画面なので）", () => {
    const doc = toOpenApi(specOf(), { basePath: "/api/customers" });
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths)).toEqual(["/api/customers/{customerCode}"]);
    expect(Object.keys(paths["/api/customers/{customerCode}"])).toEqual(["get"]);
  });

  it("複合キーなら区切りが項目ぶん並ぶ", () => {
    const doc = toOpenApi(specOf("[customerCode, revision]"), {
      basePath: "/api/customers",
    });
    expect(Object.keys(doc.paths as object)).toEqual([
      "/api/customers/{customerCode}/{revision}",
    ]);
  });

  it("形の並びは変えない（3版で見比べられる順のまま）", () => {
    // request が無いぶん詰まるだけで、response は同じ場所に来る。
    expect(specOf().shapes.map((one) => one.role)).toEqual([
      "response",
      "pathParams",
    ]);
  });
});
