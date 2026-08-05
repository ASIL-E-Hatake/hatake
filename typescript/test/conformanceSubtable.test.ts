import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FieldTypes,
  FormValidator,
  parsePageJson,
  type FormPageDefinition,
  type ValidationError,
} from "../src/index.js";

// Shared master-detail validation fixture (spec/conformance), consumed
// identically by the Dart and Java editions, so server-side row validation
// stays the same across languages.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/subtable_validation.json", "utf8"),
);

const key = (e: ValidationError | { field: string; message: string }): string =>
  `${e.field}=${e.message}`;

describe("conformance: subTable validation", () => {
  const page = parsePageJson(JSON.stringify(fixture.page)) as FormPageDefinition;
  const form = page.form;
  const validator = new FormValidator();

  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const actual = validator.validate(form, c.record).errors;
      expect(new Set(actual.map(key))).toEqual(
        new Set((c.expected as any[]).map(key)),
      );
    });
  }
});

describe("subTable field parsing", () => {
  const page = parsePageJson(
    JSON.stringify({
      page: {
        type: "form",
        id: "order_entry",
        title: "受注入力",
        repository: "orderRepository",
        form: {
          sections: [
            {
              fields: [
                {
                  field: "lines",
                  label: "明細",
                  type: "subTable",
                  columns: [
                    { field: "item", label: "品名" },
                    { field: "qty", label: "数量", type: "number", width: 80 },
                  ],
                  fields: [
                    { field: "item", label: "品名", required: true },
                    { field: "qty", label: "数量", type: "number" },
                  ],
                },
              ],
            },
          ],
        },
      },
    }),
  ) as FormPageDefinition;

  const field = page.form.sections[0].fields[0];

  it("parses columns and rowFields", () => {
    expect(field.type).toBe(FieldTypes.subTable);
    expect(field.columns.map((c) => c.field)).toEqual(["item", "qty"]);
    expect(field.columns[1].type).toBe("number");
    expect(field.columns[1].width).toBe(80);
    expect(field.rowFields.map((f) => f.field)).toEqual(["item", "qty"]);
    expect(field.rowFields[0].required).toBe(true);
    expect(field.rowFields[1].type).toBe("number");
  });

  it("leaves columns/rowFields empty for a plain field", () => {
    const plain = parsePageJson(
      JSON.stringify({
        page: {
          type: "form",
          id: "p",
          title: "t",
          repository: "r",
          form: { sections: [{ fields: [{ field: "name", label: "名前" }] }] },
        },
      }),
    ) as FormPageDefinition;
    expect(plain.form.sections[0].fields[0].columns).toEqual([]);
    expect(plain.form.sections[0].fields[0].rowFields).toEqual([]);
  });
});
