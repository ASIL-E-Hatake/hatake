# hatake AI チートシート

AI（や人）が hatake を使うための圧縮リファレンス。**実装（`src/` 配下）は読まなくていい**。基本は「定義（YAML/JSON）を書く」＋「フォーマッタ等は名前で参照する」だけ。Dart から直接使う場合もレジストリのメソッドを呼ぶだけでいい。

- 全仕様: [DSL 仕様書](../spec/dsl-spec.ja.md) / 機械検証: [JSON Schema](../spec/hatake-page.schema.json)
- 拡張: [Plugin ガイド](../flutter/docs/plugins.ja.md)
- ここに無いキーは**引く**: `npx hatake reference <キー名>`（[DSL リファレンス](../spec/reference.json)）／
  近い例を探す: `npx hatake examples <やりたいこと>`（[例のカタログ](../spec/examples/README.md)）／
  書けたら `npx hatake validate <file>`
- アプリに組み込むとき: `npx hatake refs <file> --needs-registration`（Repository・プラグイン・
  **出す口**（`exportSink` / `printSink`）＝何を登録すればいいか）／その一覧を
  `validate --registry <file>` に渡すと**名前の食い違い**と**繋いでいない口**も見る／
  `npx hatake wire <file> --base /api` で**その配線の下書き**（Flutter）が出る（中身は TODO）／
  画面を増やしたあとは `npx hatake wire <file> --merge <配線.dart> --write`＝**足りない登録だけ**を足す
  （手で埋めた中身は消えない。要らなくなった登録は言うだけで消さない）／`--todo` を付けると
  足した所を**次の1往復で渡す形**で出す（どこに・何を書くか・埋めるまで何が起きるか）
- 埋まったかを数える: `npx hatake refs <file> --filled --source lib/`＝要求している登録が
  **埋まっている／TODO のまま／登録が無い／言えない**のどれか（「TODO のまま」は道具が置いた
  `UnimplementedError` が残っているもの＝動かすと落ちる）。**登録の外**に残った TODO も出す
  （REST の配線は登録だけ済んで通信する所が空いていることがある）。CI に置くなら
  `--pending-as-error`。逆向きの `--unused` に `--source` を渡すと、コードに名前が書いてある
  ものは消す候補から外す（`--unused-as-error` はそのときだけ置ける）
- 繋いだあと（サーバが動いているとき）: `npx hatake probe <file> --base http://localhost:8080/api`
  で**定義とサーバの食い違い**を実際に叩いて見る（足りない項目・型違い・`{items, totalCount}` で
  ない・`pageSize` が効かない・行に鍵が無い）。権限は `npx hatake attack <app> --role staff --base …`（役割ぜんぶなら `--all-roles --accounts accounts.json`＝資格は役割ごとに要る）
  ＝**画面から見えない口**を叩いて、API が実際に拒否するか見る。どちらも**読むだけ**（`POST` /
  `PUT` / `DELETE` は叩かない）で、`--dry-run` なら叩かずに「何を叩くか」だけ出る
- 毎晩回すとき（人が横に居ない）: `--login login.json`（資格を**毎回取る**＝トークンの期限で
  落ちない。値は `${環境変数}` で外から渡す）／`--since 前回.json` で**変わった所だけ**出す
  （`--save 次回.json` が次の晩の相手）／`--fail-on new` で**新しい分だけ**落とす。前回
  叩けていた相手を今回叩いていなければ、消えた穴は「直った」ではなく「叩いていないので
  分かりません」と出て、`--fail-on new` でも落ちる（何も見ていない晩に緑にならない）
- 英語で読み返す: `npx hatake explain <file> --lang en`（節の見出しと言い回しだけ英語。
  **定義に書いたラベルは訳さない**＝業務の言葉なので、訳すと現場と違うものを指す）
- 定義を直したとき: `npx hatake diff <前> <後>`（`✗ 破壊的`＝呼び出し側が壊れる／`△ 要確認`＝壊れないが
  確かめてほしい＝列・ボタン・選択肢が消えた・権限が変わった・ページが消えた）

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

