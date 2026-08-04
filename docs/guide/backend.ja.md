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
```

## 押さえておくこと

- **`QuerySpec` はフレームワーク中立**。SQL/ORM への変換はアダプタの領分（Java の JPA が1個目。MyBatis / Prisma 等は今後）
- **許可リスト方式**：`search.filters` に宣言されていない項目は無視されるので、クライアントが任意カラムで検索することはできない
- **描画寄りのキーはバックエンドは無視**（`format` の一部・レイアウト等）。同じ定義でも層ごとに使う部分が違うだけ
- **3言語で同名・同出力**を [コンフォーマンステスト](../../spec/conformance/) で機械担保（`formatters` / `converters` / `validators` / `queries` / 各util）
- Java 版の定義モデルは**目録レベル**（page 識別子＋search＋form、`app:` は menu＋`PageRef`）。フル描画モデルは Flutter 側だけ

## 対応状況

| 機能 | Java | TypeScript |
|---|---|---|
| 定義モデル＋YAML/JSON パーサ | ✅ | ✅ |
| FormValidator（＋独自ルール登録・メッセージ i18n） | ✅ | ✅ |
| QueryBuilder（`QuerySpec`） | ✅ | ✅ |
| Formatter / Converter / 日本企業util | ✅ | ✅ |
| `app:` パーサ（menu＋PageRef） | ✅ | ✅ |
| ORM アダプタ | ✅ JPA | ⏳ |

最新は [ロードマップのパリティ表](../roadmap.ja.md) が正。

## 配布

まだ未公開です（Dart は pub.dev 準備済み・未公開、npm / Maven は TODO）。当面はリポジトリを取り込んで使う形になります。方針は [ロードマップの配布セクション](../roadmap.ja.md)。
