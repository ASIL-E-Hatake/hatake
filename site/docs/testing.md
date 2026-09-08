---
title: 試す（定義を動かして確かめる）
description: 定義を動かして「その値でいくらになるか・何が必須になるか・押せるか」を文字で返す。画面もブラウザも要らない。
---

# 試す

書く道具（`hatake new` / `fix` / `advise`）と読む道具（`explain` / `diagram` / `paper`）は揃っている。足りなかったのは**動かす道具**だった。

| 道具 | 何を言うか | 言えないこと |
| --- | --- | --- |
| `validate` | この定義は**書けている**（効かない書き方・黙って通る間違い） | 動かした結果 |
| `explain` | この定義には**こう書いてある** | 同じ |
| `advise` | ここは**書いていない**（好み） | 同じ |
| **`run`** | **この値を入れたら、こうなる** | 押したあと（そこは業務） |
| **`fixtures`** | **サーバはこの形を受けて、この形を弾くべき** | サーバが本当にそうするか（叩くのは `probe`） |

「小計はいくらになる？」「法人にしたら何が必須になる？」「このボタンは押せる？」は、これまで**画面を出さないと分からなかった**。AI にとっては一番遠い所（Flutter が要る）なので、文字で答える口を用意した。

## まず下書きを作る

```bash
npx hatake run order_entry.yaml --draft --out order.scenario.json
```

定義の制約から、確かめるべき形が起きる ── 必須を1つずつ空にした形・文字数の境界（ぴったりと1文字超）・同じ値の行を2つ（`unique`）・条件が成立した形（`requiredWhen` / `visibleWhen`）・明細の行の必須を空にした形。

```json
{
  "page": "order_entry",
  "cases": [
    {
      "name": "全部埋めた（通るはず）",
      "$comment": "定義の制約から作った値。業務としてあり得る値かは人が見る。",
      "record": { "orderNo": "テスト", "customer": "テスト", "lines": [{ "item": "テスト", "qty": 1, "price": 0 }] },
      "expect": { "errors": [], "computed": { "subtotal": 0 }, "required": ["orderNo", "customer"] }
    }
  ]
}
```

**期待は「いまの答え」を写したもの。** すぐ回せる代わりに、定義が間違っていれば間違ったまま写る ── だから各件に「何から作ったか」（`$comment`）が入っている。**業務としてこれが正しいかは人が見る。**

形が決まっている項目（`pattern`）は値を作らない。`TODO_<項目>` が置かれる ── 正規表現を満たす文字列を機械が作ると、業務としてあり得ない会員番号ができるので。

## 動かす

```bash
npx hatake run order_entry.yaml --scenario order.scenario.json
```

```
OK   全部埋めた（通るはず）
OK   必須の「受注番号」を空にした
NG   取消の行は小計に入らない
       computed.subtotal: 期待 200 / 実際 1000
1 / 3 件が期待と違います。
```

期待と違えば**終了コード 1**（CI にそのまま置ける）。

## 返るのは5つ

答えの作り方は**画面と同じ順**（`normalize` → `computed` → 状態 → 検証）。ここがズレると道具の答えが嘘になるので、順番そのものを収束テストで固定してある。

| 欄 | 何が返るか |
| --- | --- |
| `errors` | 検証エラー。明細の行は `lines[0].qty` の形 |
| `computed` | 計算した値（**行の中の計算が当たったあと**の縦計） |
| `enabled` | ボタンが押せるか（`enabledWhen`） |
| `hidden` | 隠れている項目（`visibleWhen`・枠の `visibleWhen`） |
| `required` | いま必須の項目（`required` ＋成立した `requiredWhen`。**隠れている項目は数えない**） |

## 期待は「書いた欄だけ」見る

確かめたいことだけ書けばよい。欄ごとに見方が違うのは、欄の形が違うから。

| 欄 | 見方 | なぜ |
| --- | --- | --- |
| `errors` | 書いたら**順不同で完全一致**（`[]` は「エラー無し」） | 「これだけ出る」が意味を持つ（余分なエラーは見逃せない） |
| `computed` / `enabled` | 書いた**キーだけ** | 1つだけ確かめたいことが多い |
| `hidden` / `required` | 書いたものが**入っていること** | 「少なくともこれは隠れている」を言いたい |

