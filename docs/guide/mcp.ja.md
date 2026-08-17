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

### `.mcp.json` を置く（CLI 不要・一番簡単）

このリポジトリには [`.mcp.json`](../../.mcp.json) が入っているので、**clone してビルドすればそのまま**使えます。自分のプロジェクトに入れるなら、プロジェクト直下に置くだけ。

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

`claude` コマンド（Claude Code の CLI）が入っているなら、ファイルを書かずにこれでも登録できます。

```bash
claude mcp add hatake -- node /path/to/hatake/typescript/dist/mcp.js
```

### ローカルに Node を入れていないとき（Docker で動かす）

サーバは Node のプロセスなので、普通はローカルの Node が要ります。**入れたくない場合は Docker で包めます**（stdio なのでコンテナ越しでもそのまま動く）。

```json
{
  "mcpServers": {
    "hatake": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "C:\\path\\to\\hatake:/app",
        "-w", "/app",
        "node:22-slim",
        "node", "typescript/dist/mcp.js"
      ]
    }
  }
}
```

* `-i` は必須（stdin を開いたままにする）。`-t` は付けない
* マウント元はフルパスで書く（`.mcp.json` ではシェル展開が効かない）
* `dist/` はホスト側でビルドしておく（`docker run … npm run build` でよい）

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
| `hatake_validate` | 書いたら/直したら必ず通す。知らないキーを全部まとめて指摘＋綴りの提案 | `source`（中身そのもの）、`strict`（既定 true）、`registry`（アプリ側で登録済みのもの＝外との辻褄も見る） |
| `hatake_new_page` | 新しい画面の出発点。そのまま検証を通る雛形が出る | `kind`、`id`、`title`、`repository` |
| `hatake_pitfalls` | よくある間違い → なぜ駄目か → 正しい書き方。書く前に眺める / 落ちて直せないとき | `query`、`lang`（ja/en） |
| `hatake_diff` | **既にある定義を直したとき**：契約（api）を壊すか＋画面・権限・アプリ構成の**確かめてほしい**変化 | `before`、`after` |
| `hatake_explain` | **検証を通したあと**：書いた定義が何をする画面かを日本語で読み返す（意図と違っていないか） | `source`、`page`（app のとき1枚だけ） |
| `hatake_refs` | アプリに組み込むとき：定義が要求している Repository / プラグイン名などの一覧 | `source` |
| `hatake_api_shape` | 同じ定義から API の形（DtoSpec / JSON Schema / OpenAPI 3.1 / TS / Java） | `source`、`format`、`basePath`、`package` |

`initialize` の応答に**使う順番**（instructions）を載せてあるので、対応クライアントなら勝手にこの順で動きます。

```
1. hatake_examples で近い例を探す
2. 新規なら hatake_new_page で雛形
3. 迷ったキーだけ hatake_reference で引く
4. 書けたら必ず hatake_validate → hatake_explain で読み返す
5. 直し方が分からない / 書く前に落とし穴を知りたいときは hatake_pitfalls
6. バックエンドの形が要るなら hatake_api_shape
7. 既にある定義を直したときは hatake_diff（壊していないか・確かめてほしい変化はないか）
8. アプリに組み込むときは hatake_refs（何を登録すればいいか）
```

`hatake_explain` は「意図どおりか」を見る道具です。strict もスキーマも警告も**綴りと構造しか見ない**ので、条件の向きを間違えた・意図と違う項目を必須にした、は全部通ります。検証のあとに日本語で読み返して、頼まれたことと違っていたら直す。人に見せてレビューしてもらう出力にもなります（読み手は DSL を知らなくてよい）。

`hatake_diff` は変更を **area**（api / ui / access / app）と **impact**（breaking / caution / safe）で返します。`compatible: false` は呼び出し側の修正が要る話、`quiet: false` は「壊れないが人に確かめてほしい」話（列やボタンや選択肢が消えた・権限が変わった・ページやメニューが消えた）。エージェントには**後者を黙って進めず列挙させる**ようにしてあります。

`hatake_refs` → `hatake_validate` の `registry` は繋がっています。前者が「何を登録すればいいか」を出し、それを人が確かめて後者に渡すと、名前の食い違いを機械で拾えます。

`hatake_validate` は**未知キーから落とし穴を引いて、直し方を添えます**。「知らないキー `form`」だけでは直せないので、「`form` を持つのは crud/master/detail/form。照会と入力を分けるなら search＋detail を navigate で繋ぐ」まで返します。

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
