# レシピ: マスタメンテ画面

> **中身**: 検索＋一覧＋登録/編集/削除を1画面で。業務システムで一番数が多いやつ。
> **読むとき**: マスタ系の画面を作るとき。
> **動く実物**: [`spec/examples/dept_master.yaml`](../../spec/examples/dept_master.yaml)（CI でスキーマ検証済み）

## 骨格

```yaml
dsl_version: "1.0"
page:
  type: master              # crud と同構造。「マスタ」と明示したいとき master
  id: dept_master
  title: 部門マスタ
  repository: deptRepository
  key: id
  search:
    filters:
      - { field: name, label: 部門名, type: text, operator: contains }
  table:
    rowActions: [edit, delete]        # 行の編集・削除ボタン
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 部門名 }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, required: true }
          - { field: name, label: 部門名, required: true }
  actions:
    - { id: create, type: create, label: 新規登録 }   # 画面右上の登録ボタン
```

これだけで検索・ページング・登録/編集ダイアログ・削除・必須チェックまで動く。

## よくある追加要件

### コードは半角英数に強制したい
```yaml
- { field: code, label: コード, required: true,
    normalize: [toHankaku, trim],                    # 入力を送信前に正規化
    validators: [ { type: pattern, pattern: "^[A-Z0-9]+$", message: 半角英数で入力してください } ] }
```

### 金額を「¥1,234,567」で見せたい
```yaml
columns:
  - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
```
マイナスを `△1,234` にしたいなら `config: { negative: triangle }`。→ 整形の一覧は [チートシート](../api-cheatsheet.ja.md)

### 区分を選択式にしたい
```yaml
- { field: kind, label: 区分, type: select, required: true,
    options: [ { value: "1", label: 社内 }, { value: "2", label: 社外 } ] }
```

### 「社外のときだけ取引先名を出す」
```yaml
- { field: partner, label: 取引先名,
    visibleWhen: { field: kind, operator: equals, value: "2" } }
```
入力に応じて即座に出し入れされる。→ 詳細は [DSL 仕様の condition](../../spec/dsl-spec.ja.md#condition)

### 担当者しか見せたくない項目がある
```yaml
- { field: cost, label: 原価, type: number, roles: [manager] }
```
`HatakeScope(roles: {'manager'})` で現在ユーザのロールを渡す。**表示制御だけ**なので、本当の保護はサーバ側で必ずやる。

### 郵便番号・和暦みたいな「毎回作るやつ」
```yaml
- { field: zip,   label: 郵便番号, validators: [ { type: postalCode } ], format: postal }
- { field: date,  label: 契約日,   type: date, format: wareki }     # 令和8年7月22日
```

## つまずきポイント

| 症状 | 原因 |
|---|---|
| 「ハンドラが未登録です」と出る | `type: plugin` のアクションに対して `ActionRegistry` へ登録していない → [Plugin ガイド](../../flutter/docs/plugins.ja.md) |
| 一覧が空のまま | `repository` のキーが `RepositoryRegistry` の登録名と不一致 |
| 削除ボタンが出ない | `table.rowActions` に `delete` を入れていない |
| `key` を変えたのに編集が効かない | `key` はレコードの主キー項目名。`findByKey`/`update` の実装と揃える |
| YAML で `no` を項目名に使うと変になる | YAML1.1 では `no` が **false** 扱い。`orderNo` 等に改名する |
