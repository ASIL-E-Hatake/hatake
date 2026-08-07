import { describe, expect, it } from "vitest";
import {
  deriveDto,
  parsePageYaml,
  type DetailPageDefinition,
  type MasterPageDefinition,
} from "../src/index.js";

// `master` / `detail` were the two page kinds this edition could not parse, which
// made the CLI unable to validate 2 of the 8 kinds. These pin the behaviour.
const body = `
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  search:
    filters:
      - { field: name, label: 顧客名, type: text, operator: contains }
  table:
    columns:
      - { field: code, label: コード }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
`;

describe("master pages", () => {
  const page = parsePageYaml(
    `page:\n  type: master${body}`,
  ) as MasterPageDefinition;

  it("parses like crud, keeping its own kind", () => {
    expect(page.kind).toBe("master");
    expect(page.table.columns).toHaveLength(1);
    expect(page.form.sections[0].fields[0].required).toBe(true);
    expect(page.search?.filters[0].operator).toBe("contains");
  });

  it("derives the same API shapes a crud page would", () => {
    const crud = parsePageYaml(`page:\n  type: crud${body}`);
    expect(deriveDto(page)).toEqual(deriveDto(crud));
  });
});

describe("detail pages", () => {
  const page = parsePageYaml(`
page:
  type: detail
  id: customer_detail
  title: 顧客詳細
  repository: customerRepository
  key: id
  form:
    sections:
      - fields:
          - { field: code, label: コード }
`) as DetailPageDefinition;

  it("parses its read-only form", () => {
    expect(page.kind).toBe("detail");
    expect(page.form.sections[0].fields[0].field).toBe("code");
  });

  it("implies no request payload — it is read-only", () => {
    // Its `form` describes what comes back, not what goes in, so the only shape
    // is the key in the path.
    expect(deriveDto(page).shapes.map((s) => s.role)).toEqual(["pathParams"]);
  });
});