**CLI で検証する**（人も AI も同じ入口。問題があれば終了コード 1。**警告**＝解析は通るが意図どおり動かない書き方も既定で出る）:

```bash
npx hatake validate page.yaml          # 解析 + strict。--json で機械可読
npx hatake new crud --id customer_master --title 顧客マスタ   # 雛形（8種別）
npx hatake types page.yaml --lang java --out gen/            # ネイティブ型
```

**いま押せるかどうかも定義で言える**: `enabledWhen`（条件の書き方は `visibleWhen` と同じ）。
判定する相手は置き場所で決まる＝行アクションはその行、一括（`scope: selection`）は**選んだ行
全部**（1件でも合わなければ押せない）、レコードを持つ画面（`form` / `detail` / `wizard`）は
いま開いているレコード。一覧の上のボタンには相手が無いので効かない（`validate` が
`enabledwhen-without-record` で言う）。押せないボタンは**灰色で残り、何の状態で決まるのかが出る**
（文言は書かない）。`roles`（見えるかどうか）とは別の話。

**押しても何も起きないボタンは、押す前に言う**（この枠組みで一番まずい転び方＝定義は通り、
ボタンも出て、押すまで気づけない）: `create` を一覧の無い画面に（`create-action-unusable`）／
`export` を表の無い画面に（`export-without-rows`）／`print` を `report` の無い画面に
（`print-without-report`）／`plugin` に `plugin:` を書き忘れ（`plugin-without-name`）／
`navigate` の行き先がその画面自身（`navigate-to-self`）／`edit` / `delete` を行の外に
（`row-declaration-unused`）／組み込みの行アクションを `crud` / `master` 以外に
（`builtin-rowaction-unsupported`）。判定は**1画面ぶんの情報だけ**で決まるので CI に置ける。

**書き間違いを検出する（strict）**: パーサは既定では知らないキーを黙って捨てるので、
任意キーの綴り間違い（`readonly` / `pagesize` / `visible_when`）は**何も起きない**。
`strict` を付けると全部まとめて指摘される（近い既知キーの提案つき）。定義を書くとき・CI は strict 推奨。

```dart
parsePageYaml(source, strict: true);              // Dart
```
```ts
parsePageYaml(source, { strict: true });          // TypeScript
```
```java
DefinitionParser.parsePageYaml(source, true);     // Java
```

## Repository（データの口）

REST に繋ぐなら opt-in の `hatake_http`。`npx hatake openapi` が定義から宣言する API と**同じ形**で話す（一覧は `{items, totalCount}`、1件は `<collection>/{key}`、404 は null、絞り込みは項目名そのまま・空と null は送らない・配列は同じ名前を2回）。

```dart
repositories: RepositoryRegistry(restRepositories(
  baseUrl: '/api',
  send: send,                       // 通信は持たない＝送る関数を1つ渡す（http でも dio でも）
  headers: () async => {'authorization': 'Bearer ${await session.token()}'},  // 毎回聞く
  collections: {'orderRepository': 'orders', 'customerRepository': 'customers'},
));
```

失敗は型で返る（401/403・400＝項目ごとの検証結果・その他・**宣言と違う形**）。宣言と違う形で落ちるのは意図的で、黙って合わせると `items` が読めず「0 件」＝空の画面になって原因が通信まで遡れない。合わない API は曲げずに `Repository` を手で書く（5メソッドの interface）。

## アプリ（ナビゲーション）

複数ページを束ねてアプリにするときはルートを `page:` でなく `app:` にする。Flutter は `HatakeApp(app: ...)` で描画（シェル＋ルータ）。

**Web では URL が画面に付いてくる**（既定 ON）。`/<画面id>?<params>` で、リンクを踏める・リロードで戻らない・ブラウザの戻るが効く。外側に自前のルータがあるアプリは `HatakeApp(app: …, syncUrl: false)` で切る（address bar を2人で取り合わない）。URL の params は**文字で戻る**（URL に型は無いので、`0012` を 12 にしない）。この app に無い画面 id は引き受けないので、別のビルドの URL で空白の画面にはならない（home が出る）。

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

