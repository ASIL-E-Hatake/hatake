# ページ種別の選び方

> **中身**: 8種類のどれを使うかの判断基準。キーの一覧ではなく**選択の指針**。
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
| 印刷して配りたい（小計付きの明細表） | **`report`** | ✅（出力条件） | 紙に組む | — |
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

## `report`（帳票）と CSV

**`report` は一覧の印刷版**です。明細の列は `table` から取るので、`search` ページと同じ列定義を使い回せます。`report` が足すのは紙の構造だけ:

```yaml
report:
  paper: { size: A4, orientation: portrait }
  rowsPerPage: 30                                    # 見出し・小計も1行として数える
  sort: { field: customer }                          # ← これが要る（下記）
  groupBy: [ { field: customer, label: 顧客, pageBreak: true } ]
  totals: [ { field: amount, aggregate: sum } ]
```

**グループはコントロールブレイク**です。「並び順に見ていって、キーが変わったら小計を出して見出しを出す」という昔ながらの帳票の作り方なので、**行が先に並んでいないと同じグループが何度も出ます**。並べ替えは Repository の責務なので、帳票側は `sort` で「この順で印字する」と宣言します（列見出しを押せない帳票では、ここが唯一の並び指定）。

**印刷そのものは Framework の外**です。定義＋行から「帳票ドキュメント」を作るところまでが Framework で、Renderer はそれを用紙の比率でプレビューします。PDF 化やプリンタ送出は opt-in アダプタの担当（`printing` / `pdf` への依存を本体に持ち込まないため）。

**印刷ボタンは定義に書けます**（`type: print`。帳票専用）。押されると Framework は紙の中身（帳票の定義・いま出ている行・役割・見せ方）を `HatakeScope(printSink:)` に渡すところまでをやり、バイト列は作りません。

```yaml
actions:
  - { id: printPdf, type: print, label: 印刷, config: { filename: 売上明細 } }
```

```dart
HatakeScope(
  printSink: (request) async {
    // opt-in の hatake_print で PDF にして、保存・プリンタ・添付に回す
    final bytes = reportPdf(request.page, request.rows,
        formatters: request.formatters, roles: request.roles);
  },
  ...
)
```

`config.filename` 以外の `config` は**読まずにそのまま渡ります**（用紙や書体はアダプタの語彙）。`report` の無い画面に置くと `validate` が警告します。

**CSV は `export` アクション**で、一覧でも帳票でも同じ書き方です。

```yaml
actions:
  - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
```

一覧ページの `export` は**表示中のページではなく検索結果全体**を出します（`config.limit` まで読み直す）。`bom: true` は Excel で開いたときの文字化け対策、`raw: true` は `format` を通さない生の値（Excel で計算させたいとき）。

そして **ファイルを書くのは利用者側**です。Framework は文字列までを作り、`HatakeScope` に登録した出力先に渡します。

```dart
HatakeScope(
  exportSink: (request) async {
    // request.filename / request.mimeType / request.text
    // → ブラウザのダウンロード、保存ダイアログ、共有、アップロードなど
  },
  ...
)
```

登録していなければ「出力先が未登録です」と画面に出ます（黙って何も起きないのを避けるため）。Shift_JIS への変換も同じ理由で出力先の責務です。

→ 例は [`spec/examples/sales_report.yaml`](../../spec/examples/sales_report.yaml)
