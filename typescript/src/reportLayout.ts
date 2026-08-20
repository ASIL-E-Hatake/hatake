// ReportDocument + 定義 → PrintLayout（紙の上の座標）。
//
// **Dart 版（`hatake_print` の `layoutReport`）の転記。** 同じ定義・同じ行から同じ座標が
// 出ることを共有フィクスチャ（`spec/conformance/report_layout.json`）で縛る。ズレると
// 「AI や人が読んだ紙」と「実際に刷った紙」が別物になり、読み合わせの意味が消える。
//
// 紙の体裁の要点は3つ（Dart 版と同じ）。
//   ・**紙から溢れない**。`rowsPerPage` 行が必ず1枚に載るよう、行の高さと文字の大きさを
//     上限つきで縮める（伸ばしはしない）
//   ・**列は定義どおり**。`column.width` をポイントとして使い、指定の無い列が残りを分ける。
//     全部足して紙幅を超えたら、全体を同じ率で縮める
//   ・**画面と同じ見た目**。列の順・寄せ（number は右）・書式（`format`）・見えない列
//     （`roles`）・小計の言葉まで、帳票プレビューと同じ規則
//
// 紙の分かれ目は決め直さない（`buildReport` が `rowsPerPage` で分けた 1 sheet = 1 page）。

import { isAllowed } from "./access.js";
import {
  AggregateOps,
  ColumnTypes,
  type ColumnDefinition,
  type ReportDefinition,
  type ReportPageDefinition,
} from "./definition.js";
import { FormatterRegistry } from "./formatter.js";
import { PAPERS, paperSize } from "./papers.js";
import {
  PrintAligns,
  type PrintItem,
  type PrintLayout,
  type PrintPage,
} from "./printLayout.js";
import { clipToWidth, textWidth } from "./printMetrics.js";
import {
  DEFAULT_PRINT_STYLE,
  fillPageNumber,
  type PrintStyle,
} from "./printStyle.js";
import { type ReportBlock, ReportBlockKinds, type ReportDocument } from "./report.js";

/** 指定の無い列に最低これだけは渡す（狭すぎる列は読めない）。 */
const MIN_FLEX_WIDTH = 40;

export interface LayoutOptions {
  formatters?: FormatterRegistry;
  /** その印刷を頼んだ人の役割（**見えない列は刷らない**）。 */
  roles?: readonly string[];
  style?: PrintStyle;
}

/**
 * 帳票を紙に組む。
 *
 * 知らない用紙名は **A4 として組む**（刷る側と同じ扱い＝刷れば A4 で出てくるので、
 * 読ませる紙も A4 でなければ嘘になる）。「知らない紙」を知らないと言うのは
 * `validate` の警告の仕事で、こちらは刷った結果に合わせる。
 */