### 見た目（`app.theme`）

会社の色・明暗・密度・角丸を定義で差す。Renderer が自分の流儀に落とす（Material なら `ThemeData`）。**挙動は何も変わらない**。

```yaml
app:
  theme:
    primaryColor: "#1B5E20"     # #RRGGBB / #AARRGGBB。ここから配色を作る
    secondaryColor: "#FF6F00"   # 省略時は primary から導出
    brightness: light           # light / dark / system（端末設定に従う）
    density: compact            # comfortable / standard / compact（業務画面は compact）
    fontFamily: Noto Sans JP
    radius: 8                   # 角丸（論理ピクセル）
    config: { logo: assets/logo.png }   # Renderer 固有の追加
```

色が色でない・`density` が知らない値なら**パース時にエラー**（黙って無視されると「書いたのに変わらない」になるので）。Flutter で自分の `MaterialApp` に渡したいときは `materialThemeOf(app.theme!)`。

<!-- vocab: theme.brightness -->
`light` `dark` `system`

<!-- vocab: theme.density -->
`comfortable` `standard` `compact`

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

### 集約（`value.aggregate` / `chart.aggregate` / 帳票の `totals`）
<!-- vocab: dashboardValue.aggregate -->
`count` `sum` `avg` `min` `max`

`count` だけは Repository の総件数を使い `field` を見ない。それ以外は `field` 必須。

### チャート種別（`chart.kind`）
<!-- vocab: chart.kind -->
`bar` `line` `pie`

`chart.aggregate` を省くと**1行=1点**（集計済みエンドポイント向け）。

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
    paper: { size: A4, orientation: portrait }   # 用紙（下記）
    rowsPerPage: 30            # 見出し・小計も1行として数える
    sort: { field: customer }  # groupBy はこの並びに依存
    groupBy: [ { field: customer, label: 顧客, pageBreak: true } ]
    totals: [ { field: amount, aggregate: sum }, { field: amount, aggregate: count } ]
  actions:
    - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
```

### 用紙（`paper.size`）
<!-- vocab: paper.size -->
`A4` `A3` `B5` `letter`

`orientation` は `portrait` / `landscape`。

**印刷（PDF / プリンタ）**: 定義は1文字も変えない。opt-in の `hatake_print` が帳票を紙に落とす（純 Dart・UI 不要なので夜間バッチでも刷れる）。

```dart
final bytes = reportPdf(page, rows, roles: {'staff'});  // PDF のバイト列
await Printing.layoutPdf(onLayout: (_) => bytes);       // プリンタに送るなら printing
```

**定義から刷る（`type: print`）**: 帳票に `- { id: printPdf, type: print, label: 印刷 }` を置くと印刷ボタンが出る。Framework が渡すのは**紙の中身まで**（帳票の定義・画面に出ている行・役割・書式）で、バイト列は作らない。

```dart
printSink: (req) async => save(req.filename,          // 既定 <画面名>.pdf
    reportPdf(req.page, req.rows, formatters: req.formatters, roles: req.roles));
