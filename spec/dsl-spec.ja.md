# hatake DSL 仕様書（v1.0）

> 🌐 [English](dsl-spec.md) ・ 日本語版（このページ）

hatake の定義 DSL の全仕様。定義は業務**ページ**を書くやつで、hatake がそれを
`PageDefinition` に解析して Renderer が描く。YAML でも JSON でも書けて、どっちも同じ
`PageDefinition` に正規化される。型安全な Dart ビルダー（`hatake_dsl`）でも結果は同じ。

- 機械可読スキーマ: [`schema/hatake-page.schema.json`](hatake-page.schema.json)（JSON Schema 2020-12）
- 定義の検証: `python spec/tools/validate_schema.py path/to/def.yaml`

## ドキュメント構造

基本形はバージョンと `page` の 2 つ:

```yaml
dsl_version: "1.0"
page:
  type: crud
  # ...
```

`dsl_version` は省略可（既定 `1.0`）。`page` を直接トップレベルに置くこと（`page:` で包まない）
もできるけど、包んどいた方が無難。

### エディタ補完

YAML Language Server 系のエディタなら、ファイル先頭にこの一行を置くだけで補完と検証が効く:

```yaml
# yaml-language-server: $schema=https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/hatake-page.schema.json
```

## 開いた型システム

型識別子（フィールド型・フィルタ演算子・カラム描画型・バリデータ型・アクション型）は
全部**開いた文字列**。組込値は下にまとめてあるけど、Plugin でスキーマを触らずに値を足せる。
あと各要素は `config` っていう自由なマップを持てて、Renderer/Plugin 固有の設定はそこに突っ込める。

## ページ種別

`page.type` で業務コンポーネントを選ぶ:

| `type` | コンポーネント | フォーム | 備考 |
|---|---|---|---|
| `crud` | 登録/参照/更新/削除 | ✅ | search + table + form + 行 edit/delete |
| `search` | 読み取り専用の照会/一覧 | — | search + table + プラグインアクション（ページ・行） |
| `master` | マスタメンテ | ✅ | `crud` と同じ構造 |
| `detail` | 読み取り専用の単一レコード | — | form のフィールドを表示。対象レコードは実行時に渡す |
| `form` | 単票の作成/編集フォーム | ✅ | table 無し。record key を渡せば編集、無ければ新規作成 |

`search` ページは `crud` と同じ `search` / `table` / `actions` を持つけど `form` は無い。
`rowActions` はページレベルの `plugin` アクション（例: `detail`）を指して、対象行を context に
乗せて呼ぶ。例: [`examples/product_search.yaml`](examples/product_search.yaml)。

## app（アプリ定義・ナビゲーション）

複数ページを **1本のアプリ**として束ねるトップレベル定義。ドキュメントのルートを `page:` の代わりに `app:` にする。描画（シェル＋ルーティング）は Renderer の責務。

