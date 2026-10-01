import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_STYLE,
  documentPdf,
  isCjk,
  parsePageYaml,
  PdfFonts,
  type PrintLayout,
  type ReportPageDefinition,
  reportPdf,
  runsOf,
  writePdf,
  buildReport,
  AggregateRegistry,
} from "../src/internal.js";

/**
 * TS の PDF（0.9.25）。ブラウザ版が帳票を刷るための2つ目の実装。
 *
 * **2つあっても中身は1つ**、を言うために、Dart の見本（`hatake_print` の
 * `test/golden/sales_report.pdf`）と**同じ材料**（同梱の例・固定の行・同じ脚注）で作って、
 * 1バイト違わないことを見る。どちらかだけ直すと、ここで落ちる。
 */
const GOLDEN = "../flutter/packages/hatake_print/test/golden/sales_report.pdf";
const EXAMPLE = "../spec/examples/sales_report.yaml";

/** Dart 版の `golden_source.dart` と同じ行（得意先ごとに改ページ＝3枚）。 */
const ROWS = [
  { orderNo: "SO-1001", orderDate: "2026-04-02", status: "出荷済", customer: "山田商事", amount: 128000 },
  { orderNo: "SO-1002", orderDate: "2026-04-05", status: "出荷済", customer: "山田商事", amount: 9800 },
  { orderNo: "SO-1013", orderDate: "2026-04-18", status: "未出荷", customer: "山田商事", amount: 1250000 },
  { orderNo: "SO-1021", orderDate: "2026-04-21", status: "出荷済", customer: "佐藤物産", amount: 43200 },
  { orderNo: "SO-1022", orderDate: "2026-04-23", status: "未出荷", customer: "佐藤物産", amount: -5000 },
  { orderNo: "SO-1030", orderDate: "2026-04-27", status: "未出荷", customer: "鈴木工業", amount: 76500 },
];

const page = (): ReportPageDefinition =>
  parsePageYaml(readFileSync(EXAMPLE, "utf8"), { strict: true }) as ReportPageDefinition;

const STYLE = { ...DEFAULT_PRINT_STYLE, footer: "売上明細表 - {page}/{pages}" };

describe("PDF（Dart の見本と同じバイト列）", () => {
  it("同じ材料なら、Dart の見本と1バイト違わない", () => {
    const made = reportPdf(page(), ROWS, { style: STYLE });
    const golden = new Uint8Array(readFileSync(GOLDEN));
    expect(made.length).toBe(golden.length);
    expect(Buffer.from(made).equals(Buffer.from(golden))).toBe(true);
  });

  it("組んである紙からでも同じものになる（ブラウザ版の帳票はこちらを使う）", () => {
    const document = buildReport(page().report, ROWS, new AggregateRegistry());
    const made = documentPdf(page(), document, { style: STYLE });
    expect(Buffer.from(made).equals(Buffer.from(readFileSync(GOLDEN)))).toBe(true);
  });

  it("同じ入力なら毎回同じ（日付も乱数も入れない）", () => {
    const one = reportPdf(page(), ROWS, { style: STYLE });
    const two = reportPdf(page(), ROWS, { style: STYLE });
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(true);
  });
});

describe("writePdf", () => {
  const layout = (text: string): PrintLayout => ({
    paper: { width: 595.28, height: 841.89 },
    title: "",
    pages: [
      {
        number: 1,
        items: [
          { kind: "text", x: 10, y: 20, width: 100, text, size: 9, bold: false, align: "left" },
        ],
      },
    ],
  });
  const ascii = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

  it("紙が0枚なら投げる（0枚の PDF は PDF ではない）", () => {
    expect(() => writePdf({ paper: { width: 1, height: 1 }, title: "", pages: [] })).toThrow(
      "紙が0枚です",
    );
  });

  it("BMP の外の文字は黙って消さずに「〓」にする", () => {
    expect(ascii(writePdf(layout("😀")))).toContain("<3013> Tj");
  });

  it("標準14フォントでは日本語は ? になる", () => {
    expect(ascii(writePdf(layout("A日"), { font: PdfFonts.helvetica }))).toContain("(A?) Tj");
  });
});

describe("runsOf / isCjk（Dart 版の転記）", () => {
  it("円記号は1文字だけの塊にして、次の桁を置き直す", () => {
    expect(runsOf("¥1,250")).toEqual([
      { em: 0, text: "¥" },
      { em: 1, text: "1,250" },
    ]);
  });

  it("かなと漢字と英数は続けて書く", () => {
    expect(runsOf("山田A")).toEqual([{ em: 0, text: "山田A" }]);
    expect(isCjk("山".codePointAt(0)!)).toBe(true);
    expect(isCjk("¥".codePointAt(0)!)).toBe(false);
  });
});
