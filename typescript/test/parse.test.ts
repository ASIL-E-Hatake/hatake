import { describe, expect, it } from "vitest";
import { DefinitionParseError } from "../src/index.js";
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

describe("action hooks", () => {
  const withAction = (action: string) =>
    parsePageYaml(`
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  actions:
${action}
`) as CrudPageDefinition;

  it("carries confirm and onSuccess", () => {
    const action = withAction(`    - id: delete
      type: delete
      label: 削除
      confirm: { title: 顧客の削除, message: よろしいですか？, okLabel: 削除する, danger: true }
      onSuccess: { message: 削除しました, page: customer_list, params: { id: $row.id } }`)
      .actions[0];
    expect(action.confirm).toEqual({
      title: "顧客の削除",
      message: "よろしいですか？",
      okLabel: "削除する",
      cancelLabel: undefined,
      danger: true,
    });
    expect(action.onSuccess).toEqual({
      message: "削除しました",
      page: "customer_list",
      params: { id: "$row.id" },
    });
  });

  it("no hooks is the normal case", () => {
    const action = withAction(
      "    - { id: create, type: create, label: 新規 }",
    ).actions[0];
    expect(action.confirm).toBeUndefined();
    expect(action.onSuccess).toBeUndefined();
  });

  // `hatake validate` で気づけるようにする（strict はキーだけ見て必須は見ない）。
  it("a confirmation with nothing to read is an error", () => {
    expect(() =>
      withAction(
        "    - { id: delete, type: delete, label: 削除, confirm: { danger: true } }",
      ),
    ).toThrow(DefinitionParseError);
  });
});