## 答えられないことは答えない

プラグインの計算・検証（アプリが `ComputedRegistry` / `ValidatorRegistry` に登録するもの）は CLI の中に無い。だから**値を作らない**。

```
※ 「消費税」の計算（op: consumptionTax）は登録が要ります。この道具には組み込みしか無いので、
   値は出しません（アプリの試験で回してください）。
```

0 や空を返すと「計算した結果が 0」と読めてしまう ── それは道具が嘘をつくのと同じ。別テーブルに持つ明細（`source`）を畳まないのも、一括のボタンの「押せるか」を答えないのも同じ理由（行の選択は画面の状態で、定義からは決まらない）。

## 同じシナリオを、アプリの試験でも回す

CLI が持てないのは**アプリの登録**だけ。Flutter 側は `ScenarioRunner` に本物の登録を渡せるので、**プラグインを含めて**同じファイルを回せる。

```dart
test('受注入力のシナリオが通る', () {
  final page = parsePageYaml(File('assets/order_entry.yaml').readAsStringSync());
  final runner = ScenarioRunner(
    computeds: ComputedRegistry({'consumptionTax': consumptionTax}),  // アプリの登録
    validators: ValidatorRegistry({'memberCode': memberCode}),
  );
  final file = jsonDecode(File('test/order.scenario.json').readAsStringSync());
  for (final raw in file['cases'] as List) {
    final one = ScenarioCase.fromMap((raw as Map).cast<String, Object?>());
    expect(compareAnswer(one.expect, runner.runCase(page, one)), isEmpty, reason: one.name);
  }
});
```

CLI（TypeScript）と Dart が**同じ答えを出す**ことは、共有のフィクスチャ（`spec/conformance/scenario.json`）で固定している。画面の中と道具の答えがズレたら、そこで落ちる。

## サーバでも同じシナリオを回す

Java 版にも `ScenarioRunner` が在る。同じファイルをサーバの試験に食べさせれば、**画面・道具・サーバの3つが同じ答えを出すこと**を案件のシナリオで確かめられる。

```java
var runner = new ScenarioRunner();
for (var one : cases) {
  assertEquals(List.of(),
      ScenarioRunner.compare(one.expect(), runner.runCase(page, one)));
}
```

ただし**押せるボタンはサーバ側では答えない**。サーバの定義は `actions` を読まない（押したときの処理は画面の側にしかない）ので、判定する相手が無い。聞かれたら「答えません」と言い、`enabled` の欄は見ない ── 答えの無いものを食い違いにすると全件落ちるので。

## サーバ側の試験データ

契約（`schema` / `openapi`）は出せるようになったが、**試すデータ**はサーバを書く人が手で作っていた。境界は定義に書いてあるので、これも機械が作れる。

```bash
npx hatake fixtures order_entry.yaml --out fixtures.json
```

```
OrderEntryRequest に入れる形（7 件）:
  受ける  全部埋めた
  弾く    必須の「顧客」が無い
  弾く    明細「明細」の1行目で必須の「品名」が無い
  弾く    明細「明細」に同じ item の行が2つ
```

**値の作り方は下書き（`run --draft`）と同じ所**。ここが別々だと、画面とサーバが違う境界で試される＝どちらかが必ず緩く、緩い側が「画面では通ったのに本番で弾かれる」を作る。

言い切る前に**自分で動かして確かめる**。「弾かれるはず」の形が実際には通ってしまうことがある（条件で隠れている項目の必須など）。その件は出さずに理由を残す ── 道具が嘘をつくより、言わないほうがいい。

レコードは**サーバが受け取る形**（整えたあと・計算した値つき）。だから `readOnly` や計算項目も入っている ── 画面はレコードごと送るので**送られてくる**。無視するのは正しいが、**弾くと保存できない画面になる**。

## まだ試していない所を数える

```bash
npx hatake run order_entry.yaml --scenario order.scenario.json --cover
```

```
まだ試していない所（3 件）:
  ・「法人番号」が出る条件: 成立した
  ・「却下」が押せる条件: 成立した
  ・明細「明細」の行の「数量」の検証: 落ちた
```

数えるのは**定義の分岐**（行数ではない）。条件は「成立した側」と「しなかった側」の両方、検証は「通った側」と「落ちた側」の両方を見る。

