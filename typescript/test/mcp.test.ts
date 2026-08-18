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

  it("tools/list は道具を、説明と入力スキーマ付きで出す", () => {
    const list = (send("tools/list")?.result as any).tools;
    expect(list.map((t: any) => t.name)).toEqual([
      "hatake_reference",
      "hatake_examples",
      "hatake_validate",
      "hatake_new_page",
      "hatake_pitfalls",
      "hatake_diff",
      "hatake_explain",
      "hatake_fix",
      "hatake_minimize",
      "hatake_refs",
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

  it("構造の間違いには直し方まで添える", () => {
    // 「知らないキー form」だけでは直せない。どの種別なら書けるのかを渡す。
    const report = json(
      call("hatake_validate", {
        source: [
          "page:",
          "  type: search",
          "  id: order_search",
          "  title: 受注照会",
          "  repository: orderRepository",
          "  form: { sections: [] }",
        ].join("\n"),
      }).text,
    );
    expect(report.ok).toBe(false);
    expect(report.hints.join("\n")).toContain("crud");
  });

  it("通るけれど意図どおり動かない書き方は warnings で返す", () => {
    // エージェントは画面を見ないので、これを返さないと気づく手段が無い。
    const report = json(
      call("hatake_validate", {
        source: [
          "page:",
          "  type: report",
          "  id: sales_report",
          "  title: 売上明細表",
          "  repository: orderRepository",
          "  table:",
          "    columns: [{ field: amount, label: 金額 }]",
          "  report:",
          "    groupBy: [{ field: customer, label: 顧客 }]",
        ].join("\n"),
      }).text,
    );
    expect(report.ok).toBe(true);
    expect(report.warnings[0].rule).toBe("groupby-without-sort");
    expect(report.warnings[0].pitfall).toBe("groupby-without-sort");
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

describe("hatake_pitfalls", () => {
  it("キー名で引くと、なぜ駄目か・正しい書き方が返る", () => {
    const found = json(call("hatake_pitfalls", { query: "groupBy" }).text);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("groupby-without-sort");
    expect(found[0].why).toContain("コントロールブレイク");
    expect(found[0].good).toContain("sort:");
  });

  it("英語でも出せる", () => {
    const found = json(
      call("hatake_pitfalls", { query: "groupBy", lang: "en" }).text,
    );
    expect(found[0].why).toContain("control break");
  });

  it("全件でも引ける", () => {
    expect(json(call("hatake_pitfalls").text).length).toBeGreaterThan(8);
  });
});

describe("hatake_diff", () => {
  const before = readFileSync("../spec/examples/customer_master.yaml", "utf8");

  it("同じ定義なら互換", () => {
    const result = json(call("hatake_diff", { before, after: before }).text);
    expect(result).toMatchObject({ compatible: true, changes: [] });
  });

  it("必須項目を足すと壊れることを言う", () => {
    const after = before.replace(
      "          - field: name",
      "          - { field: tel, label: 電話, required: true }\n          - field: name",
    );
    const result = json(call("hatake_diff", { before, after }).text);
    expect(result.compatible).toBe(false);
    expect(
      result.changes.some(
        (c: { path: string; area: string; impact: string }) =>
          c.area === "api" && c.path.endsWith(".tel") && c.impact === "breaking",
      ),
    ).toBe(true);
  });

  it("画面から消えたものは、壊れなくても「要確認」として言う", () => {
    // 列を1つ落とす（一覧から消える）。
    const after = before
      .split("\n")
      .filter((line) => !(line.includes("顧客名") && line.includes("sortable")))
      .join("\n");
    const result = json(call("hatake_diff", { before, after }).text);
    expect(result.quiet).toBe(false);
    expect(
      result.changes.some(
        (c: { area: string; kind: string }) =>
          c.area === "ui" && c.kind === "column-removed",
      ),
    ).toBe(true);
  });

  it("before / after のどちらかを忘れたら言う", () => {
    const missing = call("hatake_diff", { before });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("after は必須");
  });
});

describe("hatake_fix", () => {
  const typos = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit, aprove]
    columns:
      - { field: orderNo, label: 受注番号, witdh: 140 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
`;

  it("綴り違いを直して、直したものを返す", () => {
    const result = json(call("hatake_fix", { source: typos }).text);
    expect(result.source).toContain("width: 140");
    expect(result.source).toContain("[edit, approve]");
    expect(result.applied).toHaveLength(2);
    expect(result.remaining).toEqual([]);
  });

  it("registry を渡すと、アプリ側の登録名との食い違いも直す", () => {
    const result = json(
      call("hatake_fix", {
        source: typos.replace("orderRepository", "orderRepo"),
        registry: { repositories: ["orderRepository"] },
      }).text,
    );
    expect(result.source).toContain("repository: orderRepository");
  });

  it("直さなかったものは理由つきで返す（そこは AI の仕事）", () => {
    const ambiguous = `page:
  type: dashboard
  id: sales_dashboard
  title: 売上
  repository: orderRepository
  items:
    - { id: total, type: metric, title: 売上合計, value: { aggregate: sum } }
`;
    const result = json(call("hatake_fix", { source: ambiguous }).text);
    expect(result.applied).toEqual([]);
    expect(result.remaining).toEqual(["aggregate-without-field"]);
  });
});

describe("hatake_minimize", () => {
  it("既定値と同じ指定を落として、落としたものも返す", () => {
    const verbose = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号, type: text, sortable: false }
`;
    const result = json(call("hatake_minimize", { source: verbose }).text);
    expect(result.source).not.toContain("sortable: false");
    expect(result.source).toContain("id: order_search");
    expect(result.dropped.map((one: { where: string }) => one.where)).toContain(
      "page.table.columns[0].type",
    );
    // 1行の中の指定を落としただけなら行数は変わらない（短くはなる）。
    expect(result.lines.after).toBeLessThanOrEqual(result.lines.before);
    expect(result.source.length).toBeLessThan(verbose.length);
  });

  it("書き間違いのある定義は短くしない（黙って未知キーを消さない）", () => {
    const typo = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号, witdh: 140 }
`;
    const failed = call("hatake_minimize", { source: typo });
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain("witdh");
  });

  it("落とせるものが無ければ、そのまま返す", () => {
    const lean = `page:
  type: detail
  id: order_detail
  title: 受注詳細
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号 }
`;
    const result = json(call("hatake_minimize", { source: lean }).text);
    expect(result.dropped).toEqual([]);
    expect(result.source).toBe(lean);
  });
});

describe("hatake_explain", () => {
  const source = readFileSync("../spec/examples/customer_master.yaml", "utf8");

  it("何をする画面かを日本語で返す（キー名の羅列にしない）", () => {
    const text = call("hatake_explain", { source }).text;
    expect(text).toContain("検索して一覧に出し");
    expect(text).toContain("データの出どころは customerRepository");
    expect(text).not.toContain("visibleWhen");
  });

  it("app なら画面の一覧、page でその1枚", () => {
    const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    expect(call("hatake_explain", { source: app }).text).toContain("メニュー");
    expect(
      call("hatake_explain", { source: app, page: "sales_report" }).text,
    ).toContain("帳票の体裁");
  });

  it("無い page を指したら、在るものを言う", () => {
    const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    const missing = call("hatake_explain", { source: app, page: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("order_search");
  });

  it("before を渡すと、変更を画面の言葉で言い直す", () => {
    const after = source.replace("label: コード", "label: 顧客コード");
    const text = call("hatake_explain", { source: after, before: source }).text;
    expect(text).toContain("「コード」が無くなりました");
    expect(text).toContain("「顧客コード」が増えました");
    // 後方互換の判定はしないと、出力そのものが言う。
    expect(text).toContain("hatake diff");
  });

  it("brief なら1行だけ（画面一覧や要約に貼る）", () => {
    const text = call("hatake_explain", { source, brief: true }).text;
    expect(text.split("\n")).toHaveLength(1);
    expect(text).toContain("顧客マスタ（customer_master）…");
  });

  it("brief は app なら画面一覧の表になる", () => {
    const app = readFileSync("../spec/examples/sales_app.yaml", "utf8");
    const text = call("hatake_explain", { source: app, brief: true }).text;
    expect(text).toContain("画面 8 枚");
    expect(text).toContain("order_search");
  });
});

describe("hatake_refs", () => {
  const source = readFileSync("../spec/examples/customer_master.yaml", "utf8");

  it("登録が要るものと、要求している全部を分けて返す", () => {
    const result = json(call("hatake_refs", { source }).text);
    // Repository には組み込みが無いので、必ず登録が要る側に出る。
    expect(result.needsRegistration.repositories).toEqual(["customerRepository"]);
    // 組み込みのバリデータは「全部」にはあるが「登録が要る」には出ない。
    expect(result.all.validators).toContain("maxLength");
    expect(result.needsRegistration.validators).toBeUndefined();
  });

  it("source を忘れたら言う", () => {
    const missing = call("hatake_refs", {});
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("source は必須");
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
