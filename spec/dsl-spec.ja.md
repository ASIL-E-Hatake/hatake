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
プリンタ送出は opt-in アダプタの領分（`QuerySpec` と同じ立ち位置）。実装は
`hatake_print`（`reportPdf(page, rows)` で PDF のバイト列。純 Dart なので UI が
無い所でも刷れる）。**刷る前に紙を見る**なら `npx hatake paper <file>`（紙の上の座標を
文字にして返す。MCP の `hatake_print_preview` も同じ）＝座標は刷る側と同じ計算で、
[共有フィクスチャ](conformance/report_layout.json)が一致を縛っている。**定義は印刷のために1文字も変わらない**＝紙の体裁（余白・
脚注・ページ番号）は業務ではなく印刷所の話なので、アダプタを呼ぶ側が渡す。

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

## print（帳票を刷る）

`action` の型 `print`。**帳票（`report:` を持つ画面）専用**で、押すと紙の中身が
出力先（`printSink`）に渡る。刷るのは「いま画面に出ている行」なので、画面で3枚に
見えた帳票は3枚で刷られる。

```yaml
- { id: printPdf, type: print, label: 印刷, config: { filename: 売上明細 } }
```

| `config` | 型 | 既定 | 説明 |
|---|---|---|---|
| `filename` | string | ページタイトル | ファイル名（拡張子が無ければ `.pdf` を付ける）。 |

**`filename` 以外の `config` は読まずにそのまま出力先へ渡る。** 用紙のトレイ・書体・
両面は印刷所の語彙なので、DSL に足すのではなくアダプタが読む（`config: { font: mincho }`
のように書いておけば、出力先が拾える）。

**バイト列を作るのは Framework の外**。CSV は Framework が文字列まで作れるが、PDF は
フォント・符号化・ページツリーを持つ別の世界で、刷らないアプリに持たせる意味が無い。
だから `print` が渡すのは**紙の中身**（帳票の定義・行・役割・フォーマッタ）までで、
PDF にするのは opt-in の [`hatake_print`](../flutter/packages/hatake_print/)、
それをプリンタやファイルに送るのはアプリ。

```dart
HatakeScope(
  printSink: (request) async {
    final bytes = reportPdf(
      request.page,
      request.rows,
      formatters: request.formatters,  // 画面と同じ見え方
      roles: request.roles,            // 見えない列は紙にも出ない
    );
    await save(request.filename, bytes);
  },
  ...
)
```

