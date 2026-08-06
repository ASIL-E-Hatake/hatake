# バックエンド連携（Java / TypeScript）

> **中身**: 同じ定義をサーバ側で何に使えるか。3つの用途と入口。
> **読むとき**: API 側を作るとき。導入・詳細は [java/README](../../java/README.md) / [typescript/README](../../typescript/README.md)。
> **原則**: フレームワーク非依存（Spring / Express / ORM に依存しない）。連携は opt-in アダプタ。

## 同じ定義を3つの用途で使う

| 用途 | 何をする | 呼ぶもの |
|---|---|---|
| **サーバ側バリデーション** | フロントと同じルールでリクエストを検証（**ズレが起きない**＝最大の価値） | `FormValidator` |
| **クエリ組み立て** | 検索フィルタ定義＋リクエストparams → フレームワーク非依存の `QuerySpec` | `QueryBuilder` |
| **ORM への変換** | `QuerySpec` → JPQL（＋バインドパラメータ・ページング） | `JpaQueryTranslator`（Java・opt-in） |
| **API の形の導出** | 画面定義 → リクエスト/レスポンス/クエリの形（`DtoSpec`） | `deriveDto` |
| **スキーマ出力** | `DtoSpec` → JSON Schema 2020-12（1ドキュメント） | `toJsonSchema` |
| **OpenAPI 出力** | `DtoSpec` → OpenAPI 3.1（paths＋components.schemas） | `toOpenApi` |

補助として、画面整形と同じ `FormatterRegistry` / `ConverterRegistry`（帳票・CSV出力の整形、入力正規化）、日本企業util（`computeTax` / `fiscal*` / `eraOf` …）、ナビ定義パーサ（`parseApp*`）も同名で使えます。

## Java

```java
var page = DefinitionParser.parsePageYaml(yamlText);

// ① 検証
var result = new FormValidator().validate(page.form(), requestBody);
if (!result.valid()) { /* result.errors() を 400 で返す */ }

// ② クエリ（フィルタ定義に無い項目は無視＝許可リスト方式）
var spec = QueryBuilder.build(page.search(), requestParams);

// ③ JPA へ（opt-in・JPA 非依存の純翻訳）
var q = JpaQueryTranslator.translate("Customer", spec);
var query = em.createQuery(q.jpql(), Customer.class)
    .setFirstResult(q.firstResult()).setMaxResults(q.maxResults());
q.parameters().forEach(query::setParameter);
```

## TypeScript

```ts
const page = parsePageYaml(yamlText);
const result = new FormValidator().validate(page.form, requestBody);
const spec = buildQuery(page.search, requestParams);   // → QuerySpec
const dto = deriveDto(page);                           // → DtoSpec
const schema = toJsonSchema(dto);                      // → JSON Schema 2020-12
const api = toOpenApi(dto, { basePath: "/api/customers" });  // → OpenAPI 3.1
```

## DtoSpec（API の形の導出）

画面定義には API の入出力形がすでに書いてあります。`deriveDto(page)` はそれを
**フレームワーク非依存の `DtoSpec`** にします（`QuerySpec` と同じ立ち位置。ここから
JSON Schema / OpenAPI / 型定義を吐くのは emitter の役目で、本体は依存を持ちません）。

| 由来 | 出る形（`role`） |
|---|---|
| `form.fields`（wizard は全ステップ） | `request` — `computed` と `readOnly` は除外 |
| `table.columns` | `row`、および `listResponse`＝`{items, totalCount}`（`Repository` の契約に一致） |
| `search.filters` | `queryParams` — 全部 optional。`operator: between` は `[開始,終了]` の配列 |
| `key` | `pathParams` |
| `subTable`（埋め込み） | 親に `array<object>` メンバ＋子の形（`child`）。`source` 付きは**親に入らず**子の形だけ出る |

`validators` は `constraints` に翻訳されます（`maxLength` / `minLength` / `minimum` /
`maximum` / `pattern` / `format`）。`date` 系は `format` に、`email` / `postalCode` は
それぞれ `format: email` / `pattern` になるので、生成物をそのまま入力チェックに使えて
`FormValidator` と二重管理になりません。

形の並び順は固定です（request → row → listResponse → queryParams → pathParams → 子の形）。
対象は **Java / TypeScript のみ**です（DTO はバックエンドの関心。Flutter 側は境界が
`DataRecord`＝Map で、framework 内に DTO を詰める場所がありません）。詳細と段階は
[提案書](../proposals/dto-generation.ja.md)。

### JSON Schema を吐く（`toJsonSchema`）

`DtoSpec` を **JSON Schema 2020-12 のドキュメント1本**にします。全部の形が `$defs` に入るので、
形どうしが `$ref` で参照できます（一覧レスポンス→行、リクエスト→明細の行）。

```java
var schema = JsonSchemaEmitter.toJsonSchema(DtoDeriver.deriveDto(page));  // Map<String,Object>
```

戻りは素の Map / オブジェクトです。JSON 文字列化は呼び出し側の責務にしてあるので、
**hatake 本体は JSON ライブラリに依存しません**（`QuerySpec` → アダプタと同じ流儀）。

決めごと:

