import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hatakeTools } from "../src/index.js";

/**
 * **説明に載せた例を、機械が実際に呼ぶ。**
 *
 * 引数の名前が合っていることは `mcpContract.test.ts` が見ている。それでも**例が古い**
 * ことはある（値の形が変わった・必須が増えた・当てられる助言の名前が変わった）。AI は
 * 例を写して呼ぶので、例が嘘だと**最初の1回で転ぶ**＝道具そのものが信用されなくなる。
 *
 * だから CI が全部呼ぶ。落ちたら直すのは**例のほう**（道具を例に合わせない）。
 */
const tools = hatakeTools({
  specDir: "../spec",
  readFile: (path) => readFileSync(path, "utf8"),
});

describe("道具の例は、そのまま呼べる", () => {
  for (const tool of tools) {
    it(`${tool.name} の例が通る`, () => {
      const answer = tool.run(tool.example);
      // 空を返す道具は無い（返すものが無いなら、無いと書いた文が返る）。
      expect(answer.length, `${tool.name} が空を返した`).toBeGreaterThan(0);
    });
  }

  it("道具が1つでも例を持っていなければ落とす", () => {
    // 契約の検査（mcpContract）と二重に見る。あちらは形、ここは中身。
    for (const tool of tools) {
      expect(Object.keys(tool.example).length, tool.name).toBeGreaterThan(0);
    }
  });

  it("例に渡した引数は、全部宣言されている", () => {
    for (const tool of tools) {
      const properties = Object.keys(
        (tool.inputSchema.properties ?? {}) as Record<string, unknown>,
      );
      for (const name of Object.keys(tool.example)) {
        expect(properties, `${tool.name} の example.${name}`).toContain(name);
      }
    }
  });
});
