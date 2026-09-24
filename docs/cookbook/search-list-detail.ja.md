# レシピ: 一覧 → 詳細（メニュー付きアプリにする）

> **中身**: 複数画面をメニューで束ねて「アプリ1本」にし、一覧の行から詳細へ遷移する。
> **読むとき**: 画面が2つ以上になったとき。単一画面なら [マスタメンテ](master-maintenance.ja.md) で足りる。
> **動く実物**: [`spec/examples/sales_app.yaml`](../../spec/examples/sales_app.yaml)（CI 検証済み。[example アプリ](../../flutter/packages/hatake_example/)がこれで動いてる）

## 単一画面との違い

ルートを `page:` ではなく **`app:`** にして、`pages` に画面を並べ、`menu` で導線を作る。

```yaml
dsl_version: "1.0"
app:
  id: sales_admin
  title: 販売管理
  home: customers                # 初期表示（menu の id）
  menu:
    - { id: customers, label: 顧客, icon: people, page: customer_master }
    - group: マスタ                # items を持つとグループ（見出しになる）
      items:
        - { label: 商品, icon: inventory, page: product_master }
    - { id: orders, label: 受注照会, icon: list, page: order_search }
  pages:
    - { type: master, id: customer_master, ... }   # 各ページは単一画面の定義そのまま
    - { type: search, id: order_search,   ... }
    - { type: detail, id: order_detail,   ... }
```

Dart 側は `HatakePageView` の代わりに **`HatakeApp`** を使う（シェル＝メニュー＋現在ページを描画）:

```dart
final app = parseAppYaml(yaml);          // → AppDefinition
runApp(MaterialApp(
  home: HatakeScope(
    repositories: RepositoryRegistry({
      'customerRepository': CustomerRepository(),
      'orderRepository': OrderRepository(),
    }),
    renderer: const MaterialRenderer(),
    child: HatakeApp(app: app),
  ),
));
```

画面幅 600px 以上は常設サイドバー、未満は Drawer に自動で切り替わる。

## 行から詳細へ飛ばす

一覧側に `navigate` アクションを置き、`rowActions` から参照する。`$row.<項目>` で**その行の値**をルートに渡せる。

```yaml context:searchPage
- type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [detail]                    # ↓ の id を行ボタンとして出す
    columns:
      - { field: orderNo, label: 受注番号, sortable: true }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  actions:
    - { id: detail, type: navigate, label: 詳細,
        page: order_detail, params: { id: "$row.orderNo" } }
```

> **渡す名前は、行き先の `key` と同じにする。** 詳細ページは自分の `key` の名前
> （上の例なら `orderNo`）で鍵を受け取る。`id` も受け取る（`key` を省いた画面の既定が
> `id` なので）。**それ以外の名前で渡すと、URL は変わるのに開いた画面は空**になり、
> データを取りに行きもしない。定義の側では `hatake advise` が
> `navigate-without-key-param` で言う。
>
> ```yaml
> params: { orderNo: "$row.orderNo" }   # 行き先の key と同じ名前（推奨）
> params: { id: "$row.orderNo" }        # これも効く（既定の名前）
> params: { code: "$row.orderNo" }      # **効かない**。開いても空になる
> ```

遷移先の詳細ページは、受け取った鍵で `repository.findByKey` が呼ばれてレコードが読まれる:

```yaml context:detailPage
- type: detail
  id: order_detail
  title: 受注詳細
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - title: 受注情報
        fields:
          - { field: orderNo, label: 受注番号 }
          - { field: amount, label: 金額, format: currency, config: { symbol: "¥" } }
```

遷移すると自動で**パンくず**（`受注照会 › 受注詳細`）と戻るボタンが出る。パンくずの祖先をタップすれば一気に戻れる。

## よくある追加要件

### 詳細から編集フォームへ
`type: form` のページを足して、詳細側にもう1つ `navigate` を置くだけ。
```yaml context:detailPage
actions:
  - { id: edit, type: navigate, label: 編集, page: order_form, params: { id: "$record.orderNo" } }
```
一覧の行は `$row.*`、詳細（単一レコード）は `$record.*` を使う。

### メニューを権限で出し分け
```yaml
- group: マスタ
  roles: [admin]        # admin 以外にはグループごと見えない
  items: [ ... ]
```
子が全部隠れたグループは見出しも消える。ロールは `HatakeScope(roles: {'admin'})` で渡す。

### メニューのアイコン
`icon` に名前を書く。組込は `people` `inventory` `list` `dashboard` `settings`（未知の名前はフォルダアイコン）。増やしたいときは Renderer 側の拡張で。

## 2つの列で1件が決まるとき（複合キー）

受注明細は受注番号だけでは1件に決まらない。行番号と合わせて初めて1件を指す。
`key` に**項目を並べて**書く。

```yaml no-check:画面の断片（複合キーの書き方）
key: [orderNo, lineNo]
```

**並べた順に意味がある。** その順が REST の道の順になるので（`/api/orderLines/SO-1/2`）、
並べ替えると別の1件を指す。

画面から画面へ渡すときは、**鍵の項目を1つずつ**渡す。行き先は自分の `key` の名前で
受け取るので、名前を合わせておけば届く。

```yaml no-check:ボタンの断片（1件の画面へ渡す）
params: { orderNo: $row.orderNo, lineNo: $row.lineNo }
```

**1つでも欠けたら取りに行かない。** 欠けたまま組み立てると別の1件が開くので、
そろうまで待つ（画面は「データがありません」のまま）。

サーバ側は道の区切りを順に受け取るだけ。

```java no-check:受け口の例（hatake の定義ではない）
@GetMapping("/api/orderLines/{orderNo}/{lineNo}")
public OrderLine find(@PathVariable String orderNo, @PathVariable int lineNo) { … }
```

> **Repository は直さなくていい。** 1件を指す項目が1つの画面は、いままでどおり
> 素の値（`"SO-1"`）が `findByKey` に渡る。複合キーの画面だけ `RecordKey` が渡る。
>
> 連結した列をビューに1つ作る逃げ道も、もちろんまだ使える（`key: rowKey`）。
> サーバを触れないときや、既にその列が在るときはそのほうが早い。

## つまずきポイント

| 症状 | 原因 |
|---|---|
| 「遷移先が解決できません」と出る | `navigate` に `page` が無い、または `HatakeApp` の外（単一ページ表示）で使っている |
| 「ページ "x" が見つかりません」 | `page:` に書いた id が `pages` のどれとも一致していない |
| 詳細が空 | 渡した `params` の名前が、行き先の `key`（または `id`）と違う／`$row.<項目>` の項目名が一覧のデータキーと違う／`findByKey` の実装が `key` と不一致 |
| 詳細をメニューに置いたら必ず空 | **メニューには鍵を渡す場所が無い。** 詳細は一覧の行から開く（`advise` の `detail-page-in-menu`） |
| メニューが出ない | 表示できる葉が1つしかないとメニューは省略される（2つ以上で表示） |
| 行ボタンが出ない | `table.rowActions` に アクション id を入れていない |
