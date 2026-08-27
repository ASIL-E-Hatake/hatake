他の項目から自動で決まる値は `computed` に書く。入力が変わると再計算される。

```yaml
fields:
  - { field: qty,    label: 数量, type: number, required: true }
  - { field: price,  label: 単価, type: number, required: true }
  - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
```

`op` が計算の種類、`fields` が使う項目。上の例は「金額 = 数量 × 単価」。

## 同じレコードの項目をまとめる op

| op | 計算 | 例 |
| --- | --- | --- |
| `sum` | 足す | 小計 + 消費税 |
| `subtract` | 引く | 売価 − 原価 |
| `product` | 掛ける | 数量 × 単価 |
| `concat` | 文字をつなぐ | 姓 + 名 |

`concat` のときだけ `separator` で区切り文字を指定できる。

```yaml
- { field: fullName, label: 氏名,
    computed: { op: concat, fields: [lastName, firstName], separator: " " } }
```

## 計算項目は入力欄にならない

`computed` を付けた項目は**読み取り表示**になる。`type` を書く必要はなく、利用者が直接触ることもできない。だから「金額を手で上書きしたい」という要求には合わない（それは `readOnly` でもない普通の項目にして、計算はしない）。

## 明細の1行の中でも使える

`subTable` の `fields` に書けば、行ごとに計算される。受注明細の「金額」はこれで済む。

```yaml
- field: lines
  label: 明細
  type: subTable
  columns:
    - { field: qty,    label: 数量, type: number }
    - { field: price,  label: 単価, type: number }
    - { field: amount, label: 金額, type: number, format: currency }
  fields:
    - { field: qty,    label: 数量, type: number, required: true }
    - { field: price,  label: 単価, type: number, required: true }
    - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
```

## 明細の合計（縦計）

`fields` は同じレコードの項目を指すので、行をまたいだ集計はできない。行をまとめるときは
`field`（明細の項目名）と `of`（行の項目名）を書く。

```yaml
- title: 金額
  fields:
    - { field: subtotal, label: 小計, format: currency,
        computed: { op: sum, field: lines, of: amount } }
    - { field: lineCount, label: 明細行数,
        computed: { op: count, field: lines } }
```

行を1行足す・数量を直すと、**その場で変わる**。保存する内容にも入る。

数のまとめ方は5つ。`count` / `sum` / `avg` / `min` / `max`（文字にする `join` は後述）。ダッシュボードのカードや
`compare` の検証と同じ語彙なので、同じ書き方をすれば同じ数が出る。

| 書き方 | 何が出るか |
| --- | --- |
| `{ op: sum, field: lines, of: amount }` | 金額の合計 |
| `{ op: count, field: lines }` | 行数（`of` は要らない） |
| `{ op: avg, field: lines, of: price }` | 単価の平均 |
| `{ op: max, field: lines, of: amount }` | 一番大きい行の金額 |

### 取消した行を外す（`where`）

業務の合計は「全部の行」ではないことが多い。畳む前に行を絞るなら `where` を書く。

```yaml
- { field: subtotal, label: 小計, format: currency,
    computed: { op: sum, field: lines, of: amount,
                where: { field: cancelled, operator: notEquals, value: true } } }
```

条件の書き方は `visibleWhen` と同じ（`all` / `any` / `not` も使える）。**条件の書き方を
2つ覚える必要はない**。ただし判定するのは**行1件**なので、`{ mode: create }`（新規のとき）
はここでは意味を持たない＝常に当たらない（`validate` が言う）。

絞った結果が 0 件になったときの値は「行が無いとき」と同じ。

### 品名を1行にまとめる（`join`）

数ではなく**文字**をまとめるときは `join`。伝票の「品名」欄や確認画面の要約で要る。

```yaml
- { field: itemNames, label: 品名, type: textarea, readOnly: true,
    computed: { op: join, field: lines, of: item, separator: "、" } }
```

区切りの既定は `", "`。`concat` の既定が空なのは姓と名を詰めるためで、行を並べるときに
詰めると読めないから、既定が違う。空の値は飛ばす（区切りだけが並ばないように）。行が
1件も無ければ空文字（0 ではない）。

### 決まりごと

- `of` は `count` 以外で必須。無いと**空欄**になる（`validate` が先に言う）
- 行が1件も無いとき `sum` と `count` は 0、`avg` / `min` / `max` は空（「平均 0 円」と
  出ると読み違えるので、値が定まらないときは空にする）、`join` は空文字
- 数として読めない値の行は飛ばす（文字で来た数は読む）
- 計算は**書いた順に1回**。小計を使って消費税を出すなら、消費税は小計より後ろに書く
  （逆に書くと**空のまま計算される**。画面では空欄に見えるだけなので `validate` が言う）
- 畳めるのは**親と一緒に保存する明細**だけ。`source` を書いた明細はページ送りで別に
  取るので、画面に出ている行を足しても業務の合計にはならない（これも `validate` が言う）

紙に出す小計（グループごとの小計・総計）は帳票の `totals` の担当で、これとは別。

## 依存は絵にできる

順番の警告（`computed-order`）が出たとき、**どこを動かせばいいか**は依存を辿らないと分からない。定義から読めるので、絵にできる。

```bash
npx hatake diagram order_entry.yaml --computed
```

Mermaid で出る（PR の本文にそのまま貼れる。`--format dot` なら Graphviz）。明細の行から親への線も、畳む前の絞り込みが見ている行の項目も出る。**順番が逆の線は赤**なので、動かす所が色で分かる。

## 確認画面の表示にも使える

ステップ入力の最後で「入力内容の確認」を見せたいとき、`concat` でまとめて1項目にすると手軽。

```yaml
- { field: summary, label: 登録内容,
    computed: { op: concat, fields: [code, name], separator: " / " } }
```

## 足りない計算は足す

`op` も開いた文字列。税込金額の計算や社内固有の按分ルールなどは、名前を決めて登録すれば `op: withTax` のように書ける。消費税や年度・元号のような日本の業務でよく要る計算は、Framework 側に道具として用意されている（定義からではなくコードから呼ぶ）。
