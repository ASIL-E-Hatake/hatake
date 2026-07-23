import { describe, expect, it } from "vitest";
import { parsePageYaml } from "../src/parse.js";
import { FormValidator } from "../src/formValidator.js";
import { ValidatorRegistry } from "../src/validators.js";
import type { CrudPageDefinition } from "../src/definition.js";

const yaml = `
page:
  type: crud
  id: p
  title: t
  repository: r
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true, validators: [ { type: maxLength, value: 3 } ] }
          - { field: email, label: メール, validators: [ { type: email } ] }
`;

const page = parsePageYaml(yaml) as CrudPageDefinition;

describe("FormValidator (server-side)", () => {
  const validator = new FormValidator();

  it("passes a valid record", () => {
    const r = validator.validate(page.form, { code: "AB", email: "a@b.co" });
    expect(r.valid).toBe(true);
  });

  it("flags required and maxLength", () => {
    const r = validator.validate(page.form, { code: "ABCD", email: "" });
    expect(r.errors).toContainEqual({ field: "code", message: "3文字以内で入力してください" });
    // email empty + not required -> ok
    expect(r.errors.find((e) => e.field === "email")).toBeUndefined();
  });

  it("flags bad email", () => {
    const r = validator.validate(page.form, { code: "AB", email: "nope" });
    expect(r.errors).toContainEqual({
      field: "email",
      message: "メールアドレスの形式が正しくありません",
    });
  });

  it("supports custom validators via registry", () => {
    const registry = new ValidatorRegistry({
      even: (v) => {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isNaN(n)) return null;
        return n % 2 === 0 ? null : "偶数を入力してください";
      },
    });
    const custom = new FormValidator(registry);
    const form = {
      sections: [
        {
          columns: 1,
          fields: [
            {
              field: "n",
              label: "N",
              type: "number",
              required: false,
              readOnly: false,
              validators: [{ type: "even", params: {} }],
              options: [],
              normalize: [],
              config: {},
            },
          ],
        },
      ],
    };
    expect(custom.validate(form, { n: 3 }).errors[0].message).toBe("偶数を入力してください");
    expect(custom.validate(form, { n: 4 }).valid).toBe(true);
  });
});
