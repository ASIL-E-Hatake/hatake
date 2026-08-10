#!/usr/bin/env node
// hatake MCP サーバ。エージェントが**手元に仕様を持たなくても**正しい定義を書けるように、
// 仕様の引き当て・例の取得・検証・雛形・API の形を MCP の道具として出す。
//
// なぜ SDK を使わないか: stdio の MCP は「1行1メッセージの JSON-RPC 2.0」で、必要なのは
// initialize / tools/list / tools/call の3つだけ。業務システムを10年動かす側の都合を
// 考えると、この程度で依存を1つ増やしたくない（CLI と同じ判断）。
// 道具の中身は mcpTools.ts、プロトコルはここ。

import { readFileSync } from "node:fs";
import { hatakeTools, INSTRUCTIONS, type McpTool } from "./mcpTools.js";
import { findSpecDir, SCHEMA_FILE } from "./specDir.js";

/** 名乗るバージョン。新しい順。クライアントの希望がこの中にあればそれに合わせる。 */
export const PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

export const SERVER_INFO = { name: "hatake", version: "0.0.1" } as const;

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const PARSE_ERROR = -32700;

const ok = (id: JsonRpcMessage["id"], result: unknown): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id,
  result,
});

const fail = (
  id: JsonRpcMessage["id"],
  code: number,
  message: string,
): JsonRpcMessage => ({ jsonrpc: "2.0", id, error: { code, message } });

/**
 * メッセージ1つを処理する。通知（id なし）には返事をしないので null を返す。
 *
 * 純関数にしてあるのでテストから普通に呼べる（stdio は [runMcpServer] の仕事）。
 */
export function handleMessage(
  message: JsonRpcMessage,
  tools: McpTool[],
): JsonRpcMessage | null {
  const { id, method, params = {} } = message;
  const isNotification = id === undefined;

  switch (method) {
    case "initialize": {
      const wanted = params.protocolVersion;
      const version =
        typeof wanted === "string" &&
        (PROTOCOL_VERSIONS as readonly string[]).includes(wanted)
          ? wanted
          : PROTOCOL_VERSIONS[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return isNotification ? null : ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    case "tools/call": {
      const name = params.name;
      const tool = tools.find((t) => t.name === name);
      // 知らない道具はプロトコルの誤り、道具の中の失敗は結果として返す（MCP の作法）。
      if (tool === undefined) {
        return fail(
          id,
          INVALID_PARAMS,
          `知らない道具 "${String(name)}" です（tools/list を見てください）。`,
        );
      }
      const args =
        typeof params.arguments === "object" && params.arguments !== null
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        return ok(id, {
          content: [{ type: "text", text: tool.run(args) }],
          isError: false,
        });
      } catch (error) {
        return ok(id, {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        });
      }
    }
    default:
      if (isNotification) return null; // 知らない通知は黙って捨てる
      return fail(id, METHOD_NOT_FOUND, `知らないメソッド "${method}" です。`);
  }
}

/** 1行1メッセージなので、チャンクが途中で切れても壊れないように貯める。 */
export function createLineReader(
  onLine: (line: string) => void,
): (chunk: string) => void {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    let cut = buffer.indexOf("\n");
    while (cut >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (line !== "") onLine(line);
      cut = buffer.indexOf("\n");
    }
  };
}

export interface McpIo {
  /** 標準出力へ1行。**ここに他のものを書いてはいけない**（プロトコルが壊れる）。 */
  send(line: string): void;
  /** ログは標準エラーへ。 */
  log(message: string): void;
}

/**
 * 受け取った行を処理して返事を書く関数を作る。
 * JSON にならない行だけはプロトコルの誤りとして返す。
 */
export function createDispatcher(
  tools: McpTool[],
  io: McpIo,
): (line: string) => void {
  return (line) => {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      io.send(JSON.stringify(fail(null, PARSE_ERROR, "JSON として読めません。")));
      return;
    }
    const response = handleMessage(message, tools);
    if (response !== null) io.send(JSON.stringify(response));
  };
}

const nodeIo: McpIo = {
  send: (line) => process.stdout.write(`${line}\n`),
  log: (message) => process.stderr.write(`${message}\n`),
};

/** stdin/stdout に繋ぐ。spec/ が見つからないときは起動時に理由を出して終わる。 */
export function runMcpServer(io: McpIo = nodeIo, specPath?: string): number {
  const specDir = findSpecDir(specPath);
  if (specDir === null) {
    io.log(
      `spec/${SCHEMA_FILE} が見つかりません。hatake のリポジトリの中で動かすか、` +
        `引数で spec/ の場所を渡してください（hatake-mcp <spec ディレクトリ>）。`,
    );
    return 1;
  }
  const tools = hatakeTools({
    specDir,
    readFile: (path) => readFileSync(path, "utf8"),
  });
  io.log(`hatake MCP サーバ: spec=${specDir} 道具=${tools.length}`);

  const read = createLineReader(createDispatcher(tools, io));
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", read);
  process.stdin.on("end", () => process.exit(0));
  return 0;
}

// bin として呼ばれたときだけ走る（テストからは各関数を直接呼ぶ）。
if (process.argv[1]?.endsWith("mcp.js")) {
  // クライアントが先に閉じたときに落ちない（終了はこちらから静かにやる）。
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
  });
  const code = runMcpServer(nodeIo, process.argv[2]);
  if (code !== 0) process.exit(code);
}
