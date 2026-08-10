入力フォームは `form.sections` に分けて書く。項目（`fields`）はセクションの中に入る。

```yaml
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo

  form:
    sections:
      - title: 受注情報
        layout: { columns: 2 }
        fields:
          - { field: orderNo,  label: 受注番号, type: text, required: true }
          - { field: customer, label: 顧客,     type: text, required: true }
      - title: 備考
        fields:
          - { field: note, label: メモ, type: textarea }
```

## セクションは1つでもいい

項目が少ないなら分ける必要はない。ただし**`fields` を `form` の直下に書くことはできない**（下の「よくある間違い」参照）。セクションが1つでも `sections` を挟む。

```yaml
form:
  sections:
    - fields:
        - { field: code, label: コード, type: text }
```

## title は省ける

`title` を書かなければ見出しの無いセクションになる。見出しを付けない使いどころが2つある。

- 項目が少なくて見出しが邪魔なとき
- `subTable`（明細グリッド）を置くセクション — グリッド自身の `label` が見出しになるので、セクション見出しを付けると二重になる

## 並べ方は layout で変える

`layout: { columns: 2 }` でセクションごとに1行あたりの項目数を変えられる。住所のような長い項目だけ1列、コードや区分は2〜3列、といった作り方をする。詳しくは「項目の並べ方を変える」に書いた。

## form を持てる種別

`crud` `master` `form` `detail` の4つ。`detail` は読み取り専用で、`form.sections` に書いた項目が**表示だけ**される（入力欄にはならない）。詳細画面のためにレイアウトを別途書かなくていい、という作りになっている。

逆に `search` `dashboard` `report` に `form` は書けない。`wizard` はフォームを持つが、`form` ではなく `steps` の中に `fields` を書く。
