#!/usr/bin/env node
// hatake MCP サーバ。エージェントが**手元に仕様を持たなくても**正しい定義を書けるように、
// 仕様の引き当て・例の取得・検証・雛形・API の形を MCP の道具として出す。
//
// なぜ SDK を使わないか: stdio の MCP は「1行1メッセージの JSON-RPC 2.0」で、必要なのは
// initialize / tools/list / tools/call の3つだけ。業務システムを10年動かす側の都合を
// 考えると、この程度で依存を1つ増やしたくない（CLI と同じ判断）。
// 道具の中身は mcpTools.ts、プロトコルはここ。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { hatakeTools, INSTRUCTIONS, type McpTool } from "./mcpTools.js";
import { findSpecDir, SCHEMA_FILE } from "./specDir.js";
import { TOOL_VERSION } from "./toolVersion.js";
import { isEntryPoint } from "./entryPoint.js";
import { closestKey } from "./strictKeys.js";

/** 名乗るバージョン。新しい順。クライアントの希望がこの中にあればそれに合わせる。 */
export const PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

// 版は配っている `@hatake-fw/api` の版（0.9.23 まで `0.0.1` と名乗っていた）。
export const SERVER_INFO = { name: "hatake", version: TOOL_VERSION } as const;

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
 * 定義を**ファイルで**渡す口（`file_path`）。本文（`source`）を受け取る道具にだけ足す。
 *
 * 0.9.27 の初見試験で、AI は定義をファイルに書いたあと MCP の `hatake_check` ではなく
 * CLI の `check`（道を渡せる）に流れ、registry の別物を走らせうる名前だけの npx を打っていた（6回中5回）。
 * 本文しか受け取らない口だと、ファイルに書いた定義をもう一度貼り直すことになるので。
 * 道具の中ではなくここで扱う＝道具は今までどおり本文だけを知る（約束の試験もそのまま効く）。
 *
 * 名前は 0.9.28 では `file` だった。0.9.28 の初見試験で、AI が Claude Code 自身の `Write` に
 * `file` を渡して断られていた（6回中3回。`Read` / `Write` の引数は `file_path`）。手元の道具と
 * 同じ名前にして、覚える名前を1つにする（0.9.29）。
 */
export interface McpFiles {
  /** 起動したフォルダからの相対の道を読む。外に出る道・無いファイルは理由つきで投げる。 */
  read(path: string): string;
}

/** ファイルの道を受け取る引数の名前（Claude Code の `Read` / `Write` と同じ）。 */
export const FILE_ARG = "file_path";

const FILE_PROPERTY = {
  type: "string",
  description:
    "定義ファイルの道（MCP サーバを起動したフォルダからの相対。例: definitions/app.yaml）。" +
    "source の代わりに渡せる＝ファイルに書いた定義を貼り直さなくてよい。",
} as const;

const propertiesOf = (tool: McpTool): Record<string, unknown> =>
  (tool.inputSchema.properties ?? {}) as Record<string, unknown>;

/** `file_path` を足す道具（本文を受け取り、同じ名前を自分の意味で使っていないもの）。 */
const takesSource = (tool: McpTool): boolean =>
  "source" in propertiesOf(tool) && !(FILE_ARG in propertiesOf(tool));

