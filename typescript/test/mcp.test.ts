import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDispatcher,
  createLineReader,
  handleMessage,
  PROTOCOL_VERSIONS,
  type JsonRpcMessage,
} from "../src/mcp.js";
import { hatakeTools, parsePageYaml } from "../src/index.js";

// 本物の spec/ を読ませる（モックにすると「仕様と合っているか」を確かめられない）。
const tools = hatakeTools({
  specDir: "../spec",
  readFile: (path) => readFileSync(path, "utf8"),
});

let nextId = 1;
const send = (method: string, params?: Record<string, unknown>) =>
  handleMessage({ jsonrpc: "2.0", id: nextId++, method, params }, tools);

/** 道具を1つ呼んで、返ってきたテキストと成否を取り出す。 */
function call(
  name: string,
  args: Record<string, unknown> = {},
): { text: string; isError: boolean } {
  const response = send("tools/call", { name, arguments: args });
  const result = response?.result as {
    content: { text: string }[];
    isError: boolean;
  };
  expect(response?.error, JSON.stringify(response?.error)).toBeUndefined();
  return { text: result.content[0].text, isError: result.isError };
}

const json = (text: string): any => JSON.parse(text);

describe("MCP プロトコル", () => {
  it("initialize はクライアントの希望バージョンに合わせ、使い方を渡す", () => {
    const response = send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    const result = response?.result as any;
    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.capabilities.tools).toBeDefined();
    expect(result.serverInfo.name).toBe("hatake");
    // instructions は「どの順で使うか」を伝える唯一の場所なので、必ず入れる。
    expect(result.instructions).toContain("hatake_validate");
  });

  it("知らないバージョンを言われたら自分の新しいのを名乗る", () => {
    const result = send("initialize", { protocolVersion: "1999-01-01" })
      ?.result as any;
    expect(result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("通知には返事をしない", () => {
    expect(
      handleMessage(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        tools,
      ),
    ).toBeNull();
    // 知らない通知も黙って捨てる（返事を返すとクライアントが混乱する）。
    expect(
      handleMessage({ jsonrpc: "2.0", method: "notifications/future" }, tools),
    ).toBeNull();
  });

  it("ping に答える", () => {
    expect(send("ping")?.result).toEqual({});
  });

  it("知らないメソッドと知らない道具は JSON-RPC のエラー", () => {
    expect(send("resources/list")?.error?.code).toBe(-32601);
    const unknown = send("tools/call", { name: "hatake_frobnicate" });
    expect(unknown?.error?.code).toBe(-32602);
    expect(unknown?.error?.message).toContain("tools/list");
  });

  it("tools/list は5つの道具を、説明と入力スキーマ付きで出す", () => {
    const list = (send("tools/list")?.result as any).tools;
    expect(list.map((t: any) => t.name)).toEqual([
      "hatake_reference",
      "hatake_examples",
      "hatake_validate",
      "hatake_new_page",
      "hatake_api_shape",
    ]);
    for (const tool of list) {
      // description は AI 向けの契約なので、空だと道具が使われない。
      expect(tool.description.length, tool.name).toBeGreaterThan(80);
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
    expect(
      list.find((t: any) => t.name === "hatake_validate").inputSchema.required,
    ).toEqual(["source"]);
  });
});

describe("hatake_reference", () => {
  it("キー名で引くと、型・既定値・書ける場所が返る", () => {
    const found = json(call("hatake_reference", { name: "rowsPerPage" }).text);
    expect(found.keys[0].node).toBe("report");
    expect(found.keys[0].key.default).toBe(40);
  });

  it("ページ種別で絞れる（関係ないキーを見せない）", () => {
    const only = json(call("hatake_reference", { pageKind: "report" }).text);
    expect(Object.keys(only.nodes)).toContain("report");
    expect(Object.keys(only.nodes)).not.toContain("wizardStep");
  });

  it("名前を省くと全体が返る", () => {
    const all = json(call("hatake_reference").text);
    expect(all.pageKinds).toHaveLength(8);
    expect(all.keyIndex.pageSize).toEqual(["pagination", "subTableSource"]);
  });

  it("無い名前・無いページ種別は道具の失敗として返す", () => {
    const typo = call("hatake_reference", { name: "witdh" });
    expect(typo.isError).toBe(true);
    const kind = call("hatake_reference", { pageKind: "kanban" });
    expect(kind.isError).toBe(true);
    expect(kind.text).toContain("report");
  });
});

describe("hatake_examples", () => {
  it("やりたいことで探せる", () => {
    const found = json(call("hatake_examples", { query: "帳票" }).text);
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe("sales_report.yaml");
    expect(found[0].task).toContain("小計");
  });

  it("ファイル名を渡すと YAML 全文が返る（コピーして直せる）", () => {
    const result = call("hatake_examples", { file: "sales_report.yaml" });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("type: report");
    expect(result.text).toContain("groupBy");
    // 先頭に「何の例か」を付けてから渡す。
    expect(result.text.startsWith("# 売上明細表（report）")).toBe(true);
  });

  it("見つからないときは全件の出し方を教える", () => {
    const miss = call("hatake_examples", { query: "ブロックチェーン" });
    expect(miss.isError).toBe(true);
    expect(miss.text).toContain("query を省く");
  });
});

describe("hatake_validate", () => {
  const good = readFileSync("../spec/examples/customer_master.yaml", "utf8");

  it("正しい定義は種別を返す", () => {
    expect(json(call("hatake_validate", { source: good }).text)).toEqual({
      ok: true,
      kind: "crud",
    });
  });

  it("知らないキーは場所・キー・直し方まで返す", () => {
    const result = call("hatake_validate", {
      source: `
page:
  type: crud
  id: x
  title: X
  repository: xRepository
  table:
    columns:
      - { field: code, label: コード, witdh: 140 }
  form:
    sections:
      - fields:
          - { field: code, label: コード, requred: true }
`,
    });
    const report = json(result.text);
    expect(report.ok).toBe(false);
    expect(report.problems.join("\n")).toContain("width の間違い？");
    expect(report.problems.join("\n")).toContain("required の間違い？");
    // 機械で直したいとき用に、構造化したものも一緒に返す。
    expect(report.unknownKeys.map((k: any) => k.key)).toEqual([
      "requred",
      "witdh",
    ]);
  });

  it("app 定義も受ける", () => {
    const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    expect(json(call("hatake_validate", { source: app }).text).kind).toContain(
      "8 ページ",
    );
  });

  it("source を忘れたら、何が足りないか言う", () => {
    const missing = call("hatake_validate");
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("source は必須");
  });
});

describe("hatake_new_page", () => {
  it("出した雛形が strict を通る（そのまま出発点にできる）", () => {
    const yaml = call("hatake_new_page", {
      kind: "report",
      id: "sales_report",
      title: "売上明細表",
    }).text;
    expect(() => parsePageYaml(yaml, { strict: true })).not.toThrow();
    expect(yaml).toContain("repository: salesRepository");
  });

  it("知らない種別は失敗として返す", () => {
    const bad = call("hatake_new_page", {
      kind: "kanban",
      id: "x",
      title: "X",
    });
    expect(bad.isError).toBe(true);
  });
});

describe("hatake_api_shape", () => {
  const source = readFileSync("../spec/examples/customer_master.yaml", "utf8");

  it("OpenAPI は base path を渡すまで schemas だけ", () => {
    const schemasOnly = json(
      call("hatake_api_shape", { source, format: "openapi" }).text,
    );
    expect(schemasOnly.paths).toBeUndefined();

    const full = json(
      call("hatake_api_shape", {
        source,
        format: "openapi",
        basePath: "/api/customers",
      }).text,
    );
    expect(Object.keys(full.paths)).toContain("/api/customers");
  });

  it("ネイティブ型も出せる", () => {
    expect(call("hatake_api_shape", { source, format: "typescript" }).text)
      .toContain("export interface");
    expect(
      call("hatake_api_shape", { source, format: "java", package: "io.example" })
        .text,
    ).toContain("package io.example;");
  });

  it("書き間違いのある定義からは何も出さない", () => {
    // 間違いを API の形に焼き付けないため、生成系は常に strict で読む。
    const bad = call("hatake_api_shape", {
      source: "page: { type: crud, id: x, title: X, repository: r, keyy: id }",
      format: "dto",
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("key の間違い？");
  });
});

describe("stdio の読み書き", () => {
  it("チャンクが途中で切れても、1行1メッセージに戻す", () => {
    const lines: string[] = [];
    const read = createLineReader((line) => lines.push(line));
    read('{"a":1}\n{"b":');
    read('2}\n\n');
    read('{"c":3}');
    read("\n");
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("JSON にならない行はパースエラーを返し、落ちない", () => {
    const sent: string[] = [];
    const dispatch = createDispatcher(tools, {
      send: (line) => sent.push(line),
      log: () => {},
    });
    dispatch("not json");
    expect(JSON.parse(sent[0]).error.code).toBe(-32700);

    dispatch('{"jsonrpc":"2.0","id":9,"method":"tools/list"}');
    expect(JSON.parse(sent[1]).id).toBe(9);

    // 通知は何も書かない（返事をすると相手が混乱する）。
    dispatch('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    expect(sent).toHaveLength(2);
  });
});

describe("道具の一覧と説明", () => {
  it("道具の名前は hatake_ で始まる（他のサーバと混ざらないように）", () => {
    for (const tool of tools) expect(tool.name.startsWith("hatake_")).toBe(true);
  });

  it("使い方の説明が道具の名前と食い違っていない", () => {
    // instructions に書いた手順の道具が、実際に存在すること。
    const instructions = (send("initialize")?.result as any)
      .instructions as string;
    for (const name of instructions.match(/hatake_[a-z_]+/g) ?? []) {
      expect(
        tools.some((t) => t.name === name),
        `${name} が instructions にあるのに存在しない`,
      ).toBe(true);
    }
  });
});

// 型だけの確認（返り値の形を間違えるとクライアントが黙って無視する）。
const _shape: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: {} };
void _shape;
