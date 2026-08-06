# ページ種別の選び方

> **中身**: 7種類のどれを使うかの判断基準。キーの一覧ではなく**選択の指針**。
> **読むとき**: 画面を作り始めるとき。各キーの意味は [DSL 仕様](../../spec/dsl-spec.ja.md)、最小例は [チートシート](../api-cheatsheet.ja.md)。

## 判断表

| やりたいこと | `page.type` | 検索 | 一覧 | フォーム |
|---|---|---|---|---|
| 検索して一覧、その場で登録/編集/削除まで | **`crud`** | ✅ | ✅ | ✅（ダイアログ） |
| 上と同じだがマスタ保守だと明示したい | **`master`** | ✅ | ✅ | ✅（ダイアログ） |
| 見るだけ（更新させない照会画面） | **`search`** | ✅ | ✅ | — |
| 1件をじっくり表示（読取専用の詳細） | **`detail`** | — | — | 表示のみ |
| 1件を入力/編集する単票画面 | **`form`** | — | — | ✅（インライン） |
| 長い入力をステップに分けたい | **`wizard`** | — | — | ✅（ステップごと） |
| 数字・グラフを並べて全体を見たい | **`dashboard`** | ✅（全カードに効く） | カード内 | — |
| 上記を**複数まとめてアプリ**にする | ルートを `app:` に | — | — | — |

**迷ったら `crud` で始める。** 更新が不要と分かったら `search`、1件ずつ扱う画面が必要になったら `detail` / `form` を足す、が素直。

## 使い分けの目安

**`crud` と `master` は構造が同じ**（`search` + `table` + `form`）。違いは意図の表明だけで、描画も同じです。「マスタメンテ」と読めば分かるようにしたい／将来まとめて別レイアウトにしたい、という場合に `master` を選びます。

**`search` は行アクションでプラグイン処理や遷移を呼ぶ**のが定石。読取専用なので `form` は持ちません。
```yaml
table:
  rowActions: [detail]        # ↓ actions の id を参照
actions:
  - { id: detail, type: navigate, label: 詳細, page: order_detail, params: { id: "$row.orderNo" } }
```

**`detail` / `form` は対象レコードを実行時に受け取ります。** `app:` の中なら `navigate` の `params.id` から自動で渡り、単体で使うなら `HatakePageView(definition: d, recordKey: 123)` のように渡します。`form` は **key があれば編集・無ければ新規**。

## 共通のキー

どの種別も最低これだけ必要です。

| キー | 意味 |
|---|---|
| `type` | 上の種別 |
| `id` | 安定した識別子（`app:` の `menu` / `navigate` から参照される） |
| `title` | 画面タイトル |
| `repository` | `RepositoryRegistry` に登録したキー |
| `key` | レコードの主キー項目名（既定 `id`）。`findByKey`/`update` の実装と揃える |

## 複数画面にするとき

画面が2つ以上になったら、ドキュメントのルートを `page:` から **`app:`** に変えて `pages` に並べ、`menu` で導線を作ります。Dart 側は `HatakePageView` → **`HatakeApp`** に変わるだけ。

→ 手順は [レシピ: 一覧→詳細](../cookbook/search-list-detail.ja.md)

## `wizard` と `dashboard`

**`wizard` は「1つのフォームを `steps` に切ったもの」**。「次へ」はそのステップの項目だけを検証するので、後のステップが未入力でも進めます。保存は最後に1回だけ。全体検証で前のステップの項目が落ちたら、その項目を持つステップまで自動で戻ります。

**`dashboard` は他の種別と毛色が違います。** 単一レコードを指さないので `key` を持たず、`repository` は「カードが省略したときの既定」でしかありません。カード1枚 = 小さな読み取りクエリ + 見せ方（`metric` / `table` / `chart`）です。

```yaml
items:
  - { id: total, title: 受注金額, value: { aggregate: sum, field: amount }, format: currency }
```

大事なのは **Framework が集計クエリを投げない**こと。Repository が**行を返し**、その行に対する畳み込みだけを定義します。つまり `limit`（既定100）は集計が見る母数でもあるので、大きなテーブルで正確な数字が要るなら**集計済みのエンドポイント**を Repository にして `chart.aggregate` を省く（1行=1点）か、`count` を使います（`count` だけは Repository が返す総件数を使うので `limit` に影響されません）。

カードは独立して読み込むので、1つの Repository が落ちても**そのカードだけ**がエラー表示になります。

→ 例は [`spec/examples/sales_dashboard.yaml`](../../spec/examples/sales_dashboard.yaml)
