import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  IMPACT_KINDS,
  IMPACT_NOTE,
  IMPACT_WORDS,
  impactLines,
  impactOf,
} from "../src/internal.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 触る前に影響を問う（`hatake ask --impact`）。
 *
 * この道具は「消していいですよ」と読まれる。だから守るのは3つ:
 *   ・**場所が嘘をつかない**（出した道を辿ると、本当にその名前に行き当たる）
 *   ・**定義に無い名前を「影響なし」と言わない**（打ち間違いを見て消されると困る）
 *   ・**見えない所を毎回言う**（サーバ・プラグインの中身・ハンドラは辿れない）
 */
type Dict = Record<string, unknown>;

const doc = (source: string): Dict => parseYaml(source) as Dict;

const EXAMPLE = () =>
  doc(readFileSync("../spec/examples/order_entry.yaml", "utf8"));

/** 道を辿る（道具とは別の実装で辿る＝道具の道が本当に指しているかを確かめる）。 */
function valueAt(node: unknown, path: string): unknown {
  let here: unknown = node;
  for (const step of path.split(".")) {
    const name = step.replace(/\[\d+\]/g, "");
    if (name !== "") {
      if (typeof here !== "object" || here === null) return undefined;
      here = (here as Dict)[name];
    }
    for (const index of step.matchAll(/\[(\d+)\]/g)) {
      if (!Array.isArray(here)) return undefined;
      here = here[Number(index[1])];
    }
  }
  return here;
}

const fakeIo = (files: Record<string, string>) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo & { stdout: string[]; stderr: string[] } = {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => files[path] ?? readFileSync(path, "utf8"),
    writeFile: () => {},
    listFiles: () => null,
  };
  return io;
};

describe("触ると壊れる所を辿る", () => {
  it("明細の中まで開く（「明細の単価を消したい」が一番多い相談）", () => {
    const found = impactOf(EXAMPLE(), "price");
    expect(found.map((one) => one.kind).sort()).toEqual([
      "column",
      "computed",
      "field",
    ]);
  });

  it("行を絞る条件も計算の元として出す（`where` を見落とすと合計が変わる）", () => {
    const found = impactOf(EXAMPLE(), "cancelled");
    const computed = found.filter((one) => one.kind === "computed");
    // 数ではなく**どの道か**で見る。数だけだと、例に計算が1つ増えたときに
    // 「4 を期待して 3 でした」としか出ず、何が増えたのか読めない。
    expect(computed.map((one) => one.path).sort()).toEqual([
      "page.form.sections[2].fields[0].computed.where.field",
      "page.form.sections[2].fields[1].computed.where.field",
      "page.form.sections[2].fields[2].computed.where.field",
      "page.form.sections[2].fields[3].computed.where.field",
    ]);
  });

  it("畳む相手（`of`）も見る", () => {
    const found = impactOf(EXAMPLE(), "amount");
    expect(found.some((one) => one.path.endsWith("computed.of"))).toBe(true);
  });

  it("キーは、キーだと言う（消すと編集も削除もできない）", () => {
    const found = impactOf(EXAMPLE(), "orderNo");
    expect(found.some((one) => one.kind === "key")).toBe(true);
  });

  it("**出した道を辿ると、本当にその名前に行き当たる**（場所が嘘をつかない）", () => {
    const document = EXAMPLE();
    for (const field of ["price", "cancelled", "amount", "orderNo", "lines"]) {
      for (const one of impactOf(document, field)) {
        const value = valueAt(document, one.path);
        expect(typeof value, `${field} ${one.path}`).toBe("string");
        expect(String(value), `${field} ${one.path}`).toContain(field);
      }
    }
  });

  it("条件・遷移のパラメータ・帳票も辿る", () => {
    const document = doc(`app:
  id: demo
  title: デモ
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: r
      key: orderNo
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: status, label: 状態 }
      actions:
        - id: open
          type: navigate
          label: 詳細
          page: order_detail
          params: { no: $row.orderNo }
          enabledWhen: { field: status, operator: equals, value: 未出荷 }
    - type: report
      id: sales_report
      title: 売上
      repository: r
      table:
        columns:
          - { field: amount, label: 金額 }
      report:
        paper: { size: A4, orientation: portrait }
        groupBy: [status]
        totals:
          - { field: amount, aggregate: sum }
`);
    const status = impactOf(document, "status");
    expect(status.map((one) => one.kind)).toContain("condition");
    expect(status.map((one) => one.kind)).toContain("report");
    const orderNo = impactOf(document, "orderNo");
    expect(orderNo.map((one) => one.kind)).toContain("param");
    // ここでも道は嘘をつかない（名前ごとに、その名前で確かめる）。
    for (const [field, found] of [
      ["status", status],
      ["orderNo", orderNo],
    ] as const) {
      for (const one of found) {
        expect(String(valueAt(document, one.path)), one.path).toContain(field);
      }
    }
  });
});

describe("言い方", () => {
  it("種類ぜんぶに言い方がある（種類だけ増やせない）", () => {
    for (const kind of IMPACT_KINDS) {
      expect(IMPACT_WORDS[kind], kind).toBeTruthy();
    }
  });

  it("見えない所を毎回言う（「他に影響はありません」とは言わない）", () => {
    const text = impactLines(EXAMPLE(), "price").join("\n");
    expect(text).toContain(IMPACT_NOTE);
    expect(text).toContain("どうしますか");
  });

  it("定義に無い名前は「影響なし」ではなく**無い**と言う", () => {
    const text = impactLines(EXAMPLE(), "noSuchField").join("\n");
    expect(text).toContain("定義のどこにも出てきません");
    expect(text).toContain("影響が無い、ではありません");
  });
});

describe("hatake ask --impact", () => {
  const source = readFileSync("../spec/examples/order_entry.yaml", "utf8");

  it("影響が在れば 0（問いは人への依頼なので落とさない）", () => {
    const io = fakeIo({ "page.yaml": source });
    expect(runCli(["ask", "page.yaml", "--impact", "price"], io)).toBe(0);
    expect(io.stdout.join(String.fromCharCode(10))).toContain("3 か所に響きます");
  });

  it("定義に無い名前は 1（打ち間違いを見て消されると困る）", () => {
    const io = fakeIo({ "page.yaml": source });
    expect(runCli(["ask", "page.yaml", "--impact", "nope"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain(
      "影響が無い、ではありません",
    );
  });

  it("--json でも同じ答え（機械に渡す形）", () => {
    const io = fakeIo({ "page.yaml": source });
    expect(
      runCli(["ask", "page.yaml", "--impact", "price", "--json"], io),
    ).toBe(0);
    const parsed = JSON.parse(io.stdout.join("")) as {
      field: string;
      impacts: { kind: string }[];
    };
    expect(parsed.field).toBe("price");
    expect(parsed.impacts.length).toBe(3);
  });
});
