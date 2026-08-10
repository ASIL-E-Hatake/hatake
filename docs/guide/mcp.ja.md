# MCP サーバ（AI エージェントに hatake を持たせる）

> **中身**: hatake の MCP サーバの入れ方と、提供している道具。
> **読むとき**: Claude Code / Claude Desktop などの AI エージェントに定義を書かせたいとき。
> **前提**: [DSL リファレンス](../../spec/reference.json) と [例のカタログ](../../spec/examples/README.md) を、エージェントが**自分で引ける**ようにするのが目的。

## 何が変わるか

これまでは「AI に仕様書とチートシートを読ませてから定義を書かせる」でした。MCP サーバを繋ぐと、エージェントが必要なときに自分で引きます。

```
これまで          仕様書とチートシートを丸ごと読ませる → 定義を書かせる → 人間が検証
MCP サーバあり    近い例を引く → 迷ったキーだけ引く → 書く → 自分で検証して直す
```

読ませる量が減るのと、**書いたものを自分で検証して直せる**のが効きます。知らないキーは黙って捨てられるので、検証を通さないと「書いた気になって効いていない」定義が残ります。

## 入れ方

まだ npm に公開していないので、リポジトリを clone してビルドします。

```bash
git clone https://github.com/ASIL-E-Hatake/hatake.git
cd hatake/typescript && npm install && npm run build
```

### Claude Code

```bash
claude mcp add hatake -- node /path/to/hatake/typescript/dist/mcp.js
```

プロジェクトで共有するなら `.mcp.json` に書きます。

```json
{
  "mcpServers": {
    "hatake": {
      "command": "node",
      "args": ["/path/to/hatake/typescript/dist/mcp.js"]
    }
  }
}
```

### Claude Desktop

`claude_desktop_config.json` に同じ形で書きます（設定ファイルの場所はアプリのドキュメント参照）。

### 別のディレクトリから動かすとき

サーバは起動時に `spec/` を探します（カレント → 実行ファイルの位置の順に上へ）。見つからない場所で動かすなら引数で渡してください。

```bash
node /path/to/hatake/typescript/dist/mcp.js /path/to/hatake/spec
```

## 提供している道具

| 道具 | いつ使うか | 主な引数 |
|---|---|---|
| `hatake_reference` | キーの型・既定値・書ける場所・取れる値を知りたい。仕様書を読む代わり | `name`（キー名/ノード名/ページ種別）、`pageKind`（その画面の分だけに絞る） |
| `hatake_examples` | 定義を書き始める前に近い例を探す。`file` を渡すと YAML 全文 | `query`（日本語でよい）、`file` |
| `hatake_validate` | 書いたら/直したら必ず通す。知らないキーを全部まとめて指摘＋綴りの提案 | `source`（中身そのもの）、`strict`（既定 true） |
| `hatake_new_page` | 新しい画面の出発点。そのまま検証を通る雛形が出る | `kind`、`id`、`title`、`repository` |
| `hatake_api_shape` | 同じ定義から API の形（DtoSpec / JSON Schema / OpenAPI 3.1 / TS / Java） | `source`、`format`、`basePath`、`package` |

`initialize` の応答に**使う順番**（instructions）を載せてあるので、対応クライアントなら勝手にこの順で動きます。

```
1. hatake_examples で近い例を探す
2. 新規なら hatake_new_page で雛形
3. 迷ったキーだけ hatake_reference で引く
4. 書けたら必ず hatake_validate
5. バックエンドの形が要るなら hatake_api_shape
```

## 実装について

**依存ゼロで手書きしています**（`@modelcontextprotocol/sdk` を入れていない）。stdio の MCP は「1行1メッセージの JSON-RPC 2.0」で、必要なのは `initialize` / `tools/list` / `tools/call` だけなので、CLI と同じ判断で依存を増やしませんでした。

* プロトコルは [`typescript/src/mcp.ts`](../../typescript/src/mcp.ts)、道具は [`mcpTools.ts`](../../typescript/src/mcpTools.ts)
* 名乗るバージョン: `2025-06-18` / `2025-03-26` / `2024-11-05`（クライアントの希望がこの中にあれば合わせる）
* **知らない道具はプロトコルのエラー、道具の中の失敗は結果として返す**（後者はモデルに読ませて直させるため）
* 標準出力にはプロトコル以外を書かない（ログは標準エラー）
* CI で stdio の往復を実際に流している（通知に返事をしないことも含めて）

道具は CLI と同じ関数を呼んでいるだけなので、`hatake reference` / `hatake examples` / `hatake validate` と**同じ答え**になります。

## 関連

* [CLI](../../typescript/README.md#cli) — 人間が同じことを手で叩く口
* [DSL リファレンス](../../spec/dsl-spec.ja.md#機械可読なリファレンス) — `reference.json` の中身
* [例のカタログ](../../spec/examples/README.md)
* [AI チートシート](../api-cheatsheet.ja.md) — MCP を使わないときの1枚もの
