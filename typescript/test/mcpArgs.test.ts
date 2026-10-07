import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { advertisedSchema, handleMessage, nearArg, rootedFiles, type McpFiles } from "../src/mcp.js";
import { INSTRUCTIONS } from "../src/mcpTools.js";
import { hatakeTools } from "../src/tools.js";

// 0.9.27 の初見試験（見本の evals/）で見つかった2つ:
//   ・知らない引数を黙って捨てていた（`hatake_reference` に `key` と渡すと全体 10 万字が返る）
//   ・本文しか受け取らない口なので、ファイルに書いた定義を CLI で見に行き、名前だけの npx を打つ
const tools = hatakeTools({
  specDir: "../spec",
  readFile: (path) => readFileSync(path, "utf8"),
});

const CRUD = `page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: customerCode
  table:
    columns:
      - { field: customerCode, label: コード }
`;

let nextId = 1;
function call(name: string, args: Record<string, unknown>, files?: McpFiles) {
  const response = handleMessage(
    { jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } },
    tools,
    files,
  );
  const result = response?.result as { content: { text: string }[]; isError: boolean };
  return { text: result.content[0].text, isError: result.isError };
}

const memoryFiles = (table: Record<string, string>): McpFiles => ({
  read(path) {
    if (!(path in table)) throw new Error(`"${path}" というファイルはありません。`);
    return table[path];
  },
});

describe("知らない引数は断る", () => {
  it("名前を推し量って書いた引数（key / query）は、受け取る名前と例を返して止める", () => {
    for (const wrong of [{ key: "readOnlyWhen" }, { query: "readOnlyWhen" }]) {
      const got = call("hatake_reference", wrong);
      expect(got.isError).toBe(true);
      expect(got.text).toContain(`"${Object.keys(wrong)[0]}"`);
      expect(got.text).toContain("受け取るのは: name /");
      expect(got.text).toContain("pageKind");
      expect(got.text).toContain('{"name":"rowsPerPage"}');
      // 全体（約10万字）を返していない。
      expect(got.text.length).toBeLessThan(1000);
    }
  });

  it("全部の道具に効く（受け取る名前だけなら通る）", () => {
    for (const tool of tools) {
      const got = call(tool.name, { ...tool.example, nonsense: 1 });
      expect(got.isError, tool.name).toBe(true);
      expect(got.text, tool.name).toContain('"nonsense"');
    }
  });
});

describe("定義をファイルで渡す（file_path）", () => {
  it("本文を受け取る道具には file_path が見え、source は必須から外れる", () => {
    const check = tools.find((one) => one.name === "hatake_check")!;
    const schema = advertisedSchema(check) as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schema.properties)).toContain("file_path");
    expect(Object.keys(schema.properties)).not.toContain("file");
    expect(schema.required ?? []).not.toContain("source");
    // 本文を受け取らない道具には足さない。
    const rules = tools.find((one) => one.name === "hatake_rules")!;
    expect(Object.keys((advertisedSchema(rules) as { properties: object }).properties)).not.toContain("file_path");
  });

  it("file_path で渡すと source で渡したのと同じ答えになる", () => {
    const files = memoryFiles({ "definitions/app.yaml": CRUD });
    const byFile = call("hatake_check", { file_path: "definitions/app.yaml" }, files);
    const bySource = call("hatake_check", { source: CRUD });
    expect(byFile.isError).toBe(false);
    expect(byFile.text).toBe(bySource.text);
  });

  it("source と file_path を両方渡す・読む口が無い・無いファイル、は理由つきで断る", () => {
    const files = memoryFiles({ "a.yaml": CRUD });
    expect(call("hatake_check", { file_path: "a.yaml", source: CRUD }, files).text).toContain("どちらか1つ");
    expect(call("hatake_check", { file_path: "a.yaml" }).text).toContain("この入口ではファイルを読めません");
    const missing = call("hatake_check", { file_path: "b.yaml" }, files);
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("b.yaml");
  });

  it("起動したフォルダの外は読ませない", () => {
    const root = mkdtempSync(join(tmpdir(), "hatake-mcp-"));
    mkdirSync(join(root, "definitions"));
    writeFileSync(join(root, "definitions", "app.yaml"), CRUD);
    const files = rootedFiles(root);
    expect(files.read("definitions/app.yaml")).toBe(CRUD);
    expect(() => files.read("../outside.yaml")).toThrow("外です");
    expect(() => files.read(join(tmpdir(), "x.yaml"))).toThrow("外です");
    expect(() => files.read("definitions")).toThrow("ありません");
  });
});

describe("CLI の書き方を AI に渡す", () => {
  it("instructions は npx -p @hatake-fw/api hatake で書き、file_path と知らない引数のことも言う", () => {
    expect(INSTRUCTIONS).toContain("npx -p @hatake-fw/api hatake check");
    expect(INSTRUCTIONS).toContain("file_path");
    expect(INSTRUCTIONS).toContain("知らない引数は断る");
  });
});

describe("近い名前を添える（0.9.29）", () => {
  // 0.9.28 の初見試験で、AI は Claude Code の Write に file を渡して断られていた。
  // 名前を file_path に揃えたので、0.9.28 の名前で渡されたら近い名前を言う。
  it("0.9.28 の file には file_path を、綴り違いには正しい綴りを添える", () => {
    const files = memoryFiles({ "a.yaml": CRUD });
    const old = call("hatake_check", { file: "a.yaml" }, files);
    expect(old.isError).toBe(true);
    expect(old.text).toContain('"file" → "file_path"');
    expect(call("hatake_reference", { pagekind: "crud" }).text).toContain('"pagekind" → "pageKind"');
  });

  it("近い名前が無ければ添えない（推し量って当てない）", () => {
    const got = call("hatake_reference", { key: "readOnlyWhen" });
    expect(got.text).not.toContain("近い名前");
  });

  it("nearArg は一意に決まるときだけ返す", () => {
    expect(nearArg("file", ["source", "file_path", "page"])).toBe("file_path");
    expect(nearArg("path", ["source", "file_path"])).toBe("file_path");
    expect(nearArg("xyz", ["source", "page"])).toBeNull();
  });
});
