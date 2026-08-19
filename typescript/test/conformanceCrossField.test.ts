import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FormValidator,
  parsePageJson,
  type FormPageDefinition,
  type ValidationError,
} from "../src/index.js";

// 項目間の検証（compare）の共有フィクスチャ。Dart 版・Java 版も同じものを食べる
// （検証がフロントとバックでズレないことが、この DSL の値打ちなので）。
const fixture = JSON.parse(
  readFileSync("../spec/conformance/cross_field_validation.json", "utf8"),
);

const key = (e: ValidationError | { field: string; message: string }): string =>
  `${e.field}=${e.message}`;

describe("conformance: cross-field validation", () => {
  // strict で読む＝フィクスチャが「本当に書ける定義」であることも、ここで縛る。
  const page = parsePageJson(JSON.stringify(fixture.page), {
    strict: true,
  }) as FormPageDefinition;
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
