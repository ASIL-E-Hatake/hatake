#!/usr/bin/env node
// hatake CLI — 定義を「書いた → すぐ検証」の1コマンドにする。
//
// なぜ TypeScript 版に置くか: 検証（strict パース）と生成（DTO / JSON Schema /
// OpenAPI / ネイティブ型）が全部そろっている唯一のエディションだから。Dart 版は
// DTO 生成を持たない（バックエンドの関心なので意図的に対象外）。
//
// 依存は増やさない: 引数解析も出力も手書き。CLI が npm の流行に引きずられると、
// 「業務システムを10年動かす」側の都合と合わなくなる。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CATALOG_PATH,
  findSpecDir,
  PITFALLS_FILE,
  SCHEMA_FILE,
} from "./specDir.js";
import {
  describePitfall,
  filterPitfalls,
  type PitfallCatalog,
  pitfallsForKeys,
  snippet,
} from "./pitfalls.js";
import { deriveDto } from "./dto.js";
import { type ExampleCatalog, filterExamples } from "./examples.js";
import {
  buildReference,
  filterByPageKind,
  lookupReference,
} from "./reference.js";
import { toJsonSchema } from "./jsonSchema.js";
import { toOpenApi } from "./openApi.js";
import { type PageDefinition } from "./definition.js";
import {
  DefinitionParseError,
  parsePageYaml,
  UnknownKeysError,
  describeUnknownKey,
} from "./parse.js";
import { parseAppYaml } from "./appParse.js";
import { closestKey } from "./strictKeys.js";
import { scaffold, scaffoldKinds } from "./scaffold.js";
import { toJavaRecords, toTypeScript } from "./types.js";

/** CLI が触る外界。テストから差し替えられるようにまとめてある。 */
export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
}

export const nodeIo: CliIo = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, content, "utf8");
  },
};

const USAGE = `hatake — 定義ファースト UI フレームワークの CLI

使い方:
  hatake validate <file...> [--no-strict] [--json]
      定義を解析して問題を報告する。既定は strict（知らないキーを弾く）。

  hatake dto <file> [--json]
      API の形（DtoSpec）を出す。

  hatake schema <file>
      JSON Schema 2020-12 を出す。

  hatake openapi <file> [--base-path /api/orders] [--title T] [--api-version 1.0.0]
      OpenAPI 3.1 を出す。--base-path を省くと components.schemas だけ。

  hatake types <file> --lang ts|java [--package io.example.api] [--out dir]
      ネイティブ型を出す。--out でファイルに書く（省略時は標準出力）。

  hatake new <kind> --id <id> --title <title> [--repository <key>] [--out file]
      ページ定義の雛形を出す。kind: ${scaffoldKinds.join(" | ")}

  hatake reference [name] [--page-kind <kind>] [--out file]
      機械可読な DSL リファレンス（JSON）。name にノード名・キー名・ページ種別を
      渡すとその1件だけ。--page-kind でその画面で使えるところだけに絞る。

  hatake examples [query] [--json]
      例のカタログ（やりたいこと → 例）。query で絞り込む。

  hatake pitfalls [query] [--json] [--lang ja|en]
      よくある間違い → 正しい書き方の対照表。validate も未知キーからこれを引く。

  hatake --help / --version

終了コード: 問題があれば 1、無ければ 0。`;

const VERSION = "0.0.1";

interface Args {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** `--key value` / `--key=value` / `--flag` だけを見る素直な解析。 */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }
  return { command: positional[0], positional: positional.slice(1), flags };
}

const str = (flags: Args["flags"], key: string): string | undefined =>
  typeof flags[key] === "string" ? (flags[key] as string) : undefined;

/**
 * CLI 本体。終了コードを返す（`process.exit` はしないので、テストから普通に呼べる）。
 */
export function runCli(argv: string[], io: CliIo = nodeIo): number {
  const { command, positional, flags } = parseArgs(argv);

  if (flags.help === true || flags.h === true || command === undefined) {
    io.out(USAGE);
    return command === undefined && flags.help !== true && flags.h !== true
      ? 1
      : 0;
  }
  if (flags.version === true) {
    io.out(VERSION);
    return 0;
  }

  try {
    switch (command) {
      case "validate":
        return validate(positional, flags, io);
      case "dto":
        return emit(positional, io, (page) =>
          JSON.stringify(deriveDto(page), null, 2),
        );
      case "schema":
        return emit(positional, io, (page) =>
          JSON.stringify(toJsonSchema(deriveDto(page)), null, 2),
        );
      case "openapi":
        return emit(positional, io, (page) =>
          JSON.stringify(
            toOpenApi(deriveDto(page), {
              basePath: str(flags, "base-path"),
              title: str(flags, "title"),
              version: str(flags, "api-version"),
            }),
            null,
            2,
          ),
        );
      case "types":
        return types(positional, flags, io);
      case "new":
        return scaffoldCommand(positional, flags, io);
      case "reference":
        return reference(positional, flags, io);
      case "examples":
        return examples(positional, flags, io);
      case "pitfalls":
        return pitfalls(positional, flags, io);
      default:
        io.err(`知らないコマンド "${command}" です。--help を見てください。`);
        return 1;
    }
  } catch (error) {
    io.err(message(error));
    return 1;
  }
}

