受注1件に明細が何行も付くような画面は、`type: subTable` の項目を1つ置く。`columns` がグリッドの列、`fields` が1行を編集するときの入力欄。

```yaml
form:
  sections:
    - title: 受注情報
      fields:
        - { field: orderNo,  label: 受注番号, type: text, required: true }
        - { field: customer, label: 顧客,     type: text, required: true }
    - fields:
        - field: lines
          label: 明細
          type: subTable
          columns:
            - { field: item,  label: 品名, width: 220 }
            - { field: qty,   label: 数量, type: number }
            - { field: price, label: 単価, type: number, format: currency }
          fields:
            - { field: item,  label: 品名, type: text,   required: true }
            - { field: qty,   label: 数量, type: number, required: true }
            - { field: price, label: 単価, type: number, required: true }
```

`fields` を省くと `columns` から入力欄が導かれる。列と入力欄で並べたい順が違うときだけ両方書く。

## 明細を置くセクションには見出しを付けない

グリッド自身の `label`（上の例なら「明細」）が見出しになるので、セクションの `title` も書くと二重になる。

## 2つの持ち方

明細をどこに持つかで書き方が変わる。**違いは `source` を書くかどうかだけ**。

| | 書き方 | 明細の実体 |
| --- | --- | --- |
| 埋め込み | `source` を書かない | 親レコードの中の配列。親と一緒に1回で保存される |
| 別テーブル | `source` を書く | 子の Repository が持つ。行ごとに即時保存される |

```yaml
- field: lines
  label: 明細
  type: subTable
  source:
    repository: orderLineRepository
    parentKey: orderNo    # 子行が持つ「親のキー」の項目名
    key: lineNo           # 子行自身の主キー
    pageSize: 20
  columns: [...]
```

## どちらを選ぶか

**埋め込みを既定に考える。** 親と明細が1回のやりとりで保存されるので単純で、保存の途中で失敗して片方だけ残るということが起きない。

`source` にするのは、次のどちらかに当てはまるとき。

- 明細が数百行以上になりうる（全部を1レコードに載せると重い）
- 明細を親とは別に検索したい・別の画面からも触る

## source を使うときの注意

行は1件ずつ保存されるので、**親（ヘッダ）が保存済みでないと明細を入力できない**。`parentKey` に入れる値が決まっていないと子行を紐付けられないため。

つまり「新規伝票を開いていきなり明細から入力」はできない。画面の流れとして「ヘッダを保存 → 明細を入れる」になる。利用者にとって不自然になるなら、埋め込みのほうが合っている。

## 行の中の計算

`fields` に `computed` を書けば行ごとに計算される（金額 = 数量 × 単価）。ただし**明細の縦計は計算項目では出せない**。合計が要るなら帳票の `totals` か、保存時にバックエンドで計算する。

## 検索条件には使えない

`subTable` は入力項目専用の型。検索欄（`filters`）には書けない。
