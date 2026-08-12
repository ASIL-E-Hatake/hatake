# 例のカタログ

「やりたいこと」から近い例を探すための索引。**1から書くより、近いのをコピーして直すほうが速い**（人でも AI でも）。

機械可読版は [`index.json`](index.json)。CLI からも引ける:

```bash
npx hatake examples 帳票      # やりたいこと・機能名・業務用語で絞り込み
npx hatake examples --json    # ツール向け
```

全部 strict パース＋JSON Schema 検証を CI で通しているので、**そのまま真似して大丈夫**。

## やりたいこと → 例

| やりたいこと | 例 | 種別 |
|---|---|---|
| 検索して一覧に出して、その場で登録・修正・削除まで面倒を見たい | [customer_master.yaml](customer_master.yaml) | `crud` |
| コードと名前だけの小さなマスタを最小の定義でメンテしたい | [dept_master.yaml](dept_master.yaml) | `master` |
| 検索して一覧を見るだけ（登録も更新もさせない） | [product_search.yaml](product_search.yaml) | `search` |
| 1件の内容を読み取り専用で表示したい（一覧から開く先） | [customer_detail.yaml](customer_detail.yaml) | `detail` |
| 一覧を持たない単票の入力画面が欲しい | [customer_form.yaml](customer_form.yaml) | `form` |
| 項目が多いので入力をステップに分けたい | [customer_wizard.yaml](customer_wizard.yaml) | `wizard` |
| ヘッダ＋明細行を1画面で入力してまとめて保存したい | [order_entry.yaml](order_entry.yaml) | `form` + `subTable` |
| 明細が何百行もあるので子テーブルから引いてページングしたい | [order_entry_paged.yaml](order_entry_paged.yaml) | `form` + `subTable.source` |
| 件数・金額・グラフのカードを並べて数字を見せたい | [sales_dashboard.yaml](sales_dashboard.yaml) | `dashboard` |
| 一覧の印刷版。グループごとの小計と CSV 出力が欲しい | [sales_report.yaml](sales_report.yaml) | `report` |
| 複数の画面をメニューで束ねて1つのアプリにしたい | [sales_app.yaml](sales_app.yaml) | `app` |

## 機能から引く

| これの書き方が知りたい | 例 |
|---|---|
| 検索条件（型・演算子・範囲指定・段組み） | product_search / customer_master |
| ページング | customer_master / product_search |
| バリデーション・必須 | customer_form / customer_master |
| 全角半角などの入力正規化（`normalize`） | customer_form / customer_wizard |
| 条件表示（`visibleWhen`） | customer_wizard |
| 項目の制御（`readOnlyWhen` / `requiredWhen` / 区画ごとの `visibleWhen`） | customer_form |
| 選択肢の連動（`optionsFrom` / `when`） | customer_form（入力）/ product_search（検索条件） |
| 計算項目（`computed`） | customer_wizard / order_entry |
| 親子・明細（`subTable`） | order_entry / order_entry_paged |
| 集計・グラフ（`aggregate` / `chart`） | sales_dashboard |
| グループ・小計・用紙（`groupBy` / `totals` / `paper`） | sales_report |
| CSV 出力（`export` アクション） | sales_report / sales_dashboard |
| メニューと画面遷移（`menu` / `navigate`） | sales_app |

## 書いたら検証する

```bash
npx hatake validate spec/examples/*.yaml
```

キーの意味・型・既定値・取れる値は [DSL リファレンス](../reference.json)（`npx hatake reference <キー名>`）で引ける。間違えたときは [よくある間違い](../pitfalls.json)（`npx hatake pitfalls <キー名>`）。仕様の読み物版は [DSL 仕様](../dsl-spec.ja.md)。

## 例を足すとき

1. `spec/examples/` に置く
2. [`index.json`](index.json) に1件足す（`file` / `kind` / `title` / `task` / `keys` / `keywords`）
3. この README の表にも1行足す

`index.json` とディレクトリの中身が1対1であること、`kind` と `title` が定義と一致すること、`keys` が実在して実際に使われていることは CI で確認している（載せ忘れ・書き間違いはテストが落ちる）。
