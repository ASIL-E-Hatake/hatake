# @hatake/core — TypeScript 版 🌱

[hatake](../README.md) の **TypeScript 版**。フロントで画面を描く Flutter 版と違って、こっちは**バックエンド寄り**。同じ [DSL 仕様](../spec/dsl-spec.ja.md) の定義を読んで、**API のロジック**（サーバ側バリデーション・クエリ組み立て・API の形の生成）に使う。

要は「Flutter のフォームを描くのと同じ YAML で、Node の API のリクエスト検証もやる」ってやつ。フロントとバックでバリデーションがずれない。

**`hatake` CLI もここに入っている**（検証と生成が全部そろっている唯一の版なので）。→ [CLI](#cli)

## 今あるもの

- **定義モデル + パーサ** … `spec/` と同じ DSL を YAML / JSON から読む（`parsePageYaml` / `parsePageJson` / `parseAppYaml`）。YAML と JSON は同じ結果に収束する（テスト済み）。対応ページ種別は `crud` / `master` / `search` / `detail` / `form` / `wizard` / `dashboard` / `report`。
- **strict パース** … `parsePageYaml(source, { strict: true })` で**知らないキーを全部まとめて**エラーにする（近い既知キーの提案つき: `pagesize` → `pageSize`）。厳しさは JSON Schema と同一。
- **FormValidator** … フォーム定義からサーバ側バリデーション。組込ルール（required / maxLength / minLength / min / max / pattern / email / postalCode / **compare**）＋ `ValidatorRegistry` で独自ルールも足せる。明細（`subTable`）の子行も検証（`lines[0].qty`）。`compare` は**項目間の検証**（「開始日 ≤ 終了日」「合計＝明細の和」）で、他の項目の値を見る唯一の組込。
- **buildQuery** … 検索フィルタ定義 + リクエストの params から、フレームワーク非依存の `QuerySpec`（conditions / sort / pagination）を組み立てる。**フィルタに無い項目は無視（許可リスト方式）**なので、任意項目での検索を弾ける。
- **API の形の生成** … `deriveDto(page)` → `DtoSpec`、そこから `toJsonSchema`（JSON Schema 2020-12）／`toOpenApi`（OpenAPI 3.1）／`toTypeScript`・`toJavaRecords`（ネイティブ型）。
- **出力** … `toCsv`（一覧・帳票の CSV）、`buildReport`（帳票をコントロールブレイクで紙に組む）。
- **FormatterRegistry / ConverterRegistry / 集約 / 日本企業向けユーティリティ** … Flutter版と同名・同挙動。formatter（currency / percent / date / wareki / postal / mask）、converter（toHankaku / toZenkaku / hiraToKata / kataToHira / trim / collapseSpaces / parseNumber）、`AggregateRegistry`（count / sum / avg / min / max）、消費税・年度・和暦・営業日・年齢。

```ts
import { parsePageYaml, FormValidator } from "@hatake/core";

const page = parsePageYaml(yamlText, { strict: true });
const result = new FormValidator().validate(page.form, requestBody);
if (!result.valid) return res.status(400).json({ errors: result.errors });
```

```ts
import { parsePageYaml, buildQuery } from "@hatake/core";

const page = parsePageYaml(yamlText);
const spec = buildQuery(page.search, req.query); // { conditions, sort, page, pageSize }
// spec を Prisma / TypeORM / 生SQL に変換するのはアダプタ側（opt-in）
```

## CLI

定義を「書いた → すぐ検証」の1コマンドにするやつ。人にも AI にも同じ入口。

```bash
npx hatake validate spec/examples/*.yaml     # 解析 + strict（既定）
npx hatake new report --id sales_report --title 売上明細表 > page.yaml
npx hatake types page.yaml --lang java --package io.example.api --out gen/
npx hatake reference rowsPerPage             # このキー、どこに書くの？型は？既定値は？
npx hatake examples 帳票                      # 近い例を探す
npx hatake refs page.yaml --needs-registration # アプリ側に何を登録すればいいか
npx hatake registry lib/main.dart --out hatake-registry.json  # 実装から「登録済み」の一覧を作る
npx hatake explain page.yaml                 # この定義、結局どういう画面？
npx hatake explain page.yaml --brief         # 1行で（README や PR 本文に貼る用）
npx hatake explain --diff old.yaml page.yaml # 何を変えたのか、画面の言葉で
npx hatake explain page.yaml --review        # レビュー用の1枚（説明＋助言）
npx hatake harvest definitions/              # 繰り返し転んでいる所を実例カタログの候補に
npx hatake minimize page.yaml                # 既定値と同じ指定を落として短く（意味は変えない）
npx hatake fix page.yaml                     # 直し方が一意な問題だけ直す（--write で上書き）
npx hatake advise page.yaml                  # 書き足したほうがいい所（助言。警告ではない）
npx hatake advise page.yaml --rules team.json # 案件ごとの決めごとで見る
npx hatake index definitions/ --find "顧客 検索"  # どこに何の画面があるか
npx hatake diagram app.yaml --out app.svg    # 画面とメニューと遷移の図（権限も重なる）
npx hatake diagram app.yaml --role admin     # その役割で通れる道だけ
```

| コマンド | 何をするか |
|---|---|
| `validate <file...>` | 定義を解析して問題を報告。既定は strict（知らないキーを弾く／`--no-strict` で従来の寛容さ）。**通るけれど意図どおり動かない書き方（警告）も既定で出す**（`--no-warn` で黙る／`--warn-as-error` で終了コード 1）。`--registry <file>` で**画面の外との辻褄**（Repository / プラグイン名が登録済みか）も見る。`--json` で機械可読。**問題があれば終了コード 1** なので CI にそのまま置ける |
| `new <kind> --id --title` | ページ定義の雛形（8種別すべて。`--repository` 省略時は id から推測、`--out` でファイルへ） |
| `dto <file>` | API の形（`DtoSpec`）を JSON で |
| `diff <old> <new>` | 定義を変えた影響範囲。API の形（壊すか）＋画面・権限・アプリ構成の変化（確かめてほしいか）。`app:` どうしも比べられる。`--api-only` で契約だけ、`--caution-as-error` で「要確認」でも終了コード 1。**壊す変更があれば終了コード 1** |
| `refs <file...>` | その定義が**外に要求しているもの**（Repository・プラグイン・独自のフォーマッタ…）を種類ごとに。`--needs-registration` で「組み込みに無い＝自分で登録が要るもの」だけ。出力はそのまま `--registry` に渡せる形 |
| `registry <path...>` | 逆向き。**アプリの実装を読んで**「登録済みのもの」の一覧を作る（`--out` でファイルへ）。path はファイルでもディレクトリでも。読めない登録があれば終了コード 1 |
| `schema <file>` | JSON Schema 2020-12 |
| `openapi <file> [--base-path /api/orders]` | OpenAPI 3.1（`--base-path` を省くと `components.schemas` だけ） |
| `types <file> --lang ts\|java [--out dir]` | ネイティブ型。Java は**1レコード＝1ファイル**で書き出す |
| `reference [name] [--page-kind k]` | 機械可読な [DSL リファレンス](../spec/reference.json)（JSON）。`name` にキー名・ノード名・ページ種別を渡すとその1件だけ。綴り違いは候補を出す |
| `examples [query] [--json]` | [例のカタログ](../spec/examples/README.md)を「やりたいこと」で引く |
| `pitfalls [query] [--lang ja\|en]` | [よくある間違い](../spec/pitfalls.json) → なぜ駄目か → 正しい書き方。`validate` も未知キーからこれを引いてヒントを出す |
| `failures [query]` | [実際に転んだ実例](../spec/failures.json)。こう書いた → こう言われた → こう直した。**なぜそう書いてしまうか**も持つ |
| `explain <file> [--page id]` | 定義を「この画面は何をするか」に開く（日本語）。DSL を知らない人がレビューするための出力。`--brief` で1行だけ（`app:` なら画面一覧の表） |
| `explain --diff <old> <new>` | 変更を**画面の言葉**で言う（「枠「請求先」は、区分 が 法人 のときだけ出るようになりました」）。後方互換の判定はしない＝**終了コードは変えない**（それは `diff` の担当） |
| `explain <file> --review` | レビュー用の1枚。説明（できること・**できないこと**）＋助言（書き足したほうがいい所）をまとめて出す。`--page` を渡すと助言もその画面だけ。`--rules` も渡せる。**終了コードは変えない** |
| `harvest <path...>` | 定義の山を走査して、**繰り返し出ている診断**を[実例カタログ](../spec/failures.json)の候補として出す（`--min` で回数、既定 2）。「なぜそう書いてしまうか」は機械には書けないので、人が書く欄は空のまま。`--repro` で**最小の再現**の下書きも作る。読めない定義があれば終了コード 1 |
| `fix <file>` | **直し方が一意に決まる問題だけ**を直す（綴り違い・入れる値が決まっている指定）。既定は標準出力に出すだけで**ファイルは触らない**（`--write` で上書き）。直さなかったものは理由つきで標準エラーに。残った問題があれば終了コード 1 |
| `advise <file>` | **書き足したほうがいい所**（並べ替えできる列が無い・絞り込みが無い・誰でも消せる…）。助言なので**終了コードは変えない**。`--rules team.json` で**物差しを差し替え**（規則を切る・目盛りを変える・案件の決めごとを足す） |
| `index <path...>` | 定義の山から**画面の索引**（1行の要約＋探すための語）。`--find "顧客 検索"` は語の AND、`--by size` で規模順、`--json` / `--out` で機械可読。**同じ索引は Dart 版・Java 版にもある**（[下](#索引はどのエディションにもある)） |
| `diagram <file>` | 図解の SVG。`app:` の定義から**画面とメニューと遷移**の図を作る（遷移は1本ずつ線を引く。どこからも開けない画面も分かる）。箱の中には**誰が開けるか**も出る（赤枠＝誰でも開けて消す/持ち出せる、点線＝誰も開けない）。`--role admin` で**その役割で通れる道**だけ。図の元データ（`rows` を持つ JSON）を渡すとそれを描く |
| `minimize <file>` | **意味を変えずに**短くする。既定値と同じ指定・空の指定を落とす。落とすたびに解析後のモデルが変わらないことを確かめる（変わるものは落とさない）。コメントも、落とした所以外の書き方もそのまま。定義は標準出力・落としたものは標準エラー |

`reference` / `examples` / `minimize` は `spec/` を実行時に探す（`--spec <dir>` で明示もできる。
`minimize` はキーの既定値をスキーマから引くので、手で書いた表が古くなることがない）。
リファレンスは**その場でスキーマから生成する**ので、古い写しを配ることがない。

`validate` は失敗したとき、場所・キー・直し方をそのまま出す:

```
FAIL page.yaml
     page.table.columns[0]: 知らないキー "witdh"（width の間違い？）
```

**構造の間違い**（書ける場所を間違えた・別の種別のキーを使った）には、[対照表](../spec/pitfalls.json)から直し方も添える:

```
FAIL page.yaml
     page: 知らないキー "form"
     ヒント: `search` / `wizard` / `dashboard` / `report` に `form` を書く → 入力もさせたいなら `crud`（または `master`）にする。…
```

**解析は通るのに意図どおり動かない**書き方は警告として出す（エラーではないので終了コードは 0 のまま）:

```
OK   page.yaml (report)
     警告 page.table.rowActions[0]: 行アクション "approve" に対応する actions の定義がありません。ボタンが出ません。
          → actions に { id: approve, type: …, label: … } を足してください（組み込みは edit / delete のみ）。
     警告 page.report.groupBy: グループはコントロールブレイクなので、行がその順で届かないとグループが分裂し、小計が何度も出ます。
          → report.sort に印刷したい並びを書いてください（並べ替えは Repository の責務）。
```

生成系（`dto` / `schema` / `openapi` / `types` / `diff`）は**常に strict で読む**。書き間違いのある定義から API の形を作ると、間違いが API に焼き付くので。

定義を直したら影響範囲を見る:

```
$ npx hatake diff before.yaml after.yaml
✗ 破壊的 [api] page.CustomerMasterRequest.code: code の maxLength が 20 から 10 に変わりました。今まで通っていた値が弾かれます。
・安全  [api] page.CustomerMasterResponse.code: code の maxLength が 20 から 10 に変わりました。
**後方互換を壊します**（既存の呼び出し側の修正が要ります）。
```

同じ変更でも**受け取る形と返す形で結論が違う**（サーバが厳しくすると呼ぶ側が壊れ、返す形が厳しくなっても読む側は困らない）。壊すこと自体は普通にあるので止めない。気づかずに壊すのを防ぐのが目的。

判定は3段で、`area`（どの層の話か）とセットで出る。

| 印 | 意味 | 例 |
|---|---|---|
| `✗ 破壊的` | 呼び出し側が壊れる（`api`） | 必須項目を足す / 返す形から消す / 型を変える / 制約を厳しくする |
| `△ 要確認` | 壊れないが**目で見て確かめてほしい** | 列・ボタン・選択肢が消えた（`ui`）/ 権限が狭まった・広がった（`access`）/ ページ・メニューが消えた（`app`） |
| `・安全` | 増えただけ | 列が増えた / ページが増えた / テーマが変わった |

**「要確認」を「破壊的」と混ぜないのが要点**。列を消すのは普通にやることなので、止める話ではなく気づかせる話。混ぜると全部無視されるようになる。

```
$ npx hatake diff before.yaml after.yaml
△ 要確認 [ui] page.form.fields.status.options: 項目「ステータス」の選択肢から "active" が消えました。その値を持っている既存データは、開いても選び直せません。
△ 要確認 [app] app.menu.受注照会: メニューから「受注照会」が無くなりました。ページ order_search はメニューから開けません。
後方互換ですが、**目で見て確かめてほしい変更**があります（上の「要確認」）。
```

### 画面の外との辻褄（`--registry`）

定義は自分だけでは動かない。`repository: orderRepository` と書いたら、アプリ側がその名前で
登録していないと**画面は出るがデータが来ない**。strict もスキーマもここは見られない
（登録済みの一覧を知らないので）。なので2段構えにした。

```bash
$ npx hatake refs page.yaml --needs-registration --json > hatake-registry.json  # 何を登録すればいいか
$ npx hatake validate page.yaml --registry hatake-registry.json                 # 名前が食い違っていないか
```

`refs` は**判断せずに列挙する**（組み込みで足りているものには印を付けない）。`validate` は
**渡されたカテゴリだけ**を突き合わせる（一覧が無ければ何も言わない＝定義の中だけで閉じた検査）。
組み込みの名前は自動で足されるので、一覧に書くのは自分で登録したものだけでよい。

一覧は手で書かなくてよい。**実装から作れる。**

```bash
$ npx hatake registry lib/main.dart --out hatake-registry.json
$ npx hatake registry lib/            # 人が読む形（どこで登録しているかまで出る）
repositories:
  customerRepository    lib/main.dart:82
  orderRepository       lib/main.dart:82
plugins:
  showDefinition   lib/main.dart:100
```

**言語のパーサは持たない。** 見るのは「登録している所に、その場で書いてある文字列」だけで、
変数や関数から組み立てている登録は読めない。読めないものは**黙って落とさずに報告し、終了
コード 1** にする。

```
読めなかった登録が 1 件あります。一覧は**不完全**なので、その分は手で足してください:
     lib/playground_data.dart:20 (repositories) キーが文字列リテラルではありません: for (final key in keys…
```

黙って落とすと「登録してあるのに未登録」という**嘘の警告**になり、仕組みごと信用されなくなる。
一覧が不完全なまま使うくらいなら、不完全だと言って止まるほうがいい。

**読めなかったぶんは、動いているアプリに聞く。** Flutter 側に同じ形を吐く口がある。

```dart
File('hatake-registry.json').writeAsStringSync(registrySnapshotJson(scope));
```

ソースを読む方は「アプリを動かさずに作れる／CI で差分を見られる」、実行時に聞く方は
「動的に組み立てた登録も分かる」。出す形は同じなので、案件に合う方を選べばよい
（同じ語彙・同じ形であることは `spec/conformance/registry_snapshot.json` で両版から確認している）。

読める書き方: `XxxRegistry({ 'name': … })`（Dart / TypeScript）、`new XxxRegistry(Map.of("name", …))`
（Java。型を明示した `Map.<K, V>of(…)` も可）、名前付き引数の `fieldBuilders: { 'color': … }`。
コンストラクタの**宣言**と、受け取ったものを渡しているだけの素通し（`fieldBuilders:
widget.fieldBuilders`）は登録として数えない。

```
OK   sales_app.yaml (app: 8 ページ)
     警告 app.pages[0].actions[1].plugin: プラグイン "showDefinition" は登録されていません。ボタンは出ますが、押しても何も起きません。（他 7 箇所から参照）
          → もしかして "showDefinitoin" ですか。アプリ側のアクション登録に同じ名前で足すか、定義の名前を直してください。
```

`--registry` を省いても、定義の隣（無ければカレント）に `hatake-registry.json` があれば黙って拾う
（同梱のデモは [`flutter/packages/hatake_example/assets/hatake-registry.json`](../flutter/packages/hatake_example/assets/hatake-registry.json)）。

### 書けたものを読み返す（`explain`）

strict もスキーマも警告も、**綴りと構造しか見ない**。「条件の向きを間違えた」「意図と違う
項目を必須にした」は全部通る。だから最後に人の言葉で読み返す。

```
$ npx hatake explain spec/examples/customer_form.yaml
顧客入力（customer_form）— 1件を入力する画面（新規と編集の両方）

## 基本情報
  ・コード … 必須、新規のときだけ触れる、20 文字以内、保存前に整える（全角→半角・前後の空白を落とす）
  ・区分 … 選択、必須、選べるのは 個人 / 法人
  ・登録番号 … 区分 が 法人 のときだけ必須

## 請求先（区分 が 法人 のときだけ出る枠）
  ・請求先コード … 必須

## この画面でできないこと
  ・一覧は無い（開く先は呼び出し側が決める）
```

**キーの名前は出さない**（読み手は DSL を知らなくてよい）。条件は項目のラベルと選択肢の
ラベルで言うので、`{ field: kind, value: corp }` ではなく「区分 が 法人 のとき」と読める。
`app:` を渡すと画面の一覧とメニュー、`--page <id>` でその1枚を詳しく。

`--brief` は1行だけ。README・PR 本文・画面一覧に貼る形で、`app:` なら表になる。

```
$ npx hatake explain spec/examples/sales_app.yaml --brief
販売管理（sales_admin）— 画面 8 枚

  sales_dashboard    売上ダッシュボード          数字とグラフ。条件 1、カード 7、ボタン 1、orderRepository から
  customer_master    顧客マスタ                  マスタ保守。条件 1、列 2、項目 2（必須 2）、ボタン 1、customerRepository から
  order_search       受注照会                    照会（読み取り専用）。条件 4、列 5、ボタン 4、orderRepository から
```

### 何を変えたのかを読み返す（`explain --diff`）

`diff` は機械の言葉で言う（`ui / column-format-changed / …columns.amount.format`）。
壊れるかを CI で見るにはそれが正しいが、**人がレビューするときに読みたいもの**ではない。

```
$ npx hatake explain --diff old.yaml new.yaml
顧客入力（customer_form）— 変わったところ

## 基本情報
  ・「コード」が変わりました
      前: コード … 必須、新規のときだけ触れる、20 文字以内
      後: コード … 必須、新規のときだけ触れる、30 文字以内
## 請求先
  ・枠「請求先」は、条件なしでいつでも出るようになりました

※ ここは**見え方**の話です。呼び出し側が壊れるか（後方互換）は hatake diff で見てください。
```

やっているのは「**説明どうしを比べる**」こと。差分の規則から文を組み立てるのではなく、
`explain` が出した説明を前後で比べるので、既定値の変化や「できないこと」の増減のような、
差分の規則を書いていない変化も自動で入ってくる。`app:` なら、メニューの移動（開く先が同じ
なら「消えて増えた」ではなく「移った」）と、両方にあるページを1枚ずつ。

**終了コードは変えない**（変わっていても 0）。ここは読むための道具で、止めるための道具は
`diff`。混ぜると「見え方が変わっただけ」で CI が落ちるようになる。

### 実際に転んだ実例（`failures`）

[対照表](../spec/pitfalls.json)は「人が考えた間違い」の集合で、AI が実際に転ぶ所とはズレる。
そこで[実例のカタログ](../spec/failures.json)を分けてある。**各件は本当に道具にかけ直して、
記録した診断と一致することを CI で確認している**（＝この表は嘘をつけないし、診断の質が落ちたら
そこで落ちる）。

```
$ npx hatake failures unknown-repository
# Repository の名前を、それらしく短くして書いた
  なぜそう書くか: `orderRepository` を `orderRepo` と書く（あるいは逆）。定義だけ見れば筋が通っている…
  道具が言うこと: unknown-repository
  直し方: アプリが登録している名前をそのまま書く…
```

**機械では拾えない件も載っている**（診断が空の件）。載せないと「道具が万全である」という嘘に
なるので、そういう件には「レビューでどこを見るか」を書いてある。だいたいの答えは
「`explain` で読み返す」になる。

### 実例を手で増やさない（`harvest`）

カタログは手で書くと増えない。増えないカタログは、道具が良くなったのか実例を拾っていない
だけなのか**見分けが付かない**。そこで定義の山から拾う。

```
$ npx hatake harvest definitions/
走査: 定義 24 本（定義でないファイル 2 件は飛ばした）

候補 1 件（載せるかは人が決める。自動では足さない）:

# rowaction-not-declared  3 箇所 / 2 本
  道具が言うこと: 行アクション "approve" に対応するボタンの宣言がありません。…
  出た所: definitions/order_list.yaml  page.table.rowActions[1]
  人が書く: why: なぜそう書いてしまうか。この表の価値はここ（対照表に無い列）。
  …

既にカタログにある（数えただけ）:
  unknown-repository → repository-name-guessed  2 箇所
```

決めごと:

* **`why` は機械には書けない。** そこがカタログの価値なので、候補は人が書く欄を空のまま出す。
  `failures.json` に自動で足すことは絶対にしない
* **定義そのものは持ち出さない。** ラベルや列名に客先の語彙が入るので、出すのはファイル名・
  場所・回数と、道具が言ったことだけ
* **1回だけ出たものは転び方ではない**（ただの間違い）。既定は2回以上。同じ定義の中で2回でも
  数える（同じ手が2度伸びたということなので）
* 既にカタログにある診断は候補にせず、**数えるだけ**（重複を増やさない）
* 出るのは**道具が言えた転び方だけ**。言われない転び方は `explain` で人が見つける、と出力に
  毎回書く（黙ると「これで全部」という嘘になる）

`--repro` を付けると、**最小の再現**（`wrote` の下書き）も作る。当たった定義から、その診断が
出続ける限り削ったもの:

```
  最小の再現（17 箇所削った下書き）:
    page:
      type: report
      id: sales_report1
      title: 名前1
      repository: orderRepository
      report:
        groupBy:
          - field: customer
            label: 名前2
```

守るのは「意味」ではなく**診断**（目当ての診断が出続けていて、かつ**新しい診断が出ていない**
限り削る）。削り終わってから自由文（`label` / `title` / `description`）を記号に置き換える
（先に置き換えると、ラベルに依る診断があったときに嘘の再現になる）。**識別子は残る**ので、
そこは人が見る（候補の `todo` にそう書いてある）。出力に定義の本文が入るので**既定では作らない**。

### 一意な直しは機械にやらせる（`fix`）

AI は指摘されると**別の場所を直して壊す**ことがある。「`witdh` は知らないキーです」と言われて
列ごと書き換える、というような直し方をする。綴り違いのような**一意な直しは機械のほうが速くて
安全**なので、そこは道具に任せる。

```
$ npx hatake fix page.yaml
2 件を直しました:
  page.table.columns[0].witdh のキー名を width に直しました
  page.table.rowActions[1] を "aprove" から "approve" に直しました

直さなかったもの（意図が要るので人の仕事です）:
  page.repository [unknown-repositories] 登録済みの名前に近いものがありません（"zzz"）。名前を決めるのは人の仕事です。

残っている問題 1 件: unknown-repository
```

直すのは2種類だけ。

* **綴り違い** … キー名・Repository / プラグイン / 型 / ページ id / アクション id / 連動の親。
  近い名前が**1つに決まる**ときだけ（候補が2つあれば人の仕事）。登録済み一覧を渡せば、
  **略して書いた名前**（`orderRepository` を `orderRepo`）も戻せる
* **入れる値が決まっている指定** … 小計のある帳票に `report.sort` を足す（並べる項目は
  `groupBy` から決まる）

確かめ方は**診断で守る**（最小化がモデルの一致で守るのに対して）。1件ずつ当てて「問題が減る・
**新しい問題が出ない**」ことを見て、当て終わった文字列をもう一度読んで同じことを確かめる。
崩れていたら**何もしない**。

* **既定ではファイルを触らない**（標準出力に出すだけ）。書き換える道具は、見せてから当てる
  のが順番。`--write` のときだけ上書きする
* 直したあとは、変更を[画面の言葉](#何を変えたのかを読み返すexplain---diff)でも言う
  （前後どちらも strict で読めるときだけ）
* **直さなかったものは理由つきで必ず出す。** 同じ項目の重複（どちらを残すか）・`field` の無い
  集計（どの項目か）・条件で使えない演算子（何をしたかったか）は意図が要るので触らない
* 残った問題があれば**終了コード 1**（CI で「まだ人の手が要る」と分かる）

### 書き足したほうがいい所（`advise`）

`minimize` は**書きすぎ**を直す。しかし業務システムで多いのは書きすぎより**書き足りない**。

```
$ npx hatake advise page.yaml
書き足すと良さそうな所が 2 件:

# page.search [no-search-filter]
  こうなる: 絞り込みが無いので、一覧は毎回全件から始まります。件数が増えると使えません。
  書き足す: `search.filters` に、現場が必ず使う条件（コード・名称・日付の範囲）。

# page.actions[0].roles [open-dangerous-action]
  こうなる: 「削除」は誰でも押せます（消したものは戻りません）。
  書き足す: `roles` で見える人を決める（権限はアプリ側の判定と合わせて二重にかける）。
```

見るのは、並べ替えできる列が無い / 絞り込みが無い / キーが一覧に出ていない / 必須が1つも無い /
消せる・持ち出せるのに権限が無い / 金額らしいのに桁区切りが無い / 明細に親のキーが無い /
帳票に合計が無い、の8つ。

**これは警告ではなく助言。** この2つは混ぜない:

| | 中身 | CI |
|---|---|---|
| 警告（`validate`） | 書いたのに効かない。**事実** | 落としてよい（`--warn-as-error`） |
| 助言（`advise`） | 書いていないから不便かもしれない。**好み** | 落とさない（終了コードを変えない） |

混ぜると警告の信頼が落ちる（「hatake は好みを押し付ける」になった時点で誰も読まない）。
画面の種別も見る（照会に「必須が無い」とは言わない・帳票に「並べ替えできない」とは言わない）。
勧めるキーが**その場所に本当に書けるキーである**ことは、スキーマから作ったリファレンスで
CI が確かめている（書けないキーを勧めるのは、間違いを教えるのと同じ）。

#### 物差しを外から渡す（`--rules`）

助言は好みなので、会社と案件で変わる。固定の表しか無いと「うちの決めごとと合わないから使わない」
で終わるので、外から渡せるようにしてある（例: [`docs/guide/advise-rules.example.json`](../docs/guide/advise-rules.example.json)）。

```json
{
  "off": ["money-without-format"],
  "options": { "no-sortable-column": { "minColumns": 4 } },
  "require": [
    {
      "rule": "team-delete-confirm",
      "node": "action",
      "key": "confirm",
      "when": { "type": "delete" },
      "every": true,
      "says": "削除は必ず確認を出す決めごとです。",
      "add": "`confirm: { message: 削除してよろしいですか }`。"
    }
  ]
}
```

```bash
npx hatake advise page.yaml --rules team.json
```

* `off` … 合わない規則を止める（組み込み・案件の決めごとのどちらも）
* `options` … 組み込みの規則が**持っているつまみ**だけ（`no-sortable-column.minColumns` /
  `no-search-filter.minColumns` / `open-dangerous-action.types` / `money-without-format.words`）
* `require` … 案件の決めごとを「**この場所には必ずこのキーを書く**」の形で。見るのは
  `page` / `column` / `filter` / `field` / `action` の5か所、`when` でその場所の値で絞り、
  `every: true` なら全部に要る（既定は1つでもあればよい）

**規則を書くための言語にはしない。** 条件式を書けるようにすると、そこから先は設定ファイルでは
なく小さなプログラムになり、読める人が減る。書けるのは「どの場所の・どのキーが・書かれているか」
だけ。

**知らないキー・知らない規則名はエラー**にする（DSL の strict と同じ考え方）。設定が黙って
効かないのが一番まずい＝止めたつもりの規則が動き続け、足したつもりの決めごとは誰も見ていない、
が起きる。案件の決めごとが**書けないキー**を勧めていたら、助言を出す前に止める。

物差しを渡したときは**出力にそう書く**（「※ 物差しは team.json を使いました」）。読む人が
組み込みの助言だと思ったまま案件の決めごとを読むと、話が噛み合わない。

### レビュー用の1枚（`explain --review`）

`explain` の「この画面でできないこと」と `advise` の「書き足したほうがいい所」は隣の話で、
どちらも**人がレビューするため**に在る。道具ごとに出力が散ると、片方しか読まれない。

```
$ npx hatake explain page.yaml --review
受注一覧（order_list）— 検索して一覧に出し、その場で登録・修正・削除までできる画面

## データ
  ・データの出どころは orderRepository（アプリ側が用意する）。
（…中略…）

## この画面でできないこと
  ・絞り込みの条件は無い（一覧は全件から始まる）

## 書き足したほうがいい所（助言）
  ・絞り込みが無いので、一覧は毎回全件から始まります。件数が増えると使えません。
    → `search.filters` に、現場が必ず使う条件（コード・名称・日付の範囲）。
      page.search [no-search-filter]

※ ここは**助言**（書いていないから不便かもしれない所）で、警告ではありません。…
```

* 助言は**最後の節にまとめる**（混ざると、事実と好みの区別が付かなくなる）
* `--page` で app の1枚を読むときは、**助言もその画面のものだけ**に絞る（他の画面の指摘が
  混じると、目の前の画面の話だと読み違える）
* **終了コードは変えない**。レビューのための紙で CI を落とすと、好みの強制になる

### どこに何の画面があるか（`index`）

定義が増えると**どこに何があるか**が分からなくなる。grep では「その画面が何をするか」が出て
こないので、YAML を開いて読むことになる。

```
$ npx hatake index definitions/ --by size
画面 18 枚（規模の大きい順）:
 15  customer_form      顧客入力      1件の入力                     definitions/customer_form.yaml
 15  customer_master    顧客マスタ    検索＋一覧＋登録・修正・削除  definitions/customer_master.yaml
 13  order_search       受注照会      照会（読み取り専用）          definitions/sales_app.yaml
```

中身は [`explain --brief`](#書けたものを読み返すexplain) の1行要約を集めたもの＝**説明の道具を
再利用**している（索引のために別の語彙を作ると、必ず本文とズレる）。それに「探すための語」を
添えるだけ。

* `--find "顧客 検索"` は**語の AND**。日本語の文をそのまま投げても当たらないので（分かち書き
  しないと語に切れない）、語を並べる形にしてある
* 探せるのは**現場の言葉と実装の言葉の両方**（ラベルの「得意先」でも、項目名の `customer` でも、
  `orderRepository` でも当たる）。種別は説明の語彙の長い言い方も入れてあるので、`master` の
  画面が「検索」で出る
* `app:` は**中の画面を1枚ずつ**数える（ファイル単位ではなく画面単位の索引）
* **綴り間違いのある定義も載せる**（索引から消すと余計に探せない）。読めない定義は黙って
  飛ばさず、不完全だと言って終了コード 1
* `--json` / `--out` はそのまま機械に渡せる形（AI に「近い画面」を探させる入口）

#### 索引はどのエディションにもある

索引が要るのは「定義の山を持っている側」なので、CLI だけに在ると**アプリの中からは使えない**
（Flutter アプリが自分の画面を探せない）。同じものを Dart 版と Java 版にも置いてある。

```dart
// Dart（hatake_core）— 解析済みの画面から。画面選択やジャンプ窓はこれで作る
final index = ScreenIndex.ofApp(app);
for (final screen in index.search('顧客 検索')) print(screen.brief);

// Dart（hatake_yaml）— 定義の文字列の山から
final index = buildScreenIndex([IndexInput('sales_app.yaml', source)]);
print(renderScreenIndex(index.bySize(), showSize: true));
```

```java
// Java（io.hatake.core）
ScreenIndex index = ScreenIndex.build(List.of(new ScreenIndex.Source("sales_app.yaml", source)));
System.out.println(ScreenIndex.render(index.search("顧客 マスタ"), true, false));
```

3つのエディションで**同じ語**を使う（種別の見出し語は [`spec/vocabulary.json`](../spec/vocabulary.json)
が正で、各エディションはそれを転記し、一致することを各エディションの試験が見ている）。同じ定義の
山なら枚数も同じになる。違うのは**バックエンド版がボタン（actions）を持たない**ことだけで、
そのぶん要約に「ボタン n」は出ず、ボタン名では探せない。

### 画面と遷移を図にする（`diagram`）

```bash
npx hatake diagram app.yaml --out app.svg    # 画面とメニューと遷移
npx hatake diagram app.yaml --json           # 元データだけ（手で直してから描ける）
npx hatake diagram docs/diagrams/architecture.json --out architecture.svg
```

段は「メニューから開ける画面 → そこから `navigate` で開く画面 → …」。この並べ方にすると
**どこからも開けない画面**（メニューにも遷移先にも無い）が自然に落ちてくるので、そこだけ別に
出す。画面が増えると一覧では気づけないやつ。

段のあいだは**1本ずつ線を引く**（→ [受注アプリの遷移図](../docs/diagrams/sales-app-flow.svg)）。
まとめて1本の矢印にすると「AとBのどちらから開くのか」が読めないため。線を引けるのは隣り合う行の
あいだだけなので、段の中は**次の段へ進む画面を後ろに**置く。それでも引けない遷移（同じ段の中・
戻り・行が離れている）は**文で全部挙げる**＝図に出ていない遷移を黙って落とさない（線が無い＝
遷移が無い、と読まれるのが一番まずい）。

* 1枚の画面の中身は図にしない（`explain` のほうが読める）。図は「画面が増えたときの遷移」用
* **描画は資料の図解と同じ1本**（[`diagram.ts`](src/diagram.ts)）。定義から作る図と手で書く図で
  描画を2本持つと、必ず片方が古くなる。同梱の図解（[`docs/diagrams/`](../docs/diagrams/)）も
  このコマンドで描いていて、コミットしてある SVG と一致することを CI で見ている
* 文字幅は測らずに数えていて、**枠から溢れたら描かずに落ちる**。ただし定義から作る図は長さが
  定義次第なので、そこは**入る幅で行に割る**（機械が作る図で落ちるのは道具側の責任）

#### 権限を重ねる

**ページに `roles` は書けない。** 権限が書けるのはメニュー項目とボタン（と列・項目・カード）
なので、「この画面は誰に見えるか」は**入口から辿って**しか出せない。図はそれを数えて箱の中に
書く（→ [権限つきの遷移図](../docs/diagrams/roles-app-flow.svg)、
[admin で通れる道](../docs/diagrams/roles-app-admin.svg)）。

1枚ずつ読んでも出ないのが、この2つ。

| 色 | 意味 | なぜ1枚では出ないか |
|---|---|---|
| **赤枠** | 誰でも開けて、消す・持ち出すができる画面 | 1枚だと「`roles` の無いボタン」に見える。まずいのは**そこへ誰でも来られる**ときだけ |
| **点線** | **誰も開けない画面** | 入口の権限が食い違っている（admin だけの画面に manager だけのボタンで繋いだ、など）。定義は通るし、画面を見ても気づけない |

```bash
npx hatake diagram app.yaml --role admin --out admin.svg
```

`--role` を渡すと**その役割で通れる道**だけの図になる（開けない画面は点線、通れない扉は薄い
線で残す＝扉が在ること自体は消さない）。**知らない役割名はエラー**にする（綴り違いを黙って
通すと「全部開ける」に見えて、一番まずい読み違えになる）。

数え方は素直な繰り返し（不動点）で、遷移に輪があっても止まる。グループの `roles` は中身にも
掛かる（見えないグループの中の画面は開けない）。

### 意味を変えずに短くする（`minimize`）

AI に書かせた定義は冗長になる（`type: text`、`required: false`、`validators: []`）。冗長な定義は
レビューが重くなり、次に AI が読むときのコンテキストも太る。

```
$ npx hatake minimize spec/examples/customer_form.yaml > short.yaml
7 件の指定を落としました（66 行 から 64 行）:
  page.form.sections[0].fields[0].type = "text"   （既定値と同じ）
  page.key = "id"   （既定値と同じ）
  …
※ 解析後のモデルが1バイトも変わらないことを1件ずつ確かめています（変わるものは落としません）。
```

安全のために門を2つ通す。

1. 落とす候補は「**スキーマの既定値と同じ値**」と「**空の配列・空のオブジェクト**」だけ。既定値は
   [リファレンス](../spec/reference.json)（スキーマから毎回作る）から引くので、手で書いた表が
   古くなることがない。必須キーは候補にしない（スキーマ検証に落ちる形にしない）
2. 1つ落とすたびに**解析後のモデルが1バイトも変わらないこと**を確かめ、変わったら戻す。
   「既定値だと思っていたものが実は違った」ときは何も起きない

出力は**落とす所だけを文字列から切る**（Document を作り直して書き戻さない）。コメントも折り返しも
改行コードもそのままで、差分が「消えた行」だけになる。`dsl_version` は既定値と同じでも残す
（版は必ず持つのが決めごと）。書き間違いのある定義は最小化しない（**知らないキーを黙って落とす
道具**になると、綴り間違いが「短くなった」として消える）。

## MCP サーバ（`hatake-mcp`）

AI エージェントに「仕様を引く・例を取る・検証する」をやらせるための MCP サーバも同梱。**依存ゼロで手書き**（stdio の JSON-RPC 2.0 で、必要なのは `initialize` / `tools/list` / `tools/call` だけなので）。

```bash
npm run build
claude mcp add hatake -- node "$PWD/dist/mcp.js"      # Claude Code の場合
```

道具は `hatake_reference` / `hatake_examples` / `hatake_validate` / `hatake_new_page` / `hatake_pitfalls` / `hatake_diff` / `hatake_explain` / `hatake_fix` / `hatake_minimize` / `hatake_refs` / `hatake_api_shape` の11個で、CLI と同じ関数を呼んでいる（＝同じ答えになる）。`hatake_explain` は `before` を渡せば変更の言い直し、`brief: true` なら1行（道具を増やすより、同じ道具の引数で足りる）。入れ方と使う順番は [MCP ガイド](../docs/guide/mcp.ja.md)。

## 開発（Docker）

ローカルに Node を入れず、Docker で回す。

```bash
docker run --rm -v "$PWD:/app" -w /app/typescript node:22-slim \
  sh -c "npm install && npm run typecheck && npm test"
```

CLI を試すときは `npm run build` してから `node dist/cli.js …`。

## これから

`QuerySpec` を各 ORM に変換するアダプタ（opt-in・別パッケージ）、`detail` ページのレスポンス形の導出（今は読み取り専用なので request を出さない）あたり。UI 由来の項目（layout や描画ヒント）はバックエンドは無視する。コア本体はこの先もフレームワーク非依存を維持する。

ライセンス: Apache-2.0