AI は「もう十分書いた」の判断ができない（人も同じ）。定義が分岐を全部知っているので、**次に書くシナリオを機械が指せる**のがこの道具の値打ち。落とすためのものではない。

## 画面の試験を書く

計算や検証だけなら画面を出す必要はない（シナリオのほうが速い）。画面を出すのは**押せるか・出ているか・保存に行ったか**を見るときだけ。そのための道具が `hatake_test`。

```dart
testWidgets('一覧から編集を開いて保存できる', (tester) async {
  final page = await pumpPage(tester, yaml, rows: [
    {'id': 1, 'code': 'SO-1'},
  ]);
  await tester.tap(HatakeFind.edit(1));
  await tester.pumpAndSettle();
  await tester.enterText(HatakeFind.field('code'), 'SO-9');
  await tester.tap(HatakeFind.formSave);
  await tester.pumpAndSettle();

  expect(page.repository.calls, contains('update(1)'));
});
```

3つだけ。

| 道具 | 何をするか |
| --- | --- |
| `pumpPage` | 定義（YAML でも解析済みでも）をそのまま画面に出す。積み方を間違えない |
| `HatakeFind` | 押す・入れる相手を**定義の言葉で**探す |
| `FakeRepository` | 行を持ち、**聞かれたことを覚えている**（`calls` / `queries`） |

**「押したのに保存に行っていない」が言える**のが `FakeRepository` の値打ち。画面の見た目だけ見ていると、押しても何も起きていないことに気づけない。

行を渡さなければ、定義の項目名から**それらしい行**を作る（「一覧が出るか」だけを見たい試験のため）。値は嘘なので、**値を確かめる試験では行を書く**。

### キーの規約

`Key` の文字列は、画面の試験にとって**公開された契約**。今までどこにも書いておらず、Renderer の中を読み解いてから試験を書くことになっていた（AI は当てずっぽうになる）。

| 規約 | 何を指すか |
| --- | --- |
| `hatake.form.<項目>` | 入力の項目（選択肢は `hatake.form.<項目>.<値>`） |
| `hatake.action.<id>` | 画面のボタン |
| `hatake.rowaction.<id>.<行の鍵>` | 行のボタン（組み込みは `hatake.edit.<鍵>` / `hatake.delete.<鍵>`） |
| `hatake.confirm.ok` | 確認の「はい」 |
| `hatake.subtable.<項目>.add` | 明細の「行を追加」 |

全部は `HatakeKeys.shapes`。**規約と Renderer の一致は CI が突き合わせる** ── 契約を書いた紙と実物が別々に在るので、機械が見ないといつか食い違う。食い違うと「規約どおり書いた試験が、その画面では動かない」＝紙のほうが嘘になる。

## 足したものが片側にしか無い

組み込みの検証・計算が3版で同じ答えを出すことは収束テストで縛ってある。縛られていないのは**利用者が足したもの**だった。

```bash
npx hatake registry --compare 画面の一覧.json サーバの一覧.json
```

```
片側にしか無い登録が 2 件あります:
  ・computedOps の consumptionTax … サーバに無い
  ・validators の creditLimit … 画面に無い
同じ定義でも答えが変わります（画面では通るのに保存で弾かれる、その逆も）。

見なかった種類（片側にしか無くて当然のもの）:
  ・plugins … 押したときの処理は画面の側にしかない
```

見るのは**答えを決める種類だけ**（検証・計算・変換・集約）。Repository やプラグインは片側にしか無くて当然なので、理由つきで「見なかった」に落とす ── 当然のものを食い違いとして並べると、報告そのものが読まれなくなる。

一覧を書くのは**動いているアプリとサーバ**（`registrySnapshot` / `RegistrySnapshot`）。どちらも何も足していなければ「**突き合わせるものがありません**」と言う（「同じです」と言うと、確かめた気になる）。

## AI に使わせる

MCP を繋いでいれば `hatake_run` がそのまま渡る（`draft: true` / `cover: true` も引数）。サーバ側の試験データは `hatake_api_shape` の `format: fixtures`。→ [AI に書かせる](/ai)

書く → 動かす → まだ試していない所を見る → 書く、が**1つの道具の中で**回る。これが「定義ファースト」を AI First にする最後の一歩だった。