| ルール | 内容 |
|---|---|
| `required` | `optional: false` のメンバを列挙。空のときはキー自体を出さない |
| **受け取る形は閉じる** | `request` / `queryParams` / `pathParams` / `child` は `additionalProperties: false`。想定外のキーはエラー |
| **返す形は開けておく** | `row` / `listResponse` は制限しない。バックエンドが項目を増やしても読み手が壊れない |
| 配列の制約 | `maxLength` / `format` 等は**要素側（`items`）**に載る。配列そのものには載らない |

出力が本当に妥当なスキーマか、そして実際に期待どおり通す/弾くかは
`spec/tools/check_dto_schema.py` が独立に検証しています（2言語のコンフォーマンスだけでは
「両方が同じ間違いをしている」を検出できないため）。CI でも走ります。

### OpenAPI を吐く（`toOpenApi`）

`DtoSpec` を **OpenAPI 3.1** のドキュメントにします。

```java
var api = OpenApiEmitter.toOpenApi(
        DtoDeriver.deriveDto(page),
        OpenApiEmitter.Options.basePath("/api/customers"));   // Map<String,Object>
```

**3.0 ではなく 3.1** を選んでいます。3.1 の Schema Object は *JSON Schema 2020-12 そのもの*
なので、Phase 2 の出力をそのまま埋め込めます（3.0 だと `nullable` や `exclusiveMinimum` の
書き換えが必要で、Phase 2 の出力と乖離します）。

**`basePath` は呼び出し側が渡します。** DSL は URL を知りません（定義がトランスポートに
依存してはいけないため）。ページ id や `repository` キーからの推測もしません。
**渡さなければ `components.schemas` だけ**を出します（＝文字どおりの「断片」）。

出す操作は「必要な形が存在するときだけ」です:

| 操作 | 必要な形 | 生成されるもの |
|---|---|---|
| `GET {basePath}` | listResponse（＝`table.columns`） | ページの絞り込み条件＋**`RepositoryQuery` の契約**（`page`/`pageSize`/`sortField`/`sortAscending`）をクエリに、200 → 一覧 |
| `POST {basePath}` | request | 201 → response、400 → `ValidationErrorResponse` |
| `GET {basePath}/{key}` | response | 200 → response、404 |
| `PUT {basePath}/{key}` | request | 200 → response、400、404 |
| `DELETE {basePath}/{key}` | request | 204、404 |

だから読み取り専用の `search` ページは**一覧だけ**、`form` / `wizard` ページは一覧なしになります。
`ValidationErrorResponse` は `ValidationResult`（`{valid, errors: [{field, message}]}`）に一致し、
リクエストを受け取るページにだけ足されます。

出力が妥当な OpenAPI 3.1 か、操作・パラメータ・`$ref` の約束を守れているかは
`spec/tools/check_openapi.py` が独立に検証します（CI 込み）。

> **ここまでの範囲**: `DtoSpec` の導出（Phase 1）＋ JSON Schema 出力（Phase 2）＋
> OpenAPI 3.1 出力（Phase 3）。ネイティブ型出力（TS `interface` / Java `record`）は Phase 4 です。
> 既知の未対応: `options` → enum（Java の定義モデルに `options` が無いため）、
> `master` / `detail` ページ（TS 版パーサが未サポート）、`operator: between` の配列の要素数
> （`DtoSpec` が「between 由来」を保持しないため）。いずれも提案書に記録済み。

## 押さえておくこと

- **`QuerySpec` はフレームワーク中立**。SQL/ORM への変換はアダプタの領分（Java の JPA が1個目。MyBatis / Prisma 等は今後）
- **許可リスト方式**：`search.filters` に宣言されていない項目は無視されるので、クライアントが任意カラムで検索することはできない
- **描画寄りのキーはバックエンドは無視**（`format` の一部・レイアウト等）。同じ定義でも層ごとに使う部分が違うだけ
- **3言語で同名・同出力**を [コンフォーマンステスト](../../spec/conformance/) で機械担保（`formatters` / `converters` / `validators` / `queries` / `dto_spec` / `dto_json_schema` / `dto_openapi` / 各util）
- Java 版の定義モデルは**目録レベル**（page 識別子＋search＋table＋form、`app:` は menu＋`PageRef`）。フル描画モデルは Flutter 側だけ

## 対応状況

| 機能 | Java | TypeScript |
|---|---|---|
| 定義モデル＋YAML/JSON パーサ | ✅ | ✅ |
| FormValidator（＋独自ルール登録・メッセージ i18n） | ✅ | ✅ |
| QueryBuilder（`QuerySpec`） | ✅ | ✅ |
| `deriveDto`（`DtoSpec`） | ✅ | ✅ |
| `toJsonSchema`（JSON Schema 出力） | ✅ | ✅ |
| `toOpenApi`（OpenAPI 3.1 出力） | ✅ | ✅ |
| Formatter / Converter / 日本企業util | ✅ | ✅ |
| `app:` パーサ（menu＋PageRef） | ✅ | ✅ |
| ORM アダプタ | ✅ JPA | ⏳ |

最新は [ロードマップのパリティ表](../roadmap.ja.md) が正。

## 配布

まだ未公開です（Dart は pub.dev 準備済み・未公開、npm / Maven は TODO）。当面はリポジトリを取り込んで使う形になります。方針は [ロードマップの配布セクション](../roadmap.ja.md)。
