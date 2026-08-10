他の項目の値によって項目を出し隠しするには `visibleWhen`、入力できる／できないを切り替えるには `enabledWhen` を書く。

```yaml
fields:
  - { field: kind, label: 区分, type: select, required: true,
      options: [ { value: corporate, label: 法人 }, { value: personal, label: 個人 } ] }
  # 法人のときだけ聞く
  - { field: registryNo, label: 法人番号, type: text,
      visibleWhen: { field: kind, operator: equals, value: corporate } }
```

## 隠すか、灰色にするか

| | 使いどころ |
| --- | --- |
| `visibleWhen` | その条件では**そもそも存在しない**項目。法人にしか無い法人番号 |
| `enabledWhen` | 項目は常にあるが、**いまは入れられない**もの。出荷済になったら数量を触らせない |

迷ったら「利用者がその項目の存在を知っておくべきか」で切る。知らなくていいなら隠す、知っておいて欲しいなら灰色にする。

## 条件は入れ子にできる

1つの条件は `{ field, operator, value }`。複数を組み合わせるときは `all`（全部満たす）／`any`（どれか満たす）／`not`（逆）で包む。

```yaml
- { field: memo, label: 備考, type: textarea,
    enabledWhen: { any: [ { field: kind, operator: equals, value: vip },
                          { field: age,  operator: gte,    value: 65 } ] } }
```

`all` / `any` の中にさらに `all` / `any` を書けるので、複雑な条件も表現できる。ただし読めなくなるので、3段以上入れ子になったら**その項目を別のセクションや別の画面に分けたほうがいい**というサインだと思ったほうがいい。

## 検索条件とは演算子が違う

条件で使えるのは `equals` `notEquals` `gt` `gte` `lt` `lte` `contains` `in` `isEmpty` `isNotEmpty`。

**`between` は使えない**（下の「よくある間違い」参照）。範囲で判定したいときは `all` で `gte` と `lte` を並べる。

```yaml
visibleWhen: { all: [ { field: age, operator: gte, value: 20 },
                      { field: age, operator: lte, value: 64 } ] }
```

逆に `isEmpty` / `isNotEmpty` は条件でしか使えない（検索欄には値を入れる場所が必要なので）。

## 判定の相手は「いま編集中のレコード」

条件が見るのは、その画面で入力中・表示中のレコードの値。**他の画面の値やログイン情報は見られない**。ロールで出し分けたいなら `roles` を使う（「権限で出し分ける」参照）。

## 隠れている項目の検証

隠れている項目に `required: true` が付いていると、保存できないのに理由が見えない画面になりうる。**条件表示する項目には `required` を付けない**か、付けるなら条件と必須の条件を揃える。

## 同じ判定がバックエンドでも動く

条件の評価は Dart / TypeScript / Java の3言語に同名で用意されている。画面で隠した項目をサーバ側でも「無いもの」として扱えるので、判定ロジックを書き直さなくていい。
