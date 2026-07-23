import { describe, expect, it } from "vitest";
import { parsePageYaml } from "../src/parse.js";
import { buildQuery } from "../src/query.js";
import type { SearchPageDefinition } from "../src/definition.js";

const yaml = `
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  search:
    filters:
      - { field: name,   label: 商品名, type: text,   operator: contains }
      - { field: price,  label: 価格,   type: number, operator: gte }
      - { field: status, label: 状態,   type: select, operator: equals }
`;

const search = (parsePageYaml(yaml) as SearchPageDefinition).search;

describe("buildQuery", () => {
  it("builds conditions from declared filters, coercing by type", () => {
    const q = buildQuery(search, { name: "りんご", price: "100", status: "active" });
    expect(q.conditions).toEqual([
      { field: "name", operator: "contains", value: "りんご" },
      { field: "price", operator: "gte", value: 100 }, // coerced to number
      { field: "status", operator: "equals", value: "active" },
    ]);
  });

  it("ignores params not declared as filters (allowlist)", () => {
    const q = buildQuery(search, { name: "x", "; DROP TABLE": 1, secret: "y" });
    expect(q.conditions.map((c) => c.field)).toEqual(["name"]);
  });

  it("skips empty values", () => {
    const q = buildQuery(search, { name: "", price: "50" });
    expect(q.conditions.map((c) => c.field)).toEqual(["price"]);
  });

  it("reads pagination and validates sort field against the allowlist", () => {
    const q = buildQuery(search, { page: "2", pageSize: "20", sortField: "price" });
    expect(q.page).toBe(2);
    expect(q.pageSize).toBe(20);
    expect(q.sortField).toBe("price");

    const bad = buildQuery(search, { sortField: "evil" });
    expect(bad.sortField).toBeUndefined();
  });
});
