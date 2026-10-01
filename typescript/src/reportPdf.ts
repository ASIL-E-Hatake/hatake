// 帳票の定義と行から PDF まで1本で（Dart 版 `reportPdf` の転記）。
//
// 組む（[buildReport]）→ 紙に置く（[layoutReport]）→ バイト列（[writePdf]）。
// 段ごとの道具も残してあるので、組んだ紙を先に見たい（`hatake paper`）ときは
// 途中で止められる。

import { AggregateRegistry } from "./aggregate.js";
import type { ReportPageDefinition } from "./definition.js";
import type { FormatterRegistry } from "./formatter.js";
import { PdfFonts, type PdfFont } from "./pdfFont.js";
import { writePdf } from "./pdfWriter.js";
import type { PrintStyle } from "./printStyle.js";
import { buildReport, type ReportDocument } from "./report.js";
import { layoutReport } from "./reportLayout.js";

export interface ReportPdfOptions {
  formatters?: FormatterRegistry;
  aggregates?: AggregateRegistry;
  /** 刷る人の役割（**見えない列は刷らない**）。 */
  roles?: readonly string[];
  style?: PrintStyle;
  font?: PdfFont;
}

/** 帳票の定義と行から PDF を作る。行が0件なら投げる（[writePdf]）。 */
export function reportPdf(
  page: ReportPageDefinition,
  rows: Record<string, unknown>[],
  options: ReportPdfOptions = {},
): Uint8Array {
  const document = buildReport(page.report, rows, options.aggregates ?? new AggregateRegistry());
  return documentPdf(page, document, options);
}

/**
 * もう組んである紙（[ReportDocument]）から PDF を作る。
 *
 * ブラウザ版の帳票は、画面に出すために紙を既に組んでいる（刷る口に届くのもそれ）。
 * 行から組み直すと、画面に出ている紙と刷った紙が別物になりうるので、こちらを使う。
 */
export function documentPdf(
  page: ReportPageDefinition,
  document: ReportDocument,
  options: Omit<ReportPdfOptions, "aggregates"> = {},
): Uint8Array {
  const layout = layoutReport(page, document, {
    formatters: options.formatters,
    roles: options.roles,
    style: options.style,
  });
  return writePdf(layout, { font: options.font ?? PdfFonts.gothic });
}
