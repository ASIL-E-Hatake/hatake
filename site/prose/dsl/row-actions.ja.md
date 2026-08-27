一覧の各行に出すボタンは `table.rowActions` に**アクション id の文字列**を並べる。

```yaml
table:
  rowActions: [edit, delete]
  columns:
    - { field: code, label: コード }
    - { field: name, label: 顧客名 }
```

## edit と delete は宣言しなくていい

この2つは組み込みなので、`rowActions` に名前を書くだけで動く。`actions` に定義を足す必要はない。`delete` は確認ダイアログも自動で出る。

宣言を足すのは、**その確認の文を業務の言葉にしたいとき**（と、終わったあとに何かしたいとき）。

```yaml
table:
  rowActions: [edit, delete]

actions:
  - id: delete
    type: delete
    confirm: { message: この顧客を削除すると受注履歴から辿れなくなります。よろしいですか？, danger: true }
    onSuccess: { message: 顧客を削除しました }
```

この宣言が読まれるのは **`id: delete`（組み込みと同じ名前）で、`rowActions` に `delete` が並んでいるとき**。宣言は**画面上部のボタンにはならない**（行の操作なので、並べても押しても何も起きないボタンになる）。どこにも効かない書き方は `validate` が言う（`row-declaration-unused`）。

編集の側（`type: edit`）には `confirm` を書いても読まれない。行の編集は入力の枠を開くだけで、そこでは聞かないため。

## 独自の操作を出すときは actions に宣言する

組み込み以外を並べるときは、同じ id のアクションを `actions` に定義しておく。宣言していない id を書くと、ボタンが出ないか何も起きない（`validate` が警告する）。

```yaml
table:
  rowActions: [detail]
  columns: [...]

actions:
  - { id: detail, type: plugin, plugin: showDetail, label: 詳細 }
```

行ごとに**押せるかどうか**を変えるなら `enabledWhen`。行アクションは**その行のレコード**で判定するので、「出荷済の行だけ灰色」が定義で書ける（→ [アクション](/dsl/actions)）。

行から別の画面へ飛ばすなら `navigate` にして、`params` で行の値を渡す。

```yaml
actions:
  - { id: openDetail, type: navigate, label: 詳細, page: order_detail,
      params: { orderNo: "$row.orderNo" } }
```

## 画面上部のボタンとの使い分け

同じ `actions` に書いたものが、`rowActions` に載せれば行のボタン、載せなければ画面上部のボタンになる。判断は「**1件に対する操作か、画面全体に対する操作か**」で切る。

| 操作 | 置き場所 |
| --- | --- |
| この行を編集する・削除する・詳細を見る | `rowActions` |
| 新規登録する・CSV を出す・検索結果全体を処理する | 画面上部（`actions` だけ） |

## 読み取り専用の画面でも使える

`search`（照会）にも `rowActions` は書ける。ただし `edit` / `delete` は書かない — 照会画面は更新しないという前提の種別なので、変更する操作を置くなら種別が `crud` か `master` のはず。照会画面に置くのは `detail` や CSV 出力のような、データを変えない操作にする。

書いても**行には何も出ない**（黙って消える）ので、そこは `validate` が言う（`builtin-rowaction-unsupported`）。
