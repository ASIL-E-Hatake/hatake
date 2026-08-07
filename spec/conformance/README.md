# hatake コンフォーマンス・スイート

言語非依存の fixture（入力 + 期待出力）。**各言語版のテストがこの同じ JSON を食って、出力が一致するか**を機械確認する。「Java だけ挙動が違う」を防ぐための単一の真実。

## ファイル

| ファイル | 対象 | ケースの形 |
|---|---|---|
| `formatters.json` | FormatterRegistry | `{ name, value, options?, expected }` |
| `converters.json` | ConverterRegistry | `{ name, value, expected }`（数値も文字列比較） |
| `validators.json` | ValidatorRegistry | `{ type, params?, value, valid, message? }` |
| `queries.json` | QueryBuilder（TS/Java のみ。Flutter は QueryBuilder 非対象） | `{ filters, params, expected: { conditions, sortField, sortAscending, page, pageSize } }` |
| `tax.json` | 消費税 `computeTax`（3言語） | `{ amount, rate, included?, rounding?, expected: { net, tax, gross } }` |
| `fiscal.json` | 年度/四半期/半期（3言語） | `{ date, startMonth?, expected: { year, quarter, half } }` |
| `age.json` | 年齢/勤続 `ageAt`・`tenure`（3言語） | `{ from, to, years, months }` |
| `businessday.json` | 営業日（3言語、祝日は注入） | `{ date, holidays, expected: { isBusinessDay, next, prev } }` |
| `era.json` | 元号算出 `eraOf`（3言語） | `{ date, expected: { name, abbr, year } }` |
| `invoice.json` | 税率別合計 `computeInvoice`（3言語） | `{ lines: [{amount, rate}], included?, rounding?, expected: { byRate: [{rate,net,tax,gross}], total } }`（byRate は税率昇順） |
| `conditions.json` | 条件表示 `evaluateCondition`（3言語） | `{ condition, record, expected: bool }` |
| `computed.json` | 計算項目 `ComputedRegistry.compute`（3言語） | `{ computed, record, expected }`（数値は数値比較） |
| `access.json` | 権限制御 `isAllowed`（3言語） | `{ roles, userRoles, expected: bool }` |
| `strict_keys.json` | 未知キーの検出（strict パース、3言語） | `{ cases: [{ name, document, expected: [{path,key,suggestion}] }] }`。`expected` は `(path, key)` の昇順。`suggestion` は「大文字小文字を無視した編集距離2以下で最も近い既知キー（同点はアルファベット順）」で無ければ `null`。**各版のキー表がスキーマとズレていないことは別テストで確認**（Dart `strict_keys_schema_test.dart` / TS `strictKeys.test.ts` / Java `StrictParseTest`） |
| `csv.json` | CSV 出力 `toCsv`（3言語） | `{ cases: [{ name, columns, rows, options?, expected }] }`。`expected` は出力文字列そのもの（改行・BOM・引用を含む） |
| `report.json` | 帳票の組み立て `buildReport`（3言語） | `{ cases: [{ name, page, rows, expected }] }`。`expected` は**紙ごとの行の配列**で、1ブロック=1行の文字列に潰して比較する（`encoding` フィールドに書式あり）。数値は整数値なら小数点なしに正規化 |
| `dashboard_aggregate.json` | ダッシュボードの集約 `AggregateRegistry`（3言語） | 配列ではなくオブジェクト: `{ aggregate: [{ name, op, field?, rows, expected }], groupBy: [{ name, op, labelField, valueField?, rows, expected: [{label,value}] }] }`。数値は**整数値なら小数点なし**に正規化した文字列で比較（`200` と `200.0` を吸収）。`groupBy` は**ラベルの初出順**で比較 |
| `subtable_validation.json` | 親子・明細の**子行バリデーション**（3言語） | 配列ではなくオブジェクト: `{ page, cases: [{ name, record, expected: [{field,message}] }] }`。`page` を各言語のパーサで読み、`record` を検証して**エラー集合**（順不同）を比較。子行のエラーは `<field>[<index>].<rowField>` 形式（例 `lines[0].qty`） |
| `subtable_source_validation.json` | `source` 付き（子Repository方式）の `subTable` を親の検証が**まるごと飛ばす**こと（3言語） | `subtable_validation.json` と同じ形 |
| `wizard_validation.json` | ステップ入力の**ステップ単位検証**（3言語） | `{ page, cases: [{ name, step, record, expected }] }`。`step` が id ならそのステップのフォームだけ、`null` なら全ステップを畳んだフォームを検証 |
| `dto_spec.json` | `deriveDto`（API の形の導出。**TS/Java のみ**、Flutter は非対象） | `{ cases: [{ name, page, expected: { page, shapes } }] }`。形は順序どおり比較。制約値は文字列比較で言語差を吸収 |
| `dto_json_schema.json` | `toJsonSchema`（`DtoSpec` → JSON Schema 2020-12。**TS/Java のみ**） | `{ cases: [{ name, page, expected }] }`。`expected` は出力ドキュメントそのもの。スカラは再帰的に文字列化して比較。**加えて `spec/tools/check_dto_schema.py` が「出力が妥当なスキーマか」「実際に通す/弾くか」を独立検証**（2言語が同じ間違いをするのを防ぐ） |
| `dto_openapi.json` | `toOpenApi`（`DtoSpec` → OpenAPI 3.1。**TS/Java のみ**） | `{ cases: [{ name, options, page, expected }] }`。`options.basePath` は呼び出し側が渡す値。スカラは再帰的に文字列化して比較。**`spec/tools/check_openapi.py` が「妥当な OpenAPI 3.1 か」「操作・パラメータ・`$ref` の約束を守っているか」を独立検証** |
| `dto_native_types.json` | `toTypeScript` / `toJavaRecords`（ネイティブ型出力。**TS/Java のみ**） | `{ cases: [{ name, page, javaOptions, typescript: [行], java: { "X.java": [行] } }] }`。**両ターゲットを両エディションから出す**ので、生成ソースがバイト一致することを確認できる。さらに Java 側は `GeneratedJavaCompilesTest` が javac に通し、TS 側は `generatedTypesCompile.test.ts` が tsc に通す（生成コードが壊れていないことの独立検証） |