export function layoutReport(
  page: ReportPageDefinition,
  document: ReportDocument,
  options: LayoutOptions = {},
): PrintLayout {
  const style = options.style ?? DEFAULT_PRINT_STYLE;
  const paper = paperSize(page.report.paper) ?? PAPERS.A4;
  if (document.sheets.length === 0) {
    return { paper, pages: [], title: page.title };
  }
  const formatters = options.formatters ?? new FormatterRegistry();
  const roles = options.roles ?? [];
  const columns = page.table.columns.filter((column) =>
    isAllowed(column.roles, roles),
  );

  const left = style.margin;
  const usable = paper.width - style.margin * 2;
  const widths = columnWidths(columns, usable, style.columnGap);
  const xs = columnXs(widths, left, style.columnGap);

  // 縦の割り付け（どの紙も同じ位置から始まる）。
  const titleBaseline = style.margin + style.titleSize;
  const headingBaseline =
    titleBaseline + style.titleSize * 0.5 + style.headingSize;
  const headingRuleY = headingBaseline + style.headingSize * 0.45;
  const bodyTop = headingRuleY + 2;
  const bodyBottom = paper.height - style.margin;
  const footerBaseline = bodyBottom + style.headingSize;

  // 1枚に載る行数。行数の指定が壊れていても溢れないよう、実際のブロック数も見る。
  const rows = Math.max(
    page.report.rowsPerPage,
    document.sheets.reduce((most, s) => Math.max(most, s.blocks.length), 0),
  );
  const rowHeight = Math.min(
    style.rowHeight,
    (bodyBottom - bodyTop) / Math.max(rows, 1),
  );
  const bodySize = Math.min(style.bodySize, rowHeight * 0.62);

  const pages: PrintPage[] = document.sheets.map((sheet) => {
    const items: PrintItem[] = [
      ...sheetHeader({
        title: page.title,
        number: sheet.number,
        total: document.totalPages,
        style,
        left,
        usable,
        titleBaseline,
        headingBaseline,
        headingRuleY,
        columns,
        widths,
        xs,
      }),
    ];
    sheet.blocks.forEach((one, i) => {
      items.push(
        ...blockItems({
          block: one,
          report: page.report,
          style,
          formatters,
          columns,
          widths,
          xs,
          left,
          usable,
          top: bodyTop + rowHeight * i,
          rowHeight,
          size: bodySize,
        }),
      );
    });
    if (style.footer !== "") {
      items.push({
        kind: "text",
        x: left,
        y: footerBaseline,
        width: usable,
        text: fillPageNumber(style.footer, sheet.number, document.totalPages),
        size: style.headingSize,
        bold: false,
        align: PrintAligns.left,
      });
    }
    return { number: sheet.number, items };
  });

  return { paper, pages, title: page.title };
}

/** 列の幅。指定はポイントとして使い、指定の無い列が残りを分ける。 */
function columnWidths(
  columns: ColumnDefinition[],
  usable: number,
  gap: number,
): number[] {
  if (columns.length === 0) return [];
  const space = usable - gap * (columns.length - 1);
  const fixed = columns.reduce((sum, c) => sum + (c.width ?? 0), 0);
  const flexCount = columns.filter((c) => c.width === undefined).length;
  const flex =
    flexCount === 0 ? 0 : Math.max(MIN_FLEX_WIDTH, (space - fixed) / flexCount);
  const widths = columns.map((column) => column.width ?? flex);
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= space || total <= 0) return widths;
  const scale = space / total;
  return widths.map((w) => w * scale);
}

function columnXs(widths: number[], left: number, gap: number): number[] {
  const xs: number[] = [];
  let x = left;
  for (const width of widths) {
    xs.push(x);
    x += width + gap;
  }
  return xs;
}

/** 表題・ページ番号・列見出し（どの紙にも出る）。 */
function sheetHeader(input: {
  title: string;
  number: number;
  total: number;
  style: PrintStyle;
  left: number;
  usable: number;
  titleBaseline: number;
  headingBaseline: number;
  headingRuleY: number;
  columns: ColumnDefinition[];
  widths: number[];
  xs: number[];
}): PrintItem[] {
  const { style, left, usable } = input;
  const number =
    style.pageNumber === ""
      ? ""
      : fillPageNumber(style.pageNumber, input.number, input.total);
  const numberWidth =
    number === "" ? 0 : textWidth(number, style.headingSize) + 8;
  const items: PrintItem[] = [
    {
      kind: "text",
      x: left,
      y: input.titleBaseline,
      width: usable - numberWidth,
      text: clipToWidth(input.title, style.titleSize, usable - numberWidth),
      size: style.titleSize,
      bold: true,
      align: PrintAligns.left,
    },
  ];
  if (number !== "") {
    items.push({
      kind: "text",
      x: left,
      y: input.titleBaseline,
      width: usable,
      text: number,
      size: style.headingSize,
      bold: false,
      align: PrintAligns.right,
    });
  }
  input.columns.forEach((column, i) => {
    items.push({
      kind: "text",
      x: input.xs[i],
      y: input.headingBaseline,
      width: input.widths[i],
      text: clipToWidth(column.label, style.headingSize, input.widths[i]),
      size: style.headingSize,
      bold: false,
      align: alignOf(column),
    });
  });
  items.push({
    kind: "rule",
    x: left,
    y: input.headingRuleY,
    width: usable,
    thickness: 0.5,
  });
  return items;
}

