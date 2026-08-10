ダッシュボードは `items` にカードを並べる。カード1枚は「小さな読み取りクエリ」と「その結果の見せ方」の組。

```yaml
page:
  type: dashboard
  id: sales_dashboard
  title: 売上ダッシュボード
  repository: orderRepository      # カードが省略したときの既定
  layout: { columns: 4 }
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  items:
    - { id: orderCount, title: 受注件数 }
    - { id: total, title: 受注金額, value: { aggregate: sum, field: amount },
        format: currency, config: { symbol: "¥" } }
    - { id: pending, title: 未出荷, filters: { status: 未出荷 } }
    - { id: recent, type: table, title: 直近の受注, span: 2, limit: 5,
        sort: { field: orderDate, ascending: false },
        columns: [ { field: orderNo, label: 受注番号 } ] }
```

## 3種類のカード

`type` で決める。省略すると `metric`（数字1つ）。

| type | 何が出るか |
| --- | --- |
| `metric` | 数字1つ。件数、合計、平均 |
| `table` | 小さな一覧。直近◯件、上位◯件 |
| `chart` | グラフ（「ダッシュボードにグラフを出す」参照） |

## value を省くと件数になる

`metric` カードで `value` を書かないと**件数**が出る。合計や平均が欲しいなら `value` に `aggregate` と `field` を書く。

```yaml
- { id: orderCount, title: 受注件数 }                                    # 件数
- { id: total, title: 受注金額, value: { aggregate: sum, field: amount } } # 合計
```

`count` 以外は `field` が必須。書き忘れると落ちずに件数のまま出るので、「合計を出したのに件数が出ている」ときはここを見る（下の「よくある間違い」参照）。

## 集計しているのは Framework ではない

**集計クエリは投げていない。** Repository が返した行を、その場で畳み込んでいるだけ。だから

- カードが読む行数は `limit`（既定 100）で決まる。**100 件を超えるデータの合計は正しくない**
- 大きなデータの合計が要るなら、集計済みの値を返すエンドポイントを Repository 側に用意して、`limit` を小さくしたカードで受ける

ここは業務で一番効く落とし穴なので、金額の合計を出すカードを作ったら `limit` を必ず確認する。

## カードごとの絞り込み

`filters` に固定値を書くと、そのカードだけの条件になる。画面上部の検索条件（`search`）は**全カードに効く**ので、両方を組み合わせて「今月の・未出荷の件数」のようなカードが作れる。

```yaml
- { id: pending, title: 未出荷, filters: { status: 未出荷 } }
```

## 並べ方

`layout.columns` がグリッドの幅（既定 2。業務画面では 4 が使いやすい）。`span` で1枚のカードが占める列数を指定する（既定 1）。表やグラフは `span: 2` 以上にしないと潰れる。

## 押したら別の画面へ

`action` にページアクションの id を書くと、カードを押したときにそれが走る。件数のカードから、その条件の一覧へ飛ばすのが定番。

```yaml
items:
  - { id: orderCount, title: 受注件数, action: openOrders }
actions:
  - { id: openOrders, type: navigate, label: 受注照会, page: order_search }
```

## repository はカードごとに変えられる

ページの `repository` はカードが省略したときの既定でしかない。売上と在庫のように**別のデータを1画面に並べる**なら、カードごとに書く。

ダッシュボードは1件のレコードを扱わないので `key` は書かない。
