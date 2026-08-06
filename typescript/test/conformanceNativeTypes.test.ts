import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveDto,
  parsePageJson,
  toJavaRecords,
  toTypeScript,
} from "../src/index.js";

// Shared native-type fixture (spec/conformance). Both targets are emitted from
// both editions, so this proves TypeScript and Java produce identical source.
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dto_native_types.json", "utf8"),
);

describe("conformance: native type emitter", () => {
  for (const c of fixture.cases as any[]) {
    const spec = deriveDto(parsePageJson(JSON.stringify(c.page)));

    it(`${c.name} (TypeScript)`, () => {
      expect(toTypeScript(spec)).toBe(`${c.typescript.join("\n")}`);
    });

    it(`${c.name} (Java)`, () => {
      const files = toJavaRecords(spec, c.javaOptions);
      // One file per record, keyed by file name.
      expect(Object.keys(files)).toEqual(Object.keys(c.java));
      for (const [name, lines] of Object.entries(
        c.java as Record<string, string[]>,
      )) {
        expect(files[name]).toBe(lines.join("\n"));
      }
    });
  }
});
