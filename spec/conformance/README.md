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

`value` の日付は ISO の日付文字列（`"2026-07-22"`）で渡す（各言語が同じ解釈をするため）。

## 各言語の consumer（同じ fixture を読む）

| 版 | テスト | fixture への相対パス（テスト実行 CWD 基準） |
|---|---|---|
| Flutter/Dart | `flutter/packages/hatake_core/test/conformance_test.dart` | `../../../spec/conformance` |
| TypeScript | `typescript/test/conformance.test.ts` | `../spec/conformance` |
| Java | `java/src/test/java/io/hatake/core/ConformanceTest.java` | `../spec/conformance` |

新しい formatter/converter/validator を足したら、まずここに期待値を書いてから各言語を実装する（spec 先行）。