```

`config.filename` だけ Framework が読み（拡張子が無ければ `.pdf`）、残りの `config` は**そのまま出力先に渡る**（用紙や字はアダプタの語彙）。`printSink` 未登録なら押したときにそう言う（黙って何も起きない、にはしない）。`report` の無い画面に置くと `validate` が警告する（`print-without-report`）。

書式（`format`）・列幅（`column.width` はポイント）・見えない列（`roles`）・枚数は**画面の帳票と同じ**。余白・脚注・ページ番号は `PrintStyle`（紙の体裁は業務ではなく印刷所の話なので定義に入れない）。**日付は既定で入らない**＝同じ帳票なら毎回同じバイト列。

**CSV 出力（`type: export`）**: その画面の列と行から組む（一覧・帳票で同じ。ロールで見えない列は出ない）。
`config` は `filename` / `header` / `delimiter` / `newline`(crlf|lf) / `bom` / `raw`(format を通さない) / `limit` / `charset`。
一覧の export は表示中のページではなく**検索結果全体**（`limit` まで）。
**ファイルを書くのは利用者側**＝`HatakeScope(exportSink: (req) async {...})` に登録した出力先が受け取る。

**文字コード（`charset`、既定 `utf-8`）**: 受け側が Shift_JIS 固定のとき。**変換するのは出力先**で、定義は名前を宣言するだけ（`req.charset` に入る）。`cp932`＝Windows / Excel の Shift_JIS（「Shift_JIS で」はほぼこれ。`①` `㈱` `髙` `～` が通る）／`shift_jis`＝JIS X 0208 厳密（拡張文字を弾きたいとき）／`euc_jp`。**`bom` は UTF-8 のときだけ効く**（Shift_JIS に BOM を付けると先頭のセルにゴミが入る）。変換の実装は opt-in の `hatake_encoding`:

```dart
final encodings = EncodingRegistry();
exportSink: (req) async => save(req.filename, encodings.encode(req.charset, req.text));
```

## フィールド型（`field.type` / `filter.type`）
<!-- vocab: field.type -->
`text` `textarea` `number` `select` `multiSelect` `checkbox` `radio` `date` `dateTime` `time` `subTable`

`select`/`radio`/`multiSelect` は `options: [{value,label}]` を付ける。`subTable`（親子・明細）は field 専用で、検索条件には使えない。

## カラム型（`column.type`）
<!-- vocab: column.type -->
`text` `number` `badge` `boolean` `date` `dateTime`

## フィルタ演算子（`filter.operator`）
<!-- vocab: filter.operator -->
`equals` `notEquals` `contains` `startsWith` `endsWith` `gt` `gte` `lt` `lte` `between` `in`

`isEmpty` `isNotEmpty` は値を取らないので条件専用。逆に `between` `startsWith` `endsWith` は検索専用。

## フォーマッタ（`format:` で指定。オプションは同じ要素の `config`）
<!-- vocab: field.format -->
| name | 例 | 主なオプション |
|---|---|---|
| `currency` | `1234567 → 1,234,567` / `-1234 → △1,234` | `symbol`(例`¥`), `decimals`, `negative`(`minus`/`triangle`/`blackTriangle`/`paren`) |
| `percent` | `12.34 → 12.34%` | `decimals`, `ratio`(true で×100) |
| `date` | `2026-07-22 → 2026/07/22` | `pattern`(`yyyy/MM/dd` `yyyy-MM-dd` `yyyy年M月d日` `yyyyMMdd`) |
| `wareki` | `2026-07-22 → 令和8年7月22日` | `style`(`long`/`short`=`R8/07/22`) |
| `postal` | `1234567 → 123-4567` | — |
| `mask` | `000012341234 → ********1234` | `keep`(残す桁), `char` |

## コンバータ（`normalize: [...]` で入力前に適用）
<!-- vocab: field.normalize -->
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

新規/編集で出し分ける（`mode` のリーフ。レコードでは分からないので専用に持つ）:

```yaml
- { field: code, label: コード, enabledWhen: { mode: create } }      # 編集では変えさせない
- { field: updatedBy, label: 更新者, visibleWhen: { mode: edit } }   # 編集のときだけ出す
```

<!-- vocab: condition.mode -->
`create` `edit`

モードが分からない場所（読み取り専用の詳細画面など）では false。

読み取り専用・条件つき必須・区画ごとの出し分け:

```yaml
- { field: memberNo,  label: 会員番号, readOnlyWhen: { field: kind, value: personal } }  # 見た目は変えず直せない
- { field: invoiceNo, label: 登録番号, requiredWhen: { field: kind, value: corp } }      # 条件つき必須
sections:
  - title: 請求先
    visibleWhen: { field: kind, value: corp }   # 区画ごと（見出しも消える）
    fields: [ { field: billingCode, label: 請求先コード, required: true } ]
