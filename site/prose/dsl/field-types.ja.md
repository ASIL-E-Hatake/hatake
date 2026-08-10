項目の入力欄の種類は `type` で決める。省略すると `text`。

```yaml
fields:
  - { field: code,      label: コード,   type: text, required: true }
  - { field: qty,       label: 数量,     type: number }
  - { field: orderDate, label: 受注日,   type: date }
  - { field: status,    label: 状態,     type: select,
      options: [ { value: 未出荷, label: 未出荷 }, { value: 出荷済, label: 出荷済 } ] }
  - { field: note,      label: 備考,     type: textarea }
```

## 選択肢が要る型

`select` `radio` `multiSelect` は `options` を書かないと選ぶものが無い。`value` がデータに入る値、`label` が画面に出る文字。

```yaml
- field: kind
  label: 区分
  type: select
  options:
    - { value: corporate, label: 法人 }
    - { value: personal,  label: 個人 }
```

`value` は文字列・数値・真偽値のどれでもよく、**そのままデータに入る**（変換されない）。DB のコード値をそのまま書く。

選択肢が2つなら `radio`、3つ以上なら `select`、複数選べるなら `multiSelect`、はい／いいえなら `checkbox` と考えると迷わない。

## 初期値と読み取り専用

```yaml
- { field: status, label: 状態, type: select, defaultValue: 未出荷, options: [...] }
- { field: orderNo, label: 受注番号, type: text, readOnly: true }
```

`defaultValue` が入るのは**新規作成のときだけ**。既存レコードを編集するときは既存の値が優先される。

`readOnly: true` は「見せるが編集させない」。採番済みの伝票番号や、システムが決めた値に使う。ただし**表示制御でしかない**ので、書き換えを本当に防ぐのはバックエンドの責務。

## 値の見せ方は format で変える

金額・日付・郵便番号などは、データを加工してから渡すのではなく `format` を指定する。オプションは同じ要素の `config` に書く。

```yaml
- { field: price, label: 価格, type: number, format: currency, config: { symbol: "¥" } }
- { field: zip,   label: 郵便番号, type: text, format: postal }
```

自分のコードで整形すると、同じ項目を別の画面に出したときに揃わなくなる。

## 一覧の列の型とは別の語彙

`field.type`（入力欄の種類）と `column.type`（一覧の列の見せ方）は**別の一覧**を持つ。列側には入力欄が無いので `select` や `textarea` は無く、代わりに `badge`（状態を色付きのラベルで出す）がある。

## 足りない型はプラグインで足す

`type` は決まった値しか書けない enum ではなく、**組み込みの名前がある開いた文字列**。住所検索付きの入力欄や商品コード補完のような独自の入力欄は、名前を決めて登録すれば `type: productPicker` のように書ける。Framework 本体を直す必要はない。

明細（親子）を入力する `subTable` も型の一つだが、書くことが多いので「明細を表で入力する」に分けた。
