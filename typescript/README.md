# @hatake/core — TypeScript 版 🌱

[hatake](../README.md) の **TypeScript 版**。フロントで画面を描く Flutter 版と違って、こっちは**バックエンド寄り**。同じ [DSL 仕様](../spec/dsl-spec.ja.md) の定義を読んで、**API のロジック**（サーバ側バリデーション・クエリ組み立て・API の形の生成）に使う。

要は「Flutter のフォームを描くのと同じ YAML で、Node の API のリクエスト検証もやる」ってやつ。フロントとバックでバリデーションがずれない。

**`hatake` CLI もここに入っている**（検証と生成が全部そろっている唯一の版なので）。→ [CLI](#cli)

## 今あるもの

- **定義モデル + パーサ** … `spec/` と同じ DSL を YAML / JSON から読む（`parsePageYaml` / `parsePageJson` / `parseAppYaml`）。YAML と JSON は同じ結果に収束する（テスト済み）。対応ページ種別は `crud` / `master` / `search` / `detail` / `form` / `wizard` / `dashboard` / `report`。
- **strict パース** … `parsePageYaml(source, { strict: true })` で**知らないキーを全部まとめて**エラーにする（近い既知キーの提案つき: `pagesize` → `pageSize`）。厳しさは JSON Schema と同一。
- **FormValidator** … フォーム定義からサーバ側バリデーション。組込ルール（required / maxLength / minLength / min / max / pattern / email / postalCode）＋ `ValidatorRegistry` で独自ルールも足せる。明細（`subTable`）の子行も検証（`lines[0].qty`）。
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
| `explain <file> [--page id]` | 定義を「この画面は何をするか」に開く（日本語）。DSL を知らない人がレビューするための出力 |

`reference` / `examples` は `spec/` を実行時に探す（`--spec <dir>` で明示もできる）。
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

## MCP サーバ（`hatake-mcp`）

AI エージェントに「仕様を引く・例を取る・検証する」をやらせるための MCP サーバも同梱。**依存ゼロで手書き**（stdio の JSON-RPC 2.0 で、必要なのは `initialize` / `tools/list` / `tools/call` だけなので）。

```bash
npm run build
claude mcp add hatake -- node "$PWD/dist/mcp.js"      # Claude Code の場合
```

道具は `hatake_reference` / `hatake_examples` / `hatake_validate` / `hatake_new_page` / `hatake_pitfalls` / `hatake_diff` / `hatake_explain` / `hatake_refs` / `hatake_api_shape` の9つで、CLI と同じ関数を呼んでいる（＝同じ答えになる）。入れ方と使う順番は [MCP ガイド](../docs/guide/mcp.ja.md)。

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
