import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hatakeTools } from "../src/tools.js";

// MCP の答えの大きさを見張る（0.9.30）。
//
// 0.9.27 の `hatake_reference` は名前を省くと全体（約10万字）を返していて、**誰も大きさを
// 見ていなかった**。答えが大きすぎると Claude Code は答えをファイルに逃がし、AI は grep で
// 拾い読みになる（見本の初見試験で6回中4回）。0.9.28 で目次にしたが、次に足す道具が同じ
// ことをしても気づく口が無かった。ここで、全部の道具を「そのまま呼べる例」と「大きくなり
// やすい呼び方」で呼んで、線を超えたら落とす。
//
// 線は 2 万字。定義をそのまま返す道具（minimize / fix / apply_advice / 例の全文）は渡した
// 定義の大きさに引っぱられるので、同梱でいちばん大きい定義（sales_app.yaml・約1.2万字）で
// 1.5 万字程度になる。それを超えて伸びるなら、目次にするか絞る引数を足す。
const LIMIT = 20_000;

/** 線を超えてよい呼び方（理由つき）。足すときは、AI がそれを**わざと**頼む形であること。 */
const ALLOWED: { tool: string; args: Record<string, unknown>; why: string }[] = [
  {
    tool: "hatake_reference",
    args: { all: true },
    why: "全体をわざと頼む口（既定は目次）。説明にも「大きすぎる」と書いてある",
  },
];

const tools = hatakeTools({
  specDir: "../spec",
  readFile: (path) => readFileSync(path, "utf8"),
  listDir: () => [],
});
const BIG = readFileSync("../spec/examples/sales_app.yaml", "utf8");

/** 道具ごとの呼び方: 例・同梱でいちばん大きい定義・引数なし（目次や全件が返る道具）。 */
function callsOf(tool: (typeof tools)[number]): [string, Record<string, unknown>][] {
  const calls: [string, Record<string, unknown>][] = [["例", tool.example], ["引数なし", {}]];
  if ("source" in ((tool.inputSchema.properties ?? {}) as object)) {
    calls.push(["大きな定義", { ...tool.example, source: BIG }]);
  }
  if (tool.name === "hatake_examples") calls.push(["いちばん大きい例の全文", { file: "sales_app.yaml" }]);
  if (tool.name === "hatake_reference") calls.push(["全体", { all: true }]);
  return calls;
}

describe("MCP の答えの大きさ", () => {
  it(`どの道具も ${LIMIT.toLocaleString()} 字を超えない（わざと全体を頼む口を除く）`, () => {
    const over: string[] = [];
    for (const tool of tools) {
      for (const [label, args] of callsOf(tool)) {
        let text: string;
        try {
          text = tool.run(args);
        } catch {
          continue; // 断る答えは短い（引数が足りないなど）。ここでは大きさだけを見る。
        }
        const allowed = ALLOWED.some(
          (one) => one.tool === tool.name && JSON.stringify(one.args) === JSON.stringify(args),
        );
        if (!allowed && text.length > LIMIT) over.push(`${tool.name}（${label}）: ${text.length} 字`);
      }
    }
    expect(over).toEqual([]);
  });

  it("引数なしの where / rules は目次を返し、中身は引いたときだけ（見張りで見つかった2本）", () => {
    const run = (name: string, args: Record<string, unknown>) =>
      JSON.parse(tools.find((t) => t.name === name)!.run(args));
    const where = run("hatake_where", {});
    expect(where.index.length).toBeGreaterThan(20);
    expect(Object.keys(where.index[0]).sort()).toEqual(["id", "title", "where"]);
    expect(where.next).toContain("query");
    // 引けば今までどおり中身が返る。
    expect(run("hatake_where", { query: "承認" }).areas[0].how).toBeDefined();

    const rules = run("hatake_rules", {});
    expect(Object.keys(rules.warnings[0]).sort()).toEqual(["rule", "what"]);
    expect(rules.note).toContain("目次");
    expect(run("hatake_rules", { rule: "groupby-without-sort" }).warnings[0].fix).toBeDefined();
  });

  it("例外は本当に大きい（例外の表が古くなっていない）", () => {
    for (const one of ALLOWED) {
      const tool = tools.find((t) => t.name === one.tool)!;
      expect(tool.run(one.args).length, one.why).toBeGreaterThan(LIMIT);
    }
  });
});
