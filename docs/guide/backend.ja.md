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

> **Phase 1 の範囲**: `DtoSpec` の導出まで。JSON Schema / OpenAPI / ネイティブ型の出力
> （emitter）は次段です。`options` → enum も未対応（Java の定義モデルに `options` が
> 無いため。提案書に記録済み）。

## 押さえておくこと

- **`QuerySpec` はフレームワーク中立**。SQL/ORM への変換はアダプタの領分（Java の JPA が1個目。MyBatis / Prisma 等は今後）
- **許可リスト方式**：`search.filters` に宣言されていない項目は無視されるので、クライアントが任意カラムで検索することはできない
- **描画寄りのキーはバックエンドは無視**（`format` の一部・レイアウト等）。同じ定義でも層ごとに使う部分が違うだけ
- **3言語で同名・同出力**を [コンフォーマンステスト](../../spec/conformance/) で機械担保（`formatters` / `converters` / `validators` / `queries` / `dto_spec` / 各util）
- Java 版の定義モデルは**目録レベル**（page 識別子＋search＋table＋form、`app:` は menu＋`PageRef`）。フル描画モデルは Flutter 側だけ

## 対応状況

| 機能 | Java | TypeScript |
|---|---|---|
| 定義モデル＋YAML/JSON パーサ | ✅ | ✅ |
| FormValidator（＋独自ルール登録・メッセージ i18n） | ✅ | ✅ |
| QueryBuilder（`QuerySpec`） | ✅ | ✅ |
| `deriveDto`（`DtoSpec`） | ✅ | ✅ |
| Formatter / Converter / 日本企業util | ✅ | ✅ |
| `app:` パーサ（menu＋PageRef） | ✅ | ✅ |
| ORM アダプタ | ✅ JPA | ⏳ |

最新は [ロードマップのパリティ表](../roadmap.ja.md) が正。

## 配布

まだ未公開です（Dart は pub.dev 準備済み・未公開、npm / Maven は TODO）。当面はリポジトリを取り込んで使う形になります。方針は [ロードマップの配布セクション](../roadmap.ja.md)。
