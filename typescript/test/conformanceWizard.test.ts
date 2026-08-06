import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FormValidator,
  parsePageJson,
  wizardForm,
  wizardStepForm,
  type ValidationError,
  type WizardPageDefinition,
} from "../src/index.js";

// Shared wizard validation fixture (spec/conformance), consumed identically by
// the Dart and Java editions: a case names the `step` to validate, or null for
// the whole page.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/wizard_validation.json", "utf8"),
);

const key = (e: ValidationError | { field: string; message: string }): string =>
  `${e.field}=${e.message}`;

describe("conformance: wizard validation", () => {
  const page = parsePageJson(
    JSON.stringify(fixture.page),
  ) as WizardPageDefinition;
  const validator = new FormValidator();

  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const step = page.steps.find((s) => s.id === c.step);
      const form = c.step === null ? wizardForm(page) : wizardStepForm(step!);
      const actual = validator.validate(form, c.record).errors;
      expect(new Set(actual.map(key))).toEqual(
        new Set((c.expected as any[]).map(key)),
      );
    });
  }
});

describe("wizard page parsing", () => {
  const page = parsePageJson(
    JSON.stringify({
      page: {
        type: "wizard",
        id: "customer_onboarding",
        title: "顧客登録",
        repository: "customerRepository",
        steps: [
          {
            id: "basic",
            title: "基本情報",
            description: "まず基本情報を",
            layout: { columns: 2 },
            fields: [{ field: "code", label: "コード", required: true }],
          },
          { id: "contact", title: "連絡先", fields: [{ field: "email", label: "メール" }] },
        ],
      },
    }),
  ) as WizardPageDefinition;

  it("parses steps with the section shape", () => {
    expect(page.kind).toBe("wizard");
    expect(page.steps.map((s) => s.id)).toEqual(["basic", "contact"]);
    expect(page.steps[0].description).toBe("まず基本情報を");
    expect(page.steps[0].columns).toBe(2);
    expect(page.steps[0].fields[0].required).toBe(true);
    // layout defaults to a single column.
    expect(page.steps[1].columns).toBe(1);
    expect(page.steps[1].description).toBeUndefined();
  });

  it("exposes a step and the whole page as forms", () => {
    expect(wizardStepForm(page.steps[0]).sections[0].fields.map((f) => f.field))
      .toEqual(["code"]);
    expect(wizardForm(page).sections.map((s) => s.title))
      .toEqual(["基本情報", "連絡先"]);
  });

  it("rejects a wizard without steps", () => {
    expect(() =>
      parsePageJson(
        JSON.stringify({
          page: { type: "wizard", id: "w", title: "W", repository: "r" },
        }),
      ),
    ).toThrow();
  });

  it("rejects a step without an id", () => {
    expect(() =>
      parsePageJson(
        JSON.stringify({
          page: {
            type: "wizard",
            id: "w",
            title: "W",
            repository: "r",
            steps: [{ title: "基本情報" }],
          },
        }),
      ),
    ).toThrow();
  });
});