`printSink` が未登録なら、押したときに**そう言う**（黙って何も起きないことにはしない）。
`report` の無い画面に置くと `validate` が警告する（`print-without-report`）＝押すまで
気づかない、を避ける。一覧をそのままファイルに持ち出したいだけなら
[`export`](#exportcsv-出力)（CSV）で、そちらはどの画面でも動く。

**刷る前に紙を読む**なら `npx hatake paper <file>`（紙の上の座標を文字にして返す。
座標は刷る側と同じ計算で、[共有フィクスチャ](conformance/report_layout.json)が一致を
縛っている）。

## まとめて実行する（`scope: selection`）

`action` に `scope: selection` を書くと、**その画面の表にチェックボックスが出る**。
押したときにハンドラが受け取るのは、選ばれた**行そのもの**。

```yaml
table:
  columns:
    - { field: orderNo, label: 受注番号 }
    - { field: status, label: 状態, type: badge }
actions:
  - id: approveSelected
    type: plugin
    plugin: approveOrders
    label: 一括承認
    scope: selection
    # 1回で動かせる上限（業務の決めごと）。超えて選んでいる間ボタンは押せない。
    # 役割で変えるなら { default, byRole }。`all` は上限なし。
    maxRows:
      default: 20
      byRole: { manager: 50, admin: all }
    confirm: { message: '{count} 件の受注を承認します' }
```

| 決めごと | なぜ |
|---|---|
| **選べるようになるのは、一括のボタンが在るときだけ** | 別のキーで表を選択可能にすると、「チェックボックスは出るが何もできない表」と「一括ボタンは出るが選べない画面」の2つが書けてしまう。片方だけでは意味が無いので、1つの宣言にした |
| **選ぶまで押せない**（件数がラベルに出る） | 押しても何も起きないボタンは、画面が壊れていると教える |
| **行が入れ替わったら選択は消える** | 検索し直した・ページを変えた・実行後に読み直した後で、**画面に無い行に対して実行できてしまう**のが一番危ない |
| **実行できたら選択は解ける** | 同じ行に二度実行するのは、まず事故 |
| 実行できるのは `type: plugin` **だけ** | 一括の中身（承認・締め・出荷確定）は業務で、Framework は業務を持たない |
| **消すのを複数まとめる口は無い** | 取り消せない操作は、事故が件数ぶん大きくなる。消すのは1件ずつ（行アクションの `delete`） |
| 渡すのは**行**（キーではない） | 一括の判断には状態や金額が要る。キーだけ渡すと、ハンドラが件数ぶん読み直すことになる |
| **1回の上限は定義に書ける**（`maxRows`）。超えている間は押せない | 上限は業務の決めごと（承認は20件まで／締めは全件）。**切り詰めて実行はしない**＝選んだうちの一部だけが動いたことに、押した人は気づけない |
| 上限は**役割で変えられる**（`byRole`）。当てはまる役割が複数あれば**一番ゆるい方** | 「担当は20件・管理者は上限なし」は業務の形。ゆるい方を採るのは、`roles` が「どれか1つ当てはまれば見える」のと同じ考え方＝役割は持っているほど広がる |
| 上限は**バックエンドでも同じ数**で判定できる（TypeScript / Java） | 画面の上限は**早く気づかせるため**、サーバの上限は**守るため**。画面が止めても API を直接叩けば通るので、同じ定義から同じ数を読む（検証を両方で回すのと同じ形） |
| 上限を書かなければ、実際の上限は**画面に出ている行の数** | 選べるのは表に出ている行だけ。`table.pagination.pageSize` がそのまま上限になり、ページ送りを切っていれば全件になる |

Flutter では登録したハンドラが `ActionContext.records` で受け取る。**呼び出しは1回**なので、
API も1回で済ませられる（件数ぶんの往復にしない）。

### 結果を件数で返す

一括は**一部だけ失敗する**のが普通の姿（5件のうち1件は既に出荷済み）。ハンドラが
`ActionContext.report` で件数を返すと、何と言うかは定義（`onSuccess` / `onError` の
`message`）が決める＝ハンドラごとに文言を持たない。

```dart
'approveOrders': (ctx) async {
  final rejected = await api.approve(ctx.records);   // 呼ぶのは1回
  // 行を**名指しで**報告する（件数だけでも動くが、それだと現場は全部やり直す）。
  ctx.report(ActionOutcome.rejected(
    succeeded: ctx.records.length - rejected.length,
    rows: [
      for (final one in rejected) FailedRow(one.orderNo, reason: one.why),
    ],
  ));
},
```

行を名指しすると3つが付いてくる。文言の `{failedKeys}` が埋まる・失敗の通知から
**「どの行か」**を開ける（キーと理由を1件ずつ）・そこから**その行だけを選び直せる**
（もう一度押す相手を人が選び直さなくていい）。名指ししなければ件数だけの報告として
扱われ、`{failedKeys}` は文字のまま出る（「行が分かっていない」と読める）。

`failed` より少なく名指ししてもよい（3件失敗して1件だけ分かる）。そのときは
「1 件だけが分かっています」と出る＝分かっていない分を無かったことにしない。

| 報告 | どう扱うか |
|---|---|
| 何も報告しない（例外も投げない） | 成功。一括なら**渡した行数**が `{count}` に入る（ハンドラの手間ゼロ） |
| `failed: 0` | 成功。`onSuccess` が動く |
| 一部失敗 | **`onSuccess` は動かない**。`onError`（無ければ「3 件を実行しました（1 件失敗）」） |
| 全部失敗 | 同上（「2 件すべて失敗しました」） |
| 例外を投げた | 失敗。`onError`（無ければ理由をそのまま） |

```dart
'approveOrders': (ctx) async {
  await api.approve([for (final r in ctx.records) r['orderNo']]);
  await (ctx.controller as ListController).load();   // 一覧を読み直す
},
```

表の無い画面（フォーム・ウィザード・ダッシュボード）に置いた場合と、`plugin` 以外の型に
書いた場合は `validate` が警告する。

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
モードは2つあり、**どちらのモードかは `fields` と `field` のどちらを書いたかで決まる**。

```yaml
# ① 同じレコードの項目を畳む
computed: { op: concat, fields: [lastName, firstName], separator: " " }
computed: { op: sum, fields: [subtotal, tax] }

# ② 明細（subTable）の行を畳む（縦計）
computed: { op: sum, field: lines, of: amount }
computed: { op: count, field: lines }

# ②のうち「並べて1行にする」（数ではなく文字が出る）
computed: { op: join, field: lines, of: item, separator: "、" }

# ②は畳む前に行を絞れる（条件の書き方は visibleWhen と同じもの）
computed: { op: sum, field: lines, of: amount,
            where: { field: cancelled, operator: notEquals, value: true } }
```

| キー | 型 | 意味 |
|---|---|---|
| `op` | string（必須） | 計算方法。開いた文字列（`ComputedRegistry` で追加可）。 |
| `fields` | string[] | ①同じレコードの項目名。 |
| `separator` | string | 値の間に挟むもの。既定は `concat` が空、`join` が `", "`。 |
| `field` | string | ②畳む明細（`type: subTable`）の項目名。 |
| `of` | string | ②行のどの項目を畳むか。`count` 以外で必須。`compare` の `of` と同じ意味。 |
| `where` | condition | ②畳む前に行を絞る条件。**行1件に対して**評価する。 |

| 組込 `op` | モード | 説明 |
|---|---|---|
| `concat` | ① | `fields` を `separator`（既定 空）で連結。 |
| `sum` | ①② | ①`fields` の数値和（欠損は 0）／②行の `of` の合計。 |
| `subtract` | ① | `fields[0]` − 残りの合計。 |
| `product` | ① | `fields` の数値積（欠損は 1）。 |
| `count` | ② | 行数（`of` は要らない）。 |
| `avg` | ② | 行の `of` の平均。 |
| `min` / `max` | ② | 行の `of` の最小 / 最大。 |
| `join` | ② | 行の `of` を `separator`（既定 `", "`）で並べる。**文字**が出る。 |

②の集約の語彙と実装は**ダッシュボードの `aggregate` と同じもの**（同じ集約を2つ持たない）。
数値の解釈も同じで、数として読めない行は飛ばす（`"1500"` は数値、真偽値は数値ではない）。
`join` は数ではなく文字を作るので集約ではない（実装も別）。空の値は飛ばす（区切りだけが
並ばないように）。

②の決まりごと:

- 行が1件も無いとき `sum` と `count` は 0、`avg` / `min` / `max` は **null**
  （「平均 0 円」と出ると読み違えるので、値が定まらないときは空にする）、`join` は空文字
- 畳めるのは**親のレコードと一緒に保存する明細**だけ。`source` を書いた明細は
  ページ送りで別に取るので、行がそこに揃っていない（`validate` が
  `computed-of-paged-subtable` で言う）
- `field` と `fields` の両方を書いたら **`field` が勝つ**（`validate` が言う）
- 計算は**宣言順に1回**なので、`小計 → 消費税 → 合計` の順に並べる（後ろの項目は前の
  結果を使える。逆に書くと**空のまま計算される**ので `validate` が `computed-order` で言う）。
  依存が絡んでいるときは `hatake diagram <file> --computed` で1枚の絵にできる
  （Mermaid / DOT。順番が逆の線は赤で出る）

`where` の決まりごと:

- 条件の言葉は `visibleWhen` と同じ（リーフ `{ field, operator, value }` と
  `all` / `any` / `not`）。**条件の書き方を2つ持たない**ため
- 判定するのは**行**。だから `{ mode: create }` は常に false ＝1件も残らない
  （`validate` が `computed-where-mode` で言う）
- 知らない演算子は false（条件と同じ規則）＝1件も残らない
- 1件も残らないときの値は「行が無いとき」と同じ（`sum` は 0、`avg` は null）
- ①（`fields`）に書いても効かない（絞る行が無い。`validate` が
  `computed-where-ignored` で言う）

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
| `compare` | `operator` / `field`（＋`aggregate` / `of`） | **他の項目と比べる**（下記）。 |

`message` を書くと既定（日本語）メッセージを上書きできる。既定文言をまるごと差し替えたい
（別ロケールにしたい）ときは `ValidatorRegistry` に `MessageResolver` を注入する。

### 項目間の検証（`compare`）

1つの項目だけでは書けない規則（「開始日 ≤ 終了日」「合計＝明細の和」）は `compare` で書く。
**他の項目の値を見る**のはこの検証だけで、他の組込は自分の値しか見ない。

```yaml
- field: endDate
  label: 終了日
  type: date
  validators:
    - { type: compare, operator: gte, field: startDate }   # 開始日 以上

- field: total
  label: 合計
  type: number
  validators:
    # 明細（subTable）を畳んだ数と比べる＝「合計＝明細の和」
    - { type: compare, operator: equals, field: lines, aggregate: sum, of: amount }
```

| パラメータ | 意味 |
|---|---|
| `operator` | `equals` / `notEquals` / `gt` / `gte` / `lt` / `lte`（既定 `gte`）。大小を比べられるものだけ |
| `field` | 比べる相手の**項目名**（同じフォームの中）。必須 |
| `aggregate` | 相手が明細のとき、畳み方（`sum` / `avg` / `min` / `max` / `count`。ダッシュボードと同じ集約） |
| `of` | 畳む行の項目名（`count` のときは要らない） |

決めごと:

* 比べ方は**数として読めれば数、読めなければ文字**。ISO の日付（`2026-01-05`）は桁が揃っている
  ので文字の大小＝日付の前後になる（日付の解釈は言語ごとに違うので、型を持ち込まない）
* **判定できないときは通す**。自分が空なら `required` の担当、相手が空・相手の項目が無ければ
  相手側の検証の担当。「黙って落とす」方には倒さない
* メッセージは相手の**ラベル**で出る（「開始日以上にしてください」）。項目名ではなく画面の言葉
* 書き間違い（相手の項目名の綴り違い・比べられない突合・`of` の抜け）は**静かに通ってしまう**ので、
  `hatake validate` が警告で言う（`compare-unknown-field` / `compare-bad-operator` /
  `compare-aggregate-without-of` / `compare-with-itself` / `compare-without-field`）
* 3エディションで同じ答えになることは
  [`spec/conformance/cross_field_validation.json`](conformance/cross_field_validation.json) で固定
  （このファイル自体が動く実例）

## action

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✅ | 安定したid（`rowActions` から参照）。 |
| `type` | string | ✅ | アクション型（[アクション型](#アクション型)参照）。 |
| `label` | string | ✅ | ボタンラベル。 |
| `scope` | string | | 何に対して実行するか。`page`（既定）＝画面、`selection`＝**選んだ行**（[まとめて実行する](#まとめて実行するscope-selection)）。 |
| `plugin` | string | | Plugin キー（`type: plugin` のとき）。 |
| `confirm` | [confirm](#confirm) | | 実行前に確認する。 |
| `onSuccess` | [onSuccess](#onsuccess) | | 成功したあとの後処理。 |
| `onError` | [onError](#onerror) | | 失敗したときに出す文言。 |
| `prompt` | [prompt](#prompt) | | 実行の前に聞くこと（小さなフォーム）。 |
| `maxRows` | integer \| [maxRows](#maxrows) | | `scope: selection` のとき、**1回で動かせる行数の上限**（1以上）。超えて選んでいる間ボタンは押せない。無ければ上限は1ページの件数。 |
| `enabledWhen` | [condition](#条件condition) | | **いま押せるか**（→ [enabledWhen](#enabledwhen押せるかどうか)）。判定する相手は置き場所で決まる（行アクションはその行、一括は選んだ行ぜんぶ、レコードを持つ画面はそのレコード）。 |
| `config` | map | | 追加設定。 |
| `roles` | string[] | | 実行を許可するロール（[権限（roles）](#権限roles)参照）。空=全員。 |

### enabledWhen（押せるかどうか）

「出荷済は却下できない」を**ボタンの活性**で言う。条件の書き方は `visibleWhen` と同じ
（[条件](#条件condition)）。

```yaml
table:
  rowActions: [openEntry]
actions:
  - id: openEntry
    type: navigate
    label: 明細編集
    page: order_entry
    params: { id: "$row.orderNo" }
    enabledWhen: { field: status, operator: notEquals, value: 出荷済 }
```

**判定する相手は置き場所で決まる。**

| 置き場所 | 判定する相手 |
|---|---|
| `table.rowActions` に並べた行アクション | その行のレコード |
| `scope: selection`（一括） | 選んだ行**全部**（1件でも合わなければ押せない） |
| レコードを持つ画面（`form` / `detail` / `wizard`）のボタン | いま開いているレコード |
| 一覧の上のボタン（`search` / `crud` / `master` / `report` / `dashboard`） | **無い**（`validate` が `enabledwhen-without-record` で言う） |

- **一括は「全部満たすときだけ」。** 選んだうちの一部だけが動いたことに、押した人は
  気づけない（`maxRows` を超えたときと同じ考え方）。合わない行が混ざっている間は
  ボタンに件数が出る（「一括承認（3 件：1 件は条件に合いません）」）
- **押せないボタンは消えない。** 出たまま灰色になり、**何の状態で決まるのか**が出る
  （文言は書かなくてよい＝条件から作る）。消してしまうと、その操作が在ること自体が
  分からなくなる
- **権限（`roles`）とは別の話。** `roles` は「見えるかどうか」、`enabledWhen` は
  「いま押せるかどうか」。両方書ける
- **判定する相手が無いときは押せるまま。** 出し分けられないので出し分けない
  （書き間違いで業務が止まるほうが、出し分けが効かないより悪い）
- レコードを持つ画面で見るのは**開いているレコード**（入力中の値は見ない）

### maxRows

`scope: selection` の「1回で動かせる行数の上限」。数を書けば全員に同じ上限、
`{ default, byRole }` を書けば役割ごと。

```yaml
maxRows: 20                                  # 全員 20 件
maxRows:                                     # 役割ごと
  default: 20
  byRole: { manager: 50, admin: all }
```

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `default` | integer \| `all` | ✅ | 役割で決まらないときの上限。`all` は上限なし。 |
| `byRole` | map（役割名 → integer \| `all`） | | 役割ごとの上限。書いていない役割は `default`。 |

決めごと:

- **当てはまる役割が複数あれば、一番ゆるい上限**（`all` があれば上限なし）。`roles` が
  「どれか1つ当てはまれば見える」のと同じ考え方
- 上限を超えて選んでいる間、ボタンは**押せない**（ラベルに「いま何件で何件までか」を出す）。
  **切り詰めて実行はしない**
- 押せない役割・どこにも無い役割名に上限を書いても効かない（`validate` が言う）
- バックエンドでも同じ数で判定できる（TypeScript は `checkBulkLimit`、Java は
  `BulkLimits.check`）。3版が同じ答えを出すことは共有フィクスチャで縛る

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

その宣言が読まれるのは **`id: delete`（組み込みの名前）で、`table.rowActions` に `delete` が並んでいるとき**。行の操作の宣言は画面のボタンにはならない（並べると押しても何も起きないボタンになるので、Renderer は出さない）。どこにも効かない書き方は `validate` が言う（`row-declaration-unused`）。

### onSuccess

**成功したときだけ**動く。失敗時に動かないことがこの宣言の意味（呼び出しの後ろにコードを書くのとは違う）。

| キー | 型 | 説明 |
|---|---|---|
| `message` | string | 短く出す通知（Renderer 次第。Material ならスナックバー）。 |
| `page` | string | 遷移先のページ id。 |
| `params` | map | `page` に渡すルート値（`$row.id` / `$record.id` を埋め込み）。 |

「失敗」はハンドラ未登録・出力先未登録・Repository が拒否など。`create` / `edit` は**フォームを開くだけ**なので `onSuccess` は動かない（保存できたかはその時点で分からない）。

### prompt

**実行の前に聞く。** 「却下の理由を書いてから却下」は業務でそのまま来る話で、これが
無いと**アプリに手書きのダイアログ**が要る（このフレームワークが無くしたい物がそこで
戻ってくる）。

| キー | 型 | 説明 |
|---|---|---|
| `fields` | [field](#field)[]（必須・1つ以上） | 聞くこと。**普通の項目**なので型・`required`・`validators`・`computed`・`normalize` がフォームと同じに効く。 |
| `title` | string | 見出し（既定はボタンのラベル）。 |
| `okLabel` | string | 実行するボタン（既定は `confirm.okLabel` → ラベル）。 |
| `cancelLabel` | string | やめるボタン（既定は `confirm.cancelLabel`）。 |

```yaml
- id: rejectSelected
  type: plugin
  plugin: rejectOrders
  label: 却下
  scope: selection
  confirm: { message: 却下すると元に戻せません。, danger: true }
  prompt:
    title: 却下の理由
    okLabel: 却下する
    fields:
      - { field: reason, label: 理由, type: textarea, required: true }
      - { field: rejectedOn, label: 却下日, type: date }
```

| 決めごと | なぜ |
|---|---|
| **確認ダイアログを置き換える**（増やさない） | 聞くことがあるなら、その OK が確認そのもの。2枚続けて出すのは「読まずに押す」練習をさせるだけ。`confirm` に書いた文言・ボタン名・`danger` はこのダイアログが引き取る |
| 項目は**普通の `field`** | 入力の語彙を2つ持たない。`required` も `validators` も `computed` も `normalize` も、フォームと同じものが同じに効く |
| **書いていなければ実行しない** | 検証はダイアログの中で行い、通るまで閉じない（閉じてしまうと書き直す場所が無くなる） |
| 値は**保存と同じ正規化**を通る | 全角の数字をそのまま業務に流さない |
| 受け取れるのは `type: plugin` **だけ** | 聞いた値の行き先はハンドラ（`ActionContext.input`）。ほかの型は受け取れないので、`validate` が警告する |
| 一括（`scope: selection`）でも**聞くのは1回** | 選んだ行に同じ理由を付けるのが業務の形。行ごとに聞かれたら誰も使わない |

Flutter ではハンドラが `ActionContext.input` で受け取る（キーは項目名）。届くのは
**検証と正規化を通った値だけ**なので、ハンドラで再確認しなくてよい。

### onError

**失敗したときに出す文言。** 書かなければ、失敗の理由がそのまま出る
（`RepositoryHttpException: … 500 …`）。それは事実だが業務の言葉ではないし、同じ失敗が
画面ごとに違う意味を持つ（「在庫が足りません」/「締め済みなので直せません」）。

| キー | 型 | 説明 |
|---|---|---|
| `message` | string（必須） | 生の理由の代わりに出す文言。 |

**`onError` は画面を移せない**（`page` が無い）。`onSuccess` は移せるのに、こちらに無いのは
意図的で、失敗した画面から離れると何が起きたか読めなくなり、直すべき行も視界から消える。

差し込み（埋まるときだけ埋まる。埋まらなければ**文字のまま出る**＝`validate` が
`placeholder-not-filled` で先に言う）:

| 差し込み | 何が入るか |
|---|---|
| `{error}` | 失敗の理由（詳しい原因を出したいときに入れる） |
| `{count}` | 成功した件数（`scope: selection` のときだけ） |
| `{failed}` | 失敗した件数（同上） |
| `{total}` | 対象の件数（同上） |

**押す前の文言**（`confirm.title` / `confirm.message` / `prompt.title`）にも `{count}` を
書ける。そこで入るのは**選んだ行の数**（`scope: selection` のときだけ）。まだ何も動いて
いないので `{failed}` / `{total}` / `{error}` は埋まらない（`validate` が言う）。

```yaml
  confirm: { message: '{count} 件を承認します' }   # 押す前 → 選んだ行の数
  onSuccess: { message: '{count} 件を承認しました' } # 走ったあと → 成功した件数
```

ボタンのラベルにも件数は出る（「一括承認（3 件）」）。それでも確認の文に書くのは、
**最後に読むのがこの文**だから（`advise` が `bulk-confirm-without-count` で言う）。

```yaml
- id: approveSelected
  type: plugin
  plugin: approveOrders
  label: 一括承認
  scope: selection
  onSuccess: { message: '{count} 件を承認しました' }
  onError: { message: '{count} 件を承認しました（{failed} 件は出荷済みなので承認できません）' }
```

**一部だけ失敗したときも `onError`。** `onSuccess` は動かない＝1件でも残っているなら画面を
移さない。件数はハンドラが報告する（下記）。

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
`create`, `edit`, `delete`, `navigate`, `plugin`, `export`（→ [export](#exportcsv-出力)）,
`print`（→ [print](#print帳票を刷る)）

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
| `compare-unknown-field` / `compare-without-field` / `compare-with-itself` / `compare-bad-operator` / `compare-aggregate-without-of` | 項目間の検証（`compare`）の書き間違い → **その検証が黙って通る** |
| `page-nobody-can-open` | 入口（メニュー項目・遷移ボタン）の `roles` が食い違っている → **その画面を開ける人が誰も居ない** |
| `prompt-unsupported-type` | 実行前に聞く（`prompt`）のに、聞いた値を受け取れない型（`plugin` 以外）→ **聞くだけ聞いて捨てる** |
| `compare-where-unknown-field` | 突き合わせの行を絞る条件（`where`）が、行に無い項目を**綴り違いに見える形で**指している → 条件が当たらず 1件も残らない |
| `compare-where-ignored` | 明細を畳んでいない（`aggregate` が無い）のに `where` を書いた → 絞る行が無いので効かない |
| `compare-where-mode` | 突き合わせの `where` に `{ mode: … }` を書いた → 行にフォームの状態は無いので常に false ＝1件も残らない |
| `computed-where-unknown-field` | 行を絞る条件（`computed.where`）が、行に無い項目を**綴り違いに見える形で**指している → 条件が当たらず 1件も残らない |
| `computed-where-ignored` | ①（`fields`）に `where` を書いた → 絞る行が無いので効かない |
| `computed-where-mode` | `where` に `{ mode: … }` を書いた → 行にフォームの状態は無いので常に false ＝1件も残らない |
| `computed-order` | 計算項目が**後ろに書かれた**計算項目を使っている → 計算は宣言順に1回なので、空のまま計算される |
| `computed-self-reference` | 計算項目が自分自身を使っている → いつも1つ前の値（はじめは空）を使う |
| `computed-of-unknown-field` | 行を畳む計算（`computed.field` / `of`）が、無い項目・明細でない項目・行に無い項目を指している → 畳む値が取れず、その項目は空欄か 0 になる |
| `computed-of-paged-subtable` | `source` つき明細（ページ送り）を畳もうとしている → 行がそこに揃っていないので 0 になる |
| `computed-rows-unsupported-op` | 行を畳めない `op` に `field` を書いた／行を畳む `op`（`count`/`avg`/`min`/`max`）に `field` が無い → 計算されない |
| `computed-aggregate-without-of` | 行を畳む計算に `of` が無い（`count` 以外） → 何を畳むか決まらないので空欄になる |
| `computed-field-and-fields` | `field` と `fields` の両方を書いた → `field` が勝ち、`fields` は効かない |
| `create-action-unusable` | `type: create` を `crud` / `master` 以外の画面に置いた → ボタンは出るが**押しても何も起きない**（`create` が開くのは一覧からの新規入力。`form` / `wizard` には保存ボタンが最初から出ている） |
| `export-without-rows` | `type: export` を**表の無い画面**（`form` / `wizard` / `dashboard` / `detail`）に置いた → CSV にする行が無いので、押しても何も出ない |
| `plugin-without-name` | `type: plugin` なのに `plugin:` が無い → 呼ぶ相手が無いので、押しても何も起きない |
| `navigate-to-self` | `type: navigate` の行き先がその画面自身 → 同じ画面がもう1枚開くだけで、何も起きなかったように見える |
| `row-declaration-unused` | 行の操作の宣言（`type: edit` / `type: delete`）が**どこにも効かない** → 行を直す/消す枠が無い画面に置いた・`table.rowActions` にその名前が無い・id が組み込みの名前（`edit` / `delete`）ではない |
| `builtin-rowaction-unsupported` | 組み込みの行アクション（`edit` / `delete`）を `crud` / `master` 以外の `table.rowActions` に書いた → 行には何も出ない（`search` の `rowActions` が指すのは画面のアクションの id） |
| `enabledwhen-without-record` | `enabledWhen` を**判定する相手が無い所**に書いた（一覧の上のボタン）→ ボタンは出て押せる＝出し分けが黙って効かない |
| `placeholder-not-filled` | 文言に**埋まらない差し込み**を書いた（`onSuccess` / `onError` は件数が `scope: selection` だけ・`{error}` は失敗だけ、**押す前**（`confirm` / `prompt.title`）は `{count}` だけ＝まだ失敗も理由も無い、**それ以外の名前＝`{orderNo}` のような項目名は埋める口が無い**）→ 押すまで気づけず、文字のまま出る |
| `maxrows-unknown-role` | `byRole` に書いた役割が、そのボタンを押せない（`roles` に無い）／定義のどこにも出てこない → 誰にも当てはまらないので、その上限は効かない |
| `maxrows-without-selection` | `maxRows` を `scope: selection` でないボタンに書いた → 数える対象が無いので上限は効かない |
| `maxrows-above-page-size` | `maxRows` が1ページの件数より大きい → 画面に出ている行しか選べないので、その上限は一度も効かない |
| `selection-without-table` | `scope: selection` のボタンを**表の無い画面**に置いた → 選ぶ手段が無いので、押せないボタンが出たままになる |
| `selection-unsupported-type` | `scope: selection` を `plugin` 以外の型に書いた → 押しても実行されない（一括の中身は業務＝アプリ側の処理） |
| `print-without-report` | `type: print` のボタンを **`report` の無い画面**に置いた → 刷る紙が無いので、ボタンは出るのに押すと「このページでは刷れません」と言われる |
| `columns-wider-than-paper` / `rows-per-page-too-many` | 帳票が**紙に入らない**（列幅の合計が紙幅を超える・1枚の行数が多すぎて1行が読めない高さになる）→ 刷る側が全体を縮めるので、例外は出ずに**読めない紙が出てくる**。用紙の実寸は [`spec/papers.json`](papers.json) |

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
npx hatake registry lib/main.dart --out reg.json  # 実装から「登録済み」の一覧を作る
npx hatake validate page.yaml --registry reg.json # 突き合わせる
```

`refs` は判断せずに列挙し、`validate` は**渡されたカテゴリだけ**を突き合わせる。一覧を
渡さなければ何も言わない（今までと同じ検査に戻る）。組み込みの名前は自動で足されるので、
一覧に書くのは自分で登録したものだけでよい。

**その登録を書く所まで**を下書きできる。

```bash
npx hatake wire app.yaml --base /api --out lib/wiring.dart
```

定義が要求している登録（Repository・プラグイン・出す口・独自の検証 / 正規化 / 見せ方 /
計算 / 集約 / 項目の型 / カードの型）を全部並べた `HatakeScope` を Dart で出す。
**中身は決められないので TODO**（何をするかは業務、どう繋ぐかは環境）で、埋めるまでは
`UnimplementedError` で落ちる＝「黙って何もしない実装」を置かない。`--base` を渡すと
Repository は [`hatake_http`](../flutter/packages/hatake_http/)（REST）で組むので、そこは
TODO にならない（collection の名前は複数形を**推測**して埋める）。

生成物は**コンパイルが通る形**で出す。それを確かめるために、下書き2枚を
`flutter/packages/hatake_example/tool/` にコミットして `flutter analyze` に通している
（生成器が壊れたら、生成物が解析で落ちる）。

| 規則 | 何が起きるか |
|---|---|
| `unknown-repository` | 画面は出るがデータが来ない |
| `unknown-plugin` | ボタンは出るが押しても何も起きない |
| `unregistered-sink` | 出す口（CSV は `exportSink`、印刷は `printSink`）が無い → ボタンは出るが押すと「未登録です」 |
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

一覧は手で書かなくてよく、作り方が2つある。**どちらも同じ形**を出すので、出どころは選べる。

| 作り方 | いつ使うか | 弱点 |
|---|---|---|
| `hatake registry <path...>` … ソースを読む | アプリを動かさずに作りたい。CI で再生成して差分を見たい | **その場に書いてある文字列しか読めない** |
| `registrySnapshot(scope)` … 動いているアプリに聞く | 登録を動的に組み立てている | アプリを動かす必要がある |

前者は言語のパーサを持たないので、変数や関数から組み立てている登録は読めない。読めないものは
**黙って落とさずに報告して終了コード 1**（落とすと「登録してあるのに未登録」という嘘の警告に
なり、仕組みごと信用されなくなる）。そこで読めなかったぶんは、後者で埋める。

```dart
// Flutter 側。scope はアプリが組み立てた HatakeScope。
File('hatake-registry.json').writeAsStringSync(registrySnapshotJson(scope));
```

どちらも**アプリが足したものだけ**を出す（組み込みは突き合わせ側が知っているので、混ぜると
一覧が無駄に太り、組み込みが増えるたびに古くなる）。空の種類は出さない＝「その種類は何も無い」
ではなく「言うことが無い」の意味で、突き合わせの対象から外れる。

2つの道が同じ語彙・同じ形になることは `spec/conformance/registry_snapshot.json` で両版から
確認している。

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

## 実際に転んだ実例

対照表は**人が考えた間違い**の集合で、AI が実際に転ぶ所とはズレる。実例は
[`failures.json`](failures.json) に分けてある。

```bash
npx hatake failures unknown-repository   # こう書いた → こう言われた → こう直した
```

対照表との違いは**出どころ**と、**なぜそう書いてしまうか**を持っていること。各件は
`wrote` を本当に道具にかけ直して、記録した診断と一致することを CI で確認している
（＝この表も嘘をつけないし、検出しなくなった・文言が変わったらそこで落ちる）。

**機械では拾えない件も載っている**（診断が空の件）。載せないと「道具が万全である」という
嘘になるので、そういう件には「レビューでどこを見るか」を書く。

実例は手で書くと増えないので、定義の山から候補を拾う道もある。

```bash
npx hatake harvest definitions/          # 繰り返し出ている診断を候補として出す
```

候補は**人が書く欄を空のまま**出す（「なぜそう書いてしまうか」は機械には書けないし、そこが
この表の価値）。自動で `failures.json` に足すことはしない。定義そのものは持ち出さない
（ファイル名・場所・回数だけ）。既にカタログにある診断は候補にせず数えるだけ。

`--repro` を付けると**最小の再現**（`wrote` の下書き）も作る。守るのは意味ではなく**診断**で、
目当ての診断が出続けていて新しい診断が出ていない限り削る。自由文（`label` / `title` /
`description`）は削り終わってから記号に置き換えるが、識別子は残る。出力に定義の本文が入るので
既定では作らない。

## 直し方が一意な問題を直す

```bash
npx hatake fix page.yaml            # 既定は出すだけ。--write で上書き
```

直すのは**綴り違い**（キー名・Repository / プラグイン / 型 / ページ id / アクション id / 連動の親）と、
**入れる値が決まっている指定**（小計のある帳票に `report.sort` を足す）だけ。近い名前が1つに決まらな
ければ直さない（候補が2つある時点で機械の仕事ではない）。登録済み一覧を渡せば、略して書いた名前
（`orderRepository` を `orderRepo`）も戻す。

確かめ方は**診断で守る**。1件ずつ当てて「問題が減る・**新しい問題が出ない**」ことを見て、当て終わった
文字列をもう一度読んで同じことを確かめる。崩れていたら何もしない。同じ項目の重複・`field` の無い集計・
条件で使えない演算子は意図が要るので触らず、**理由つきで「直さなかった」と言う**。

## 書き足したほうがいい所

```bash
npx hatake advise page.yaml
```

並べ替えできる列が無い・絞り込みが無い・キーが一覧に出ていない・必須が1つも無い・消せる/持ち出せる
/まとめて実行できるのに権限が無い・**まとめて実行するのに確認が無い**・金額らしいのに桁区切りが
無い・明細に親のキーが無い・帳票に合計が無い、を挙げる。

**これは警告ではなく助言**（書いていないから不便かもしれない、という好みの話）なので、終了コードを
変えない。警告は「書いたのに効かない」＝事実で、CI で落としてよい。混ぜると警告の信頼が落ちる。
勧めるキーがその場所に本当に書けることは、スキーマから作ったリファレンスで CI が確かめている。

物差しは外から渡せる（`--rules team.json`。例は
[`docs/guide/advise-rules.example.json`](../docs/guide/advise-rules.example.json)）。助言は好みなので
案件で変わる＝固定の表だけだと「合わないから使わない」で終わる。書けるのは3つだけ:

* `off` … 合わない規則を止める
* `options` … 組み込みの規則が持っているつまみ（列数のしきい値・金額らしいと見なす語など）
* `require` … 案件の決めごとを「**この場所には必ずこのキーを書く**」の形で（`page` / `column` /
  `filter` / `field` / `action` の5か所。`when` で値で絞り、`every: true` なら全部に要る）

**規則を書くための言語にはしない**（条件式を書けるようにすると設定が小さなプログラムになる）。
知らないキー・知らない規則名はエラー＝設定が黙って効かないことを作らない。

`explain --review` を使うと、説明（できないこと）と助言を**1枚**で出せる。レビューする人が見る紙は
1枚がよく、道具ごとに散ると片方しか読まれないため。1枚にしても助言は助言のままで、終了コードは
変わらない。

## 説明に使う語彙

`explain` が使う言い方（フォーマッタの見え方・条件の言い方・種別の説明）は
[`vocabulary.json`](vocabulary.json) が正で、各エディションはそれを転記する。語彙を実装の中に
だけ持つと、Dart 版で説明を出したいとき・英語版を出したいときに二重管理になるので spec に置いた。

`{value}` は差し込み位置（`{value} 文字以内`）。`ja` と `en` を持つが、いまの出力は日本語だけ
（英語版の説明生成はこの列から作る）。CI が3つを見る:

* TypeScript 版の表と `vocabulary.json` の `ja` が**完全に一致**すること
* `reference.json` の**組み込みの値には全部語がある**こと（値を増やしたら語も要る）
* 語彙に**DSL から消えた値が残っていない**こと

## 画面の索引

```bash
npx hatake index definitions/ --find "顧客 検索"
```

1行の要約（`explain --brief`）を集めて、「どこに何の画面があるか」に答える表を作る。探すための語
には**現場の言葉（ラベル）と実装の言葉（項目名・Repository）の両方**が入る。`--find` は語の AND、
`--by size` で規模順、`--json` / `--out` で機械可読。`app:` は中の画面を1枚ずつ数える。

索引は**どのエディションにもある**（`ScreenIndex`）。要るのは定義の山を持っている側なので、CLI だけ
に在るとアプリの中から自分の画面を探せない:

| エディション | 入口 |
|---|---|
| TypeScript | `npx hatake index <path...>` / `buildIndex` |
| Dart | `ScreenIndex.ofApp(app)`（解析済み）/ `buildScreenIndex([IndexInput(...)])`（文字列から） |
| Java | `ScreenIndex.build(List.of(new ScreenIndex.Source(file, text)))` |

種別の見出し語は [`vocabulary.json`](vocabulary.json) の `pageKinds[].short` が正で、3つのエディション
はそれを転記する（一致は各エディションの試験で見る）。同じ定義の山なら**枚数も同じ**になる。違うのは
バックエンド版がボタン（actions）を持たないことだけ。

## 画面と遷移の図

```bash
npx hatake diagram app.yaml --out app.svg
```

`app:` の定義から「画面とメニューと遷移」の図（SVG）を作る。段は「メニューから開ける画面 →
そこから `navigate` で開く画面 → …」で、この並べ方にすると**どこからも開けない画面**が自然に
落ちてくる。1枚の画面の中身は図にしない（`explain` のほうが読める）。図の元データ（`rows` を
持つ JSON）を渡すとそれを描くので、手で書く図（[`docs/diagrams/`](../docs/diagrams/)）と
**描画は1本**。

段のあいだの遷移は**1本ずつ線**にする（まとめて1本の矢印にすると「AとBのどちらから開くのか」が
読めない）。線を引けるのは隣り合う行のあいだだけなので、段の中は次の段へ進む画面を後ろに置く。
それでも引けない遷移（同じ段の中・戻り・行が離れている）は**文で全部挙げる**＝図に出ていない遷移を
黙って落とさない。できあがりは
[受注アプリの遷移図](../docs/diagrams/sales-app-flow.svg)。

**権限も重ねる。** ページに `roles` は書けない（書けるのはメニュー項目とボタン、それに列・項目・
カード）ので、「この画面は誰に見えるか」は**入口から辿って**しか出せない。図はそれを数えて箱の中に
書き、1枚ずつ読んでも出ない2つを色で分ける:

* **赤枠** … 誰でも開けて、消す・持ち出すができる画面（1枚だけ見ると「`roles` の無いボタン」に
  見える。まずいのは**そこへ誰でも来られる**ときだけ）
* **点線** … **誰も開けない画面**（入口の権限が食い違っている。定義は通るし、画面を見ても
  気づけない）

`--role admin` を渡すと**その役割で通れる道**だけの図になる（通れない扉は薄い線で残す）。知らない
役割名はエラー＝綴り違いを黙って通すと「全部開ける」に見える。グループの `roles` は中身にも掛かる。
できあがりは [権限つきの遷移図](../docs/diagrams/roles-app-flow.svg) と
[admin で通れる道](../docs/diagrams/roles-app-admin.svg)。

## 意味を変えずに短くする

AI に書かせた定義は冗長になる（既定値をわざわざ書く・空の配列を置く）。

```bash
npx hatake minimize page.yaml > short.yaml   # 落としたものは標準エラーに出る
```

落とす候補は「スキーマの既定値と同じ値」と「空の配列・空のオブジェクト」だけで、必須キーと
`dsl_version` は落とさない。**1つ落とすたびに解析後のモデルが1バイトも変わらないことを確かめ、
変わったら戻す**ので、意味は変わらない（パーサの既定値がスキーマと食い違っていた場合は
「落とすのをやめる」側に倒れる）。出力は落とす所だけを文字列から切るので、コメント・折り返し・
改行コードはそのまま。書き間違いのある定義は最小化しない（未知キーを黙って落とす道具にしない）。

## 定義を人の言葉に開く

strict もスキーマも警告も、綴りと構造しか見ない。「条件の向きを間違えた」「意図と違う項目を
必須にした」は全部通るので、**最後は人が読んで確かめる**。そのための出力が `explain`。

```bash
npx hatake explain page.yaml               # この画面は何をするか（日本語）
npx hatake explain app.yaml --page <id>    # app の中の1枚を詳しく
npx hatake explain page.yaml --brief       # 1行だけ（app なら画面一覧の表）
npx hatake explain --diff old.yaml new.yaml # 何を変えたのか、画面の言葉で
```

出すのは画面単位の説明で、**キーの名前は出さない**（読み手は DSL を知らなくてよい）。条件は
項目と選択肢のラベルで言うので、`{ field: kind, value: corp }` は「区分 が 法人 のとき」に
なる。「この画面でできないこと」も定義から読み取って言う（削除のボタンが無い、照会専用など）。

`--brief` は1行の要約（README・PR 本文・画面一覧に貼る形）。`--diff` は変更の言い直しで、
「枠「請求先」は、区分 が 法人 のときだけ出るようになりました」のように**画面の言葉**で言う。
やっているのは説明どうしの比較なので、差分の規則を書いていない変化（既定値・「できないこと」の
増減）も入ってくる。**後方互換の判定はしない**（それは `diff`）ので終了コードは変わらない。

AI に書かせたものを人がレビューする道であり、AI が**自分で読み返して意図と照らす**道でもある
（MCP の `hatake_explain`。`before` を渡せば変更の言い直し、`brief` で1行）。

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
