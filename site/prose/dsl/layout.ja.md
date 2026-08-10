`layout.columns` は「1行に何項目並べるか」。既定は 1（縦一列）。

```yaml
form:
  sections:
    - title: 基本情報
      layout: { columns: 2 }
      fields:
        - { field: code, label: コード, type: text }
        - { field: name, label: 顧客名, type: text }
```

## table の columns とは別物

紛らわしいが**まったく違うもの**。名前が同じだけ。

| | 意味 | 書く場所 |
| --- | --- | --- |
| `layout.columns` | 1行あたりの**項目数**（数値） | `search` / `section` / `wizardStep` / `dashboardPage` |
| `table.columns` | 一覧に出す**列の定義**（配列） | `table` / `dashboardItem` / `subTable` の `field` |

`layout: { columns: 3 }` は「3項目ずつ横に並べる」。`columns: [{ field: ... }]` は「この列を出す」。書き間違えるとパースで落ちるので気づけるが、頭の中では混ざりやすい。

## 4か所に書ける

| 書く場所 | 効く範囲 |
| --- | --- |
| `search.layout` | 検索条件の並び |
| `section.layout` | そのセクションの項目の並び |
| `wizardStep.layout` | そのステップの項目の並び |
| `dashboardPage.layout` | カードのグリッド幅（既定は 2） |

セクションごとに変えられるので、「住所は1列、コードと区分は3列」のような作り分けができる。

## 狭い画面では効かない

`columns` は**画面が広いときの**列数。狭い画面では縦一列に落ちる。タブレットやスマホで見る画面に大きな数を入れても、そこで崩れるわけではない。

## 業務画面での目安

- 検索条件: 3 前後。条件が多い画面ほど横に詰めたほうが1画面に収まる
- 入力フォーム: 2。1にすると縦に長くなり、3以上にすると項目名が読みにくくなる
- ダッシュボード: 4（既定の 2 だとカードが大きすぎることが多い）

迷ったら小さいほうにする。詰めすぎた画面は直すのが面倒だが、縦に長い画面はスクロールで済む。
