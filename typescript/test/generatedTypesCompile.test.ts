import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Checks that the generated TypeScript actually typechecks.
 *
 * The conformance suite only proves the two editions agree; it cannot catch both
 * emitting source that does not compile. (The Java side of this check caught a
 * real bug: every record was emitted into one file, violating "one public
 * top-level type per file".)
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dto_native_types.json", "utf8"),
);

describe("generated TypeScript typechecks", () => {
  for (const c of fixture.cases as any[]) {
    it(c.name, () => {
      const dir = mkdtempSync(join(tmpdir(), "hatake-generated-"));
      writeFileSync(join(dir, "generated.ts"), c.typescript.join("\n"), "utf8");
      // Its own tsconfig with `types: []`, so the compile is hermetic: a bare
      // `tsc <file>` pulls in every @types package it can see and would fail on
      // their problems instead of the generated code's.
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: "es2022",
            noEmit: true,
            types: [],
          },
          files: ["generated.ts"],
        }),
        "utf8",
      );

      // Throws (with tsc's diagnostics) when the generated source is invalid.
      expect(() =>
        execFileSync("npx", ["tsc", "-p", dir], {
          encoding: "utf8",
          stdio: "pipe",
        }),
      ).not.toThrow();
    });
  }
}, 120_000);
