# hatake AI チートシート

AI（や人）が hatake を使うための圧縮リファレンス。**実装（`src/` 配下）は読まなくていい**。基本は「定義（YAML/JSON）を書く」＋「フォーマッタ等は名前で参照する」だけ。Dart から直接使う場合もレジストリのメソッドを呼ぶだけでいい。

- 全仕様: [DSL 仕様書](../spec/dsl-spec.ja.md) / 機械検証: [JSON Schema](../spec/hatake-page.schema.json)
- 拡張: [Plugin ガイド](../flutter/docs/plugins.ja.md)

## 最小の書き方（定義ファースト）

```yaml
dsl_version: "1.0"
page:
  type: crud                 # crud | search | master | detail | form | wizard | dashboard | report
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository   # 利用者が実装する Repository をキーで解決
  key: id
  search:
    filters:
      - { field: name, label: 顧客名, type: text, operator: contains }
  table:
    rowActions: [edit, delete]
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: amount, label: 金額, format: currency, config: { symbol: "¥" } }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, type: text, required: true,
              normalize: [toHankaku, trim], validators: [ { type: maxLength, value: 20 } ] }
          - { field: name, label: 顧客名, type: text, required: true }
  actions:
    - { id: create, type: create, label: 新規登録 }
```

## アプリ（ナビゲーション）

複数ページを束ねてアプリにするときはルートを `page:` でなく `app:` にする。Flutter は `HatakeApp(app: ...)` で描画（シェル＋ルータ）。

```yaml
app:
  id: sales_admin
  title: 販売管理
  home: customers                       # 初期ルート（menu の id）
  menu:
    - { id: customers, label: 顧客, icon: people, page: customer_master }
    - group: マスタ                      # items を持つとグループ
      roles: [admin]                    # roles で出し分け
      items: [ { label: 商品, page: product_master } ]
  pages: [ { type: crud, id: customer_master, ... }, { type: detail, id: customer_detail, ... } ]
```

画面遷移は `navigate` アクション：`{ type: navigate, page: <id>, params: { id: "$row.id" } }`（`$row.id`/`$record.id` で現在行・レコードを埋める）。

## ページ種別（`page.type`）

| type | 何 | フォーム |
|---|---|---|
| `crud` | 検索+一覧+CRUD | あり |
| `search` | 照会（読み取り一覧、行/ページのプラグインアクション） | なし |
| `master` | マスタメンテ（crud と同構造） | あり |
| `detail` | 単一レコードの読み取り表示（record は実行時に渡す） | 表示のみ |
| `form` | 単票の作成/編集（record key あり=編集 / なし=新規） | あり |
| `wizard` | ステップ入力（`steps`。ステップ単位で検証して次へ、最後に1回保存） | あり |
| `dashboard` | カードのグリッド（`items`。1枚=小さな読み取りクエリ+見せ方） | なし |
| `report` | 帳票（一覧の印刷版。`report` でグループ・小計・用紙を指定） | なし |

```yaml
# ダッシュボード: 集計は「Repository が返した行の畳み込み」。集計クエリは投げない。
page:
  type: dashboard
  id: sales_dashboard
  title: 売上ダッシュボード
  repository: orderRepository      # カードが省略したときの既定
  layout: { columns: 4 }
  search: { filters: [ { field: orderDate, label: 受注日, type: date, operator: between } ] }
  items:
    - { id: orderCount, title: 受注件数, action: openOrders }        # value 省略=count
    - { id: total, title: 受注金額, value: { aggregate: sum, field: amount }, format: currency }
    - { id: pending, title: 未出荷, filters: { status: 未出荷 } }     # カード固有の条件
    - { id: byCustomer, type: chart, title: 顧客別, span: 2,
        chart: { kind: bar, labelField: customer, valueField: amount, aggregate: sum } }
    - { id: recent, type: table, title: 直近, span: 2, limit: 5,
        sort: { field: orderDate, ascending: false },
        columns: [ { field: orderNo, label: 受注番号 } ] }
  actions:
    - { id: openOrders, type: navigate, label: 受注照会, page: order_search }
```