```

| キー | 効き方 | サーバ側の検証 |
|---|---|---|
| `visibleWhen` | 出す / 出さない | **効く**（隠れている項目は検証しない） |
| `enabledWhen` | 活性 / 非活性（グレー） | 効かない |
| `readOnlyWhen` | 読み取り専用（見た目は変えない） | 効かない |
| `requiredWhen` | 必須 / 任意 | **効く** |

* **隠れている項目は検証まるごと飛ぶ**ので、「出たら必須」は `visibleWhen` ＋ `required: true` で書ける。`requiredWhen` が要るのは「出ているのに条件で必須が変わる」とき
* 隠れている項目の値は**保存はされる**（検証を飛ばすだけ）
* サーバ側で `{ mode: … }` を含む条件を使うなら、検証にモードを渡す（渡さないと false ＝緩む方に倒れる）

条件の演算子（`visibleWhen` / `enabledWhen`）:
<!-- vocab: condition.operator -->
`equals` `notEquals` `gt` `gte` `lt` `lte` `contains` `in` `isEmpty` `isNotEmpty`

計算の `op`:
<!-- vocab: field.computed.op -->
`concat` `sum` `subtract` `product` `count` `avg` `min` `max` `join`

* **同じレコードの項目**を畳むのは `fields: [a, b]`（`concat` / `sum` / `subtract` / `product`）
* **明細（subTable）の行**を畳むのは `field: <明細の項目名>` ＋ `of: <行の項目名>`
  （`count` / `sum` / `avg` / `min` / `max`。集約の語彙はダッシュボードのカードと同じ）
* 行を**並べて1行にする**のは `join`（数ではなく文字が出る）。区切りは `separator`（既定 `", "`）

```yaml
- { field: subtotal, label: 小計, computed: { op: sum, field: lines, of: amount } }
- { field: rows, label: 行数, computed: { op: count, field: lines } }
- { field: itemNames, label: 品名, computed: { op: join, field: lines, of: item, separator: "、" } }
- { field: total, label: 合計, computed: { op: sum, fields: [subtotal, tax] } }
# 畳む前に行を絞る（条件の書き方は visibleWhen と同じもの）
- { field: subtotal, label: 小計,
    computed: { op: sum, field: lines, of: amount,
                where: { field: cancelled, operator: notEquals, value: true } } }
```

* `of` は `count` 以外で必須（無いと空欄になる）。行が1件も無いとき `sum`/`count` は 0、`avg`/`min`/`max` は空、`join` は空文字
* `where` は**行を絞る**指定（行1件に対して判定する）。`{ mode: … }` は行では常に false ＝1件も残らない
* 同じ `where` が**項目間の検証**でも使える（`compare` の `aggregate` + `of` + `where`）。計算が取消行を外すなら、検証も同じ条件で外す（片方だけだと必ず食い違う）
* 畳めるのは**親と一緒に保存する明細**だけ。`source` を持つ明細はページ送りなので行が揃っていない（`validate` が言う）
* 計算は**書いた順に1回**なので、`小計 → 消費税 → 合計` の順に並べる（後ろの項目は前の結果を使える。**逆に書くと空のまま計算される**ので `validate` が言う）。
  依存が絡んだら `npx hatake diagram <file> --computed`＝**どの項目がどの項目から出るか**の図
  （Mermaid。順番が逆の線は赤）。画面の図も `--format mermaid` / `--format dot` で貼れる形に出せる
* `ComputedRegistry` で追加可。

## 選択肢の連動（親の値で子の選択肢を絞る）

```yaml
# ① 定義に書く（選択肢が固定のとき）
- { field: prefecture, label: 都道府県, type: select,
    options: [{ value: tokyo, label: 東京都 }, { value: osaka, label: 大阪府 }] }
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture                              # 親の項目名
  options:
    - { value: shibuya, label: 渋谷区, when: tokyo }    # この親の値のときだけ出る
    - { value: other,   label: その他 }                # when 無し = 常に出る

# ② Repository から引く（選択肢がデータのとき）
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture
  optionsSource: { repository: cityRepository, value: code, label: name, parentKey: prefecture }
