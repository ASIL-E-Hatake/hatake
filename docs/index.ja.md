# hatake ドキュメント目次

> **中身**: どの文書に何が書いてあるかの索引。
> **読むとき**: 最初。ここで行き先を決めて、**該当1〜2ファイルだけ**読めばいい。
> **方針**: 各文書は「1テーマ・結論先出し・表とコード優先・重複なし」。全部読む必要はない。

## やりたいこと → 読むファイル

| やりたいこと | 読むファイル | 補足 |
|---|---|---|
| **はじめて触る（最初の30分）** | [チュートリアル](tutorial.ja.md) | 0から受注入力画面まで通しで1本。定義1枚と道具7つだけ |
| とりあえず動かす／自分のアプリに入れる | [getting-started](getting-started.ja.md) | 未公開なので git 依存の手順あり |
| **定義の書き方をサッと知る**（AI に渡すならこれ1枚） | [AI チートシート](api-cheatsheet.ja.md) | 名前一覧＋最小例。実装は読まなくていい |
| キーの意味・型・既定値を厳密に確認 | [DSL 仕様書](../spec/dsl-spec.ja.md) | 規範リファレンス |
| **このキーどこに書くの？型は？既定値は？を1発で** | [DSL リファレンス](../spec/reference.json) | `npx hatake reference <キー名>`。スキーマから生成＝ズレない |
| やりたいことに近い例を探す | [例のカタログ](../spec/examples/README.md) | `npx hatake examples <やりたいこと>` |
| **書き方を間違えた / 間違えたくない** | [よくある間違い](../spec/pitfalls.json) | `npx hatake pitfalls <キー名>`。`validate` も自動で引く |
| 英語で AI に読ませる | [AI cheat sheet](api-cheatsheet.md) / [llms-en.txt](../llms-en.txt) | 日本語版のみの文書には `(ja)` と明記 |
| 定義が正しいか機械検証 | [JSON Schema](../spec/hatake-page.schema.json) | `python spec/tools/validate_schema.py <file>` |
| 業務画面をまるごと写経したい | [cookbook](cookbook/) | 下記参照。実物は CI 検証済み |
| **絵で全体像をつかむ** | [図解](diagrams/README.ja.md) | 定義から画面まで / データの流れ / 層の責務（[サイト版](https://asil-e-hatake.github.io/hatake/diagrams)） |
| **自分のコードをどこに書くか**知りたい | [仕組みと責務分担](guide/concepts.ja.md) | Framework が持たない領域も明記 |
| どのページ種別を使うか迷った | [ページ種別の選び方](guide/page-types.ja.md) | 判断表 |
| 検証を足す／メッセージを変える | [入力検証](guide/validation.ja.md) | 独自ルール・i18n |
| 独自の型/バリデータ/描画を足す | [Plugin ガイド](../flutter/docs/plugins.ja.md) | 本体を fork せず拡張する |
| バックエンド（Java / TS）で使う | [バックエンド連携](guide/backend.ja.md) | 詳細は [java](../java/README.md) / [typescript](../typescript/README.md) |
| **これは hatake で書けるのか知りたい** | [仕組みと責務分担](guide/concepts.ja.md#これはどっちの担当は引ける) | 定義 / 登録 / サーバ / **枠組みの外** の4区分。`npx hatake where <やりたいこと>` |
| **この案件のことを AI に先に教えたい** | [案件の前書き](guide/project.ja.md) | 何のシステムか・できないこと・用語・名前の決めごとを1枚に。`npx hatake project` |
| **AI エージェントに定義を書かせる** | [MCP サーバ](guide/mcp.ja.md) | 仕様の引き当て・例の取得・検証を道具として渡す |
| 対応状況・今後の方針を知る | [ロードマップ](roadmap.ja.md) / [utils ロードマップ](roadmap-utils.ja.md) | 実装状況はここが正 |
| 思想・背景を読む | [紹介記事](blog/introducing-hatake.md) | 読み物 |

## guide（仕組み・判断が必要なテーマ）

| ガイド | 分かること |
|---|---|
| [仕組みと責務分担](guide/concepts.ja.md) | 4層の役割、自分が書くのは定義とRepositoryだけ、正規化→検証→永続化 |
| [ページ種別の選び方](guide/page-types.ja.md) | crud / master / search / detail / form の判断表 |
| [入力検証](guide/validation.ja.md) | 実行順・空値の扱い・独自ルール・メッセージ差し替え |
| [バックエンド連携](guide/backend.ja.md) | サーバ検証・`QuerySpec`・JPA アダプタ |
| [案件の前書き](guide/project.ja.md) | 定義の手前に置く1枚。書くもの／書かないもの、名前と用語の突き合わせ |
| [MCP サーバ](guide/mcp.ja.md) | エージェントへの繋ぎ方・道具5つ・使う順番 |

## cookbook（写経用サンプル）

| レシピ | 作るもの |
|---|---|
| [マスタメンテ](cookbook/master-maintenance.ja.md) | 検索＋一覧＋登録/編集/削除の1画面 |
| [一覧→詳細（アプリ化）](cookbook/search-list-detail.ja.md) | メニュー付きアプリ＋行から詳細へ遷移 |
| [消費税・インボイス](cookbook/invoice-tax.ja.md) | 税率別合計・端数処理を業務要件どおりに |

## 全体像（1枚で）

絵で見るなら [図解](diagrams/README.ja.md)（定義から画面まで / データの流れ / 層の責務）。

```
業務定義（YAML / JSON / 各言語DSL）
      │  Parser
      ▼
 PageDefinition / AppDefinition   ← 唯一の正（言語非依存）
      │  Renderer（差し替え可）           └→ バックエンド（検証・クエリ）
      ▼
    画面（Flutter / Material）
```

- **フロント**（Flutter）… 定義を描画する
- **バックエンド**（Java / TypeScript）… 同じ定義でサーバ側バリデーション・クエリ組み立て
- 各言語で**同名・同出力**（[コンフォーマンステスト](../spec/conformance/)で担保）

## 手引きに載せたものは、機械が読む

文書に載せた定義とコマンドは、**走らせないと必ず腐る**（読んだ人の所で初めて落ちる）。
なので CI が `docs/**/*.md` を読んで突き合わせている（`typescript/tool/check-docs.mjs`）。

| 載せたもの | 何と突き合わせるか |
| --- | --- |
| ```` ```yaml ```` の**丸ごとの定義**（`dsl_version:` / `page:` で始まる） | `hatake validate`（通らなければ落ちる） |
| ```` ```yaml ```` の**断片**（`columns:` だけ・`- { field: … }` だけ） | キー名を DSL の語彙（`spec/reference.json`）と（消えたキー・綴り違いが出る） |
| ```` ```bash ```` の `hatake <コマンド> --旗` | `hatake --help`（**走らせない**。旗が消えたか、help が書き忘れたかが出る） |

書くときの決めごと:

- **丸ごと見せたい定義は `dsl_version:` から書く**（`app:` から始まる塊は抜粋が多いので、
  断片として扱う）
- **抜粋は `...` で省く**。`...` が書いてある塊は「抜粋」として飛ばす（人が読む印を
  そのまま機械の印にしている＝印を2つ持たない）
- hatake の定義ではない YAML（`pubspec.yaml` / GitHub Actions）は
  ```` ```yaml no-check:<理由> ```` と書く。**理由の無い `no-check` は落ちる**
  （黙って外せる印にすると、いつか全部に付く）
- 飛ばした塊は**必ず一覧に出る**（見ていないことを見えなくしない）
- **塊を取り出す側は、言語のうしろを読み飛ばす**（印が付くので）。CI がチュートリアルと
  PR コメントの断片を抜き出している所も、そう書いてある＝印を足したら塊が取れなくなる、
  を起こさないため

`docs/proposals/` は見ない（**これから作る DSL** を書く場所なので、いまの語彙で
突き合わせると順番が逆になる）。

## AI に使わせるとき

`llms.txt`（[リポジトリ直下](../llms.txt)）が LLM 向けの入口。**実装（`src/`）は読ませない**。渡すのは「[チートシート](api-cheatsheet.ja.md) 1枚」＋必要なら「[例](../spec/examples/README.md)」で足りる。

対応クライアント（Claude Code / Claude Desktop 等）なら [MCP サーバ](guide/mcp.ja.md)を繋ぐのが一番速い。エージェントが必要なときに自分で引いて、自分で検証して直す。

**案件の話は先に渡す。** 「何のシステムで、何ができないか」はどこにも書いていないので、
書いていなければ AI は**書ける方に倒す**（直せないマスタに編集ボタンが付く）。定義の隣に
`hatake.project.yaml` を置いて、最初に読ませる → [案件の前書き](guide/project.ja.md)。

繋がないときは、仕様書を全部読ませるのではなく**引かせる**:

```bash
npx hatake project                  # 案件の前書き（何のシステムか・用語・名前の決めごと）
npx hatake reference rowsPerPage    # キー名から：型・既定値・書ける場所
npx hatake examples 小計            # やりたいことから：近い例
npx hatake validate page.yaml       # 書けたら検証（未知キーは直し方まで出る）
```
