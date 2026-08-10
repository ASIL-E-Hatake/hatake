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

## 足りないルールは足す

`validators` の `type` も開いた文字列なので、独自ルール（社内のコード体系、他項目との突き合わせなど）は名前を決めて登録すれば書けるようになる。

## 同じ検証がバックエンドでも動く

画面で検証しても、API を直接叩かれれば意味がない。だから**同じ定義をバックエンドでも読んで、同じ検証を実行できる**ようになっている（Java / TypeScript に同名の実装がある）。検証を二重に書き直す必要はない。

つまり画面側の検証は「早く気づかせるため」、バックエンド側の検証は「守るため」。どちらも同じ定義から動く。

## ステップ入力での挙動

`wizard` では「次へ」を押したときに**そのステップの項目だけ**が検証される。最後まで進んで1回保存するので、後のステップの必須項目が未入力でも前のステップは通る。
