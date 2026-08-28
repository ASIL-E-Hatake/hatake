画面が1枚なら根を `page:` にする。複数の画面をまとめて1つのアプリにするなら `app:` にして、`pages` に画面を並べ、`menu` で辿れるようにする。

```yaml
dsl_version: "1.0"
app:
  id: sales_admin
  title: 販売管理
  home: dashboard
  theme:
    primaryColor: "#1B5E20"
    density: compact
  menu:
    - { id: dashboard, label: ダッシュボード, icon: insights, page: sales_dashboard }
    - { id: customers, label: 顧客,           icon: people,   page: customer_master }
    - group: マスタ
      items:
        - { label: 商品, icon: inventory, page: product_master }
  pages:
    - { type: dashboard, id: sales_dashboard, title: 売上ダッシュボード, ... }
    - { type: master,    id: customer_master, title: 顧客マスタ, ... }
    - { type: master,    id: product_master,  title: 商品マスタ, ... }
```

`page:` を書いた定義がそのまま `pages` の1要素になる。**1枚で作り始めて、後からアプリにまとめられる**。

## 1画面ずつか、並べて開くか

業務システムによって作法が違う。伝票を1件ずつ片付ける仕事では、1画面ずつ遷移する方が速い。逆に「受注を見ながらマスタを直す」が毎日来る仕事では、行き来のたびに検索条件と入力が消えるのは苦痛でしかない。**どちらかに決め打ちしない。**

```yaml
app:
  id: sales
  title: 販売管理
  navigation: tabs      # 既定は single（1画面ずつ）
```

| | どうなるか |
| --- | --- |
| `single`（既定） | メニューで選ぶと入れ替わる。遷移すると重なって、戻れる |
| `tabs` | メニューで選ぶと**新しいタブ**。開いたままにできて、行き来しても中身が残る |

**アプリ側で上書きできる。** 定義が言うのは「その業務システムの既定」で、端末の都合は別の話。

```dart
HatakeApp(app: definition, navigation: AppNavigation.single)  // この端末では遷移で使う
```

同じ定義を PC ではタブ、タブレットでは遷移で出せる。だから読み返し（`npx hatake explain`）にも「※ アプリ側で上書きできます」と毎回書いてある（定義だけを読んで決めつけないため）。

### 並べて開くときの決めごと

| | なぜ |
| --- | --- |
| 同じ画面は2枚開かない（開いているタブが前に出る） | 同じ受注を2枚開いて別々に編集できると、どちらが正か分からない。**別のレコードなら別のタブ**（`params` が違えば別物） |
| 上限は 10 枚。超えたら**開かずにそう言う** | 古いタブを勝手に閉じない（入力中かもしれない） |
| 最後の1枚は閉じられない | 画面が無くなるので、閉じる口も出さない |
| 入力する画面を閉じるときは聞く | 何を入力したかはタブの列からは見えないので、**消えるかもしれない側に倒す** |
| URL に出るのは**前面のタブだけ** | タブ列ごと URL に載せると、共有リンクが他人の作業状態になる。共有先では1枚で開く |
| タブの中身は作り直さない | 検索結果も入力もタブに付いて回る。それがタブの値打ち |

## メニュー項目は2種類だけ

| 書くもの | 何になるか |
| --- | --- |
| `page` を持つ | その画面を開く葉 |
| `items` を持つ | 折りたたむグループ（`group` が見出し） |

グループは入れ子にできる。ただし2階層を超えると利用者が辿れなくなるので、深くするより並びを見直したほうがいい。

```yaml
menu:
  - { id: orders, label: 受注照会, icon: list, page: order_search }
  - group: マスタ
    roles: [admin]
    items:
      - { label: 顧客, page: customer_master }
      - { label: 商品, page: product_master }
```

## id と page の関係

葉の `id` は遷移先として指す名前（ルートキー）。省略すると `page` の値がそのまま使われるので、**同じ画面をメニューに2回出す**とき以外は書かなくていい。

`home` に書くのはメニュー項目の id。上の例なら `dashboard`。

## icon は名前を渡すだけ

`icon: people` のように名前を書く。それを実際のアイコンに解決するのは Renderer の仕事なので、書ける名前は Renderer 次第（Material なら Material Icons の名前）。省略すればアイコンなしで出る。

## pages に無い画面には飛べない

`navigate` の飛び先も、メニューの `page` も、`pages` に並べた画面の id を指す。一覧から詳細に飛ぶような**メニューに出さない画面も `pages` には並べる**。メニューに出さなければ、直接開かれることはない。

## dsl_version は書いておく

`dsl_version` は定義がどのバージョンの DSL に従っているかの宣言（既定 `"1.0"`）。省略しても動くが、書いておくと将来 DSL が変わったときに**古い定義をそのまま読める**保証の手がかりになる。文字列なので `"1.0"` とクォートを付ける。

## ロールで出し分ける

メニュー項目にも `roles` が書ける。管理者だけに見せるマスタメンテなどはこれ。ただし**見えなくするだけ**で、アクセスを止めるのはバックエンドの仕事（「権限で出し分ける」参照）。
