# ページ種別の選び方

> **中身**: 5種類のどれを使うかの判断基準。キーの一覧ではなく**選択の指針**。
> **読むとき**: 画面を作り始めるとき。各キーの意味は [DSL 仕様](../../spec/dsl-spec.ja.md)、最小例は [チートシート](../api-cheatsheet.ja.md)。

## 判断表

| やりたいこと | `page.type` | 検索 | 一覧 | フォーム |
|---|---|---|---|---|
| 検索して一覧、その場で登録/編集/削除まで | **`crud`** | ✅ | ✅ | ✅（ダイアログ） |
| 上と同じだがマスタ保守だと明示したい | **`master`** | ✅ | ✅ | ✅（ダイアログ） |
| 見るだけ（更新させない照会画面） | **`search`** | ✅ | ✅ | — |
| 1件をじっくり表示（読取専用の詳細） | **`detail`** | — | — | 表示のみ |
| 1件を入力/編集する単票画面 | **`form`** | — | — | ✅（インライン） |
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

## まだ無い種別

`dashboard`（集計カード・グラフ）と `wizard`（ステップ入力）は未実装です。状況は [ロードマップ](../roadmap.ja.md)。

現状で近いことをやるなら、ダッシュボードは `detail` を使って計算項目（`computed`）で数字を並べる、ウィザードは `form` ページを `navigate` でつなぐ、で代替できます。
