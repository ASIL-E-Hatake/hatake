// 一覧・帳票の CSV 出力。列 + 行 → 文字列。Dart / Java 版と同結果。
//
// 既定では列の format を通した表記で書く（画面と同じ見た目）。Excel で計算
// させたいときは raw: true。文字コード変換は Framework の外＝出力先の責務。

import { type ColumnDefinition } from "./definition.js";
import { FormatterRegistry } from "./formatter.js";

/** CSV の書き方。既定は Excel（日本語 Windows）で開くのが楽な組み合わせ。 */
export interface CsvOptions {
  /** 見出し行（列ラベル）を出すか。 */
  header: boolean;
  /** 区切り文字。 */
  delimiter: string;
  /** 改行: `crlf`（既定）か `lf`。 */
  newline: string;
  /** 先頭に BOM を付けるか（Excel の文字化け対策）。 */
  bom: boolean;
  /** format を通さず生の値を書くか。 */
  raw: boolean;
}

export const defaultCsvOptions: CsvOptions = {
  header: true,
  delimiter: ",",
  newline: "crlf",
  bom: false,
  raw: false,
};

/** DSL の config（export アクション）から読む。 */
export function csvOptionsFromConfig(
  config: Record<string, unknown>,
): CsvOptions {
  return {
    header: typeof config.header === "boolean" ? config.header : true,
    delimiter: config.delimiter == null ? "," : String(config.delimiter),
    newline: config.newline == null ? "crlf" : String(config.newline),
    bom: config.bom === true,
    raw: config.raw === true,
  };
}

/**
 * rows を columns の順に CSV へ書き出す。列が無ければ空文字。
 * 区切り・引用符・改行を含む値は引用し、引用符は2つに重ねる（RFC 4180）。
 */
export function toCsv(
  columns: ColumnDefinition[],
  rows: Record<string, unknown>[],
  options: CsvOptions = defaultCsvOptions,
  formatters: FormatterRegistry = new FormatterRegistry(),
): string {
  if (columns.length === 0) return "";
  const lineBreak = options.newline === "lf" ? "\n" : "\r\n";
  const lines: string[] = [];

  if (options.header) {
    lines.push(
      columns.map((c) => escape(c.label, options.delimiter)).join(options.delimiter),
    );
  }
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => escape(cell(c, row[c.field], options, formatters), options.delimiter))
        .join(options.delimiter),
    );
  }
  const bom = options.bom ? "\ufeff" : "";
  return bom + lines.map((line) => line + lineBreak).join("");
}

function cell(
  column: ColumnDefinition,
  value: unknown,
  options: CsvOptions,
  formatters: FormatterRegistry,
): string {
  if (!options.raw && column.format) {
    return formatters.format(column.format, value, column.config);
  }
  return value == null ? "" : String(value);
}

/** 引用が要るのは区切り・引用符・改行を含むときだけ。 */
function escape(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value;
}
