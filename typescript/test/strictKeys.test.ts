import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findUnknownKeys,
  parseAppYaml,
  parsePageYaml,
  strictKeyTable,
  UnknownKeysError,
} from "../src/index.js";

// Shared strict-keys fixture (spec/conformance), consumed identically by the
// Dart and Java editions: the same typo is reported at the same place with the
// same suggestion.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/strict_keys.json", "utf8"),
);

describe("conformance: strict keys", () => {
  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      expect(findUnknownKeys(c.document)).toEqual(c.expected);
    });
  }
});

// The checker carries its own key table, so it could drift from the spec. This
// makes that impossible: every closed node in the schema must match exactly.
const schema = JSON.parse(
  readFileSync("../spec/hatake-page.schema.json", "utf8"),
);

function schemaKeys(node: string): string[] | null {
  const defs = schema.$defs;
  let target: any;
  if (node === "") target = schema;
  else if (node.includes(".")) {
    const [parent, property] = node.split(".");
    target = defs[parent]?.properties?.[property];
  } else target = defs[node];
  if (!target || target.additionalProperties !== false) return null;
  return Object.keys(target.properties ?? {}).sort();
}

describe("strict key table vs schema", () => {
  it("every node the checker closes matches the schema", () => {
    for (const [node, keys] of Object.entries(strictKeyTable)) {
      expect(schemaKeys(node), `${node}: スキーマに閉じたノードが無い`).not.toBeNull();
      expect([...keys].sort(), node).toEqual(schemaKeys(node));
    }
  });

  it("every closed node in the schema is checked", () => {
    const missing = [...Object.keys(schema.$defs), ""].filter(
      (name) => schemaKeys(name) !== null && !(name in strictKeyTable),
    );
    expect(missing).toEqual([]);
  });
});

describe("strict parse", () => {
  // The typos are on optional keys on purpose: a misspelled *required* key
  // already fails, because the parser then cannot find the value it needs.
  const yaml = `
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: code, label: コード, requred: true, readonly: true }
`;

  it("ignores unknown keys by default", () => {
    expect(() => parsePageYaml(yaml)).not.toThrow();
  });

  it("reports every unknown key at once, with suggestions", () => {
    try {
      parsePageYaml(yaml, { strict: true });
      throw new Error("expected UnknownKeysError");
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownKeysError);
      const error = e as UnknownKeysError;
      expect(error.keys.map((k) => k.key)).toEqual(["readonly", "requred"]);
      expect(error.keys.map((k) => k.suggestion)).toEqual([
        "readOnly",
        "required",
      ]);
      expect(error.message).toContain("page.form.sections[0].fields[0]");
      expect(error.message).toContain("required の間違い？");
    }
  });

  it("strict works on app documents too", () => {
    expect(() =>
      parseAppYaml(
        `
app:
  id: sales_admin
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search, ikon: list }
  pages:
    - { type: search, id: order_search, title: 受注照会, repository: orderRepository }
`,
        { strict: true },
      ),
    ).toThrow(UnknownKeysError);
  });

  it("every shipped example passes strict", () => {
    for (const file of [
      "customer_master",
      "product_search",
      "dept_master",
      "customer_detail",
      "customer_form",
      "order_entry",
      "order_entry_paged",
      "customer_wizard",
      "sales_dashboard",
      "sales_report",
    ]) {
      const source = readFileSync(`../spec/examples/${file}.yaml`, "utf8");
      expect(() => parsePageYaml(source, { strict: true }), file).not.toThrow();
    }
    const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    expect(() => parseAppYaml(app, { strict: true })).not.toThrow();
  });
});