```

* 親が未入力なら `when` 付きは出ない（親を選ぶまで子は空）。②も引かない
* **親が変わって子の値が選べなくなったら捨てる**（「大阪府なのに渋谷区」で保存させない）
* 値の比較は条件式と同じ緩い比較（`'1'` と `1` は同じ）
* `options` と `optionsSource` の両方は書かない（引いた方が勝つ。`validate` が警告する）
* **検索条件（`search.filters`）でも同じキーが同じ意味で使える**（判定は共有）。範囲（`between`）は値を2つ持つので親にはできない

## 権限（ロールで表示出し分け）

`field` / `column` / `action` に `roles: [..]`（許可ロール、空=全員）を付ける。現在ユーザのロールは Flutter は `HatakeScope(roles: {'admin'})` で注入。

```yaml
- { field: salary, label: 給与, roles: [hr, manager] }   # hr か manager だけ表示
actions:
  - { id: export, type: plugin, plugin: exportCsv, label: CSV出力, roles: [admin] }
```

※ **表示制御のみ**。実際のアクセス制御（データ保護）はバックエンドで行う（Framework は認証・認可を持たない）。

## バリデータ（`validators: [{ type, ...params, message? }]`）
<!-- vocab: validator.type -->
| type | params | 意味 |
|---|---|---|
| `required` | — | 必須（`field.required: true` でも可） |
| `maxLength` / `minLength` | `value`(int) | 文字数 |
| `min` / `max` | `value`(num) | 数値範囲 |
| `pattern` | `pattern`(正規表現) | 形式 |
| `email` | — | メール形式 |
| `postalCode` | — | 郵便番号形式 |
| `compare` | `operator` / `field`（＋`aggregate` / `of`） | **他の項目と比べる**（`{ type: compare, operator: gte, field: startDate }` ＝開始日以上。`aggregate: sum, of: amount` で明細の和と比べる） |

`message` を足すと既定（日本語）メッセージを上書き。全体のロケール切替・文言差し替えは `MessageResolver`（既定 `ja`）を `ValidatorRegistry(custom, messages)` に注入する（Dart/TS/Java の3言語で同名・同挙動）。

## アクション（`actions: [...]` / `table.rowActions`）
<!-- vocab: action.type -->
`create` `edit` `delete` `navigate` `plugin` `export` `print`

**まとめて実行する**なら `scope: selection`（既定は `page`）。表にチェックボックスが出て、選ぶまで押せない（件数がラベルに出る）。ハンドラは選んだ**行そのもの**を `ctx.records` で受け取り、**呼び出しは1回**（API も1回で済ませられる）。行が入れ替わったら選択は消え、実行できたら解ける。実行できるのは `type: plugin` だけで、**一括の削除は無い**（取り消せない操作は事故が件数ぶん大きくなる）。

**1回で動かせる件数の上限**は定義に書ける（`maxRows: 20`）。超えて選んでいる間ボタンは押せず、ラベルが「（80 件：20 件まで）」になる。**切り詰めて実行はしない**（選んだうちの一部だけが動いたことに気づけないのが一番まずい）。書かなければ上限は1ページの件数＝`pagination.pageSize`（切っていれば全件）。

役割で変えるなら `maxRows: { default: 20, byRole: { manager: 50, admin: all } }`。**当てはまる役割が複数あれば一番ゆるい方**（`roles` と同じ考え方）。`all` は上限なし。押せない役割・どこにも無い役割名に書いても効かないので `validate` が言う。

上限は**バックエンドでも同じ数**で判定できる（TypeScript は `checkBulkLimit(document, actionId, count, roles)`、Java は `BulkLimits.check(...)`）。画面の上限は早く気づかせるため、サーバの上限は守るため。

**一括だけは既定で厳しい**。`advise` が言うのは5つ: 確認が無い（`prompt` があればそれが確認）・確認に件数が無い・失敗の言い方が無い・戻せない名前なのに `danger` が無い・1回で動く件数が多すぎる（ページ送りを切っていると全件）。`roles` で絞っていない一括は型に関わらず「誰でも押せる危ないボタン」に数える（`advise` も `explain --roles` も同じ見方）。

`plugin` は `plugin: <key>` で登録ハンドラにディスパッチ。`navigate` は `page` と `params`、`export` は CSV 出力（上記）、`print` は帳票の印刷（下記）。`table.rowActions` は**アクション id の文字列配列**（`edit` / `delete` は組み込みなので宣言不要）。

### 確認と後処理（`confirm` / `prompt` / `onSuccess` / `onError`）

「削除前に確認」「保存できたら一覧に戻る」を Dart で書かない。

```yaml
actions:
  - id: delete
    type: delete
    label: 削除
    confirm:                      # 実行前に聞く
      title: 顧客の削除
      message: 受注履歴から辿れなくなります。よろしいですか？
      okLabel: 削除する           # 省略時は「削除」（danger なら）/「OK」
      cancelLabel: やめる         # 省略時は「キャンセル」
      danger: true                # 実行ボタンを破壊的な見た目に
    onSuccess:                    # 成功したときだけ動く
      message: 顧客を削除しました
      page: customer_list         # 省略可。遷移先
      params: { id: "$row.id" }
    onError:                      # 失敗したときに出す文言（画面は移らない）
      message: 受注が残っているので削除できません（{error}）
