import { describe, expect, it } from "vitest";
import {
  adviceRuleNames,
  AdviseOffError,
  applyAdviseOff,
  findAdvice,
  parseAdviseOff,
  silencedNote,
} from "../src/internal.js";
import { parse as parseYamlText } from "yaml";
import { runCli, type CliIo } from "../src/cli.js";
import { readFileSync } from "node:fs";

/**
 * 定義の隣に置く助言の例外（`# advise-off:`）。
 *
 * 助言を黙らせる口は、作り方を間違えると**定義が嘘をつける口**になる。守るのは4つ:
 *   ・知らない規則名は落とす（止めたつもりで止まっていない、を作らない）
 *   ・黙らせた件数は必ず出る（消えた助言が見えないと、助言ゼロがきれいに見える）
 *   ・画面 A の印で画面 B が黙らない
 *   ・1件も黙らせていない印は、そう言う（消し忘れ・場所違い）
 */
const APP = `app:
  id: sales
  title: 販売
  pages:
    - id: order_list
      type: search
      title: 受注照会
      repository: orderRepository
      key: id
      # advise-off: key-not-in-table # 現場は受注番号で話すので id は出さない
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: amount, label: 金額 }
    - id: product_list
      type: search
      title: 商品照会
      repository: productRepository
      key: id
      table:
        columns:
          - { field: name, label: 商品名 }
`;

const adviceOf = (source: string) =>
  findAdvice(parseYamlText(source) as Record<string, unknown>);

describe("定義の隣の印を読む", () => {
  it("画面の中に書いた印は、その画面のものになる", () => {
    const marks = parseAdviseOff(APP, adviceRuleNames());
    expect(marks).toHaveLength(1);
    expect(marks[0].rule).toBe("key-not-in-table");
    expect(marks[0].page).toBe("order_list");
    expect(marks[0].reason).toContain("受注番号");
  });

  it("画面の外に書いた印は、定義ぜんたいに効く", () => {
    const marks = parseAdviseOff(
      `# advise-off: key-not-in-table\n${APP}`,
      adviceRuleNames(),
    );
    expect(marks[0].page).toBeUndefined();
  });

  it("知らない規則名は落とす（止めたつもりで止まっていないを作らない）", () => {
    expect(() =>
      parseAdviseOff("page:\n  # advise-off: key-not-in-tabel\n", adviceRuleNames()),
    ).toThrow(AdviseOffError);
  });

  it("案件の決めごと（物差しの require）も止められる", () => {
    const names = adviceRuleNames({
      off: [],
      options: {},
      require: [{ rule: "column-needs-width", node: "column", key: "width" }],
    });
    expect(() =>
      parseAdviseOff("page:\n  # advise-off: column-needs-width\n", names),
    ).not.toThrow();
    // 前書きから来る助言の名前も知っている（知らないと、正しい名前なのに落とす）。
    expect(() =>
      parseAdviseOff("page:\n  # advise-off: project-name-shape\n", names),
    ).not.toThrow();
  });

  it("値の中の # は印にしない（行頭のコメントだけを見る）", () => {
    const marks = parseAdviseOff(
      'page:\n  title: "# advise-off: key-not-in-table"\n',
      adviceRuleNames(),
    );
    expect(marks).toEqual([]);
  });
});

describe("印を当てる", () => {
  const all = adviceOf(APP);
  const result = applyAdviseOff(all, parseAdviseOff(APP, adviceRuleNames()));

  it("その画面だけが黙る（隣の画面は黙らない）", () => {
    expect(all.filter((one) => one.rule === "key-not-in-table")).toHaveLength(2);
    expect(result.silenced.map((one) => one.page)).toEqual(["order_list"]);
    expect(
      result.kept.some(
        (one) => one.rule === "key-not-in-table" && one.page === "product_list",
      ),
    ).toBe(true);
  });

  it("黙らせた件数は必ず言う", () => {
    expect(silencedNote(result)).toContain("1 件を黙らせました");
    expect(silencedNote(result)).toContain("order_list");
  });

  it("1件も黙らせていない印は、そう言う（消し忘れ・場所違い）", () => {
    const idle = applyAdviseOff([], parseAdviseOff(APP, adviceRuleNames()));
    expect(idle.idle).toHaveLength(1);
    expect(silencedNote(idle)).toContain("何も黙らせていません");
    expect(silencedNote(idle)).toContain("消し忘れ");
  });
});

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

describe("hatake advise と印", () => {
  it("黙らせたことが出力に出る（消えた助言を見落とせない）", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["advise", "app.yaml"], io)).toBe(0);
    const text = io.stdout.join(String.fromCharCode(10));
    expect(text).toContain("1 件を黙らせました");
    expect(text).toContain("現場は受注番号で話すので id は出さない");
  });

  it("知らない規則名を書いた定義は落ちる", () => {
    const io = fakeIo({ "bad.yaml": "page:\n  # advise-off: そんな規則\n  type: search\n" });
    expect(runCli(["advise", "bad.yaml"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain("規則ではない名前");
  });

  it("印の無い定義では、今までと同じ形（助言の配列）を返す", () => {
    const io = fakeIo({ "p.yaml": "page:\n  type: search\n  title: x\n  key: id\n" });
    expect(runCli(["advise", "p.yaml", "--json"], io)).toBe(0);
    expect(JSON.parse(io.stdout.join(String.fromCharCode(10)))).toBeInstanceOf(Array);
  });
});

describe("前書きから来る規則名の表", () => {
  it("**projectAdvise が出す名前と食い違わない**（片方だけ足したら落ちる）", async () => {
    const { PROJECT_ADVICE_RULES } = await import("../src/internal.js");
    const source = readFileSync(
      new URL("../src/projectAdvise.ts", import.meta.url),
      "utf8",
    );
    // 表そのものの行は数えない（表を読んで表と比べても何も分からない）。
    const body = source.slice(source.indexOf("type Dict = Record"));
    const emitted = new Set(
      [...body.matchAll(/rule: "(project-[a-z-]+)"/g)].map((one) => one[1]),
    );
    expect([...emitted].sort()).toEqual([...PROJECT_ADVICE_RULES].sort());
  });
});
