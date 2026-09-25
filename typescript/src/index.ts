// @hatake-fw/api — TypeScript edition.
//
// **ここから出ているものだけが「約束」です。** 名前も形も、1.0 のあとは変えません。
// 一覧は [`spec/public-api.ts.json`](../../spec/public-api.ts.json) に在り、試験が
// 完全一致を見ます（増えても減っても落ちる）。
//
// 枠組みの中身は `@hatake-fw/api/internal` から**そのまま使えます**が、
// そちらは**約束しません**（名前も形も断りなく変わります）。
//
// **なぜ2つに分けたか。** ここが 142 モジュールを `export *` で丸ごと出していたので、
// **内部に定数を1つ足すだけで公開 API が1つ増えて**いました（8日で 586 → 588、
// どちらも検証規則の内部の表）。全部を約束すると、人に見せる字を良くするだけで
// 「約束を破った」ことになります。かといって隠すと、中身を使いたい人の道が消える。
// だから**道は残して、約束だけを分け**ました。
//
// ここに足すときの線引きは3つ。ひとつでも外れるなら `internal` に置きます:
//
//   ・**手引きが名前で案内している**（`docs/guide/backend.ja.md` の表）
//   ・**呼ぶ相手が業務のコード**である（枠組みの中から呼ぶだけの道具ではない）
//   ・**中身が変わっても名前と形が変わらない**と言い切れる

// ── 定義を読む ────────────────────────────────────────────────
// YAML / JSON / 素の地図から。読めない版は落とす（`dsl_version` の門番）。
export {
  DefinitionParseError,
  UnknownKeysError,
  parsePageJson,
  parsePageMap,
  parsePageYaml,
  type ParseOptions,
} from "./parse.js";
export { parseAppJson, parseAppMap, parseAppYaml } from "./appParse.js";
export { parseAppSource } from "./explainSource.js";
export { checkDslVersion } from "./dslVersion.js";

// ── 定義の形（読んだ結果を受け取る型） ──────────────────────────
export {
  kDslVersion,
  type AppDefinition,
  type ColumnDefinition,
  type FieldDefinition,
  type FilterDefinition,
  type FormDefinition,
  type PageDefinition,
  type SearchDefinition,
  type TableDefinition,
} from "./definition.js";

// ── サーバ側の検証（画面と同じ規則でリクエストを見る） ──────────
// 3版そろえている所。**画面の検証は親切であって守りではない**ので、ここが要る。
export {
  FormValidator,
  type ValidationError,
  type ValidationResult,
} from "./formValidator.js";
export { ValidatorRegistry } from "./validators.js";

// ── 問い合わせの組み立て（定義に書いた条件だけを通す） ──────────
export { buildQuery, type QueryCondition, type QuerySpec } from "./query.js";

// ── API の形（画面定義 → 受け口の宣言） ────────────────────────
export { deriveDto, type DtoMember, type DtoShape, type DtoSpec } from "./dto.js";
export { toJsonSchema } from "./jsonSchema.js";
export { toOpenApi } from "./openApi.js";
export { toJavaRecords, toTypeScript } from "./types.js";

// ── 整形・変換（画面と同じ字をサーバでも出す） ──────────────────
export { FormatterRegistry } from "./formatter.js";
export { ConverterRegistry } from "./converter.js";
export { ComputedRegistry } from "./computed.js";
export { AggregateRegistry } from "./aggregate.js";
export { toCsv, type CsvOptions } from "./csv.js";

// ── 一括の上限（1回で動かせる行数） ────────────────────────────
export { checkBulkLimit } from "./bulkLimit.js";

// ── 日本企業 util（3版で同じ答えになることを conformance が縛る） ──
export { ageAt, tenure } from "./age.js";
export { eraOf } from "./era.js";
export { fiscalQuarter, fiscalYear } from "./fiscal.js";
export { isBusinessDay, nextBusinessDay, prevBusinessDay } from "./businessDay.js";
export { computeInvoice, computeTax } from "./tax.js";