/** 解析して問題を報告する。1ファイルでも落ちれば終了コードは 1。 */
function validate(files: string[], flags: Args["flags"], io: CliIo): number {
  if (files.length === 0) {
    io.err("検証するファイルを指定してください。");
    return 1;
  }
  const strict = flags["no-strict"] !== true;
  const asJson = flags.json === true;
  const results: unknown[] = [];
  let failures = 0;

  for (const file of files) {
    try {
      const parsed = parseDefinition(io.readFile(file), file, { strict });
      if (asJson) {
        results.push({ file, ok: true, kind: parsed.kind });
      } else {
        io.out(`OK   ${file} (${parsed.kind})`);
      }
    } catch (error) {
      failures++;
      const hints = hintsFor(error, flags, io);
      if (asJson) {
        results.push({
          file,
          ok: false,
          ...problem(error),
          ...(hints.length > 0 ? { hints } : {}),
        });
      } else {
        io.out(`FAIL ${file}`);
        for (const line of problemLines(error)) io.err(`     ${line}`);
        for (const hint of hints) io.err(`     ヒント: ${hint}`);
      }
    }
  }
  if (asJson) io.out(JSON.stringify(results, null, 2));
  return failures === 0 ? 0 : 1;
}

/**
 * 未知キーに当てはまる「よくある間違い」の助言。
 *
 * 助言は**あれば出すもの**なので、spec/ が無くても読めなくても検証自体は成立させる
 * （`hatake validate` は spec/ を持たない場所でも動く必要がある）。
 */
function hintsFor(error: unknown, flags: Args["flags"], io: CliIo): string[] {
  if (!(error instanceof UnknownKeysError)) return [];
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) return [];
  try {
    const catalog = JSON.parse(
      io.readFile(join(dir, PITFALLS_FILE)),
    ) as PitfallCatalog;
    return pitfallsForKeys(
      catalog,
      error.keys.map((k) => k.key),
    ).map((pitfall) => describePitfall(pitfall));
  } catch {
    return [];
  }
}

/** `page:` と `app:` のどちらでも受ける（どちらを渡されるか AI は迷うので）。 */
function parseDefinition(
  source: string,
  file: string,
  options: { strict: boolean },
): { kind: string } {
  if (/^\s*app\s*:/m.test(source)) {
    const app = parseAppYaml(source, options);
    return { kind: `app: ${app.pages.length} ページ` };
  }
  return { kind: parsePageYaml(source, options).kind };
}

/** 生成系はどれも「1ファイル読んで1つの文字列を出す」形。 */
function emit(
  files: string[],
  io: CliIo,
  render: (page: PageDefinition) => string,
): number {
  const page = onePage(files, io);
  if (page === null) return 1;
  io.out(render(page));
  return 0;
}

function types(files: string[], flags: Args["flags"], io: CliIo): number {
  const lang = str(flags, "lang");
  if (lang !== "ts" && lang !== "java") {
    io.err("--lang ts か --lang java を指定してください。");
    return 1;
  }
  const page = onePage(files, io);
  if (page === null) return 1;
  const spec = deriveDto(page);
  const out = str(flags, "out");

  if (lang === "ts") {
    const source = toTypeScript(spec);
    if (out === undefined) {
      io.out(source);
    } else {
      const path = join(out, `${spec.page}.ts`);
      io.writeFile(path, source);
      io.out(`書きました: ${path}`);
    }
    return 0;
  }

  // Java は 1レコード＝1ファイル（public な型はファイル名と一致しないと通らない）。
  const records = toJavaRecords(spec, { packageName: str(flags, "package") });
  for (const [name, source] of Object.entries(records)) {
    if (out === undefined) {
      io.out(`// ${name}`);
      io.out(source);
    } else {
      const path = join(out, name);
      io.writeFile(path, source);
      io.out(`書きました: ${path}`);
    }
  }
  return 0;
}

function scaffoldCommand(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const kind = positional[0];
  const id = str(flags, "id");
  const title = str(flags, "title");
  if (kind === undefined || id === undefined || title === undefined) {
    io.err(
      `hatake new <kind> --id <id> --title <title> の形で指定してください` +
        `（kind: ${scaffoldKinds.join(" | ")}）。`,
    );
    return 1;
  }
  const yaml = scaffold(kind, {
    id,
    title,
    repository: str(flags, "repository"),
  });
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(yaml);
  } else {
    io.writeFile(out, yaml);
    io.out(`書きました: ${out}`);
  }
  return 0;
}

/** spec/ の中の1ファイルを読む。見つからなければ理由を出して null。 */
function readSpec(
  flags: Args["flags"],
  io: CliIo,
  ...names: string[]
): unknown | null {
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) {
    io.err(
      `spec/${SCHEMA_FILE} が見つかりません（--spec <dir> で場所を渡せます）。`,
    );
    return null;
  }
  return JSON.parse(io.readFile(join(dir, ...names)));
}

