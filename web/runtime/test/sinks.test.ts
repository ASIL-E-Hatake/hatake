import { readFileSync } from "node:fs";
import { AggregateRegistry, FormatterRegistry, parsePageYaml } from "@hatake-fw/api";
import {
  buildReport,
  documentPdf,
  type ReportPageDefinition,
} from "@hatake-fw/api/internal";
import { describe, expect, it } from "vitest";
import { ActionRunner } from "../src/actionRunner.js";
import { downloadCsv, printPdf } from "../src/downloads.js";
import { Notifier } from "../src/notifier.js";
import type { PrintRequest } from "../src/sinks.js";

/**
 * ブラウザ版の刷る口・出す口（0.9.25）。
 *
 * ・刷る頼みに**紙に組む材料**（帳票の定義・役割・見せ方・config）が来る
 * ・刷る口を**待つ**（0.9.24 までは投げっぱなしで、失敗しても「刷った」ことになっていた）
 * ・出来合いの口は、UTF-8 でない CSV を**黙って UTF-8 で出さずに断る**
 */
const page = (): ReportPageDefinition =>
  parsePageYaml(readFileSync("../../spec/examples/sales_report.yaml", "utf8"), {
    strict: true,
  }) as ReportPageDefinition;

const ROWS = [
  { orderNo: "SO-1", orderDate: "2026-04-02", status: "出荷済", customer: "山田商事", amount: 1000 },
  { orderNo: "SO-2", orderDate: "2026-04-03", status: "未出荷", customer: "佐藤物産", amount: 2000 },
];

const printAction = () => page().actions.find((one) => one.type === "print")!;

const around = (definition: ReportPageDefinition) => ({
  controller: new Notifier(),
  printDocument: () => buildReport(definition.report, ROWS, new AggregateRegistry()),
  reportPage: definition,
  fallbackName: definition.title,
});

describe("刷る口（ActionRunner）", () => {
  it("紙に組む材料が一緒に届く", async () => {
    const got: PrintRequest[] = [];
    const runner = new ActionRunner({
      roles: ["manager"],
      printSink: (request) => {
        got.push(request);
      },
    });
    const definition = page();
    expect(await runner.run(printAction(), around(definition))).toBe(true);
    expect(got[0].page?.id).toBe(definition.id);
    expect(got[0].roles).toEqual(["manager"]);
    expect(got[0].formatters).toBeInstanceOf(FormatterRegistry);
    expect(got[0].config.filename).toBe("売上明細");
    expect(got[0].filename).toBe("売上明細.pdf");
  });

  it("刷る口が失敗したら、刷ったことにしない（待って、失敗を言う）", async () => {
    const runner = new ActionRunner({
      printSink: async () => {
        throw new Error("プリンタが見つかりません");
      },
    });
    expect(await runner.run(printAction(), around(page()))).toBe(false);
    expect(runner.messages.message?.text).toContain("プリンタが見つかりません");
  });
});

describe("出来合いの出力先", () => {
  it("printPdf: 画面と同じ紙を PDF にする（組み方は documentPdf と同じ）", () => {
    const definition = page();
    const document = buildReport(definition.report, ROWS, new AggregateRegistry());
    const bytes = printPdf({
      filename: "売上明細.pdf",
      document,
      actionId: "printPdf",
      page: definition,
      roles: [],
      formatters: new FormatterRegistry(),
      config: {},
    });
    expect(Buffer.from(bytes).subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
    expect(Buffer.from(bytes).equals(Buffer.from(documentPdf(definition, document)))).toBe(true);
  });

  it("printPdf: 帳票の定義が届いていなければ、組めないと言う", () => {
    expect(() =>
      printPdf({
        filename: "x.pdf",
        document: { sheets: [], totalPages: 0 },
        actionId: "p",
        roles: [],
        formatters: new FormatterRegistry(),
        config: {},
      }),
    ).toThrow("帳票の定義が届いていません");
  });

  it("printPdf: 行が無い紙（0枚）は投げる＝刷ったことにしない", () => {
    expect(() =>
      printPdf({
        filename: "x.pdf",
        document: { sheets: [], totalPages: 0 },
        actionId: "p",
        page: page(),
        roles: [],
        formatters: new FormatterRegistry(),
        config: {},
      }),
    ).toThrow("紙が0枚です");
  });

  it("downloadCsv: cp932 は黙って UTF-8 で出さずに断る", () => {
    expect(() =>
      downloadCsv({
        filename: "a.csv",
        mimeType: "text/csv; charset=cp932",
        text: "a\r\n",
        charset: "cp932",
        actionId: "csv",
      }),
    ).toThrow("UTF-8 しか書けません");
  });
});
