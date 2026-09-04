import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FormValidator,
  parsePageJson,
  type FormPageDefinition,
  type ValidationError,
} from "../src/index.js";

// 項目間の検証（compare）と、**どれを先に言うか**の共有フィクスチャ。Dart 版・Java 版も
// 同じものを食べる（検証がフロントとバックでズレないことが、この DSL の値打ちなので）。
const key = (e: ValidationError | { field: string; message: string }): string =>
  `${e.field}=${e.message}`;

function runFixture(name: string, file: string): void {
  const fixture = JSON.parse(readFileSync(`../spec/conformance/${file}`, "utf8"));

  describe(`conformance: ${name}`, () => {
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
}

runFixture("cross-field validation", "cross_field_validation.json");
// 1項目で複数落ちたとき、自分の形が先・他の項目に依るものが後。
runFixture("which error is reported first", "validation_order.json");