```

* **`delete` は宣言が無くても必ず確認する**（取り消せないので）。`confirm` を書くと文言が置き換わる
* `onSuccess` は**失敗したら動かない**（ハンドラ未登録・出力先未登録・Repository が拒否＝全部失敗）
* `onError` が無ければ**失敗の理由がそのまま出る**（`RepositoryHttpException: … 500 …`）。業務の言葉で言うならここに書く。**`page` は無い**＝失敗した画面から離れると、何が起きたか読めなくなり直す行も見えなくなる
* 差し込みは**埋まるときだけ**埋まる（`{error}` は失敗時、`{count}` / `{failed}` / `{total}` は `scope: selection` のときだけ）。**書けるのはこの4つだけ**＝`{orderNo}` のような項目名は埋まらない（レコードの値は文言に渡っていない）。埋まらない差し込みは文字のまま出るので、`validate` が `placeholder-not-filled` で先に言う
* **押す前の文言**（`confirm.title` / `confirm.message` / `prompt.title`）にも `{count}` を書ける＝**選んだ行の数**が入る。走る前なので `{failed}` / `{total}` / `{error}` は埋まらない。ボタンにも件数は出るが、**最後に読むのは確認の文**なので、そこに書く（`advise` が `bulk-confirm-without-count` で言う）
* 一括に `batchSize: 20` を書くと**枠組みが20件ずつ渡す**＝進み具合（「12 / 100 件」）が出て、
  区切りで**中断**できる（1回で全部渡すと途中の状態は枠組みに分からないので、そこには出ない）。
  中断は「まだ送っていない分を送らない」だけで、送った分は動いている＝文言の `{skipped}` に入る。
  止めた実行は成功ではないので `onSuccess` は動かない
* 一括の結果はハンドラが `ctx.report(ActionOutcome.rejected(succeeded: …, rows: [FailedRow(key, reason: …)]))` で返す（件数だけの `ActionOutcome(succeeded:, failed:)` でもよい）。**一部でも失敗したら `onSuccess` は動かない**（1件残っているのに画面を移さない）。**行を名指しすると**文言の `{failedKeys}` が埋まり、通知から「どの行か」を開けて、その行だけを選び直せる
* **実行の前に聞く**なら `prompt`（「却下の理由を書いてから却下」）。項目は**普通の `field`**（型・`required`・`validators`・`computed`・`normalize` がフォームと同じに効く）で、ハンドラは `ctx.input` で受け取る。**確認ダイアログは増えない**（`prompt` の OK が確認そのもの＝`confirm` の文言とボタン名を引き取る）。受け取れるのは `type: plugin` だけ

```yaml
    prompt:
      title: 却下の理由
      okLabel: 却下する
      fields:
        - { field: reason, label: 理由, type: textarea, required: true }
```
* `create` / `edit` はフォームを開くだけなので `onSuccess` は動かない（保存できたかはその時点で分からない）

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
