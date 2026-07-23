import { describe, expect, it } from "vitest";
import { parsePageJson, parsePageYaml } from "../src/parse.js";
import type { CrudPageDefinition } from "../src/definition.js";

const yaml = `
dsl_version: "1.0"
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 顧客名 }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, required: true, validators: [ { type: maxLength, value: 20 } ] }
          - { field: name, label: 顧客名, required: true }
`;

const json = JSON.stringify({
  dsl_version: "1.0",
  page: {
    type: "crud",
    id: "customer_master",
    title: "顧客マスタ",
    repository: "customerRepository",
    key: "id",
    table: {
      columns: [
        { field: "code", label: "コード", sortable: true },
        { field: "name", label: "顧客名" },
      ],
    },
    form: {
      sections: [
        {
          title: "基本情報",
          fields: [
            { field: "code", label: "コード", required: true, validators: [{ type: "maxLength", value: 20 }] },
            { field: "name", label: "顧客名", required: true },
          ],
        },
      ],
    },
  },
});

describe("parse", () => {
  it("parses YAML into a CrudPageDefinition", () => {
    const page = parsePageYaml(yaml) as CrudPageDefinition;
    expect(page.kind).toBe("crud");
    expect(page.id).toBe("customer_master");
    expect(page.table.columns.map((c) => c.field)).toEqual(["code", "name"]);
    expect(page.form.sections[0].fields[0].validators[0]).toEqual({
      type: "maxLength",
      params: { value: 20 },
      message: undefined,
    });
  });

  it("YAML and JSON converge on an identical PageDefinition", () => {
    expect(parsePageJson(json)).toEqual(parsePageYaml(yaml));
  });
});
