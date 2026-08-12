import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FormValidator,
  parsePageJson,
  type FormPageDefinition,
  type ValidationError,
} from "../src/index.js";

// Shared conditional-validation fixture (spec/conformance), consumed identically
// by the Dart and Java editions: hidden fields are not validated, `requiredWhen`
// makes a field required, and an unknown mode leaves mode conditions false.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/conditional_validation.json", "utf8"),
);

const key = (e: ValidationError | { field: string; message: string }): string =>
  `${e.field}=${e.message}`;

describe("conformance: conditional validation", () => {
  const page = parsePageJson(
    JSON.stringify(fixture.page),
  ) as FormPageDefinition;
  const validator = new FormValidator();

  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const actual = validator.validate(page.form, c.record, c.mode).errors;
      expect(new Set(actual.map(key))).toEqual(
        new Set((c.expected as any[]).map(key)),
      );
    });
  }
});
