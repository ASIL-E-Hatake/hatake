# @hatake/core — TypeScript 版 🌱

[hatake](../README.md) の **TypeScript 版**。フロントで画面を描く Flutter 版と違って、こっちは**バックエンド寄り**。同じ [DSL 仕様](../spec/dsl-spec.ja.md) の定義を読んで、**API のロジック**（まずはサーバ側バリデーション）に使う。

要は「Flutter のフォームを描くのと同じ YAML で、Node の API のリクエスト検証もやる」ってやつ。フロントとバックでバリデーションがずれない。

## 今あるもの

- **定義モデル + パーサ** … `spec/` と同じ DSL を YAML / JSON から読む（`parsePageYaml` / `parsePageJson`）。YAML と JSON は同じ結果に収束する（テスト済み）。
- **FormValidator** … フォーム定義からサーバ側バリデーション。組込ルール（required / maxLength / minLength / min / max / pattern / email）＋ `ValidatorRegistry` で独自ルールも足せる。
- **buildQuery** … 検索フィルタ定義 + リクエストの params から、フレームワーク非依存の `QuerySpec`（conditions / sort / pagination）を組み立てる。**フィルタに無い項目は無視（許可リスト方式）**なので、任意項目での検索を弾ける。
- **FormatterRegistry / ConverterRegistry** … Flutter版と同名・同挙動。formatter（currency / percent / date / wareki / postal / mask）で帳票・CSV 出力を整形、converter（toHankaku / toZenkaku / hiraToKata / kataToHira / trim / collapseSpaces / parseNumber）で入力正規化。`postalCode` バリデータも。

```ts
import { parsePageYaml, FormValidator } from "@hatake/core";

const page = parsePageYaml(yamlText);
const result = new FormValidator().validate(page.form, requestBody);
if (!result.valid) return res.status(400).json({ errors: result.errors });
```

## 開発（Docker）

ローカルに Node を入れず、Docker で回す。

```bash
docker run --rm -v "$PWD:/app" -w /app/typescript node:22-slim \
  sh -c "npm install && npm run typecheck && npm test"
```

```ts
import { parsePageYaml, buildQuery } from "@hatake/core";

const page = parsePageYaml(yamlText);
const spec = buildQuery(page.search, req.query); // { conditions, sort, page, pageSize }
// spec を Prisma / TypeORM / 生SQL に変換するのはアダプタ側（opt-in）
```

## これから

`QuerySpec` を各 ORM に変換するアダプタ（opt-in・別パッケージ）、DTO / レスポンス形の生成あたり。UI 由来の項目（layout や描画ヒント）はバックエンドは無視する。コア本体はこの先もフレームワーク非依存を維持する。

ライセンス: Apache-2.0
