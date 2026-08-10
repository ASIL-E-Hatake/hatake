// MCP サーバが提供する道具。プロトコル（mcp.ts）とは分けてある。
//
// 狙いは「エージェントが手元に hatake の仕様を持たなくても、正しい定義を書ける」こと。
// なので4つの動作を1往復ずつで終わらせる:
//   例を探す → キーを引く → 雛形を出す → 検証する（＋必要なら API の形）
//
// description は**AI 向けの契約**なので、ここが一番大事。「いつ使うか」を書く。

import { join } from "node:path";
import { deriveDto } from "./dto.js";
import { type ExampleCatalog, filterExamples } from "./examples.js";
import { toJsonSchema } from "./jsonSchema.js";
import { toOpenApi } from "./openApi.js";
import { parseAppYaml } from "./appParse.js";
import {
  DefinitionParseError,
  describeUnknownKey,
  parsePageYaml,
  UnknownKeysError,
} from "./parse.js";
import {
  buildReference,
  filterByPageKind,
  lookupReference,
} from "./reference.js";
import { scaffold, scaffoldKinds } from "./scaffold.js";
import { CATALOG_PATH, SCHEMA_FILE } from "./specDir.js";
import { toJavaRecords, toTypeScript } from "./types.js";

/** 道具1つ。`run` は文字列を返し、入力がおかしければ例外を投げる。 */
export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): string;
}

export interface McpToolOptions {
  /** spec/ の場所（[findSpecDir] の結果）。 */
  specDir: string;
  /** ファイル読み。テストから差し替えられるように受け取る。 */
  readFile(path: string): string;
}

/** クライアントに最初に渡す使い方。順番を書いておくと迷わない。 */
export const INSTRUCTIONS = `hatake は業務画面を「定義（YAML）」で作るフレームワーク。
このサーバを使えば、リポジトリの仕様書を読まなくても正しい定義が書ける。

推奨の順番:
1. hatake_examples で近い例を探す（例をコピーして直すのが一番速い）
2. 新規なら hatake_new_page で雛形を出す
3. キーの型・既定値・書ける場所に迷ったら hatake_reference で引く（仕様書は読まなくていい）
4. 書けたら必ず hatake_validate にかける（知らないキーは黙って捨てられるので、書いた気になって効いていない事故が起きる）
5. バックエンドの形が要るなら hatake_api_shape

原則: Flutter の Widget や API のコードを手で書かず、定義を書く。定義に無い機能は
DSL の拡張（プラグイン）で足す。`;

const str = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === "string" ? (args[key] as string) : undefined;

