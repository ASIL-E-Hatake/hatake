# hatake ドキュメント目次

> **中身**: どの文書に何が書いてあるかの索引。
> **読むとき**: 最初。ここで行き先を決めて、**該当1〜2ファイルだけ**読めばいい。
> **方針**: 各文書は「1テーマ・結論先出し・表とコード優先・重複なし」。全部読む必要はない。

## やりたいこと → 読むファイル

| やりたいこと | 読むファイル | 補足 |
|---|---|---|
| とりあえず動かす／自分のアプリに入れる | [getting-started](getting-started.ja.md) | 未公開なので git 依存の手順あり |
| **定義の書き方をサッと知る**（AI に渡すならこれ1枚） | [AI チートシート](api-cheatsheet.ja.md) | 名前一覧＋最小例。実装は読まなくていい |
| キーの意味・型・既定値を厳密に確認 | [DSL 仕様書](../spec/dsl-spec.ja.md) | 規範リファレンス |
| **このキーどこに書くの？型は？既定値は？を1発で** | [DSL リファレンス](../spec/reference.json) | `npx hatake reference <キー名>`。スキーマから生成＝ズレない |
| やりたいことに近い例を探す | [例のカタログ](../spec/examples/README.md) | `npx hatake examples <やりたいこと>` |
| 定義が正しいか機械検証 | [JSON Schema](../spec/hatake-page.schema.json) | `python spec/tools/validate_schema.py <file>` |
| 業務画面をまるごと写経したい | [cookbook](cookbook/) | 下記参照。実物は CI 検証済み |
| **自分のコードをどこに書くか**知りたい | [仕組みと責務分担](guide/concepts.ja.md) | Framework が持たない領域も明記 |
| どのページ種別を使うか迷った | [ページ種別の選び方](guide/page-types.ja.md) | 判断表 |
| 検証を足す／メッセージを変える | [入力検証](guide/validation.ja.md) | 独自ルール・i18n |
| 独自の型/バリデータ/描画を足す | [Plugin ガイド](../flutter/docs/plugins.ja.md) | 本体を fork せず拡張する |
| バックエンド（Java / TS）で使う | [バックエンド連携](guide/backend.ja.md) | 詳細は [java](../java/README.md) / [typescript](../typescript/README.md) |
| 対応状況・今後の方針を知る | [ロードマップ](roadmap.ja.md) / [utils ロードマップ](roadmap-utils.ja.md) | 実装状況はここが正 |
| 思想・背景を読む | [紹介記事](blog/introducing-hatake.md) | 読み物 |

## guide（仕組み・判断が必要なテーマ）

| ガイド | 分かること |
|---|---|
| [仕組みと責務分担](guide/concepts.ja.md) | 4層の役割、自分が書くのは定義とRepositoryだけ、正規化→検証→永続化 |
| [ページ種別の選び方](guide/page-types.ja.md) | crud / master / search / detail / form の判断表 |
| [入力検証](guide/validation.ja.md) | 実行順・空値の扱い・独自ルール・メッセージ差し替え |
| [バックエンド連携](guide/backend.ja.md) | サーバ検証・`QuerySpec`・JPA アダプタ |

## cookbook（写経用サンプル）

| レシピ | 作るもの |
|---|---|
| [マスタメンテ](cookbook/master-maintenance.ja.md) | 検索＋一覧＋登録/編集/削除の1画面 |
| [一覧→詳細（アプリ化）](cookbook/search-list-detail.ja.md) | メニュー付きアプリ＋行から詳細へ遷移 |
| [消費税・インボイス](cookbook/invoice-tax.ja.md) | 税率別合計・端数処理を業務要件どおりに |

## 全体像（1枚で）

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

## AI に使わせるとき

`llms.txt`（[リポジトリ直下](../llms.txt)）が LLM 向けの入口。**実装（`src/`）は読ませない**。渡すのは「[チートシート](api-cheatsheet.ja.md) 1枚」＋必要なら「[例](../spec/examples/README.md)」で足りる。

書いている途中で詰まったら、仕様書を全部読ませるのではなく**引かせる**:

```bash
npx hatake reference rowsPerPage    # キー名から：型・既定値・書ける場所
npx hatake examples 小計            # やりたいことから：近い例
npx hatake validate page.yaml       # 書けたら検証（未知キーは直し方まで出る）
```
