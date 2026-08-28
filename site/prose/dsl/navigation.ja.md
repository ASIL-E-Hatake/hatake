画面遷移は `navigate` アクションで書く。飛び先は**ページの id**で指定する。

```yaml
actions:
  - id: openDetail
    type: navigate
    label: 詳細
    page: order_detail
    params: { orderNo: "$row.orderNo" }
```

## 行の値を渡す

`params` の値に `$row.<項目>` と書くと、いま押した行の値が入る。1件の画面（`detail` や `form`）から飛ぶときは `$record.<項目>`。

```yaml
params: { orderNo: "$row.orderNo" }      # 一覧の行から
params: { customerId: "$record.id" }     # 詳細・フォームの表示中レコードから
```

固定値も書ける（`params: { mode: readonly }`）。渡した値は飛び先の画面がレコードを引くときのキーになる。

## 飛び先は実在する id でなければならない

`page` に書くのは、同じアプリ定義（`app.pages`）に含まれるページの id。存在しない id を書いても**パースは通ってしまう**ので、`validate` が警告で教える。警告が出たら綴りを確認する。

## 保存できたら移る

「登録したら一覧に戻る」は `navigate` アクションではなく、そのアクションの `onSuccess` に書く。

```yaml
actions:
  - id: save
    type: plugin
    plugin: saveOrder
    label: 保存
    onSuccess:
      message: 登録しました
      page: order_search
```

こう書くと**失敗したときは移らない**。`navigate` を別に置いて手で押させると、保存できていないのに一覧に戻ってしまう。

## 最初に開く画面は app.home

アプリを起動したときの画面は `app.home` に書く。指定するのはメニュー項目の id（メニューに無い画面なら、そのページの id）。

```yaml
app:
  id: sales_admin
  title: 販売管理
  home: dashboard
  menu:
    - { id: dashboard, label: ダッシュボード, page: sales_dashboard }
```

`home` を省くとメニューの先頭が開く。業務アプリではダッシュボードか、一番よく使うマスタを指すことが多い。

## 別のタブで開くか、同じ画面の続きか

並べて開くアプリ（`app.navigation: tabs`）では、遷移のボタンごとに開き方を書ける。

```yaml
actions:
  - { id: open, type: navigate, label: 明細, page: order_entry, params: { id: "$row.orderNo" } }
  - { id: openTab, type: navigate, label: 明細（別タブ）, page: order_entry, params: { id: "$row.orderNo" }, open: tab }
```

**既定は `same`＝いまの画面の続きとして進む。** 一覧から明細へ入るのは同じ仕事の続きなので、押すたびにタブが増えるのは邪魔になる（10行開いたらタブが10枚）。

`open: tab` は「**一覧を残したまま個別を開く**」＝業務の意図なので、定義に書ける。同じレコードをもう一度開いたら、開いているタブが前に出る（2枚にはならない）。

並べない設定のアプリに `open: tab` を書いても壊れない（いままで通り重なる）。ただし**効いていない**ので `npx hatake validate` が言う ── アプリ側で `tabs` に上書きしている場合は、そのままで意図どおり。

## 戻るボタンは定義しない

ブラウザの戻る・端末の戻るは Renderer が面倒を見る。定義に書くのは「進む」側だけでいい。
