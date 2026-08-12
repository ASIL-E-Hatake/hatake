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
もできるけど、包んどいた方が無難。複数ページを1本のアプリとして束ねたいときはルートを
`app:` にする（→ [app](#appアプリ定義ナビゲーション)）。

### エディタ補完

YAML Language Server 系のエディタなら、ファイル先頭にこの一行を置くだけで補完と検証が効く:

```yaml
# yaml-language-server: $schema=https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/hatake-page.schema.json
```

## 開いた型システム

型識別子（フィールド型・フィルタ演算子・カラム描画型・バリデータ型・アクション型）は
全部**開いた文字列**。組込値は下にまとめてあるけど、Plugin でスキーマを触らずに値を足せる。
あと各要素は `config` っていう自由なマップを持てて、Renderer/Plugin 固有の設定はそこに突っ込める。

**開いているのは値だけで、キーは閉じている。** 型の名前はいくらでも足せるが、
`label` を `labell` と書いたら**それは間違い**。次節がその話。

## 未知キーの検出（strict）

パーサは既定では知らないキーを黙って捨てる。これは既存の定義を壊さないためだが、
**任意キーを書き間違えたときに何も起きない**という副作用がある（必須キーなら値が
見つからないので既にエラーになる。困るのは `readOnly` / `sortable` / `visibleWhen`
のような任意キーで、DSL の大半はそちら）。

そこで **strict パース**がある。オンにすると、知らないキーは**1件も許されない**。

```dart
parsePageYaml(source, strict: true);   // Dart
```
```ts
parsePageYaml(source, { strict: true });          // TypeScript
```
```java
DefinitionParser.parsePageYaml(source, true);     // Java
```

- 厳しさは [JSON Schema](hatake-page.schema.json) と**完全に同じ**。`additionalProperties: false`
  のノードだけを閉じ、`config` / `validators` / `computed` / `visibleWhen` のような
  **自由な入れ物の中は見ない**（プラグインが自由に足せる場所なので）
- **1件目で止めない**。見つかった全部をまとめて返す（1往復で直せるように）
- 近い既知キーがあれば**指摘する**（大文字小文字を無視した編集距離が2以下。
  `pagesize` → `pageSize`、`visible_when` → `visibleWhen`）
- 未知の**ページ種別**はキーを見ない（種別エラーのほうが根本的なので、そちらが出る）
- 出てくる順は `(パス, キー)` の昇順で、3言語同じ

```
知らないキーが 2 件あります:
  - page.form.sections[0].fields[0]: 知らないキー "readonly"（readOnly の間違い？）
  - page.form.sections[0].fields[0]: 知らないキー "requred"（required の間違い？）
```

CI や定義を書く道具では strict を使うのがいい（[`conformance/strict_keys.json`](conformance/strict_keys.json)
で3言語一致を担保。各版のキー表がスキーマとズレていないことも機械で確認している）。

## ページ種別

`page.type` で業務コンポーネントを選ぶ:

| `type` | コンポーネント | フォーム | 備考 |
|---|---|---|---|
| `crud` | 登録/参照/更新/削除 | ✅ | search + table + form + 行 edit/delete |
| `search` | 読み取り専用の照会/一覧 | — | search + table + プラグインアクション（ページ・行） |
| `master` | マスタメンテ | ✅ | `crud` と同じ構造 |
| `detail` | 読み取り専用の単一レコード | — | form のフィールドを表示。対象レコードは実行時に渡す |
| `form` | 単票の作成/編集フォーム | ✅ | table 無し。record key を渡せば編集、無ければ新規作成 |
| `wizard` | ステップ入力 | ✅ | `steps` に分割したフォーム。**ステップ単位で検証**して次へ進み、最後にまとめて保存（→ [wizard](#wizardtype-wizard)） |
| `dashboard` | ダッシュボード | — | `items`（カード）のグリッド。1枚＝小さな読み取りクエリ＋見せ方（→ [dashboard](#dashboardtype-dashboard)） |
| `report` | 帳票 | — | 一覧の印刷版。グループ・小計・用紙で紙に組む（→ [report](#reporttype-report)） |

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
| `theme` | [theme](#theme) | | — | 見た目（色・明暗・密度・角丸）。省略時は Renderer の既定。 |
| `menu` | [menu-item](#menu-item)[] | | `[]` | ナビゲーションメニュー（葉とグループの木）。 |
| `pages` | page[] | | `[]` | このアプリを構成するページ定義。id で `menu` / `navigate` から参照。 |

### theme

会社の色・明暗・密度・角丸。**Renderer 非依存**で、Material なら `ThemeData` に、別の Renderer なら別の形に落ちる。**挙動は何も変わらない**（見た目だけ）。Renderer 固有の追加は DSL を増やさず `config` に入れる。

```yaml
app:
  theme:
    primaryColor: "#1B5E20"
    density: compact
    radius: 8
```

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `primaryColor` | string | — | ブランド色（`#RRGGBB` / `#AARRGGBB`）。ここを種に配色を作る。 |
| `secondaryColor` | string | primary から導出 | アクセント色。 |
| `brightness` | `light` / `dark` / `system` | `light` | `system` は端末設定に従う。 |
| `density` | `comfortable` / `standard` / `compact` | `standard` | 行の高さと余白。業務画面は `compact` が使いやすい。 |
| `fontFamily` | string | — | フォント名（Renderer が解決）。 |
| `radius` | number（≥0） | — | 角丸（論理ピクセル）。 |
| `config` | map | `{}` | Renderer 固有の追加設定。 |

色が色でない・`brightness` / `density` が知らない値のときは**パース時にエラー**にする。黙って無視すると「書いたのに変わらない」になり、定義を疑う手掛かりが無くなるので。

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

## wizard（type: wizard）

長い入力を**ステップに分けて**進める単票ページ。1ステップぶんの項目だけを見せ、
**そのステップの項目だけを検証**して次に進む。最後のステップで初めて Repository に保存する
（途中の状態はどこにも書かない）。

`form` の代わりに `steps` を持つ。それ以外は [`form` ページ](#pagetype-crud) と同じ
（`repository` / `key` を持ち、record key を渡せば編集・無ければ新規作成）。

```yaml
dsl_version: "1.0"
page:
  type: wizard
  id: customer_onboarding
  title: 顧客登録
  repository: customerRepository
  key: id
  steps:
    - id: basic
      title: 基本情報
      description: まず会社の基本情報を入力してください   # 任意の補足
      layout: { columns: 2 }
      fields:
        - { field: code, label: コード, required: true, normalize: [toHankaku, trim] }
        - { field: name, label: 会社名, required: true }
    - id: contact
      title: 連絡先
      fields:
        - { field: zip, label: 郵便番号, validators: [ { type: postalCode } ] }
        - { field: email, label: メール, validators: [ { type: email } ] }
    - id: confirm
      title: 確認
      fields:
        # 前のステップの入力を computed で見せる（読み取り表示）
        - { field: summary, label: 内容, computed: { op: concat, fields: [code, name], separator: " / " } }
  actions:
    - { id: showDef, type: plugin, plugin: showDefinition, label: 定義を見る }
```

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `type` | string | ✅ | — | `wizard`。 |
| `id` | string | ✅ | — | 安定したページ識別子。 |
| `title` | string | ✅ | — | ページタイトル。 |
| `repository` | string | ✅ | — | 利用者が実装した `Repository` を解決するキー。 |
| `key` | string | | `id` | レコードの主キー項目名。 |
| `steps` | [step](#step)[] | ✅ | — | ステップ（1つ以上）。宣言順に進む。 |
| `actions` | [action](#action)[] | | `[]` | ページレベルのアクション。 |

### step

**`id` と見出しを持つ [section](#section)**、と思えばいい（`fields` / `layout` は section と同じ形）。

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `id` | string | ✅ | — | ステップ識別子（安定した参照用）。 |
| `title` | string | ✅ | — | ステップ見出し。 |
| `description` | string | | — | 任意の補足文。 |
| `layout` | [layout](#layout) | | `{columns: 1}` | 項目の配置。 |
| `fields` | [field](#field)[] | | `[]` | そのステップの入力項目。 |

**検証の効き方**:

- **次へ** … そのステップの `fields` だけを検証する。他のステップの未入力では止まらない。
- **保存** … 最後のステップを検証したうえで、**全ステップを1つのフォームとして**もう一度検証する。
  ここで前のステップの項目が落ちた場合は、**その項目を含むステップまで自動的に戻って**エラーを出す
  （黙って保存に失敗させない）。
- 保存は1回。`normalize` は保存時に全項目へ適用される（[コンバータ](#コンバータ)）。

同じ定義でサーバ側も検証できる。`FormValidator`（Dart / TypeScript / Java）に
**ステップ単位のフォーム**を渡せばそのステップだけ、**全体のフォーム**を渡せば全項目を検証する
（[コンフォーマンス](conformance/)の `wizard_validation.json` で3言語一致を担保）。

## dashboard（type: dashboard）

カードを並べた読み取り専用のページ。**1枚のカード = 小さな読み取りクエリ + その結果の見せ方**。

他のページ種別と違って**単一レコードを指さない**ので `key` は無く、`repository` は
「カードが省略したときの既定」でしかない（カードごとに別 Repository を引ける）。

**集計の考え方**: Framework は集計クエリを投げない。Repository が**行を返し**、
その行に対する畳み込み（[集約](#集約オペレーション)）だけを定義する。だから
`limit` は「集計が見る母数」でもある。大きなテーブルで正確な数字が要るときは
**集計済みのエンドポイント**を Repository にして、`aggregate` を省く（1行＝1点）か
`count` を使う。`count` だけは Repository が返す**総件数**を使うので `limit` に影響されない。

```yaml
dsl_version: "1.0"
page:
  type: dashboard
  id: sales_dashboard
  title: 売上ダッシュボード
  repository: orderRepository       # カードが省略したときの既定
  layout: { columns: 4 }            # カードのグリッド幅
  # 検索エリアは全カードのクエリに混ざる（期間で board 全体を絞る）
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  items:
    # metric: 集約された1つの数値。value 省略時は count（件数）
    - { id: orderCount, title: 受注件数, action: openOrders }
    - id: totalAmount
      title: 受注金額
      value: { aggregate: sum, field: amount }
      format: currency
      config: { symbol: "¥" }
    - id: pending
      title: 未出荷
      filters: { status: 未出荷 }   # このカードだけの固定条件
    # chart: aggregate があるとラベルが同じ行を1点に畳む
    - id: byCustomer
      type: chart
      title: 顧客別の受注金額
      span: 2
      chart: { kind: bar, labelField: customer, valueField: amount, aggregate: sum }
    # table: 数行の一覧（列は table の column と同じ形）
    - id: recent
      type: table
      title: 直近の受注
      span: 2
      limit: 5
      sort: { field: orderDate, ascending: false }
      columns:
        - { field: orderNo, label: 受注番号, width: 140 }
        - { field: amount, label: 金額, type: number, format: currency }
  actions:
    - { id: openOrders, type: navigate, label: 受注照会, page: order_search }
```

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `type` | string | ✅ | — | `dashboard`。 |
| `id` | string | ✅ | — | 安定したページ識別子。 |
| `title` | string | ✅ | — | ページタイトル。 |
| `repository` | string | | — | カードが省略したときの既定 Repository キー。 |
| `layout` | [layout](#layout) | | `{columns: 2}` | カードのグリッド幅。 |
| `search` | [search](#search) | | — | **全カード**のクエリに混ぜる絞り込み（カードの `filters` より優先）。 |
| `items` | [item](#item)[] | ✅ | — | カード（1つ以上）。宣言順に並ぶ。 |
| `actions` | [action](#action)[] | | `[]` | ページレベルのアクション（カードの `action` から参照）。 |

### item

1枚のカード。「どう引くか」（`repository` / `filters` / `limit` / `sort`）と
「どう見せるか」（`type` と、それに対応する `value` / `columns` / `chart`）を持つ。

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `id` | string | ✅ | — | カード識別子。 |
| `title` | string | ✅ | — | カード見出し。 |
| `type` | string | | `metric` | カード種別（[ダッシュボード項目型](#ダッシュボード項目型)参照）。 |
| `repository` | string | | ページの既定 | このカードが引く Repository キー。 |
| `span` | integer（≥1） | | `1` | グリッドで何列ぶん使うか。 |
| `filters` | map | | `{}` | このカードだけの固定条件。 |
| `limit` | integer（≥1） | | `100` | 取得件数（クエリの `pageSize`）。 |
| `sort` | `{field, ascending}` | | — | 並び替え。`ascending` の既定は `true`。 |
| `value` | [value](#value) | | `{aggregate: count}` | `metric` の畳み込み。 |
| `format` | string | | — | 表示フォーマッタ名（[フォーマッタ](#フォーマッタ)参照）。 |
| `config` | map | | `{}` | 追加設定（フォーマッタのオプション、`height` など）。 |
| `columns` | [column](#column)[] | | `[]` | `table` の列。 |
| `chart` | [chart](#chart) | | — | `chart` のプロット。 |
| `action` | string | | — | タップで実行するページアクションの id。 |
| `roles` | string[] | | `[]` | 表示を許可するロール（[権限](#権限roles)参照）。 |

**カードは独立して読み込む**ので、1つの Repository が落ちても**そのカードだけ**がエラーになる。

### value

`metric` カードが行を1つの数値に畳む方法。

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `aggregate` | string | `count` | 集約オペレーション（[集約](#集約オペレーション)参照）。 |
| `field` | string | — | 畳む項目。`count` では不要、それ以外は必須。 |

### chart

`chart` カードが行を点の列にする方法。

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `kind` | string | | `bar` | チャート種別（[チャート種別](#チャート種別)参照）。 |
| `labelField` | string | ✅ | — | 各点のラベルを持つ項目。 |
| `valueField` | string | | — | 各点の値を持つ項目（`count` では不要）。 |
| `aggregate` | string | | — | ラベル別に適用する集約。**省略すると1行＝1点**（集計済みデータ向け）。 |

ラベルの並びは**初出順**（言語をまたいで同じ順序にするため。並べ替えは Repository の責務）。
ラベルが無い行は空文字のグループにまとまる。

## report（type: report）

一覧の**印刷版**。明細の列は [table](#table) から取るので、一覧と帳票で列がずれない。
`report` が足すのは「紙の構造」だけ。単一レコードを指さないので `key` は無い。

**グループはコントロールブレイク**（並び順に見て、キーが変わったら小計を出して
見出しを出す）。だから**行が先に並んでいる必要がある**＝並べ替えは Repository の責務で、
同じ値が離れて2回出れば2グループになる。

**印刷そのものは Framework の外**。定義 + 行 → 中立な「帳票ドキュメント」までを
Framework が作り、Renderer はそれを用紙の比率で描く（プレビュー）。PDF 化や
プリンタ送出は opt-in アダプタの領分（`QuerySpec` と同じ立ち位置）。

```yaml
dsl_version: "1.0"
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  # 出力条件。値はそのまま Repository のフィルタに渡る
  search:
    layout: { columns: 2 }
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  # 明細の列（column そのまま。number は右寄せで印字）
  table:
    columns:
      - { field: orderNo, label: 受注番号, width: 140 }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  report:
    paper: { size: A4, orientation: portrait }
    rowsPerPage: 30
    sort: { field: customer }          # groupBy はこの並びに依存する
    groupBy:
      - { field: customer, label: 顧客, pageBreak: true }   # 得意先ごとに1枚
    totals:
      - { field: amount, aggregate: sum }
      - { field: amount, aggregate: count }
  actions:
    # CSV も同じ列から出る（出力先は利用者が登録する）
    - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
```

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `type` | string | ✅ | — | `report`。 |
| `id` | string | ✅ | — | 安定したページ識別子。 |
| `title` | string | ✅ | — | 帳票タイトル（紙にも出る）。 |
| `repository` | string | ✅ | — | 利用者が実装した `Repository` を解決するキー。 |
| `search` | [search](#search) | | — | 出力条件。 |
| `table` | [table](#table) | | 空 | 明細の列。 |
| `report` | 下表 | | 既定値 | 紙の構造。 |
| `actions` | [action](#action)[] | | `[]` | ページレベルのアクション（`export` など）。 |

**`report`**:

| キー | 型 | 既定 | 説明 |
|---|---|---|---|
| `paper` | `{size, orientation}` | `{A4, portrait}` | 用紙。`size` は開いた文字列（`A4` / `A3` / `B5` / `letter`）、`orientation` は `portrait` / `landscape`。 |
| `rowsPerPage` | integer（≥1） | `40` | 1枚に載る行数。**グループ見出し・小計も1行として数える**（これでページ割りが3言語で一致する）。 |
| `limit` | integer（≥1） | `1000` | 1回の出力で読む行数。帳票は印刷物なのでページングしない。 |
| `sort` | `{field, ascending}` | — | 印字順（Repository に渡す）。列見出しを押せない帳票では**ここが唯一の並び指定**で、`groupBy` はこの順に依存する。 |
| `groupBy` | [reportGroup](#reportgroup)[] | `[]` | コントロールブレイク（外側から順）。 |
| `totals` | [reportTotal](#reporttotal)[] | `[]` | 小計・総計に出す数字。 |

### reportGroup

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `field` | string | ✅ | — | グループを切る項目。 |
| `label` | string | ✅ | — | 見出しに出すラベル（`顧客: 山田商事` のように出る）。 |
| `pageBreak` | boolean | | `false` | 変わるたびに改ページするか。 |

### reportTotal

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `field` | string | ✅ | — | 集約する項目。 |
| `aggregate` | string | | `sum` | 集約オペレーション（[集約](#集約オペレーション)。ダッシュボードと同じ語彙）。 |

同じ `field` を2つ宣言してよい（例: 金額の `sum` と `count`）。小計の値は項目名ではなく
**宣言順の位置**で対応する。

**出力の組み立て方**（3言語一致。[`conformance/report.json`](conformance/report.json)）:

1. 行を順に見て、`groupBy` の値が変わったら → **深い階層から小計** → （`pageBreak` があれば改ページ）→ **外側から見出し**
2. 明細を1行出す
3. 最後に、開いていた階層の小計 → **総計**
4. できた行を `rowsPerPage` ごとに紙へ割る（ページが埋まっていれば小計・総計も次の紙へ送る）
5. 行が0件なら紙も0枚（Renderer が「データがありません」を出す）

## export（CSV 出力）

`action` の型 `export`。**その画面の列（`table.columns`）と行から CSV を組む**ので、
一覧・帳票のどちらでも同じ書き方になる。ロールで見えない列は出力にも入らない。

```yaml
- { id: csv, type: export, label: CSV出力, config: { filename: 受注一覧, bom: true } }
```

| `config` | 型 | 既定 | 説明 |
|---|---|---|---|
| `filename` | string | ページタイトル | ファイル名（拡張子が無ければ `.csv` を付ける）。 |
| `header` | boolean | `true` | 見出し行（列ラベル）を出すか。 |
| `delimiter` | string | `,` | 区切り文字（タブ区切りは `"\t"`）。 |
| `newline` | string | `crlf` | 改行（`crlf` / `lf`）。 |
| `bom` | boolean | `false` | 先頭に BOM を付けるか（Excel の文字化け対策）。 |
| `raw` | boolean | `false` | `format` を通さず生の値を書くか（Excel で計算させたいとき）。 |
| `limit` | integer | `10000` | 一覧ページで出力のために読み直す上限件数。 |
| `charset` | string | `utf-8` | 出力先に渡す文字コードの名前（下記）。**変換はしない**。 |

**書き出しの決まり**（[`conformance/csv.json`](conformance/csv.json)）: 区切り・引用符・改行を含む値は
`"` で囲み、`"` は2つに重ねる（RFC 4180）。欠損・`null` は空欄。列が無ければ空文字。
最後の行にも改行を付ける。

**一覧ページの `export` は表示中のページではなく検索結果全体を出す**（`limit` まで
読み直す）。帳票ページは既に `report.limit` ぶん読んでいるので、その行をそのまま出す。

**ファイルを書くのは Framework の外**。Framework は文字列（BOM 込み）までを作り、
ダウンロード・保存ダイアログ・共有・アップロードは利用者が登録した出力先が行う。

### 文字コード（`charset`）

受け側が Shift_JIS 固定、という連携は今でも多い。**変換するのは出力先**（バイト列を
書くのはそちらの責務）なので、定義は「どの文字コードで欲しいか」を宣言するだけ。名前は
出力先にそのまま渡る（Flutter では `ExportRequest.charset`、MIME にも
`text/csv; charset=cp932` として載る）。

```yaml
- id: csvSjis
  type: export
  label: CSV出力（Shift_JIS）
  config: { filename: 受注一覧, charset: cp932 }
```

| 名前 | 何か |
|---|---|
| `utf-8`（既定） | そのまま |
| `cp932` | **Windows / Excel の Shift_JIS**（別名 windows-31j / MS932）。「Shift_JIS で下さい」はほぼこれ |
| `shift_jis` | JIS X 0208 の Shift_JIS（厳密）。`①` `㈱` `髙` `～` は入らない＝拡張文字を弾きたいとき |
| `euc_jp` | EUC-JP（JIS X 0208） |

**`bom` は UTF-8 のときだけ効く。** BOM は UTF-8 のものなので、Shift_JIS に付けると
先頭のセルにゴミが3バイト入る（`charset` が UTF-8 でなければ、宣言があっても付けない）。

変換の実装は opt-in パッケージ [`hatake_encoding`](../flutter/packages/hatake_encoding/)
（cp932 / Shift_JIS / EUC-JP。表は生成物で、期待値は
[`conformance/charset.json`](conformance/charset.json) で Dart と JVM が突き合わせている）。
名前は開いた文字列なので、独自の文字コードは出力先で自由に足せる。

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
| `optionsFrom` | string | | — | 親の条件名。その値で選択肢を絞る（[選択肢の連動](#選択肢の連動optionsfrom--when--optionssource)参照）。 |
| `optionsSource` | [optionsSource](#選択肢の連動optionsfrom--when--optionssource) | | — | 選択肢を Repository から引く。 |
| `config` | map | | `{}` | 追加設定。 |

**入力の出方**（Renderer が `type` で決める）:

| `type` | 入力 | 送られる値 |
|---|---|---|
| `text` / `textarea` | テキスト | 文字列（空なら送らない） |
| `number` | 数値キーボード | 数値（解釈できないときは文字列） |
| `select` | ドロップダウン（`—`＝指定なし付き） | `option.value` |
| `checkbox` | **3状態**ドロップダウン（指定なし / はい / いいえ） | `true` / `false`（指定なしは送らない） |
| `date` / `dateTime` | カレンダー選択 | `yyyy-MM-dd` |

`operator: between` を付けると**開始／終了の2入力**になり、値は `[開始, 終了]` の2要素で渡る（片側だけの指定も可＝もう片方は `null`）。期間絞り込みはこれで書く:

```yaml
- { field: orderDate, label: 受注日, type: date, operator: between }
```

複数条件を並べるときは `search.layout.columns` で列数を指定できる（狭い画面では自動的に1列へ退避）。**空の入力は送信されない**ので、未入力の条件で絞り込まれることはない。

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
| `visibleWhen` | [condition](#condition) | — | 条件が真のときだけ**区画ごと**表示。隠れている区画の項目は検証もされない（[項目の制御](#項目の制御visiblewhen--enabledwhen--readonlywhen--requiredwhen)参照）。 |

### field

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `field` | string | ✅ | — | 対象のデータキー。 |
| `label` | string | ✅ | — | 表示ラベル。 |
| `type` | string | | `text` | フィールド型（[フィールド型](#フィールド型)参照）。 |
| `required` | boolean | | `false` | `required` バリデータ + 必須マーカーを付与。 |
| `requiredWhen` | [condition](#condition) | | — | 条件が真のときだけ必須（**サーバ側でも効く**）。 |
| `readOnly` | boolean | | `false` | 読み取り専用か。 |
| `readOnlyWhen` | [condition](#condition) | | — | 条件が真のあいだ読み取り専用（見た目は変えない）。 |
| `defaultValue` | any | | — | 新規作成時の初期値。 |
| `validators` | [validator](#validator)[] | | `[]` | バリデーション規則。 |
| `options` | [option](#option)[] | | `[]` | select/radio/multiSelect 用。 |
| `format` | string | | — | 表示フォーマッタ名（[フォーマッタ](#フォーマッタ)参照）。 |
| `normalize` | string[] | | `[]` | 入力前に適用するコンバータ（[コンバータ](#コンバータ)参照）。 |
| `config` | map | | `{}` | 追加設定。 |
| `visibleWhen` | [condition](#condition) | | — | 条件が真のときだけ表示。省略時は常に表示。 |
| `enabledWhen` | [condition](#condition) | | — | 条件が真のときだけ活性（偽なら**非活性＝グレー**）。省略時は常に活性。 |
| `computed` | [computed](#computed) | | — | 値をレコードから導出（読み取り専用表示）。 |
| `roles` | string[] | | `[]` | 表示を許可するロール（[権限（roles）](#権限roles)参照）。空=全員。 |
| `columns` | [column](#column)[] | | `[]` | 子行グリッドの表示列（`type: subTable` のとき。[明細](#明細subtable)参照）。 |
| `fields` | field[] | | `[]` | 子行の編集項目（`type: subTable` のとき。省略時は `columns` から導出）。 |
| `source` | [subTableSource](#subtablesource) | | — | 子行を別 Repository から取る（`type: subTable` のとき。省略時は親レコード埋め込み）。 |

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

保存は**ヘッダと明細をまとめて1回**（`Repository.update(key, {...ヘッダ, lines: [...]})`）。明細が大量でページングが要るなら [subTableSource](#subtablesource) を使う。

行は**並べ替え**できる（行ごとの上へ/下へ。明細の順序が意味を持つ帳票向け）。既定で有効、`config: { reorderable: false }` で無効化:

```yaml
- { field: lines, label: 明細, type: subTable, config: { reorderable: false }, columns: [...] }
```

**サーバ側でも同じ定義で子行を検証できる**。`FormValidator`（Dart / TypeScript / Java）は `subTable` の各行を `fields` の規則で検証し、エラー項目名を **`<項目>[<行番号>].<行項目>`**（例 `lines[0].qty`）で返す。フロントの行編集と同じルールがサーバでも効くので、明細のチェック漏れが起きない（[コンフォーマンス](conformance/)の `subtable_validation.json` で3言語一致を担保）。

### subTableSource

`subTable` に `source` を付けると、子行を**親レコードの中ではなく別 Repository から**外部キーで引いてくる。明細が数千行あってページングが要る場合向け（数十行なら `source` 無しの埋め込みで十分）。

```yaml
- field: lines
  label: 明細
  type: subTable
  source:
    repository: orderLineRepository   # 子側の Repository キー
    parentKey: orderNo                # 子行が持つ親キーの項目名
    key: lineNo                       # 子行の主キー項目名（既定 id）
    pageSize: 20                      # 1ページの行数（既定 20）
  columns: [...]
  fields: [...]
```

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `repository` | string | ✓ | — | 子行の Repository キー。 |
| `parentKey` | string | ✓ | — | 子行が持つ親キーの項目名。検索フィルタ `{ parentKey: 親キー値 }` として渡る。 |
| `key` | string | | `id` | 子行の主キー項目名（行の更新/削除に使う）。 |
| `pageSize` | integer | | `20` | 1ページの行数。 |

**埋め込みとの違い**（挙動が変わるので理解して選ぶこと）:

| | 埋め込み（`source` なし） | 子Repository（`source` あり） |
|---|---|---|
| 行の在り処 | 親レコードの項目（`lines: [...]`） | 別 Repository。親レコードに `lines` は入らない |
| 読み込み | 親の `findByKey` で一緒に来る | `search({ filters: { parentKey: 親キー }, page, pageSize })` |
| 行の保存 | 親の保存時にまとめて1回 | **行ごとに即時**（`create` / `update` / `delete`） |
| 親が未保存のとき | そのまま編集できる | **編集不可**（親キーが無いと外部キーを張れない）。先に親を保存する |
| 並べ替え | ✓（`reorderable`） | ✗（順序は Repository 側の責務。並び順を持ちたいなら項目にして `sort` で扱う） |
| 親の `FormValidator` | 項目自身の規則＋各行を `fields` で検証 | **項目まるごと検証対象外**（値がレコードに無いので `required` を付けても無意味）。行の検証は行の保存時に同じ `fields` で行う |

`source` を使うと「1回で原子的に保存」ではなくなる。**ヘッダと明細を必ず同時にコミットしたい業務なら埋め込みを選ぶ**。

### 権限（roles）

`field` / `column` / `action` に `roles`（許可ロールの配列）を付けると、**現在ユーザのロールに応じて表示/非表示を出し分け**られる。空 or 省略なら全員に表示。

```yaml
- { field: salary, label: 給与, type: number, roles: [hr, manager] }
```

判定は「`roles` が空なら誰でも可、そうでなければユーザのロールのいずれかが含まれれば可」（`isAllowed`）。

**注意**: これは **UI レベルの表示制御**であって、認証・認可そのものではない（Framework の対象外）。現在ユーザのロール集合は実行時に与える（Flutter は `HatakeScope(roles: {...})`）。本当のアクセス制御（データの保護・改ざん防止）はバックエンド側で必ず行うこと。

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

**新規のときだけ / 編集のときだけ**は `mode` のリーフで書く。レコードの中身では分からない
（キー項目が入っているかを見る回避策は、読んでも意図が分からない）。

```yaml
# コードは新規のときだけ入力できる（編集では変えさせない）
- { field: code, label: コード, enabledWhen: { mode: create } }
# 更新者は編集のときだけ出す
- { field: updatedBy, label: 更新者, readOnly: true, visibleWhen: { mode: edit } }
```

| `mode` | いつ true |
|---|---|
| `create` | 新規入力中（まだ保存されていない） |
| `edit` | 既存レコードの編集中 |

**モードが分からない場所では false**（読み取り専用の詳細画面など）。`{ mode: create }` は
「新規のときだけ」なので、そう言えない場所では満たされない、と読む。明細（`subTable`）の
行では、行の追加が `create`・既存行を開いたら `edit`。

### 項目の制御（`visibleWhen` / `enabledWhen` / `readOnlyWhen` / `requiredWhen`）

条件を使った項目の出し分けは4つ。**見た目の話と検証の話が混ざるので、どれがどこまで
効くのかを先に決めてある**。

| キー | 効き方 | サーバ側の検証 |
|---|---|---|
| `visibleWhen` | 出す / 出さない | **効く**（隠れている項目は検証しない） |
| `enabledWhen` | 活性 / **非活性（グレー）** | 効かない |
| `readOnlyWhen` | 読み取り専用（**見た目は変えない**） | 効かない |
| `requiredWhen` | 必須 / 任意 | **効く** |

```yaml
# 個人のときは会員番号を直させない（値は読ませたい）
- { field: memberNo,  label: 会員番号, readOnlyWhen: { field: kind, value: personal } }
# 法人のときだけ登録番号が必須
- { field: invoiceNo, label: 登録番号, requiredWhen: { field: kind, value: corp } }
```

**`enabledWhen` と `readOnlyWhen` の使い分け**: どちらも直せなくなるが、非活性は
「いま触るものではない」を色で示し、読み取り専用は「読むものだ」という顔のまま直せない。
値を読ませたいなら `readOnlyWhen`。`enabledWhen: { not: … }` と書けば同じことはできるが、
条件を反転させて読むのは間に1枚入るので、素直な向きのキーを用意してある。

**隠れている項目は検証しない。** `visibleWhen` で消えている項目（と `visibleWhen` で
消えている区画の項目）は、`required` も他のバリデータも飛ばす。入力できない項目を必須に
すると「保存できないが直せない画面」になってしまうため。逆に、**出ている項目の必須は
そのまま効く**ので、「出たら必須」は `visibleWhen` ＋ `required: true` で書ける。
`requiredWhen` が要るのは「**出ているのに、条件によって必須が変わる**」ときだけ。

**区画ごとの出し分け**は `section.visibleWhen`。見出しごと消え、中の項目も検証されない。

```yaml
sections:
  - title: 請求先
    visibleWhen: { field: kind, value: corp }
    fields:
      - { field: billingCode, label: 請求先コード, required: true }
```

`requiredWhen` は**サーバ側の検証でも同じ定義が使われる**（3言語の `FormValidator`）。
`{ mode: … }` を含む条件を使うなら、検証を呼ぶときにモードを渡すこと（POST / PUT で
分かる）。渡さないと mode のリーフは false になり、**検証は緩む方に倒れる**。

なお、隠れている項目に値が残っていた場合、**その値は保存される**（検証を飛ばすだけで、
値を消すことはしない）。消えていてほしいなら、値を持たせない側で作ること。

### 選択肢の連動（`optionsFrom` / `when` / `optionsSource`）

都道府県 → 市区町村、大分類 → 中分類。**親項目の値で子項目の選択肢を絞る**。

書き方は2つあり、選択肢が定義に書ける量かどうかで選ぶ。

```yaml
# ① 定義に書く（選択肢が固定で、数が知れているとき）
- { field: prefecture, label: 都道府県, type: select,
    options: [{ value: tokyo, label: 東京都 }, { value: osaka, label: 大阪府 }] }
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture              # 親の項目名
  options:
    - { value: shibuya, label: 渋谷区, when: tokyo }   # この親の値のときだけ出る
    - { value: kita,    label: 北区,   when: osaka }
    - { value: other,   label: その他 }               # when 無し = 常に出る

# ② Repository から引く（選択肢がデータのとき）
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture
  optionsSource:
    repository: cityRepository   # 利用者が登録した Repository
    value: code                  # 行のどの項目を値にするか（既定 code）
    label: name                  # 行のどの項目を表示するか（既定 name）
    parentKey: prefecture        # 行の中で親の値を持つ項目名。絞り込み条件として渡る
    limit: 200                   # 引く件数（既定 200）
```

決まっていること:

- **親が未入力なら、`when` 付きの選択肢は出ない**（親を選ぶまで子は空）。`when` を書いて
  いない選択肢は常に出るので、「未選択」「その他」に使える
- 値の比較は条件式と同じ**緩い比較**（`'1'` と `1` は同じ）
- **親が変わって子の値が選べなくなったら、子の値を捨てる**。「大阪府なのに渋谷区」で
  保存されるより、消えて選び直す方が安全
- ②では**親が未入力のうちは引かない**（全件出すと連動の意味が無い）。`parentKey` は
  `optionsFrom` と対で使う（親が決まらないと絞り込めない）
- `options` と `optionsSource` の両方を書いたら**引いた方が勝つ**（`hatake validate` が警告する）
- Framework は HTTP も SQL も知らない。②が使うのは一覧画面と同じ `Repository.search`

**検索条件（`search.filters`）でも同じキーが同じ意味で使える。** 「いまの値の集まり」が
レコードではなく検索欄に入っている値になるだけで、絞り込みの判定は共有している
（`optionsFrom` / `when` / `optionsSource` の書き方は上と同じ）。範囲（`operator: between`）
は値を2つ持つので、親には使えない。

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

`message` を書くと既定（日本語）メッセージを上書きできる。既定文言をまるごと差し替えたい
（別ロケールにしたい）ときは `ValidatorRegistry` に `MessageResolver` を注入する。

## action

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✅ | 安定したid（`rowActions` から参照）。 |
| `type` | string | ✅ | アクション型（[アクション型](#アクション型)参照）。 |
| `label` | string | ✅ | ボタンラベル。 |
| `plugin` | string | | Plugin キー（`type: plugin` のとき）。 |
| `confirm` | [confirm](#confirm) | | 実行前に確認する。 |
| `onSuccess` | [onSuccess](#onsuccess) | | 成功したあとの後処理。 |
| `config` | map | | 追加設定。 |
| `roles` | string[] | | 実行を許可するロール（[権限（roles）](#権限roles)参照）。空=全員。 |

### confirm

実行前に聞く。「削除前に確認」を毎回コードで書かないための宣言。

| キー | 型 | 必須 | 既定 | 説明 |
|---|---|---|---|---|
| `title` | string | | Renderer の既定 | ダイアログの見出し。 |
| `message` | string | ✅ | — | 聞く内容。 |
| `okLabel` | string | | Renderer の既定 | 実行するボタンのラベル。 |
| `cancelLabel` | string | | Renderer の既定 | 何もしないボタンのラベル。 |
| `danger` | bool | | `false` | 実行ボタンを破壊的な見た目にする。 |

**`type: delete` は `confirm` が無くても必ず確認する**（取り消せない操作なので、既定を安全側に置く）。`confirm` を書いた場合は文言がそれに置き換わる。

### onSuccess

**成功したときだけ**動く。失敗時に動かないことがこの宣言の意味（呼び出しの後ろにコードを書くのとは違う）。

| キー | 型 | 説明 |
|---|---|---|
| `message` | string | 短く出す通知（Renderer 次第。Material ならスナックバー）。 |
| `page` | string | 遷移先のページ id。 |
| `params` | map | `page` に渡すルート値（`$row.id` / `$record.id` を埋め込み）。 |

「失敗」はハンドラ未登録・出力先未登録・Repository が拒否など。`create` / `edit` は**フォームを開くだけ**なので `onSuccess` は動かない（保存できたかはその時点で分からない）。

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
`date`, `dateTime`, `time`, `subTable`

### フィルタ演算子
`equals`, `notEquals`, `contains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`,
`lte`, `between`, `in`

`isEmpty` / `isNotEmpty` は値を取らないので**条件（[condition](#condition)）専用**。
逆に `between` / `startsWith` / `endsWith` は条件では使えない（検索専用）。

### カラム型
`text`, `number`, `badge`, `boolean`, `date`, `dateTime`

### アクション型
`create`, `edit`, `delete`, `navigate`, `plugin`, `export`（→ [export](#exportcsv-出力)）

### ダッシュボード項目型
（[item](#item) の `type`）`metric`, `table`, `chart`

### チャート種別
（[chart](#chart) の `kind`）`bar`, `line`, `pie`

### 集約オペレーション
（[value](#value) / [chart](#chart) の `aggregate`）`count`, `sum`, `avg`, `min`, `max`。

| op | 意味 | 空のとき |
|---|---|---|
| `count` | 行数（`field` は見ない） | `0` |
| `sum` | 数値の合計（数値でない値は 0 扱い） | `0` |
| `avg` | 数値の平均（数値でない行は分母に入れない） | `null` |
| `min` / `max` | 数値の最小 / 最大 | `null` |

数値の解釈は `computed` と同じ（`"1500"` は数値、真偽値は数値ではない）。
未登録の op は `null`（例外にしない）。3言語で同結果になることを
[`conformance/dashboard_aggregate.json`](conformance/dashboard_aggregate.json) で担保している。

### フォーマッタ
（表示整形、`format` で指定）`currency`, `percent`, `date`, `wareki`, `postal`, `mask`。
オプションはその要素の `config` から読む（例 `{ symbol: "¥", negative: "triangle" }`）。

### コンバータ
（入力正規化、`normalize` で指定）`toHankaku`, `toZenkaku`, `hiraToKata`,
`kataToHira`, `trim`, `collapseSpaces`, `parseNumber`。

## 機械可読なリファレンス

この仕様書は読み物なので、**「ここに何を書けるか」を1発で引きたいとき**は
[`reference.json`](reference.json) を使う。JSON Schema から機械的に生成しているので、
仕様とズレない（ズレたら CI が落ちる）。

```bash
npx hatake reference                      # 全部（JSON）
npx hatake reference rowsPerPage          # キー名で引く（どのノードに書けるか＋型・既定値）
npx hatake reference report               # ノード名・ページ種別でも引ける（当たったもの全部）
npx hatake reference --page-kind report   # その画面で使える所だけに絞る
```

中身:

| フィールド | 内容 |
|---|---|
| `pageKinds` | ページ種別（`crud` …）→ ノード名・必須キー |
| `nodes` | ノード（`table` / `column` …）ごとの説明・キー一覧・**どのページ種別で有効か**・親ノード |
| `nodes.*.keys[]` | `key` / `type` / `required` / `default` / `values` / `open` / `minimum` / `nodes`（入れ子の名前） |
| `keyIndex` | キー名 → そのキーを書けるノード名。「このキーどこに書くの？」用 |

`values` は取れる値。`open: true` は**組み込みの一覧**という意味で、Registry で足せる
（例: `format` は `currency` 等が組み込みだが独自フォーマッタを登録できる）。
`open: false` は enum＝それ以外書けない。

`closed: false` のノードは「中身が自由な入れ物」（`config` / `validators` / `computed` /
`visibleWhen`）。strict パースもここは見ない。

## 構造の間違いの検出（警告）

strict は「知らないキー」を、スキーマは「型と必須」を見る。どちらも通るのに**意図どおり
動かない**定義がまだ書けるので、そこは警告として言う。

```bash
npx hatake validate page.yaml                    # 既定で警告も出す（終了コードは変えない）
npx hatake validate page.yaml --warn-as-error    # CI で落としたいとき
npx hatake validate page.yaml --no-warn --json   # 黙らせる / 機械可読
```

| 規則 | 何が起きるか |
|---|---|
| `rowaction-not-declared` | `rowActions` の id に対応する `actions` が無い → ボタンが黙って出ない（組み込みは `edit` / `delete` のみ） |
| `rowactions-as-objects` | `rowActions` の要素が文字列でない → 行アクションにならない |
| `unknown-page` | `navigate` / `onSuccess.page` / メニューの行き先が `pages` に無い → 押しても何も起きない |
| `unknown-home` | `app.home` に当たるメニュー項目もページも無い → 先頭のページが開く |
| `unknown-action` | ダッシュボードのカードが指す `action` が無い → 押しても何も起きない |
| `duplicate-page-id` / `duplicate-action-id` / `duplicate-field` | id や項目名の重複 → 後ろが前を隠す |
| `condition-operator-unsupported` | 条件が理解しない演算子（`between` など）→ 常に false になり、その項目が出てこない |
| `aggregate-without-field` | `count` 以外で `field` が無い → 集計結果が null |
| `groupby-without-sort` | 並び順の指定が無い → グループが分裂して小計が何度も出る |
| `total-without-column` | 合計の対象が `table.columns` に無い → 合計がどこにも表示されない |
| `required-as-validator-only` | `validators` の要素がオブジェクトでない → 検証が増えない |
| `requiredwhen-with-required` / `readonlywhen-with-readonly` | 常に効く指定と条件つきの指定の両方 → 条件が意味を持たない |
| `option-when-without-optionsfrom` / `optionsfrom-unknown-field` / `optionssource-parentkey-without-optionsfrom` / `options-and-optionssource` | 選択肢の連動の辻褄（入力項目・検索条件の両方） |

**エラーではない**（Repository の実装やプラグインの登録次第で成立する書き方もあるため）。
遷移先の検査は `app:` の定義だけ（単票の定義は他のページを知らないので判定しない）。
警告には対応する[対照表](pitfalls.json)の id が付くものがあり、`hatake pitfalls <id>` で
正しい書き方が引ける。**同梱の例とデモは警告ゼロ**であることを CI で確認している。

### 画面の外との辻褄（登録済み一覧を渡したとき）

上の規則は**定義の中だけ**で閉じている。実際にはもう一段あって、`repository: orderRepository`
と書いてもアプリ側がその名前で登録していなければ**画面は出るがデータが来ない**。`format` /
`plugin` / 独自の項目型も同じで、名前が合っていなければ黙って効かない。

strict もスキーマもここは見られない（**登録済みの一覧を知らない**ので）。なので2つに分けた。

```bash
npx hatake refs page.yaml --needs-registration    # 定義が外に要求しているものを列挙する
npx hatake validate page.yaml --registry reg.json # 渡した一覧と突き合わせる
```

`refs` は判断せずに列挙し、`validate` は**渡されたカテゴリだけ**を突き合わせる。一覧を
渡さなければ何も言わない（今までと同じ検査に戻る）。組み込みの名前は自動で足されるので、
一覧に書くのは自分で登録したものだけでよい。

| 規則 | 何が起きるか |
|---|---|
| `unknown-repository` | 画面は出るがデータが来ない |
| `unknown-plugin` | ボタンは出るが押しても何も起きない |
| `unknown-validator` / `unknown-converter` | その検証・正規化が**黙って行われない** |
| `unknown-formatter` | 整形されず素の値が出る |
| `unknown-computed-op` / `unknown-aggregate` | 計算・集計されず値が空になる |
| `unknown-field-type` / `unknown-column-type` / `unknown-action-type` / `unknown-dashboard-item-type` / `unknown-chart-kind` | 組み込みでも登録済みでもない → その型として扱われない |
| `unknown-page-ref` | 単票の定義から遷移先が引けない（`app:` の中は `unknown-page` の担当） |

一覧（`--registry` に渡す JSON）は `refs --needs-registration --json` の出力と同じ形。

```json
{ "repositories": ["orderRepository"], "plugins": ["csvExport"] }
```

`--registry` を省いても、定義の隣（無ければカレント）の `hatake-registry.json` があれば
黙って拾う。同じ名前が何箇所から参照されていても**警告は1件**（直す所は登録する側の1つなので、
件数だけ添える）。

## よくある間違い

綴り間違いは strict パースが拾うが、**書ける場所を間違える**（ページ直下に `columns`、
`form` の直下に `fields`）と、**落ちないけど意図と違う**（`groupBy` に `sort` が無い、
`metric` が件数になる）は名前を見ても直せない。対照表を
[`pitfalls.json`](pitfalls.json) に置いてある。

```bash
npx hatake pitfalls groupBy        # 間違い → なぜ駄目か → 正しい書き方（--lang en で英語）
npx hatake validate page.yaml      # 未知キーからも自動で引いてヒントを出す
```

各項目は「間違いの例は本当に strict で落ち、正しい例は本当に通る」ことを CI で確認して
いる（＝この表は嘘をつけない）。日本語と英語の両方が入っている。

## 完全な例

用途から引く索引は [`examples/README.md`](examples/README.md)（機械可読版は
[`examples/index.json`](examples/index.json)、CLI は `npx hatake examples <やりたいこと>`）。

[`examples/customer_master.yaml`](examples/customer_master.yaml) を見て。
アプリ丸ごと（メニュー＋複数ページ）は [`examples/sales_app.yaml`](examples/sales_app.yaml)、
親子・明細は [`examples/order_entry.yaml`](examples/order_entry.yaml)（埋め込み）と
[`examples/order_entry_paged.yaml`](examples/order_entry_paged.yaml)（子Repository）。
ステップ入力は [`examples/customer_wizard.yaml`](examples/customer_wizard.yaml)、
ダッシュボードは [`examples/sales_dashboard.yaml`](examples/sales_dashboard.yaml)、
帳票は [`examples/sales_report.yaml`](examples/sales_report.yaml)。

## 同一性の保証

どんな定義でも、次は全部おなじ `PageDefinition` になる:

```
parsePageYaml(yaml) == parsePageJson(json) == <hatake_dsl ビルダー>
```

これは `hatake_yaml` と `hatake_dsl` のテストで担保してる。