```yaml
dsl_version: "1.0"
app:
  id: sales_admin
  title: 販売管理
  home: customers                 # 初期ルート（menu の id / 省略時は先頭の葉）
  menu:
    - { id: customers, label: 顧客, icon: people, page: customer_master }
    - group: マスタ                # 子を持つとグループ
      roles: [admin]              # roles で出し分け（isAllowed）
      items:
        - { label: 商品, page: product_master }
  pages:
    - { type: crud, id: customer_master, ... }   # 既存のページ定義をそのまま列挙
    - { type: detail, id: customer_detail, ... }
```

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `id` | string | ✅ | — | アプリ識別子。 |
| `title` | string | ✅ | — | アプリタイトル（シェル表示）。 |
| `home` | string | | 先頭の葉 | 初期ルート（[menu-item](#menu-item) の id）。 |
| `menu` | [menu-item](#menu-item)[] | | `[]` | ナビゲーションメニュー（葉とグループの木）。 |
| `pages` | page[] | | `[]` | このアプリを構成するページ定義。id で `menu` / `navigate` から参照。 |

### menu-item

葉（`page` を開く）かグループ（`items` を持つ）のどちらか。

| キー | 型 | 説明 |
|---|---|---|
| `id` | string | 葉のルートキー（省略時は `page` を流用）。 |
| `label` / `group` | string | ラベル。グループは `group:` に見出しを書く。 |
| `icon` | string | アイコン名（Renderer が実アイコンに対応付け）。 |
| `page` | string | 葉が開くページ id。 |
| `items` | menu-item[] | グループの子。 |
| `roles` | string[] | 表示を許可するロール（[権限](#権限roles)）。 |

### navigate アクション

画面遷移は `action` の型 `navigate`。`page`（遷移先 id）と `params`（ルートに渡す値。`$row.id` / `$record.id` で現在行・レコードを埋め込み）を持つ。

```yaml
- { id: detail, type: navigate, label: 詳細, page: customer_detail, params: { id: "$row.id" } }
```

## `page`（type: crud）

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `type` | string | ✅ | — | ページ種別。現在は `crud`。 |
| `id` | string | ✅ | — | 安定したページ識別子。 |
| `title` | string | ✅ | — | ページタイトル。 |
| `repository` | string | ✅ | — | 利用者が実装した `Repository` を解決するキー。 |
| `key` | string | | `id` | レコードの主キー項目名。 |
| `search` | [search](#search) | | — | 検索エリア。省略時は全件一覧。 |
| `table` | [table](#table) | | 空 | 結果テーブル。 |
| `form` | [form](#form) | | 空 | 新規/編集フォーム。 |
| `actions` | [action](#action)[] | | `[]` | ページレベルのアクション。 |

## search

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `layout` | [layout](#layout) | `{columns: 1}` | フィルタの配置。 |
| `filters` | [filter](#filter)[] | `[]` | 検索入力。 |

### filter

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `field` | string | ✅ | — | 対象のデータキー。 |
| `label` | string | ✅ | — | 表示ラベル。 |
| `type` | string | | `text` | 入力型（[フィールド型](#フィールド型)参照）。 |
| `operator` | string | | `contains` | 突合演算子（[演算子](#フィルタ演算子)参照）。 |
| `options` | [option](#option)[] | | `[]` | セレクト系フィルタ用。 |
| `config` | map | | `{}` | 追加設定。 |

## table

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `pagination` | [pagination](#pagination) | `{pageSize: 50}` | ページング設定。 |
| `rowActions` | string[] | `[]` | 行ごとのアクションid。組込: `edit`, `delete`。 |
| `columns` | [column](#column)[] | `[]` | テーブル列。 |

### column

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `field` | string | ✅ | — | 対象のデータキー。 |
| `label` | string | ✅ | — | ヘッダラベル。 |
| `type` | string | | `text` | 描画型（[カラム型](#カラム型)参照）。 |
| `width` | number | | 可変 | 固定幅（論理ピクセル）。 |
| `sortable` | boolean | | `false` | ソート可能か。 |
| `format` | string | | — | 表示フォーマッタ名（[フォーマッタ](#フォーマッタ)参照）。オプションは `config` から。 |
| `config` | map | | `{}` | 追加設定（フォーマッタのオプション兼用）。 |
| `roles` | string[] | | `[]` | 表示を許可するロール（[権限（roles）](#権限roles)参照）。空=全員。 |

### pagination

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `pageSize` | integer（≥1） | `50` | 1ページの行数。 |
| `enabled` | boolean | `true` | ページングの有効/無効。 |

## form

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `sections` | [section](#section)[] | `[]` | フィールドのグループ。 |

### section

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `title` | string | — | 任意の見出し。 |
| `layout` | [layout](#layout) | `{columns: 1}` | フィールド配置。 |
| `fields` | [field](#field)[] | `[]` | 入力フィールド。 |

### field

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `field` | string | ✅ | — | 対象のデータキー。 |
| `label` | string | ✅ | — | 表示ラベル。 |
| `type` | string | | `text` | フィールド型（[フィールド型](#フィールド型)参照）。 |
| `required` | boolean | | `false` | `required` バリデータ + 必須マーカーを付与。 |
| `readOnly` | boolean | | `false` | 読み取り専用か。 |
| `defaultValue` | any | | — | 新規作成時の初期値。 |
| `validators` | [validator](#validator)[] | | `[]` | バリデーション規則。 |
| `options` | [option](#option)[] | | `[]` | select/radio/multiSelect 用。 |
| `format` | string | | — | 表示フォーマッタ名（[フォーマッタ](#フォーマッタ)参照）。 |
| `normalize` | string[] | | `[]` | 入力前に適用するコンバータ（[コンバータ](#コンバータ)参照）。 |
| `config` | map | | `{}` | 追加設定。 |
| `visibleWhen` | [condition](#condition) | | — | 条件が真のときだけ表示。省略時は常に表示。 |
| `enabledWhen` | [condition](#condition) | | — | 条件が真のときだけ活性。省略時は常に活性。 |
| `computed` | [computed](#computed) | | — | 値をレコードから導出（読み取り専用表示）。 |
| `roles` | string[] | | `[]` | 表示を許可するロール（[権限（roles）](#権限roles)参照）。空=全員。 |
| `columns` | [column](#column)[] | | `[]` | 子行グリッドの表示列（`type: subTable` のとき。[明細](#明細subtable)参照）。 |
| `fields` | field[] | | `[]` | 子行の編集項目（`type: subTable` のとき。省略時は `columns` から導出）。 |

### 明細（subTable）

受注ヘッダ＋明細行のような**親子（master-detail）**を1画面で扱うための組込フィールド型。`type: subTable` を指定すると、**その項目の値がレコードの配列**（子行）になり、`columns` でグリッド表示、`fields` で行の編集項目を定義する。

```yaml
- field: lines                # 親レコードの lines が [{...}, {...}]
  label: 明細
  type: subTable
  columns:                    # 表示（column と同じ形＝format/width/roles が効く）
    - { field: item,  label: 品名 }
    - { field: qty,   label: 数量, type: number, width: 100 }
    - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  fields:                     # 行の編集（field と同じ形＝required/validators/computed が効く）
    - { field: item, label: 品名, required: true }
    - { field: qty,  label: 数量, type: number, required: true, validators: [ { type: min, value: 1 } ] }
    - { field: price, label: 単価, type: number, required: true }
    - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
```

保存は**ヘッダと明細をまとめて1回**（`Repository.update(key, {...ヘッダ, lines: [...]})`）。子行を別 Repository から引く方式は将来対応。

**サーバ側でも同じ定義で子行を検証できる**。`FormValidator`（Dart / TypeScript / Java）は `subTable` の各行を `fields` の規則で検証し、エラー項目名を **`<項目>[<行番号>].<行項目>`**（例 `lines[0].qty`）で返す。フロントの行編集と同じルールがサーバでも効くので、明細のチェック漏れが起きない（[コンフォーマンス](conformance/)の `subtable_validation.json` で3言語一致を担保）。

### 権限（roles）

`field` / `column` / `action` に `roles`（許可ロールの配列）を付けると、**現在ユーザのロールに応じて表示/非表示を出し分け**られる。空 or 省略なら全員に表示。

```yaml
- { field: salary, label: 給与, type: number, roles: [hr, manager] }
```

判定は「`roles` が空なら誰でも可、そうでなければユーザのロールのいずれかが含まれれば可」（`isAllowed`）。

**注意**: これは **UI レベルの表示制御**であって、認証・認可そのものではない（[スコープ](#スコープ)のとおり Framework の対象外）。現在ユーザのロール集合は実行時に与える（Flutter は `HatakeScope(roles: {...})`）。本当のアクセス制御（データの保護・改ざん防止）はバックエンド側で必ず行うこと。

### condition

`visibleWhen` / `enabledWhen` で使う宣言的な条件。レコードに対して評価する。
**リーフ**か**結合**のいずれか:

```yaml
# リーフ（field / operator / value）
visibleWhen: { field: type, operator: equals, value: corporate }

# 結合（all=AND / any=OR / not）
enabledWhen:
  all:
    - { field: type, operator: equals, value: corporate }
    - { field: age,  operator: gte,    value: 20 }
```

演算子（`operator`）: `equals` `notEquals` `gt` `gte` `lt` `lte` `contains` `in` `isEmpty` `isNotEmpty`。数値同士は数値比較、そうでなければ文字列比較。未知の演算子は false。

### computed

値をレコードから導出する計算項目。`op` で計算方法を選ぶ（組込み以外はプラグインで追加可）。

```yaml
computed: { op: concat, fields: [lastName, firstName], separator: " " }
computed: { op: sum, fields: [price, tax] }
```

| 組込 `op` | 説明 |
|---|---|
| `concat` | `fields` を `separator`（既定 空）で連結。 |
| `sum` | `fields` の数値和（欠損は 0）。 |
| `subtract` | `fields[0]` − 残りの合計。 |
| `product` | `fields` の数値積（欠損は 1）。 |

### validator

`type` でバリデータを選ぶ。`message` 以外の残りのキーは、そのままパラメータとして渡る。

```yaml
- { type: maxLength, value: 20 }
- { type: pattern, pattern: "^[A-Z]+$", message: 大文字のみ }
```

| 組込 `type` | パラメータ | 意味 |
|---|---|---|
| `required` | — | 空でないこと。 |
| `maxLength` | `value`（int） | 文字数 ≤ value。 |
| `minLength` | `value`（int） | 文字数 ≥ value。 |
| `min` | `value`（num） | 数値 ≥ value。 |
| `max` | `value`（num） | 数値 ≤ value。 |
| `pattern` | `pattern`（正規表現） | 正規表現に一致すること。 |
| `email` | — | メールアドレス形式であること。 |
| `postalCode` | — | 郵便番号形式（`1234567` / `123-4567`）。 |

`message` を書くと既定（日本語）メッセージを上書きできる。

## action

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✅ | 安定したid（`rowActions` から参照）。 |
| `type` | string | ✅ | アクション型（[アクション型](#アクション型)参照）。 |
| `label` | string | ✅ | ボタンラベル。 |
| `plugin` | string | | Plugin キー（`type: plugin` のとき）。 |
| `config` | map | | 追加設定。 |
| `roles` | string[] | | 実行を許可するロール（[権限（roles）](#権限roles)参照）。空=全員。 |

## option

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `value` | string/number/bool/null | | 格納値。 |
| `label` | string | ✅ | 表示ラベル。 |

## layout

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `columns` | integer（≥1） | `1` | 広い画面での1行あたりの項目数。 |

## 組込ボキャブラリ

### フィールド型
`text`, `textarea`, `number`, `select`, `multiSelect`, `checkbox`, `radio`,
`date`, `dateTime`, `time`

### フィルタ演算子
`equals`, `contains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`,
`between`, `in`

### カラム型
`text`, `number`, `badge`, `boolean`, `date`, `dateTime`

### アクション型
`create`, `edit`, `delete`, `plugin`

### フォーマッタ
（表示整形、`format` で指定）`currency`, `percent`, `date`, `wareki`, `postal`, `mask`。
オプションはその要素の `config` から読む（例 `{ symbol: "¥", negative: "triangle" }`）。

### コンバータ
（入力正規化、`normalize` で指定）`toHankaku`, `toZenkaku`, `hiraToKata`,
`kataToHira`, `trim`, `collapseSpaces`, `parseNumber`。

## 完全な例

[`examples/customer_master.yaml`](examples/customer_master.yaml) を見て。

## 同一性の保証

どんな定義でも、次は全部おなじ `PageDefinition` になる:

```
parsePageYaml(yaml) == parsePageJson(json) == <hatake_dsl ビルダー>
```

これは `hatake_yaml` と `hatake_dsl` のテストで担保してる。