/**
 * 機械可読な DSL リファレンス。仕様書を読ませる代わりに引かせるためのもの。
 * スキーマから毎回作るので、古い写しを配ることがない。
 */
function reference(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const schema = readSpec(flags, io, SCHEMA_FILE);
  if (schema === null) return 1;
  let ref = buildReference(schema as Record<string, unknown>);

  const kind = str(flags, "page-kind");
  if (kind !== undefined) {
    const only = filterByPageKind(ref, kind);
    if (only === null) {
      io.err(
        `知らないページ種別 "${kind}" です` +
          `（${ref.pageKinds.map((k) => k.type).join(" | ")}）。`,
      );
      return 1;
    }
    ref = only;
  }

  const name = positional[0];
  if (name === undefined) return output(JSON.stringify(ref, null, 2), flags, io);

  const found = lookupReference(ref, name);
  if (found === null) {
    const suggestion = closestKey(name, [
      ...Object.keys(ref.nodes),
      ...Object.keys(ref.keyIndex),
    ]);
    io.err(
      `"${name}" はリファレンスにありません` +
        `${suggestion === null ? "" : `（${suggestion} の間違い？）`}。`,
    );
    return 1;
  }
  return output(JSON.stringify(found, null, 2), flags, io);
}

/** 例のカタログ。「やりたいこと」で引いて、近い例をコピーしてもらう。 */
function examples(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const catalog = readSpec(flags, io, ...CATALOG_PATH);
  if (catalog === null) return 1;
  const query = positional[0];
  const found = filterExamples(catalog as ExampleCatalog, query);

  if (flags.json === true) {
    io.out(JSON.stringify(found, null, 2));
    return found.length === 0 ? 1 : 0;
  }
  if (found.length === 0) {
    io.err(`"${query}" に近い例は見つかりませんでした。`);
    return 1;
  }
  for (const example of found) {
    io.out(`${example.file}  [${example.kind}]  ${example.title}`);
    io.out(`    ${example.task}`);
    io.out(`    キー: ${example.keys.join(" ")}`);
  }
  return 0;
}

/** よくある間違いの対照表。書く前に眺めるのと、落ちた後に引くのの両方に使う。 */
function pitfalls(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const catalog = readSpec(flags, io, PITFALLS_FILE);
  if (catalog === null) return 1;
  const query = positional[0];
  const found = filterPitfalls(catalog as PitfallCatalog, query);

  if (flags.json === true) {
    io.out(JSON.stringify(found, null, 2));
    return found.length === 0 ? 1 : 0;
  }
  if (found.length === 0) {
    io.err(`"${query}" に近い間違いは載っていません。`);
    return 1;
  }
  const lang = str(flags, "lang") === "en" ? "en" : "ja";
  // 見出しも訳す（英語で引いたのに見出しだけ日本語だと読みにくい）。
  const label =
    lang === "en"
      ? { why: "Why", fix: "Fix", good: "Correct form" }
      : { why: "なぜ", fix: "直し方", good: "正しい書き方" };
  for (const pitfall of found) {
    io.out(`✗ ${pitfall.wrong[lang]}`);
    io.out(`  ${label.why}: ${pitfall.why[lang]}`);
    io.out(`  ${label.fix}: ${pitfall.fix[lang]}`);
    io.out(`  ${label.good}:`);
    for (const line of snippet(pitfall.good).split("\n")) io.out(`    ${line}`);
    io.out("");
  }
  return 0;
}

/** `--out` があればファイルへ、無ければ標準出力へ（どちらも末尾は改行1つ）。 */
function output(text: string, flags: Args["flags"], io: CliIo): number {
  const out = str(flags, "out");
  if (out === undefined) {
    io.out(text);
  } else {
    io.writeFile(out, `${text}\n`);
    io.out(`書きました: ${out}`);
  }
  return 0;
}

function onePage(files: string[], io: CliIo): PageDefinition | null {
  if (files.length !== 1) {
    io.err("定義ファイルを1つ指定してください。");
    return null;
  }
  // 生成は「1ページ = 1つの API の形」なので、常に strict で読む。
  return parsePageYaml(io.readFile(files[0]), { strict: true });
}

/** 例外を「1行1問題」に開く。未知キーは全部並べる。 */
function problemLines(error: unknown): string[] {
  if (error instanceof UnknownKeysError) {
    return error.keys.map(describeUnknownKey);
  }
  return [message(error)];
}

function problem(error: unknown): Record<string, unknown> {
  if (error instanceof UnknownKeysError) {
    return { unknownKeys: error.keys };
  }
  if (error instanceof DefinitionParseError) {
    return { error: error.message, path: error.path };
  }
  return { error: message(error) };
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// bin として呼ばれたときだけ走る（テストからは runCli を直接呼ぶ）。
if (process.argv[1]?.endsWith("cli.js")) {
  // `hatake reference | head` のように受け側が先に閉じても、スタックトレースを
  // 吐いて落ちない（JSON を出すコマンドなので、パイプで切るのは普通の使い方）。
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
  });
  process.exitCode = runCli(process.argv.slice(2));
}
