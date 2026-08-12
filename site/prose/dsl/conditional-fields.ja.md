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

## 隠れている項目は検証しない

`visibleWhen` で消えている項目は、`required` も他の検証も飛ばす。入力できない項目を必須にすると「直せないのに保存できない画面」になってしまうので、そちら側に倒してある。

なので **「出たときだけ必須」は素直に書ける**。条件を2回書く必要はない。

```yaml
- field: registryNo
  label: 法人番号
  required: true
  visibleWhen: { field: kind, operator: equals, value: corporate }
```

ただし、隠れている項目に値が残っていた場合、**その値は保存される**。検証を飛ばすだけで、値を消しには行かない（消したつもりのデータが残るより、勝手に消えるほうが事故が大きいので）。

## 見た目は変えずに、直せなくする

`enabledWhen` は灰色になる。「値は読ませたいが直させたくない」ときはこれだと目立ちすぎるので、`readOnlyWhen` を使う。見た目は普通の入力欄のまま、編集だけできなくなる。

```yaml
# 個人には会員番号を直させない（でも読ませたい）
- { field: memberNo, label: 会員番号, readOnlyWhen: { field: kind, value: personal } }
```

`enabledWhen: { not: ... }` と書いても同じことはできるが、条件を反転させて読むぶん1枚挟まる。素直な向きで書けるようにしてある。

## 条件によって必須にする

「法人のときだけ登録番号が必須」のように、**項目は出ているのに必須かどうかだけ変わる**場合は `requiredWhen`。

```yaml
- { field: invoiceNo, label: 登録番号, requiredWhen: { field: kind, value: corp } }
```

必須の条件を `validators` の中に書こうとしても効かない。`validators` の要素はその項目の値しか見ないので、他の項目の値では分岐できない（そして余分なキーは黙って捨てられる）。

## 枠ごと出し分ける

項目が何個も同じ条件で出たり消えたりするなら、セクションに `visibleWhen` を書けば見出しごと消える。中の項目も検証されない。

```yaml
sections:
  - title: 請求先
    visibleWhen: { field: kind, value: corp }
    fields:
      - { field: billingCode, label: 請求先コード, required: true }
```

## 同じ判定がバックエンドでも動く

条件の評価は Dart / TypeScript / Java の3言語に同名で用意されている。画面で隠した項目をサーバ側でも「無いもの」として扱えるので、判定ロジックを書き直さなくていい。

サーバ側の検証が見るのは `visibleWhen` と `requiredWhen` の2つ（`enabledWhen` と `readOnlyWhen` は見た目の話なので見ない）。`{ mode: ... }` を含む条件を使うなら、検証を呼ぶときにモードを渡すこと。渡さないと mode の判定が false になり、**検証が緩む方に倒れる**。

## 新規のときだけ／編集のときだけ

「コードは登録時だけ入力できて、あとから変えさせない」は業務システムで必ず出る。これは他の項目の値では決まらない（フォームがいまどちらの状態かという話）なので、`mode` という専用のリーフで書く。

```yaml
fields:
  # 新規のときだけ入力できる
  - { field: code, label: コード, enabledWhen: { mode: create } }
  # 編集のときだけ出す（新規の時点では存在しない項目）
  - { field: updatedBy, label: 更新者, readOnly: true, visibleWhen: { mode: edit } }
```

`{ field: id, operator: isEmpty }` のようにキー項目の有無で判定しても動くが、**なぜ id を見ているのかが定義から読み取れない**。キー項目名を変えた瞬間に黙って壊れるので、`mode` と書く。

明細（`subTable`）の行では、行を追加するときが `create`、既にある行を開いたときが `edit`。読み取り専用の詳細画面のように**そもそもモードが無い場所では false**になる（「新規のときだけ」は、新規と言えない場所では満たされない）。
