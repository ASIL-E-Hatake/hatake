他の項目から自動で決まる値は `computed` に書く。入力が変わると再計算される。

```yaml
fields:
  - { field: qty,    label: 数量, type: number, required: true }
  - { field: price,  label: 単価, type: number, required: true }
  - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
```

`op` が計算の種類、`fields` が使う項目。上の例は「金額 = 数量 × 単価」。

## 4つの op

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

**明細の合計（縦計）はこれではできない**。`fields` は同じ行の中の項目を指すので、行をまたいだ集計は対象外。伝票の合計金額が要るなら、帳票の `totals` かダッシュボードの集計を使う、あるいは保存時にバックエンドで計算する。

## 確認画面の表示にも使える

ステップ入力の最後で「入力内容の確認」を見せたいとき、`concat` でまとめて1項目にすると手軽。

```yaml
- { field: summary, label: 登録内容,
    computed: { op: concat, fields: [code, name], separator: " / " } }
```

## 足りない計算は足す

`op` も開いた文字列。税込金額の計算や社内固有の按分ルールなどは、名前を決めて登録すれば `op: withTax` のように書ける。消費税や年度・元号のような日本の業務でよく要る計算は、Framework 側に道具として用意されている（定義からではなくコードから呼ぶ）。
