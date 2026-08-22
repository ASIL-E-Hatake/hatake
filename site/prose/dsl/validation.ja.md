必須は `required: true`、それ以外の検証は `validators` に並べる。

```yaml
fields:
  - { field: code, label: コード, type: text, required: true,
      validators: [ { type: maxLength, value: 20 } ] }
  - { field: email, label: メール, type: text, required: true,
      validators: [ { type: email } ] }
  - { field: qty, label: 数量, type: number,
      validators: [ { type: min, value: 1 } ] }
```

## validators はオブジェクトの配列

`validators: [required, email]` のように**文字列を並べる書き方はできない**（下の「よくある間違い」参照）。`type` でどの検証かを選び、残りのキーがその引数になる。

| 書きたいこと | 書き方 |
| --- | --- |
| 20文字まで | `{ type: maxLength, value: 20 }` |
| 1以上 | `{ type: min, value: 1 }` |
| 形式を正規表現で縛る | `{ type: pattern, pattern: "^[A-Z]{2}\\d{4}$" }` |
| メール・郵便番号 | `{ type: email }` / `{ type: postalCode }` |

## メッセージを変える

`message` を足すと既定の日本語メッセージを上書きできる。業務の言葉で言いたいときに使う。

```yaml
- { field: code, label: 顧客コード, type: text,
    validators: [ { type: pattern, pattern: "^C\\d{5}$",
                    message: 顧客コードは C で始まる6桁で入力してください } ] }
```

画面ごとではなく**アプリ全体の文言を差し替えたい**、あるいは日本語以外を出したいときは、定義ではなくメッセージ解決の仕組み（`MessageResolver`）を差し替える。同じ仕掛けが Dart / TypeScript / Java の3言語にあって、同じ名前・同じ挙動で動く。

## 空のときは動かない

`required` 以外の検証は、値が空なら通る。「任意だが入れるなら形式は守れ」が普通の要求なので、それに合わせてある。**任意項目に `pattern` を書いても、空欄で弾かれることはない**。

## 明細の合計と突き合わせる

`compare` は「他の項目と比べる」検証だが、相手が明細（`subTable`）なら `aggregate` と
`of` を足すと**行を畳んだ数**と比べられる。「合計が明細の和と合っているか」はこれで書ける。

```yaml
- { field: total, label: 合計, type: number,
    validators: [ { type: compare, operator: equals,
                    field: lines, aggregate: sum, of: amount } ] }
```

畳み方はダッシュボードのカードや計算項目（`computed`）と**同じ集約**なので、同じ書き方を
すれば同じ数が出る。行を絞ってから比べるなら `where` を足す。

```yaml
    validators: [ { type: compare, operator: equals,
                    field: lines, aggregate: sum, of: amount,
                    where: { field: cancelled, operator: notEquals, value: true } } ]
```

**計算と検証で絞り方を揃えること**。小計を「取消行を外した合計」で出しているのに検証が
全部の行を足すと、取消が1件でもあれば**必ず**食い違って、直せないエラーが出続ける。

## 足りないルールは足す

`validators` の `type` も開いた文字列なので、独自ルール（社内のコード体系、他項目との突き合わせなど）は名前を決めて登録すれば書けるようになる。

## 同じ検証がバックエンドでも動く

画面で検証しても、API を直接叩かれれば意味がない。だから**同じ定義をバックエンドでも読んで、同じ検証を実行できる**ようになっている（Java / TypeScript に同名の実装がある）。検証を二重に書き直す必要はない。

つまり画面側の検証は「早く気づかせるため」、バックエンド側の検証は「守るため」。どちらも同じ定義から動く。

## ステップ入力での挙動

`wizard` では「次へ」を押したときに**そのステップの項目だけ**が検証される。最後まで進んで1回保存するので、後のステップの必須項目が未入力でも前のステップは通る。
