import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 手引き（docs/guide/vscode.ja.md）と、tool/shots.sh が撮った画像が食い違っていないか。
// 画像は撮り直すもの（手で撮らない）なので、撮る側と貼る側の名前がずれると黙って切れる。
const DOCS = join(__dirname, "..", "..", "docs", "guide");
const guide = readFileSync(join(DOCS, "vscode.ja.md"), "utf8");
const used = [...guide.matchAll(/!\[[^\]]*\]\((images\/vscode\/[^)]+)\)/g)].map((one) => one[1]);
const placed = readdirSync(join(DOCS, "images", "vscode"))
  .filter((name) => name.endsWith(".png"))
  .map((name) => `images/vscode/${name}`);

describe("VS Code 拡張の手引きと画像", () => {
  it("手引きが貼っている画像は全部在る", () => {
    expect(used.filter((one) => !placed.includes(one))).toEqual([]);
  });

  it("撮った画像は全部手引きに貼ってある（撮りっぱなしにしない）", () => {
    expect(placed.filter((one) => !used.includes(one))).toEqual([]);
    expect(placed.length).toBeGreaterThanOrEqual(8);
  });

  it("撮る手順（shots.e2e.mjs）が撮る名前と、手引きの名前が同じ", () => {
    const script = readFileSync(join(__dirname, "shots.e2e.mjs"), "utf8");
    const shot = [...script.matchAll(/shot\("([^"]+)"/g)].map((one) => `images/vscode/${one[1]}.png`);
    expect([...shot].sort()).toEqual([...used].sort());
  });
});