集約（`aggregate`）: `count` / `sum` / `avg` / `min` / `max`。チャート種別（`kind`）: `bar` / `line` / `pie`。
`chart.aggregate` を省くと**1行=1点**（集計済みエンドポイント向け）。`count` だけは Repository の総件数を使う。

```yaml
# 帳票: 明細の列は table から取る。グループはコントロールブレイクなので sort が要る。
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  search: { filters: [ { field: orderDate, label: 受注日, type: date, operator: between } ] }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number, format: currency }
  report:
    paper: { size: A4, orientation: portrait }   # A4/A3/B5/letter × portrait/landscape
    rowsPerPage: 30            # 見出し・小計も1行として数える
    sort: { field: customer }  # groupBy はこの並びに依存
    groupBy: [ { field: customer, label: 顧客, pageBreak: true } ]
    totals: [ { field: amount, aggregate: sum }, { field: amount, aggregate: count } ]
  actions:
    - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
```

**CSV 出力（`type: export`）**: その画面の列と行から組む（一覧・帳票で同じ。ロールで見えない列は出ない）。
`config` は `filename` / `header` / `delimiter` / `newline`(crlf|lf) / `bom` / `raw`(format を通さない) / `limit`。
一覧の export は表示中のページではなく**検索結果全体**（`limit` まで）。
**ファイルを書くのは利用者側**＝`HatakeScope(exportSink: (req) async {...})` に登録した出力先が受け取る。

## フィールド型（`field.type` / `filter.type`）
`text` `textarea` `number` `select` `multiSelect` `checkbox` `radio` `date` `dateTime` `time`
（`select`/`radio`/`multiSelect` は `options: [{value,label}]` を付ける）

## カラム型（`column.type`）
`text` `number` `badge` `boolean` `date` `dateTime`

## フィルタ演算子（`filter.operator`）
`equals` `contains` `startsWith` `endsWith` `gt` `gte` `lt` `lte` `between` `in`

## フォーマッタ（`format:` で指定。オプションは同じ要素の `config`）

| name | 例 | 主なオプション |
|---|---|---|
| `currency` | `1234567 → 1,234,567` / `-1234 → △1,234` | `symbol`(例`¥`), `decimals`, `negative`(`minus`/`triangle`/`blackTriangle`/`paren`) |
| `percent` | `12.34 → 12.34%` | `decimals`, `ratio`(true で×100) |
| `date` | `2026-07-22 → 2026/07/22` | `pattern`(`yyyy/MM/dd` `yyyy-MM-dd` `yyyy年M月d日` `yyyyMMdd`) |
| `wareki` | `2026-07-22 → 令和8年7月22日` | `style`(`long`/`short`=`R8/07/22`) |
| `postal` | `1234567 → 123-4567` | — |
| `mask` | `000012341234 → ********1234` | `keep`(残す桁), `char` |

## コンバータ（`normalize: [...]` で入力前に適用）
`toHankaku` `toZenkaku` `hiraToKata` `kataToHira` `trim` `collapseSpaces` `parseNumber`

## 条件表示・計算項目（field に付与）

```yaml
# 条件表示/活性: リーフ {field,operator,value} か 結合 {all|any:[...]} / {not:{...}}
- { field: corpName, label: 法人名, type: text,
    visibleWhen: { field: type, operator: equals, value: corporate } }
- { field: memo, label: 備考, type: textarea,
    enabledWhen: { any: [ { field: type, operator: equals, value: vip },
                          { field: age, operator: gte, value: 65 } ] } }
# 計算項目（読み取り表示、入力変化で自動再計算）
- { field: fullName, label: 氏名, computed: { op: concat, fields: [last, first], separator: " " } }
- { field: total, label: 合計, computed: { op: sum, fields: [price, tax] } }
```

演算子: `equals` `notEquals` `gt` `gte` `lt` `lte` `contains` `in` `isEmpty` `isNotEmpty`。
計算 `op`: `concat` `sum` `subtract` `product`（`ComputedRegistry` で追加可）。

## 権限（ロールで表示出し分け）

