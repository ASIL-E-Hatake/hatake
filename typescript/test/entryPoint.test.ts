import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { isEntryPoint } from "../src/entryPoint.js";

/**
 * bin の入口の判定（0.9.26）。
 *
 * npm は bin を `hatake` という名前の**リンク**から起動する。0.9.25 までは起動したファイルの
 * 名前が `cli.js` で終わるかで見ていたので、`npx -p @hatake-fw/api hatake …` は何も出さずに 0 で終わっていた。
 */
const work = mkdtempSync(join(tmpdir(), "hatake-entry-"));
const real = join(work, "cli.js");
writeFileSync(real, "");
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("isEntryPoint", () => {
  it("直に起動されたら真", () => {
    expect(isEntryPoint(pathToFileURL(real).href, real)).toBe(true);
  });

  it("**名前の違うリンク**から起動されても真（`node_modules/.bin/hatake` → `dist/cli.js`）", () => {
    const link = join(work, "hatake");
    try {
      symlinkSync(real, link);
    } catch {
      // リンクを張れない環境（権限の無い Windows）では、この1件は確かめられない。
      return;
    }
    expect(isEntryPoint(pathToFileURL(real).href, link)).toBe(true);
  });

  it("別のファイルから読み込まれただけなら偽（試験から import しても走らない）", () => {
    const other = join(work, "other.js");
    writeFileSync(other, "");
    expect(isEntryPoint(pathToFileURL(real).href, other)).toBe(false);
  });

  it("起動したファイルが分からなければ偽", () => {
    expect(isEntryPoint(pathToFileURL(real).href, undefined)).toBe(false);
    expect(isEntryPoint(pathToFileURL(real).href, join(work, "no-such"))).toBe(false);
  });
});