/** 外に見せる引数の形（本文を受け取る道具には `file_path` を足し、`source` を必須から外す）。 */
export function advertisedSchema(tool: McpTool): Record<string, unknown> {
  if (!takesSource(tool)) return tool.inputSchema;
  const { required: given, ...rest } = tool.inputSchema;
  const required = ((given ?? []) as string[]).filter((one) => one !== "source");
  return {
    ...rest,
    properties: { ...propertiesOf(tool), [FILE_ARG]: FILE_PROPERTY },
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * 推し量って書かれた引数名に近い、受け取る名前（無ければ null）。綴りの近さ（2文字まで）と、
 * 片方がもう片方を含む形（`file` → `file_path`・`path` → `file_path`）を見る。
 */
export function nearArg(given: string, accepted: string[]): string | null {
  const spelled = closestKey(given, accepted);
  if (spelled !== null) return spelled;
  const lower = given.toLowerCase();
  const containing = accepted.filter(
    (one) => lower.length >= 3 && (one.toLowerCase().includes(lower) || lower.includes(one.toLowerCase())),
  );
  return containing.length === 1 ? containing[0] : null;
}

/**
 * 渡された引数を道具に渡せる形にする。だめなら**理由の文**を返す（道具は呼ばない）。
 *
 * **知らない引数は黙って捨てない。** 0.9.27 まで捨てていたので、`hatake_reference` に
 * `{ key: "readOnlyWhen" }` と渡すと名前を省いた扱いになり、全体（約10万字）が返っていた
 * （初見試験の6回中4回）。AI は引数名を推し量って書くので、受け取る名前と例を返す。
 */
export function prepareArgs(
  tool: McpTool,
  args: Record<string, unknown>,
  files: McpFiles | undefined,
): { args: Record<string, unknown> } | { refusal: string } {
  const accepted = [...Object.keys(propertiesOf(tool)), ...(takesSource(tool) ? [FILE_ARG] : [])];
  const unknown = Object.keys(args).filter((one) => !accepted.includes(one));
  if (unknown.length > 0) {
    const hints = unknown
      .map((one) => [one, nearArg(one, accepted)] as const)
      .filter(([, near]) => near !== null)
      .map(([one, near]) => `"${one}" → "${near}"`);
    return {
      refusal:
        `知らない引数 ${unknown.map((one) => `"${one}"`).join(" / ")} です（黙って捨てると、` +
        `渡したつもりの条件が効かないまま答えが返るので止めました）。\n` +
        (hints.length > 0 ? `近い名前: ${hints.join(" / ")}\n` : "") +
        `${tool.name} が受け取るのは: ${accepted.length > 0 ? accepted.join(" / ") : "（引数なし）"}\n` +
        `呼び方の例: ${JSON.stringify(tool.example)}`,
    };
  }
  // 同じ名前を自分で宣言している道具は、そのまま渡す。
  if (!takesSource(tool) || !(FILE_ARG in args)) return { args };
  if ("source" in args) {
    return { refusal: `source と ${FILE_ARG} はどちらか1つにしてください（どちらを読めばいいか決められません）。` };
  }
  const path = args[FILE_ARG];
  if (typeof path !== "string" || path.trim() === "") {
    return { refusal: `${FILE_ARG} には定義ファイルの道を文字で渡してください（例: definitions/app.yaml）。` };
  }
  if (files === undefined) {
    return { refusal: "この入口ではファイルを読めません。source に定義の中身を渡してください。" };
  }
  const { [FILE_ARG]: _path, ...rest } = args;
  try {
    return { args: { ...rest, source: files.read(path) } };
  } catch (error) {
    return { refusal: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * メッセージ1つを処理する。通知（id なし）には返事をしないので null を返す。
 *
 * 純関数にしてあるのでテストから普通に呼べる（stdio は [runMcpServer] の仕事）。
 * ファイルを読む口（`files`）は渡されたときだけ使う（渡さなければ `file` は断る）。
 */
export function handleMessage(
  message: JsonRpcMessage,
  tools: McpTool[],
  files?: McpFiles,
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
          // 説明に**そのまま呼べる例**を継ぎ足す。文で書いた例とは別に持たない＝
          // 渡している例と CI が呼ぶ例が**同じ値**になる（古い例が残らない）。
          description: `${tool.description}

呼び方の例（そのまま渡せます）: ${JSON.stringify(tool.example)}`,
          inputSchema: advertisedSchema(tool),
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
      const given =
        typeof params.arguments === "object" && params.arguments !== null
          ? (params.arguments as Record<string, unknown>)
          : {};
      const prepared = prepareArgs(tool, given, files);
      if ("refusal" in prepared) {
        return ok(id, { content: [{ type: "text", text: prepared.refusal }], isError: true });
      }
      try {
        return ok(id, {
          content: [{ type: "text", text: tool.run(prepared.args) }],
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
  files?: McpFiles,
): (line: string) => void {
  return (line) => {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      io.send(JSON.stringify(fail(null, PARSE_ERROR, "JSON として読めません。")));
      return;
    }
    const response = handleMessage(message, tools, files);
    if (response !== null) io.send(JSON.stringify(response));
  };
}

/**
 * 起動したフォルダ（案件の根）の中だけを読む口。外へ出る道（`../` や絶対の道で別の場所）は
 * 断る＝定義を読ませる口であって、手元のファイルを何でも読ませる口ではない。
 */
export function rootedFiles(root: string): McpFiles {
  return {
    read(path) {
      const full = resolve(root, path);
      const inside = relative(root, full);
      if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
        throw new Error(`"${path}" は起動したフォルダ（${root}）の外です。案件の中の道を渡してください。`);
      }
      if (!existsSync(full) || !statSync(full).isFile()) {
        throw new Error(`"${path}" というファイルはありません（起動したフォルダ ${root} からの相対で探しました）。`);
      }
      return readFileSync(full, "utf8");
    },
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
    // `hatake_doctor` が案件を歩く口（MCP は案件の根で起動される）。
    listDir: (path) => {
      if (!existsSync(path) || !statSync(path).isDirectory()) return null;
      return readdirSync(path, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        dir: entry.isDirectory(),
      }));
    },
  });
  io.log(`hatake MCP サーバ: spec=${specDir} 道具=${tools.length}`);

  const read = createLineReader(createDispatcher(tools, io, rootedFiles(process.cwd())));
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", read);
  process.stdin.on("end", () => process.exit(0));
  return 0;
}

// bin として呼ばれたときだけ走る（テストからは各関数を直接呼ぶ）。`hatake-mcp` という
// 名前のリンクから起動されるので、名前ではなく実体で見る（[isEntryPoint]）。
if (isEntryPoint(import.meta.url)) {
  // クライアントが先に閉じたときに落ちない（終了はこちらから静かにやる）。
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
  });
  const code = runMcpServer(nodeIo, process.argv[2]);
  if (code !== 0) process.exit(code);
}
