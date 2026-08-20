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

## PDF にする・プリンタに送る

画面のプレビューまでが Framework の担当で、**紙に出すのは opt-in の `hatake_print`**（純 Dart）。定義は1文字も変えない。

```dart
final bytes = reportPdf(page, rows);              // PDF のバイト列
await Printing.layoutPdf(onLayout: (_) => bytes); // プリンタに送るなら printing
```

書式（`format`）・列幅（`column.width`）・見えない列（`roles`）・枚数は**画面の帳票と同じ**規則で組まれる。画面で 3 枚に見えた帳票は 3 枚で刷られる。

`column.width` は紙の上ではポイント（1pt = 1/72 inch）として使われ、指定の無い列が残りを分ける。全部足して紙幅を超えたら全体を同じ率で縮めるので、**紙から溢れることはない**（`rowsPerPage` が多いときは行の高さと文字も縮む）。

ただし「縮めて収める」は、刷ってから読めないと分かるということでもある。`npx hatake validate` が**刷る前に**言う。

```
警告 page.table.columns: A4 縦の紙幅 595.28pt に対して、列は最低 600pt 要ります
     （幅の指定がある 3 列で 600pt）。刷ると全体が縮められて、どの列も読めなくなります。
```

画面の `width` をそのまま持ってくると（px のつもりで 200 を3列）これに当たる。用紙の実寸は [`spec/papers.json`](https://github.com/ASIL-E-Hatake/hatake/blob/main/spec/papers.json) が正で、刷る側と警告が同じ数を見ている。

余白・脚注・ページ番号は定義ではなく `PrintStyle` に書く。紙の体裁は業務ではなく印刷所の話なので、定義に持ち込まない。

```dart
reportPdf(page, rows, style: const PrintStyle(footer: '営業部 - {page}/{pages}'));
```

日本語のフォントは**埋め込まない**（PDF が数KBで済み、どこで刷っても同じバイト列になる）。代わりに書体は開いた環境が決めるので、字面まで固定したい帳票には向かない。UI が無いところ（夜間バッチ・サーバ側）でも同じ1行で刷れるのは、この割り切りのおかげ。