`field` / `column` / `action` に `roles: [..]`（許可ロール、空=全員）を付ける。現在ユーザのロールは Flutter は `HatakeScope(roles: {'admin'})` で注入。

```yaml
- { field: salary, label: 給与, roles: [hr, manager] }   # hr か manager だけ表示
actions:
  - { id: export, type: plugin, plugin: exportCsv, label: CSV出力, roles: [admin] }
```

※ **表示制御のみ**。実際のアクセス制御（データ保護）はバックエンドで行う（Framework は認証・認可を持たない）。

## バリデータ（`validators: [{ type, ...params, message? }]`）

| type | params | 意味 |
|---|---|---|
| `required` | — | 必須（`field.required: true` でも可） |
| `maxLength` / `minLength` | `value`(int) | 文字数 |
| `min` / `max` | `value`(num) | 数値範囲 |
| `pattern` | `pattern`(正規表現) | 形式 |
| `email` | — | メール形式 |
| `postalCode` | — | 郵便番号形式 |

`message` を足すと既定（日本語）メッセージを上書き。全体のロケール切替・文言差し替えは `MessageResolver`（既定 `ja`）を `ValidatorRegistry(custom, messages)` に注入する（Dart/TS/Java の3言語で同名・同挙動）。

## アクション（`actions: [...]` / `table.rowActions`）
`type`: `create` `edit` `delete` `plugin`。`plugin` は `plugin: <key>` で登録ハンドラにディスパッチ。

---

## Dart から直接使う場合（実装は読まなくていい）

```dart
import 'package:hatake_material/hatake_material.dart';

// 表示整形
FormatterRegistry().format('currency', 1234567, {'symbol': '¥'}); // "¥1,234,567"
// 入力正規化
ConverterRegistry().convert('toHankaku', '１２３');                // "123"
// サーバ/フォーム検証
FormValidator().validate(form, record);                          // ValidationResult
// 消費税（内税/外税・端数処理 floor/round/ceil）
computeTax(1000, rate: 0.10);                     // net:1000 tax:100 gross:1100（外税）
computeTax(1080, rate: 0.08, included: true);     // net:1000 tax:80  gross:1080（内税）
computeTax(155,  rate: 0.10, rounding: 'round');  // tax:16（15.5→四捨五入）
// 税率別合計（適格請求書。税率ごとに1回だけ丸める）
computeInvoice([
  InvoiceLine(amount: 3000, rate: 0.10),
  InvoiceLine(amount: 1000, rate: 0.08),
]); // byRate:[8%→net1000/tax80, 10%→net3000/tax300], total:net4000/tax380/gross4380
// 元号算出（改元境界日で切替、明治より前は null）
eraOf('2026-07-31');                               // EraDate(令和, R, 8)
// 年度・四半期・半期（開始月は startMonth、既定4月）
fiscalYear('2026-03-31');                          // 2025
fiscalQuarter('2026-07-01');                       // 2
// 年齢・勤続
ageAt('1990-06-15', '2026-06-14');                 // 35（誕生日未達）
tenure('2020-04-01', '2026-07-15');                // years:6, months:3
// 営業日（祝日は yyyy-MM-dd の集合を注入）
nextBusinessDay('2024-01-05', holidays: {'2024-01-08'}); // 2024-01-09
```

拡張したいときは各レジストリに `register(name, fn)`、または `MaterialRenderer(fieldBuilders: {...})`。詳細は [Plugin ガイド](../flutter/docs/plugins.ja.md)。

## 他言語（バックエンド）
TypeScript(`@hatake/core`) と Java(`io.github.asil-e-hatake:hatake-core`) も**同じ名前・同じ出力**で `FormatterRegistry` / `ConverterRegistry` / `FormValidator` / `MessageResolver` / `QueryBuilder` / `evaluateCondition` / `ComputedRegistry` / `isAllowed` / `parseApp*`（app定義パーサ＝menu/ページ目録） / `computeTax` / `computeInvoice` / `fiscal*` / `ageAt`・`tenure` / `*BusinessDay` / `eraOf` を提供（[コンフォーマンス](../spec/conformance/)で3言語の一致を担保）。定義（YAML/JSON）は全言語共通。
