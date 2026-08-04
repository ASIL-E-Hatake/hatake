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

```yaml
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

遷移先の詳細ページは、受け取った `id` で `repository.findByKey` が呼ばれてレコードが読まれる:

```yaml
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
```yaml
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

## つまずきポイント

| 症状 | 原因 |
|---|---|
| 「遷移先が解決できません」と出る | `navigate` に `page` が無い、または `HatakeApp` の外（単一ページ表示）で使っている |
| 「ページ "x" が見つかりません」 | `page:` に書いた id が `pages` のどれとも一致していない |
| 詳細が空 | `params.id` が渡っていない（`$row.<項目>` の項目名が一覧のデータキーと違う）／`findByKey` の実装が `key` と不一致 |
| メニューが出ない | 表示できる葉が1つしかないとメニューは省略される（2つ以上で表示） |
| 行ボタンが出ない | `table.rowActions` に アクション id を入れていない |
