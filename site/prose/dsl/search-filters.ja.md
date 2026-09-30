検索欄に並べる条件は `search.filters` に書く。並べた順に画面に出る。

```yaml
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository

  search:
    layout: { columns: 3 }
    filters:
      - { field: name, label: 商品名, type: text, operator: contains }
      - field: category
        label: カテゴリ
        type: select
        operator: equals
        options:
          - { value: food,  label: 食品 }
          - { value: drink, label: 飲料 }
```

`field` がデータ側の項目名、`type` が入力欄の種類、`operator` が比較のしかた。

## operator を省くと部分一致になる

既定は `contains`。名前や住所を探す欄はそれでいいが、**コードや区分を探す欄では意図と違う**。「A001」で検索したら「A0012」も出てくる。コードや選択肢は `equals` を明示する。

日付や金額の範囲は `between`、複数選択で絞るなら `in`。

```yaml
- { field: orderDate, label: 受注日, type: date,   operator: between }
- { field: status,    label: 状態,   type: select, operator: in, options: [...] }
```

## 検索でしか使えない演算子、条件でしか使えない演算子

`operator` は検索条件（`filters`）と表示条件（`visibleWhen` / `enabledWhen`）の両方に出てくるが、**使える演算子が違う**。

| | 検索条件 | 表示条件 |
| --- | --- | --- |
| `between` `startsWith` `endsWith` | 使える | **使えない** |
| `isEmpty` `isNotEmpty` | **使えない** | 使える |

値を2つ取る（`between`）ものは入力欄が2つ必要なので検索専用、値を取らない（`isEmpty`）ものは検索欄として置き場がないので条件専用、と考えると覚えやすい。

## 検索条件を組み立てるのは Framework、実行するのは Repository

入力された値は「項目・演算子・値」の組として Repository へ渡る。**それを SQL や API のクエリにするのは Repository 側**。バックエンド（Java / TypeScript）には同じ組を受け取ってクエリを組む道具が用意されている。

## select には options が要る

`select` `radio` `multiSelect` は `options` を書かないと選ぶものが無い。値はデータに入る値、ラベルは画面に出る文字。マスタにある選択肢は `optionsSource` で引く（[選択肢の連動](./linked-options)）。

## 最初から絞って始める（defaultValue）

「一覧は既定で在籍者だけ」「今月の受注から」のように、**開いたときから絞ってある**画面は `defaultValue` で書く。検索欄がその値で埋まって始まり、**最初の一覧もその条件で読む**（欄だけ埋まって一覧は全件、にはならない）。利用者は外せる。

```yaml
search:
  filters:
    - { field: employmentStatus, label: 在籍, type: select, operator: equals, defaultValue: active,
        options: [{ value: active, label: 在籍 }, { value: retired, label: 退職 }] }
    - { field: orderDate, label: 受注日, type: date, operator: between, defaultValue: $thisMonth }
```

日付は相対の語で書ける。開いた日で解く。

| 語 | 意味 |
| --- | --- |
| `$today` | 今日 |
| `$startOfMonth` / `$endOfMonth` | 今月の1日 / 末日 |
| `$startOfYear` / `$endOfYear` | 今年の1月1日 / 12月31日 |
| `$thisMonth` / `$thisYear` | 範囲（`between`）だけ。今月・今年のはじめからおわりまで |

範囲は `[from, to]` でも書ける（`[$startOfMonth, $today]`、片方は `null` でよい）。形の合わない書き方（範囲の語を範囲でない条件に書いた、など）は**既定値が付かない**ので、`npx hatake validate` が言う。

## 画面から外させない条件（fixed）

「取消は刷らない」「退職者は出さない」のように、**利用者に外させたくない決めごと**は `fixed` に書く。画面には出ない。

```yaml
search:
  filters: [ … ]
  fixed:
    - { field: cancelled, operator: notEquals, value: true }
```

足すのは**サーバの `buildQuery`（TS / Java）**で、毎回の問い合わせに必ず付く。画面は送ってこないので、API を直接叩いても外せない。Repository を自分で直接実装した Flutter アプリ（`buildQuery` を通らない）は、同じ条件を自分で当てる。

## どこに書くか

`filters` は `search` の中。ページ直下に書いても効かない（下の「よくある間違い」参照）。`search` を持てるのは `crud` `master` `search` `dashboard` `report` の5種別で、`form` や `detail` には検索欄という概念がない。
