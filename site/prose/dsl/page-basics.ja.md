どの画面も、まず「どの種別か」「どのデータを扱うか」を書く。ここが決まれば、あとはその種別が持てるものを足していくだけになる。

```yaml
dsl_version: "1.0"

page:
  type: master          # 画面の種別
  id: dept_master       # 画面の識別子（遷移先の指定に使う）
  title: 部門マスタ      # 画面に出る名前
  repository: deptRepository   # データの出し入れ先の名前
  key: code             # 1件を特定する項目
```

## repository は「名前」であって実装ではない

`repository` に書くのは名前だけ。その名前で実際に何をするか（HTTP を叩く、DB を見る、メモリに持つ）は自分のコードで書いて、アプリ起動時に名前と結びつける。Framework は HTTP も DB も知らない。

## key を書く画面と書かない画面

`key` は「この1件」を決めるための項目。詳細表示・編集・削除は、これが無いとどのレコードを触るのか決まらない。

逆に、1件を触らない画面（`dashboard` / `report`）には `key` を書かない。集計しか出さないので特定する対象が無い。

## どの type を選ぶか

迷ったら、扱う対象が「一覧か1件か」「読むだけか書くか」で切る。

| やりたいこと | type |
| --- | --- |
| 探して一覧に出して、その場で登録・修正・削除まで | `crud` / `master` |
| 探して一覧に出すだけ（照会） | `search` |
| 1件を読み取り専用で見せる | `detail` |
| 1件を入力・編集する（一覧なし） | `form` |
| 長い入力を数ステップに分ける | `wizard` |
| 数字とグラフを並べる | `dashboard` |
| 印刷・PDF 向けに出す | `report` |

判断に迷う場合の対照表は [ページ種別の選び方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/page-types.ja.md) にある。