/** 必須の文字列引数。無ければ「何が足りないか」を言って落とす。 */
function required(args: Record<string, unknown>, key: string): string {
  const value = str(args, key);
  if (value === undefined || value === "") {
    throw new Error(`${key} は必須です（文字列で渡してください）。`);
  }
  return value;
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

export function hatakeTools(options: McpToolOptions): McpTool[] {
  const { specDir, readFile } = options;
  const readJson = (...names: string[]): unknown =>
    JSON.parse(readFile(join(specDir, ...names)));

  /** リファレンスは毎回スキーマから作る（古い写しを配らないため）。 */
  const reference = () =>
    buildReference(readJson(SCHEMA_FILE) as Record<string, unknown>);
  const catalog = () => readJson(...CATALOG_PATH) as ExampleCatalog;

  return [
    {
      name: "hatake_reference",
      title: "DSL リファレンスを引く",
      description:
        "hatake の DSL のキー・型・既定値・取れる値・どのページ種別で有効かを引く。" +
        "「このキーはどこに書くのか」「型と既定値は」「他に何が書けるのか」で迷ったら" +
        "仕様書を読まずにこれを使う。name にキー名（rowsPerPage）・ノード名（report / column）・" +
        "ページ種別（crud）のどれを渡してもよく、当たったものを全部返す。" +
        "name を省くと全体（大きいので pageKind での絞り込みを推奨）。" +
        "values は取れる値で、open が true なら組み込みの一覧＝プラグインで足せる、false なら enum。" +
        "closed が false のノードは中身が自由（config など）。",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "キー名 / ノード名 / ページ種別。省略で全体。",
          },
          pageKind: {
            type: "string",
            description:
              "その画面で使える範囲だけに絞る（crud / master / search / detail / form / wizard / dashboard / report）。",
          },
        },
      },
      run(args) {
        const kind = str(args, "pageKind");
        let ref = reference();
        if (kind !== undefined) {
          const only = filterByPageKind(ref, kind);
          if (only === null) {
            throw new Error(
              `知らないページ種別 "${kind}" です（${ref.pageKinds
                .map((k) => k.type)
                .join(" / ")}）。`,
            );
          }
          ref = only;
        }
        const name = str(args, "name");
        if (name === undefined) return pretty(ref);
        const found = lookupReference(ref, name);
        if (found === null) {
          throw new Error(
            `"${name}" は DSL に無い名前です。キー名の一覧は name を省いて keyIndex を見てください。`,
          );
        }
        return pretty(found);
      },
    },
    {
      name: "hatake_examples",
      title: "例を探す / 取り出す",
      description:
        "「やりたいこと」から近い定義例を探す。定義を書き始める前に必ずこれを引く" +
        "（1から組み立てるより、近い例を直すほうが速くて正確）。" +
        "query は日本語でよく、やりたいこと・機能名・業務用語で当たる（例: 帳票 / 小計 / 親子 / ダッシュボード / ステップ入力 / CSV出力）。" +
        "file にカタログの file 名を渡すと、その例の YAML 全文を返す。",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "やりたいこと・機能名・業務用語。省略で全件。",
          },
          file: {
            type: "string",
            description:
              "例のファイル名（sales_report.yaml など）。渡すと YAML 全文を返す。",
          },
        },
      },
      run(args) {
        const file = str(args, "file");
        if (file !== undefined) {
          const entry = catalog().examples.find((e) => e.file === file);
          if (entry === undefined) {
            throw new Error(
              `"${file}" という例はありません。file を省いて一覧を見てください。`,
            );
          }
          const source = readFile(join(specDir, "examples", entry.file));
          return `# ${entry.title}（${entry.kind}）— ${entry.task}\n${source}`;
        }
        const found = filterExamples(catalog(), str(args, "query"));
        if (found.length === 0) {
          throw new Error(
            `"${str(args, "query")}" に近い例はありません。query を省くと全件出ます。`,
          );
        }
        return pretty(found);
      },
    },
    {
      name: "hatake_validate",
      title: "定義を検証する",
      description:
        "定義（YAML / JSON）を解析して問題を報告する。定義を書いたら・直したら必ず通す。" +
        "既定は strict で、知らないキー（綴り間違い・存在しない機能）を全部まとめて指摘し、" +
        "近い既知キーを提案する。page: でも app: でも受ける。" +
        "ok が false のときは problems を読んで直し、もう一度かける。",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "定義の中身そのもの（ファイルパスではない）。",
          },
          strict: {
            type: "boolean",
            description:
              "既定 true。false にすると知らないキーを黙って捨てる従来の寛容さ（普段は使わない）。",
          },
        },
        required: ["source"],
      },
      run(args) {
        const source = required(args, "source");
        const strict = args.strict !== false;
        try {
          const kind = /^\s*app\s*:/m.test(source)
            ? `app（${parseAppYaml(source, { strict }).pages.length} ページ）`
            : parsePageYaml(source, { strict }).kind;
          return pretty({ ok: true, kind });
        } catch (error) {
          return pretty({ ok: false, ...problem(error) });
        }
      },
    },
    {
      name: "hatake_new_page",
      title: "ページ定義の雛形を出す",
      description:
        "指定したページ種別の、そのまま検証を通る雛形（YAML）を出す。" +
        "新しい画面を作るときの出発点にする。種別の選び方は " +
        "crud=検索+一覧+登録編集削除 / master=マスタメンテ / search=照会（読み取り専用） / " +
        "detail=1件表示 / form=単票入力 / wizard=ステップ入力 / dashboard=カード並べ / report=帳票。",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...scaffoldKinds] },
          id: { type: "string", description: "安定したページ id（customer_master）。" },
          title: { type: "string", description: "画面名（顧客マスタ）。" },
          repository: {
            type: "string",
            description: "Repository キー。省略すると id から推測する。",
          },
        },
        required: ["kind", "id", "title"],
      },
      run(args) {
        return scaffold(required(args, "kind"), {
          id: required(args, "id"),
          title: required(args, "title"),
          repository: str(args, "repository"),
        });
      },
    },
    {
      name: "hatake_api_shape",
      title: "定義から API の形を出す",
      description:
        "同じ定義からバックエンドが返す/受け取る形を導出する。" +
        "format は dto（中立な DtoSpec）/ jsonSchema（2020-12）/ openapi（3.1）/ " +
        "typescript / java（ネイティブ型）。" +
        "フロントとバックで定義がズレるのを防ぐのが目的なので、API を書く前にこれを見る。" +
        "定義は常に strict で読むので、書き間違いのある定義からは何も出ない。",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "ページ定義の中身（1ページ分）。" },
          format: {
            type: "string",
            enum: ["dto", "jsonSchema", "openapi", "typescript", "java"],
          },
          basePath: {
            type: "string",
            description:
              "openapi のとき。省略すると components.schemas だけ（DSL は URL を知らない）。",
          },
          package: { type: "string", description: "java のときのパッケージ名。" },
        },
        required: ["source", "format"],
      },
      run(args) {
        const page = parsePageYaml(required(args, "source"), { strict: true });
        const spec = deriveDto(page);
        switch (required(args, "format")) {
          case "dto":
            return pretty(spec);
          case "jsonSchema":
            return pretty(toJsonSchema(spec));
          case "openapi":
            return pretty(toOpenApi(spec, { basePath: str(args, "basePath") }));
          case "typescript":
            return toTypeScript(spec);
          case "java":
            return Object.entries(
              toJavaRecords(spec, { packageName: str(args, "package") }),
            )
              .map(([name, source]) => `// ${name}\n${source}`)
              .join("\n");
          default:
            throw new Error(
              "format は dto / jsonSchema / openapi / typescript / java のどれかです。",
            );
        }
      },
    },
  ];
}

/** 例外を機械可読な形に開く。未知キーは場所・キー・直し方まで並べる。 */
function problem(error: unknown): Record<string, unknown> {
  if (error instanceof UnknownKeysError) {
    return {
      problems: error.keys.map(describeUnknownKey),
      unknownKeys: error.keys,
    };
  }
  if (error instanceof DefinitionParseError) {
    return { problems: [error.message], path: error.path };
  }
  return { problems: [error instanceof Error ? error.message : String(error)] };
}
