都道府県を選んだら、市区町村の選択肢がその県のものだけになる。業務システムでは定番の動きで、これまでは自分でコードを書くしかなかった。定義で書けるようにしたのがこれ。

親の項目を `optionsFrom` で指して、選択肢それぞれに「どの親の値のときに出るか」を `when` で書く。

```yaml
- { field: prefecture, label: 都道府県, type: select,
    options: [ { value: tokyo, label: 東京都 }, { value: osaka, label: 大阪府 } ] }
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture
  options:
    - { value: shibuya, label: 渋谷区, when: tokyo }
    - { value: kita,    label: 北区,   when: osaka }
    - { value: other,   label: その他 }
```

`when` を書いていない選択肢（上の「その他」）は常に出る。「未選択」「不明」「その他」のような、親に関係なく要るものに使う。

## 親を選ぶまで、子は空

親が未入力のあいだ、`when` 付きの選択肢は出ない。全部出しておいて後で絞るのではなく、**選べる状態になってから出す**。

親を選び直したときに、子に入っていた値が新しい選択肢に無ければ**その値は捨てる**。東京都・渋谷区と入れたあとで大阪府に変えたら、市区町村は空に戻る。放っておくと「大阪府なのに渋谷区」で保存できてしまうので、消えて選び直してもらう方を選んだ。ここは知らないと驚くところなので、先に書いておく。

## 選択肢がデータのときは Repository から引く

市区町村を全部定義に書くわけにはいかない。選択肢そのものがマスタにあるなら `optionsSource` で引く。

```yaml
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture
  optionsSource:
    repository: cityRepository   # 自分で登録した Repository
    value: code                  # 行のどの項目を値にするか
    label: name                  # 行のどの項目を表示するか
    parentKey: prefecture        # 親の値を、この名前で絞り込み条件として渡す
```

引き先は一覧画面と同じ `Repository`。フレームワークは HTTP も SQL も知らないので、`{ prefecture: "osaka" }` という条件で `search` を呼ぶところまでしかしない。どう絞るかは実装した人の領分。

親が未入力のあいだは**引きにも行かない**（全件返ってきても連動の意味がないので）。親を変えれば引き直し、同じ親のままなら1回しか引かない。

## どちらで書くか

| | 定義に書く（`when`） | Repository から引く（`optionsSource`） |
| --- | --- | --- |
| 向いている | 区分・種別・ステータスのような固定の分類 | マスタにあるもの（取引先、品目、市区町村） |
| 増えたとき | 定義を直してリリース | データを足すだけ |
| オフラインでも動くか | 動く | Repository 次第 |

両方書いた場合は引いてきた方が勝つ。書いた `options` が黙って無視される形になるので、`hatake validate` が警告する。

## 検索条件でも同じ

検索欄（`search.filters`）でも同じキーが同じ意味で使える。「絞ってから探す」は入力より先に欲しがられるやつ。

```yaml
search:
  filters:
    - { field: category, label: カテゴリ, type: select, operator: equals,
        options: [ { value: food, label: 食品 }, { value: drink, label: 飲料 } ] }
    - field: subCategory
      label: 細目
      type: select
      operator: equals
      optionsFrom: category
      options:
        - { value: vegetable, label: 野菜,     when: food }
        - { value: juice,     label: ジュース, when: drink }
```

判定は入力項目とまったく同じものを使っている（違うのは「いまの値」がレコードか検索欄かだけ）。親を変えて選べなくなった条件は捨てられるので、**絞った先に無い条件で検索してしまうことがない**。

範囲指定（`operator: between`）の条件は値を2つ持つので、親にはできない。
