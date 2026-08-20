import { describe, expect, it } from "vitest";
import {
  buildReport,
  layoutReport,
  parsePageYaml,
  renderPaperText,
  type ReportPageDefinition,
  sampleRows,
} from "../src/index.js";

const report = (body: string, columns: string): ReportPageDefinition =>
  parsePageYaml(
    `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
${columns}
  report:
${body}
`,
    { strict: true },
  ) as ReportPageDefinition;

const paper = (
  page: ReportPageDefinition,
  rows: Record<string, unknown>[],
  columns = 100,
): string =>
  renderPaperText(layoutReport(page, buildReport(page.report, rows)), {
    columns,
  });

const AMOUNTS = `      - { field: item, label: 品名, width: 200 }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }`;

describe("紙を文字で見せる", () => {
  it("紙の大きさと枚数を先に言う", () => {
    const page = report("    rowsPerPage: 30", AMOUNTS);
    const text = paper(page, [{ item: "あ", amount: 100 }]);
    expect(text.split("\n")[0]).toContain("595.28 x 841.89pt の紙 1 枚");
    expect(text).toContain("--- 1 枚目 ---");
  });

  // ここが要点。右寄せが効いているかは、右端が揃っているかでしか読めない。
  it("右寄せの数は、桁数が違っても右端が揃う", () => {
    const page = report("    rowsPerPage: 30", AMOUNTS);
    const text = paper(page, [
      { item: "あ", amount: 98 },
      { item: "い", amount: 1250000 },
    ]);
    const ends = text
      .split("\n")
      .filter((line) => line.includes("¥"))
      .map((line) => line.trimEnd().length);
    expect(new Set(ends).size).toBe(1);
  });

  it("グループ見出し・小計・総計が、上から順に読める", () => {
    const page = report(
      `    rowsPerPage: 30
    sort: { field: customer }
    groupBy: [{ field: customer, label: 顧客 }]
    totals: [{ field: amount, aggregate: sum }]`,
      AMOUNTS,
    );
    const text = paper(page, [
      { item: "あ", customer: "山田商事", amount: 100 },
      { item: "い", customer: "佐藤物産", amount: 250 },
    ]);
    const lines = text.split("\n").map((line) => line.trim());
    const at = (needle: string) =>
      lines.findIndex((line) => line.startsWith(needle));
    expect(at("顧客: 山田商事")).toBeLessThan(at("小計"));
    expect(at("小計")).toBeLessThan(at("顧客: 佐藤物産"));
    expect(at("合計")).toBeGreaterThan(at("顧客: 佐藤物産"));
  });

  it("罫線は見出しの下が `=`、グループと合計が `-`", () => {
    const page = report(
      `    rowsPerPage: 30
    totals: [{ field: amount, aggregate: sum }]`,
      AMOUNTS,
    );
    const lines = paper(page, [{ item: "あ", amount: 100 }]).split("\n");
    expect(lines.some((line) => line.trim().startsWith("==="))).toBe(true);
    expect(lines.some((line) => line.trim().startsWith("---"))).toBe(true);
  });

  it("総計の上は二重線（罫線の行が2つ続く）", () => {
    const page = report(
      `    rowsPerPage: 30
    totals: [{ field: amount, aggregate: sum }]`,
      AMOUNTS,
    );
    const lines = paper(page, [{ item: "あ", amount: 100 }])
      .split("\n")
      .map((line) => line.trim());
    const total = lines.findIndex((line) => line.startsWith("合計"));
    expect(lines[total - 1].startsWith("---")).toBe(true);
    expect(lines[total - 2].startsWith("---")).toBe(true);
  });

  it("列に収まらない文字は … で切れて見える", () => {
    const page = report(
      "    rowsPerPage: 30",
      "      - { field: note, label: 備考, width: 60 }",
    );
    expect(paper(page, [{ note: "とても長い備考がここに入って収まらない" }])).toContain("…");
  });

  it("紙が2枚なら2枚ぶん出る（改ページの指定が読める）", () => {
    const page = report(
      `    rowsPerPage: 30
    sort: { field: customer }
    groupBy: [{ field: customer, label: 顧客, pageBreak: true }]`,
      AMOUNTS,
    );
    const text = paper(page, [
      { item: "あ", customer: "山田商事", amount: 100 },
      { item: "い", customer: "佐藤物産", amount: 250 },
    ]);
    expect(text).toContain("--- 1 枚目 ---");
    expect(text).toContain("--- 2 枚目 ---");
    expect(text).toContain("の紙 2 枚");
  });

  it("桁数を狭くすると、その幅で出る", () => {
    const page = report("    rowsPerPage: 30", AMOUNTS);
    const narrow = paper(page, [{ item: "あ", amount: 100 }], 60);
    for (const line of narrow.split("\n").slice(2)) {
      expect(line.length).toBeLessThanOrEqual(60);
    }
  });

  it("行が無ければ、紙は0枚だと言う", () => {
    const page = report("    rowsPerPage: 30", AMOUNTS);
    expect(paper(page, [])).toContain("紙は0枚です");
  });

  it("権限で見えない列は紙にも出ない", () => {
    const page = report(
      "    rowsPerPage: 30",
      `      - { field: item, label: 品名 }
      - { field: cost, label: 原価, type: number, roles: [manager] }`,
    );
    const document = buildReport(page.report, [{ item: "あ", cost: 80 }]);
    const staff = renderPaperText(
      layoutReport(page, document, { roles: ["staff"] }),
    );
    expect(staff).not.toContain("原価");
    const manager = renderPaperText(
      layoutReport(page, document, { roles: ["manager"] }),
    );
    expect(manager).toContain("原価");
  });
});

describe("見本の行（データが無くても紙を見る）", () => {
  const page = report(
    `    rowsPerPage: 30
    sort: { field: customer }
    groupBy: [{ field: customer, label: 顧客 }]
    totals: [{ field: tax, aggregate: sum }]`,
    `      - { field: item, label: 品名 }
      - { field: customer, label: 顧客 }
      - { field: orderDate, label: 受注日, type: date }
      - { field: amount, label: 金額, type: number }`,
  );

  it("グループの項目はまとまって変わる（コントロールブレイクが効く形）", () => {
    const rows = sampleRows(page, 6);
    const customers = rows.map((row) => row.customer);
    // 前半と後半で2グループ＝混ざらない。
    expect(new Set(customers).size).toBe(2);
    expect(customers.slice(0, 3).every((one) => one === customers[0])).toBe(true);
    expect(customers.slice(3).every((one) => one === customers[3])).toBe(true);
  });

  it("数は桁を変える（桁区切りと右寄せの確認になる）", () => {
    const amounts = sampleRows(page, 6).map((row) => row.amount as number);
    expect(amounts.every((one) => typeof one === "number")).toBe(true);
    expect(new Set(amounts.map((one) => String(one).length)).size).toBeGreaterThan(1);
  });

  it("日付は並ぶ", () => {
    const dates = sampleRows(page, 3).map((row) => row.orderDate as string);
    expect(dates).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
  });

  it("合計の対象は、列に無くても数が入る（合計だけに出る項目）", () => {
    for (const row of sampleRows(page, 3)) {
      expect(typeof row.tax).toBe("number");
    }
  });

  it("作った行でも、紙が組める（グループと小計が出る）", () => {
    const rows = sampleRows(page, 4);
    const text = paper(page, rows);
    expect(text).toContain("顧客: ");
    expect(text).toContain("小計");
  });
});
