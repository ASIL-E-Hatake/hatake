import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { argsRead, checkToolContracts, hatakeTools, INSTRUCTIONS } from "../src/index.js";

const tools = hatakeTools({
  specDir: "../spec",
  readFile: (path) => readFileSync(path, "utf8"),
});

describe("道具の説明と実物が合っているか", () => {
  it("説明・引数・使い方の食い違いが1件も無い", () => {
    // ここが落ちたら、直すのは試験ではなく**説明か実装**（どちらかが嘘）。
    expect(checkToolContracts(tools, INSTRUCTIONS)).toEqual([]);
  });

  it("宣言した引数を run が読んでいないと言う", () => {
    const problems = checkToolContracts(
      [
        {
          name: "hatake_fake",
          title: "偽の道具",
          description: "試験用。",
          inputSchema: {
            type: "object",
            properties: {
              source: { type: "string", description: "定義。" },
              lang: { type: "string", description: "言語。" },
            },
            required: ["source"],
          },
          run(args) {
            return String(args.source);
          },
        },
      ],
      "hatake_fake を使う。",
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"lang"');
    expect(problems[0]).toContain("黙って捨てられる");
  });

  it("run が読んでいる引数の宣言が無いと言う", () => {
    const problems = checkToolContracts(
      [
        {
          name: "hatake_fake",
          title: "偽の道具",
          description: "試験用。",
          inputSchema: { type: "object", properties: {}, required: [] },
          run(args) {
            return String(args.source);
          },
        },
      ],
      "hatake_fake を使う。",
    );
    expect(problems).toEqual([
      'hatake_fake: run が "source" を読んでいるのに宣言が無い（誰も渡せない）。',
    ]);
  });

  it("説明の中の道具名が実在しないと言う（綴り違いの道具を勧めない）", () => {
    const problems = checkToolContracts(
      [
        {
          name: "hatake_fake",
          title: "偽の道具",
          description: "先に hatake_validte に通すこと。",
          inputSchema: { type: "object", properties: {} },
          run() {
            return "";
          },
        },
      ],
      "hatake_fake を使う。",
    );
    expect(problems).toEqual(['hatake_fake: description の "hatake_validte" という道具は無い。']);
  });

  it("使い方に出てこない道具を言う（いつ使うかが無い道具は使われない）", () => {
    const problems = checkToolContracts(
      [
        {
          name: "hatake_fake",
          title: "偽の道具",
          description: "試験用。",
          inputSchema: { type: "object", properties: {} },
          run() {
            return "";
          },
        },
      ],
      "まず近い例を探す。",
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("INSTRUCTIONS に出てこない");
  });

  it("引数の読み方が追えない書き方は、追えないと言う（見たけれど分からなかったを隠さない）", () => {
    const wrapped = (args: Record<string, unknown>): string => JSON.stringify(args);
    expect(argsRead((args) => wrapped(args))).toBeNull();
    expect(argsRead((args) => String(args.source))).toEqual(new Set(["source"]));
  });
});
