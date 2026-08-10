帳票は `type: report`。明細に出す列は一覧と同じ `table.columns` に書き、印刷のための指定（用紙・小計・改ページ）を `report` に書く。

```yaml
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  table:
    columns:
      - { field: orderNo,  label: 受注番号 }
      - { field: customer, label: 顧客 }
      - { field: amount,   label: 金額, type: number, format: currency }
  report:
    paper: { size: A4, orientation: portrait }
    rowsPerPage: 30
    sort: { field: customer }
    groupBy: [ { field: customer, label: 顧客, pageBreak: true } ]
    totals: [ { field: amount, aggregate: sum } ]
  actions:
    - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
```

## groupBy は「並んでいる前提」で切る

`groupBy` はコントロールブレイク、つまり**上から見ていって値が変わったところで区切る**方式。並んでいないデータに対して使うと、同じ顧客のグループが何度も現れる。

だから `sort` が要る。`groupBy` に指定した項目と同じ順で並べておく（下の「よくある間違い」参照）。並べ替えを実行するのは Repository なので、`sort` はそこへ渡る指定でしかない。

複数階層で切るときは**外側から**書く。

```yaml
sort: { field: customer }
groupBy:
  - { field: area,     label: 地区 }
  - { field: customer, label: 顧客 }
```

## 小計と総合計は totals

`totals` に書いた項目が、グループの小計行と最後の総合計行に出る。同じ項目を2回書けば、合計と件数を並べられる。

```yaml
totals:
  - { field: amount, aggregate: sum }
  - { field: amount, aggregate: count }
```

`aggregate` の既定は `sum`（ダッシュボードは `count` が既定なので逆）。

## 改ページ

`pageBreak: true` を付けたグループは、値が変わるたびに新しい用紙から始まる。顧客ごとに1枚ずつ配る帳票はこれ。

`rowsPerPage`（既定 40）は1枚に載せる行数。**グループの見出し行と小計行も1行として数える**ので、明細だけの数ではない。A4 縦で 30〜35 行あたりが目安。

## limit があるので全件は出ない

1回の実行で読む行数は `limit`（既定 1000）。帳票はページングしないので、これが実質の上限になる。月次の全明細を出すような帳票では**足りているか必ず確認する**。

## 一覧との違い

| | 一覧（`search` / `crud`） | 帳票（`report`） |
| --- | --- | --- |
| 目的 | 画面で探す | 紙・PDF にする |
| ページング | `pagination` で切る | しない（`limit` まで一度に読む） |
| 小計 | 出せない | `totals` |
| 用紙 | 関係ない | `paper` |

同じデータを「画面で探す」と「印刷する」の両方したいなら、`search` の画面と `report` の画面を**2枚作る**のが素直。列定義は似るが、目的が違うので分けたほうが後で揉めない。

## CSV も出せる

`type: export` のアクションを置けば、帳票の列と行から CSV が出る。用紙の指定は CSV には関係しないので、小計行や改ページは CSV には現れない（明細だけが出る）。
