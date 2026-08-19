# hatake-core — Java 版 🌱

[hatake](../README.md) の **Java 版**。Flutter 版がフロントで画面を描くのに対して、こっちは**バックエンド寄り**。同じ [DSL 仕様](../spec/dsl-spec.ja.md) を読んで、**API のロジック**（まずはサーバ側バリデーション）に使う。

狙いは「Flutter のフォームを描くのと同じ YAML で、Java の API のリクエスト検証もやる」。フロントとバックでバリデーションがずれない、ってやつ。

## 今あるもの

- **定義モデル + パーサ** … `spec/` と同じ DSL を YAML / JSON から読む（`DefinitionParser.parsePageYaml` / `parsePageJson`）。JSON は YAML の一部なので同じ経路で読めて、結果は一致する（テスト済み）。
- **FormValidator** … フォーム定義からサーバ側バリデーション。組込ルール（required / maxLength / minLength / min / max / pattern / email）＋ `ValidatorRegistry` で独自ルールも足せる。
- **QueryBuilder** … 検索フィルタ定義 + リクエストの params から、フレームワーク非依存の `QuerySpec`（conditions / sort / pagination）を組み立てる。**フィルタに無い項目は無視（許可リスト方式）**なので、任意項目での検索を弾ける。
- **FormatterRegistry / ConverterRegistry** … Flutter版と同名・同挙動。formatter（currency / percent / date / wareki / postal / mask）で帳票・CSV 出力を整形、converter（toHankaku / toZenkaku / hiraToKata / kataToHira / trim / collapseSpaces / parseNumber）で入力正規化。`postalCode` バリデータも。
- **画面の索引** … 定義の山から「どこに何の画面があるか」を引く（`ScreenIndex.build` / `search` / `render`）。1行の要約（`ScreenBrief`）＋探すための語で、TypeScript 版の `npx hatake index` と同じもの。種別の言い方は [`spec/vocabulary.json`](../spec/vocabulary.json) が正で、この版はそれを転記している（一致は試験で見る）。**この版はボタン（actions）を持たない**ので、要約に「ボタン n」は出ず、ボタン名では探せない。
- **JPA アダプタ（opt-in）** … `QuerySpec` を JPQL 文字列＋バインドパラメータ＋ページングへ翻訳する `JpaQueryTranslator`（`io.hatake.core.adapter`）。**JPA への依存は持たない**（＝本体に依存を持ち込まない、純粋な翻訳）。実行は利用者の `EntityManager` で。

```java
var page = DefinitionParser.parsePageYaml(yamlText);
var result = new FormValidator().validate(page.form(), requestBody);
if (!result.valid()) {
    // result.errors() を 400 で返すなど
}
```

```java
// 画面の索引（どこに何の画面があるか）
var index = ScreenIndex.build(List.of(new ScreenIndex.Source("sales_app.yaml", yamlText)));
System.out.println(ScreenIndex.render(index.search("顧客 マスタ"), true, false));
```

## 開発（Docker）

ローカルに JDK / Gradle を入れず、Docker で回す。

```bash
docker run --rm -v "$PWD:/app" -w /app/java gradle:jdk21 gradle test --no-daemon
```

```java
var page = DefinitionParser.parsePageYaml(yamlText);
var spec = QueryBuilder.build(page.search(), requestParams); // conditions / sort / pagination

// JPA アダプタ（opt-in）で JPQL に翻訳。実行は利用者の EntityManager。
var q = JpaQueryTranslator.translate("Customer", spec);
var query = em.createQuery(q.jpql(), Customer.class)
    .setFirstResult(q.firstResult())
    .setMaxResults(q.maxResults());
q.parameters().forEach(query::setParameter);
var rows = query.getResultList();
```

## これから

他 ORM のアダプタ（MyBatis / jOOQ …）、DTO / レスポンス形の生成あたり。UI 由来の項目（描画ヒント）はバックエンドは無視する。コア本体はこの先もフレームワーク非依存を維持する。JPA アダプタは依存ゼロの純翻訳なので当面コア同梱、必要になれば別 artifact へ切り出す。

ライセンス: Apache-2.0
