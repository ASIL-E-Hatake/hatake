# @hatake/core — TypeScript 版 🌱

[hatake](../README.md) の **TypeScript 版**。フロントで画面を描く Flutter 版と違って、こっちは**バックエンド寄り**。同じ [DSL 仕様](../spec/dsl-spec.ja.md) の定義を読んで、**API のロジック**（サーバ側バリデーション・クエリ組み立て・API の形の生成）に使う。

要は「Flutter のフォームを描くのと同じ YAML で、Node の API のリクエスト検証もやる」ってやつ。フロントとバックでバリデーションがずれない。

**`hatake` CLI もここに入っている**（検証と生成が全部そろっている唯一の版なので）。→ [CLI](#cli)

## 今あるもの

- **定義モデル + パーサ** … `spec/` と同じ DSL を YAML / JSON から読む（`parsePageYaml` / `parsePageJson` / `parseAppYaml`）。YAML と JSON は同じ結果に収束する（テスト済み）。対応ページ種別は `crud` / `master` / `search` / `detail` / `form` / `wizard` / `dashboard` / `report`。
- **strict パース** … `parsePageYaml(source, { strict: true })` で**知らないキーを全部まとめて**エラーにする（近い既知キーの提案つき: `pagesize` → `pageSize`）。厳しさは JSON Schema と同一。
- **FormValidator** … フォーム定義からサーバ側バリデーション。組込ルール（required / maxLength / minLength / min / max / pattern / email / postalCode）＋ `ValidatorRegistry` で独自ルールも足せる。明細（`subTable`）の子行も検証（`lines[0].qty`）。
- **buildQuery** … 検索フィルタ定義 + リクエストの params から、フレームワーク非依存の `QuerySpec`（conditions / sort / pagination）を組み立てる。**フィルタに無い項目は無視（許可リスト方式）**なので、任意項目での検索を弾ける。
- **API の形の生成** … `deriveDto(page)` → `DtoSpec`、そこから `toJsonSchema`（JSON Schema 2020-12）／`toOpenApi`（OpenAPI 3.1）／`toTypeScript`・`toJavaRecords`（ネイティブ型）。
- **出力** … `toCsv`（一覧・帳票の CSV）、`buildReport`（帳票をコントロールブレイクで紙に組む）。
- **FormatterRegistry / ConverterRegistry / 集約 / 日本企業向けユーティリティ** … Flutter版と同名・同挙動。formatter（currency / percent / date / wareki / postal / mask）、converter（toHankaku / toZenkaku / hiraToKata / kataToHira / trim / collapseSpaces / parseNumber）、`AggregateRegistry`（count / sum / avg / min / max）、消費税・年度・和暦・営業日・年齢。

```ts
import { parsePageYaml, FormValidator } from "@hatake/core";

const page = parsePageYaml(yamlText, { strict: true });
const result = new FormValidator().validate(page.form, requestBody);
if (!result.valid) return res.status(400).json({ errors: result.errors });
```

```ts
import { parsePageYaml, buildQuery } from "@hatake/core";

const page = parsePageYaml(yamlText);
const spec = buildQuery(page.search, req.query); // { conditions, sort, page, pageSize }
// spec を Prisma / TypeORM / 生SQL に変換するのはアダプタ側（opt-in）
```

## CLI

定義を「書いた → すぐ検証」の1コマンドにするやつ。人にも AI にも同じ入口。

```bash
npx hatake validate spec/examples/*.yaml     # 解析 + strict（既定）
npx hatake new report --id sales_report --title 売上明細表 > page.yaml
npx hatake types page.yaml --lang java --package io.example.api --out gen/
npx hatake reference rowsPerPage             # このキー、どこに書くの？型は？既定値は？
npx hatake examples 帳票                      # 近い例を探す
```

| コマンド | 何をするか |
|---|---|
| `validate <file...>` | 定義を解析して問題を報告。既定は strict（知らないキーを弾く／`--no-strict` で従来の寛容さ）。`--json` で機械可読。**問題があれば終了コード 1** なので CI にそのまま置ける |
| `new <kind> --id --title` | ページ定義の雛形（8種別すべて。`--repository` 省略時は id から推測、`--out` でファイルへ） |
| `dto <file>` | API の形（`DtoSpec`）を JSON で |
| `schema <file>` | JSON Schema 2020-12 |
| `openapi <file> [--base-path /api/orders]` | OpenAPI 3.1（`--base-path` を省くと `components.schemas` だけ） |
| `types <file> --lang ts\|java [--out dir]` | ネイティブ型。Java は**1レコード＝1ファイル**で書き出す |
| `reference [name] [--page-kind k]` | 機械可読な [DSL リファレンス](../spec/reference.json)（JSON）。`name` にキー名・ノード名・ページ種別を渡すとその1件だけ。綴り違いは候補を出す |
| `examples [query] [--json]` | [例のカタログ](../spec/examples/README.md)を「やりたいこと」で引く |

`reference` / `examples` は `spec/` を実行時に探す（`--spec <dir>` で明示もできる）。
リファレンスは**その場でスキーマから生成する**ので、古い写しを配ることがない。

`validate` は失敗したとき、場所・キー・直し方をそのまま出す:

```
FAIL page.yaml
     page.table.columns[0]: 知らないキー "witdh"（width の間違い？）
```

生成系（`dto` / `schema` / `openapi` / `types`）は**常に strict で読む**。書き間違いのある定義から API の形を作ると、間違いが API に焼き付くので。

## MCP サーバ（`hatake-mcp`）

AI エージェントに「仕様を引く・例を取る・検証する」をやらせるための MCP サーバも同梱。**依存ゼロで手書き**（stdio の JSON-RPC 2.0 で、必要なのは `initialize` / `tools/list` / `tools/call` だけなので）。

```bash
npm run build
claude mcp add hatake -- node "$PWD/dist/mcp.js"      # Claude Code の場合
```

道具は `hatake_reference` / `hatake_examples` / `hatake_validate` / `hatake_new_page` / `hatake_api_shape` の5つで、CLI と同じ関数を呼んでいる（＝同じ答えになる）。入れ方と使う順番は [MCP ガイド](../docs/guide/mcp.ja.md)。

## 開発（Docker）

ローカルに Node を入れず、Docker で回す。

```bash
docker run --rm -v "$PWD:/app" -w /app/typescript node:22-slim \
  sh -c "npm install && npm run typecheck && npm test"
```

CLI を試すときは `npm run build` してから `node dist/cli.js …`。

## これから

`QuerySpec` を各 ORM に変換するアダプタ（opt-in・別パッケージ）、`detail` ページのレスポンス形の導出（今は読み取り専用なので request を出さない）あたり。UI 由来の項目（layout や描画ヒント）はバックエンドは無視する。コア本体はこの先もフレームワーク非依存を維持する。

ライセンス: Apache-2.0
