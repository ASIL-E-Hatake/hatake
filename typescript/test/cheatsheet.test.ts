import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReference, type ReferenceKey } from "../src/index.js";

// チートシートは「AI に渡す1枚」なので、ここがズレると一番効く形で嘘になる。
// 手で書く文書だが、**組み込みの名前だけは機械で縛る**（実際に過去、フィルタ演算子の
// notEquals とアクション型の navigate/export が落ちていた）。
//
// 約束: 名前の一覧の直前に `<!-- vocab: <ノード>.<キー> -->` を置く。
// マーカーの次の空行までを一覧とみなし、表なら1列目、それ以外は `名前` を全部拾う。

const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

const SHEETS = [
  { file: "../docs/api-cheatsheet.ja.md", name: "日本語版" },
  { file: "../docs/api-cheatsheet.md", name: "English" },
];

/** マーカー付きの一覧を拾う。 */
function vocabBlocks(markdown: string): { target: string; names: string[] }[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: { target: string; names: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = /^<!--\s*vocab:\s*([\w.]+)\s*-->$/.exec(lines[i].trim());
    if (marker === null) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) {
      body.push(lines[j]);
    }
    blocks.push({ target: marker[1], names: namesIn(body) });
  }
  return blocks;
}

/**
 * 表なら1列目（見出しと区切りは飛ばす）、それ以外は行全体から `名前` を全部拾う。
 * 1行に2つ書く（`maxLength` / `minLength`）のもそのまま数える。
 */
function namesIn(body: string[]): string[] {
  const cells = body[0]?.trimStart().startsWith("|")
    ? body.slice(2).map((row) => row.split("|")[1] ?? "")
    : body;
  return [...cells.join("\n").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/** `field.computed.op` → ノード `field.computed` のキー `op`。 */
function keyOf(target: string): ReferenceKey | undefined {
  const cut = target.lastIndexOf(".");
  const node = reference.nodes[target.slice(0, cut)];
  return node?.keys.find((k) => k.key === target.slice(cut + 1));
}

describe("チートシートの組み込み一覧", () => {
  for (const sheet of SHEETS) {
    describe(sheet.name, () => {
      const blocks = vocabBlocks(readFileSync(sheet.file, "utf8"));

      it("印を付けた一覧がある", () => {
        // 印が消えると黙って検査が止まるので、数も見る。
        expect(blocks.length).toBeGreaterThanOrEqual(11);
      });

      for (const block of blocks) {
        it(`${block.target} が DSL と一致する`, () => {
          const key = keyOf(block.target);
          expect(key, `${block.target} は DSL に無い`).toBeDefined();
          expect(key!.values, `${block.target} に組み込みの一覧が無い`).toBeDefined();
          // 並び順は読み物としての都合なので見ない。抜け・余りだけを見る。
          expect([...block.names].sort()).toEqual([...key!.values!].sort());
        });
      }
    });
  }

  it("両方の版が同じ語彙を載せている", () => {
    const targets = SHEETS.map((sheet) =>
      vocabBlocks(readFileSync(sheet.file, "utf8"))
        .map((b) => b.target)
        .sort(),
    );
    expect(targets[0]).toEqual(targets[1]);
  });
});

describe("英語版の入口（llms-en.txt）", () => {
  const llms = readFileSync("../llms-en.txt", "utf8");

  it("英語で読める資料を指している", () => {
    for (const path of [
      "docs/api-cheatsheet.md",
      "spec/reference.json",
      "spec/dsl-spec.md",
      "spec/examples/index.json",
      "spec/pitfalls.json",
    ]) {
      expect(llms, path).toContain(path);
    }
  });

  it("日本語しかない資料には (ja) と書いてある", () => {
    // 英語のモデルに日本語を黙って渡すと、読めると思って読んで確度が落ちる。
    for (const line of llms.split("\n")) {
      if (!line.includes(".ja.md")) continue;
      expect(line, line).toContain("(ja)");
    }
  });
});
