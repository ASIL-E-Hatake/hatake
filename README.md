# hatake 🌱

> 種（業務定義）を、畠（各言語のフレームワーク）に蒔いて、実り（アプリ）を得る。

**hatake（畠）** は、業務システムの画面を「コード」じゃなくて「業務定義（Definition）」から組み立てるための、宣言型 UI フレームワーク一式。言語に依存しない **DSL 仕様** を一個定めて、それを各言語のフレームワークが描画する、って構造になってる。要は「毎回同じような業務画面を手で書くのだるいから、定義書いたら出てくるようにしようぜ」という話。

```
Business Definition (YAML / JSON / 各言語DSL)
        │  Parser
        ▼
   PageDefinition          ← ここが唯一の正（言語非依存）
        │  Renderer（言語・デザインごとに差し替え可）
        ▼
   UI（Flutter / …）
```

## まず触る（インストール不要）

- **[プレイグラウンド](https://asil-e-hatake.github.io/hatake/demo/?playground=1)** — 定義（YAML）を貼るとその場で画面になる。直すと描き変わる。データは定義から作った仮のものなので、Repository も要らない。綴りを間違えたらその場で理由が出る。作った定義は URL で渡せる（`?yaml=` に載る）
- **[デモ](https://asil-e-hatake.github.io/hatake/demo/)** — 8画面のアプリ（ダッシュボード / 一覧 / 帳票 / 親子明細 / マスタ）。各画面の「定義を見る」でその画面の YAML が出る
- **[サイト](https://asil-e-hatake.github.io/hatake/)** — 機能別の書き方

## 何を大事にしてるか

- **Business First** — UI を作るんじゃなくて業務を書く
- **Configuration over Coding** — 部品を書くより定義を書く
- **Backend Agnostic** — Repository インターフェースだけ知ってる。HTTP も DB も知らん
- **Renderer / Language Independent** — 描画層も実装言語も交換可能
- **AI First** — 人間だけじゃなく AI も読み書きしやすい（[DSL 仕様書](spec/dsl-spec.ja.md) と [JSON Schema](spec/hatake-page.schema.json) 付き）

## モノレポの中身

| ディレクトリ | 中身 | 状態 |
|---|---|---|
| [`spec/`](spec/) | **言語非依存の DSL 仕様**（[仕様書](spec/dsl-spec.ja.md) / [JSON Schema](spec/hatake-page.schema.json) / [examples](spec/examples) / 検証ツール）。全言語の共通ソース | ✅ |
| [`flutter/`](flutter/README.md) | **Flutter / Dart 版**（フロント：画面を描く） | ✅ 動いてる |
| [`java/`](java/README.md) | **Java 版**（バックエンド：API ロジック） | ✅ scaffold（core + バリデーション + クエリ組み立て） |
| [`typescript/`](typescript/README.md) | **TypeScript 版**（バックエンド：API ロジック） | ✅ scaffold（core + バリデーション + クエリ組み立て） |
| [`docs/`](docs/index.ja.md) | **ドキュメント**（[目次](docs/index.ja.md) / [導入](docs/getting-started.ja.md) / [レシピ集](docs/cookbook/) / [AIチートシート](docs/api-cheatsheet.ja.md) / 紹介記事） | ✅ |

全部の版が同じ `spec/` を共通ソースにして、同じ定義から各言語で画面を出す。パッケージ名も揃える（Dart `hatake_core` / npm `@hatake/core` / Maven `io.github.asil-e-hatake:hatake-core` …）。どの言語から来ても「hatake ね」で通じるように。

## ドキュメント

**[📖 ドキュメント目次](docs/index.ja.md)** から入るのが早い（「やりたいこと → 読むファイル」の索引）。よく使うのはこの3つ:

| | |
|---|---|
| [チュートリアル](docs/tutorial.ja.md) | **最初の30分**。0から明細つきの受注入力画面まで通しで1本 |
| [導入](docs/getting-started.ja.md) | インストール〜最小コードで1画面出すまで |
| [レシピ集](docs/cookbook/) | [マスタメンテ](docs/cookbook/master-maintenance.ja.md) / [一覧→詳細](docs/cookbook/search-list-detail.ja.md) / [消費税・インボイス](docs/cookbook/invoice-tax.ja.md) |
| [ガイド](docs/guide/) | [仕組みと責務分担](docs/guide/concepts.ja.md) / [ページ種別の選び方](docs/guide/page-types.ja.md) / [入力検証](docs/guide/validation.ja.md) / [バックエンド連携](docs/guide/backend.ja.md) |
| [AI チートシート](docs/api-cheatsheet.ja.md) | 定義の書き方を1枚に圧縮（AI に渡すならこれ） |
| [図解](docs/diagrams/README.ja.md) | 定義から画面まで / データの流れ / 層の責務（絵は生成物で、元はテキスト） |

## ざっとイメージ

```yaml
# spec/examples/customer_master.yaml
dsl_version: "1.0"
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 顧客名, sortable: true }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, type: text, required: true }
          - { field: name, label: 顧客名, type: text, required: true }
```

定義がちゃんとしてるかは、これで確認できる:

```bash
python spec/tools/validate_schema.py path/to/def.yaml
```

## AI で使う（実装は読まなくていい）

hatake は「定義を書く」フレームワークなので、AI に使わせるときは**実装（`src/`）を読ませる必要はない**。ページ種別・フィールド型・フォーマッタ/コンバータ/バリデータの**名前と例**さえ渡せば書ける。渡す用の圧縮リファレンスを用意してある:

- [AI チートシート](docs/api-cheatsheet.ja.md) — 名前一覧＋オプション＋最小例（これ1枚でだいたい書ける）
- [`llms.txt`](llms.txt) — LLM 向けの入口（チートシート・仕様・Schema・例へのリンク集）
- 公開後はデモと同じ GitHub Pages にも置くので、`https://asil-e-hatake.github.io/hatake/llms.txt` のように **URL 1本渡すだけ**でも使える。

## 各版

`PageDefinition` は UI 専用じゃなくて、層ごとに消費者が違うだけ。フロントは描画、バックエンドは API ロジックに使う。

| 層 | 版 | PageDefinition の使い道 |
|---|---|---|
| フロント | Flutter | Renderer → 画面を描く |
| バックエンド | Java / TypeScript | サーバ側バリデーション・クエリ組み立て（`QuerySpec`）・（今後）DTO |

一番効くのは**サーバ側バリデーション**。Flutter のフォームを描くのと同じ YAML が、そのままサーバのリクエスト検証に使える＝フロントとバックの**バリデーションずれが起きない**。

### Flutter / Dart（フロント・動いてる）
CrudPage / SearchPage に対応。検索・一覧・ページング・CRUD・バリデーション、拡張（Validator / Action / Field型 / Renderer）も入ってる。詳しくは [`flutter/README.md`](flutter/README.md)、拡張は [Plugin ガイド](flutter/docs/plugins.ja.md)。

### Java / TypeScript（バックエンド・scaffold）
どちらも `core`（定義モデル + YAML/JSON パーサ）、`FormValidator`（サーバ側バリデーション）、`QueryBuilder`（検索フィルタ + params → フレームワーク非依存の `QuerySpec`。フィルタに無い項目は弾く許可リスト方式）、API の形の生成（`DtoSpec` → JSON Schema / OpenAPI 3.1 / ネイティブ型）まで。ORM 依存は持たず、JPA/Prisma 等への変換は opt-in アダプタの領分。YAML↔JSON 収束もテスト済み。詳しくは [`java/README.md`](java/README.md) / [`typescript/README.md`](typescript/README.md)。

### CLI（`npx hatake`）
定義を「書いた → すぐ検証」にするやつ。TypeScript 版に同梱。

```bash
npx hatake validate spec/examples/*.yaml   # strict（知らないキーを弾く）。問題があれば終了コード 1
npx hatake new crud --id customer_master --title 顧客マスタ
npx hatake reference rowsPerPage           # このキーどこに書くの？型は？既定値は？
npx hatake examples 帳票                    # やりたいことから近い例を引く
```

書き間違いは場所と直し方まで出る（`page.table.columns[0]: 知らないキー "witdh"（width の間違い？）`）。生成（`dto` / `schema` / `openapi` / `types`）も同じ CLI から。→ [使い方](typescript/README.md#cli)

仕様を「読ませる」のではなく「引かせる」ための機械可読な資料も置いてある: [DSL リファレンス](spec/reference.json)（全キーの索引。JSON Schema から生成）、[例のカタログ](spec/examples/README.md)（やりたいこと → 例）、[よくある間違い](spec/pitfalls.json)（間違い → 正しい書き方。ja/en）。英語で渡すなら [llms-en.txt](llms-en.txt) と [AI cheat sheet](docs/api-cheatsheet.md)。

### MCP サーバ（`hatake-mcp`）
AI エージェント（Claude Code / Claude Desktop 等）に繋ぐと、**仕様を読ませずに引かせられる**。道具は「キーを引く / 近い例を取る / 検証する / 雛形を出す / API の形を出す」の5つ。依存ゼロで手書き。

```bash
claude mcp add hatake -- node /path/to/hatake/typescript/dist/mcp.js
```

→ [MCP ガイド](docs/guide/mcp.ja.md)

読み物としては [紹介記事（全体）](docs/blog/introducing-hatake.md) と [Flutter 版の使い方](docs/blog/introducing-hatake-flutter.md) がある。

## ロードマップ

- **[開発ロードマップ（全体指針）](docs/roadmap.ja.md)** — 機能・言語間パリティ・対応言語追加(Python/Rust)の方針と優先度。今後の作業依頼のベース。
- **[ユーティリティ ロードマップ](docs/roadmap-utils.ja.md)** — 日本企業向け formatter / validator / converter（金額・和暦・消費税・全半角・営業日…）の項目と優先度。

formatter / converter は「開いた文字列キー + 登録式レジストリ」で足す方針（本体は不変）。Flutter では `format: currency` で `¥1,234,567`、`format: wareki` で `令和8年7月22日` みたいに表示できる（P0+P1 実装済み）。

## 名前の由来（なんで「畠」？）

「畑」じゃなく「畠」なのは理由がある。「畑」は字に **火** が入ってて焼き畑＝**炎上**を連想するから避けた（半分本気）。「畠」は水を抜いた田んぼ、つまり **動かない土台**。水を入れれば米、そのまま使えば麦や野菜、二毛作・三毛作もいける。要は「基盤さえ堅ければ、上に載せるものは自由」——これが hatake の思想そのもの。堅い土台はこっちが用意するんで、農家（＝使う人や AI）が好きに実らせてくれ、という気持ちでやってる。

詳しくは [紹介記事の「命名について」](docs/blog/introducing-hatake.md#命名について) に書いた。

## ライセンス

[Apache License 2.0](LICENSE) — Copyright 2026 Hatakeyama.

## CI

GitHub Actions（[.github/workflows/ci.yml](.github/workflows/ci.yml)）で各版の analyze / test、DSL スキーマ検証、`hatake_core` の `pub publish --dry-run` を回してる。デモは [deploy-demo.yml](.github/workflows/deploy-demo.yml) が GitHub Pages に勝手に上げてくれる。