/** 1ブロック（見出し / 明細 / 小計 / 総計）を1行に組む。 */
function blockItems(input: {
  block: ReportBlock;
  report: ReportDefinition;
  style: PrintStyle;
  formatters: FormatterRegistry;
  columns: ColumnDefinition[];
  widths: number[];
  xs: number[];
  left: number;
  usable: number;
  top: number;
  rowHeight: number;
  size: number;
}): PrintItem[] {
  const { block, style, columns, widths, xs, left, usable, top, rowHeight, size } =
    input;
  // ベースラインは行の下から少し上（文字の下に伸びる部分ぶん）。
  const baseline = top + rowHeight - rowHeight * 0.3;

  if (block.kind === ReportBlockKinds.groupHeader) {
    // 見出しは文章なので行いっぱいに書く（狭い1列目に押し込めると切れる）。
    const indent = 10 * block.level;
    const width = usable - indent;
    const text = `${block.label}: ${block.value ?? ""}`;
    return [
      {
        kind: "text",
        x: left + indent,
        y: baseline,
        width,
        text: clipToWidth(text, size, width),
        size,
        bold: true,
        align: PrintAligns.left,
      },
      {
        kind: "rule",
        x: left,
        y: top + rowHeight,
        width: usable,
        thickness: 0.4,
      },
    ];
  }

  if (block.kind === ReportBlockKinds.detail) {
    return columns.map((column, i) => ({
      kind: "text",
      x: xs[i],
      y: baseline,
      width: widths[i],
      text: clipToWidth(cell(input.formatters, column, block.row[column.field]), size, widths[i]),
      size,
      bold: false,
      align: alignOf(column),
    }));
  }

  if (
    block.kind === ReportBlockKinds.subtotal ||
    block.kind === ReportBlockKinds.grandTotal
  ) {
    const isGrand = block.kind === ReportBlockKinds.grandTotal;
    const label = isGrand ? style.grandTotalLabel : style.subtotalLabel;
    const items: PrintItem[] = [
      { kind: "rule", x: left, y: top, width: usable, thickness: 0.4 },
    ];
    // 総計の上は二重線（日本の帳票の作法）。
    if (isGrand) {
      items.push({
        kind: "rule",
        x: left,
        y: top + 1.6,
        width: usable,
        thickness: 0.4,
      });
    }
    columns.forEach((column, i) => {
      items.push({
        kind: "text",
        x: xs[i],
        y: baseline,
        width: widths[i],
        // 画面の帳票と同じ規則: 1列目は見出し、以降は自分の列の数字。
        text: clipToWidth(
          i === 0
            ? label
            : totalFor(input.formatters, input.report, style, column, block),
          size,
          widths[i],
        ),
        size,
        bold: true,
        align: i === 0 ? PrintAligns.left : alignOf(column),
      });
    });
    return items;
  }

  // 知らない種類（プラグインが増やしたもの）は刷らない。落とさない。
  return [];
}

function cell(
  formatters: FormatterRegistry,
  column: ColumnDefinition,
  value: unknown,
): string {
  if (column.format !== undefined) {
    return formatters.format(column.format, value, column.config);
  }
  return value === null || value === undefined ? "" : String(value);
}

/** その列に属する小計・総計。同じ列に2つ（`sum` と `count`）あれば並べる。 */
function totalFor(
  formatters: FormatterRegistry,
  report: ReportDefinition,
  style: PrintStyle,
  column: ColumnDefinition,
  block: ReportBlock,
): string {
  const parts: string[] = [];
  report.totals.forEach((total, i) => {
    if (total.field !== column.field) return;
    if (i >= block.totals.length) return;
    const value = block.totals[i];
    if (value === null || value === undefined) return;
    // 件数は数を数えただけなので、列の書式（金額など）を通さない。
    parts.push(
      total.aggregate === AggregateOps.count
        ? `${Math.trunc(value)} ${style.countSuffix}`
        : cell(formatters, column, value),
    );
  });
  return parts.join(" / ");
}

/** 数は右、それ以外は左（紙の上の作法。画面の帳票と同じ）。 */
const alignOf = (column: ColumnDefinition): string =>
  column.type === ColumnTypes.number ? PrintAligns.right : PrintAligns.left;