`value` の日付は ISO の日付文字列（`"2026-07-22"`）で渡す（各言語が同じ解釈をするため）。

## 各言語の consumer（同じ fixture を読む）

| 版 | テスト | fixture への相対パス（テスト実行 CWD 基準） |
|---|---|---|
| Flutter/Dart | `flutter/packages/hatake_core/test/conformance_test.dart` | `../../../spec/conformance` |
| Flutter/Dart（`subtable_*` / `wizard_*` / `report` / `strict_keys` のみ。ページ解析が必要なため `hatake_yaml` 側） | `flutter/packages/hatake_yaml/test/conformance_subtable_test.dart`・`conformance_wizard_test.dart`・`conformance_report_test.dart`・`conformance_strict_keys_test.dart` | `../../../spec/conformance` |
| TypeScript | `typescript/test/conformance.test.ts`（`dashboard_aggregate` は `conformanceAggregate.test.ts`、`csv`/`report` は `conformanceOutput.test.ts`、`strict_keys` は `strictKeys.test.ts`） | `../spec/conformance` |
| Java | `java/src/test/java/io/hatake/core/ConformanceTest.java`（`dashboard_aggregate` は `AggregateConformanceTest.java`、`csv`/`report` は `OutputConformanceTest.java`、`strict_keys` は `StrictKeysConformanceTest.java`） | `../spec/conformance` |

新しい formatter/converter/validator を足したら、まずここに期待値を書いてから各言語を実装する（spec 先行）。
