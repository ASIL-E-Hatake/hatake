一覧のページングは `table.pagination` で指定する。何も書かなければページングは有効で、1ページ 50 件になる。

```yaml
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository

  table:
    pagination: { pageSize: 50 }
    columns:
      - { field: code, label: コード }
      - { field: name, label: 商品名 }
```

## 書くのは既定を変えたいときだけ

`pagination` そのものを省略しても、既定でページングされる。書く理由は2つしかない。

- **1ページの件数を変えたい** — 業務によっては 20 件のほうが見やすい、逆に 200 件まとめて見たい
- **ページングを切りたい** — 件数が必ず少ないマスタなど。`enabled: false` で全件を1画面に出す

```yaml
table:
  pagination: { enabled: false }
```

## 実際に切り出すのは Repository

指定した件数は、検索条件と一緒に Repository へ渡る。**その件数だけ返すのも、総件数を返すのも Repository の仕事**である。Framework は「何件目から何件」を伝えるだけで、SQL の `LIMIT` も API のページング仕様も知らない。

なので `pageSize` を変えたのに件数が変わらないときは、定義ではなく Repository 側の実装を見る。

## 明細のページングは別物

`subTable`（明細）を別テーブルから引くときの `source.pageSize`（既定 20）は、一覧の `pagination.pageSize` とは無関係。親レコードの一覧と、その中の子行のグリッドは別々に数える。

ダッシュボードのカードが読む件数（`limit`、既定 100）もこれとは別。カードは1枚ずつ小さなクエリを投げるので、ページングではなく「上限」として指定する。
