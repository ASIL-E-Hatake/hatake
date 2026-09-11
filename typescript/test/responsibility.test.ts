import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  filterAreas,
  parseResponsibility,
  RESPONSIBILITY_NOTE,
  responsibilityLines,
  SORT_NOTE,
  sortedLines,
  sortInstruction,
  WHERE_KINDS,
} from "../src/index.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 担当の割り振り（`spec/responsibility.json`）。
 *
 * この表は**枠組みが持たないもの**を機械が引ける形にしたもので、値打ちは
 * 「hatake では書けません」と言えることに全部ある。だから守るのは2つ:
 *   ・**表が嘘をつけない**（載せたキーは実在する・次の道具は実在する・持たないと
 *     決めたものは CLAUDE.md に書いてある字と揃っている）
 *   ・**「載っていない」と「枠組みの外」を混ぜない**（引けなかったら、そう言う）
 */
const catalog = () =>
  parseResponsibility(
    JSON.parse(readFileSync("../spec/responsibility.json", "utf8")),
  );

const fakeIo = (): CliIo & { stdout: string[]; stderr: string[] } => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: () => {},
    listFiles: () => null,
  };
};

const minimal = (areas: unknown[], notProvided: unknown[] = []) => ({
  notProvided,
  areas,
});

describe("担当の表を読む", () => {
  it("同梱の表が読める（区分は4つに収まっている）", () => {
    const found = catalog();
    expect(found.areas.length).toBeGreaterThan(20);
    for (const area of found.areas) {
      expect(WHERE_KINDS).toContain(area.where);
    }
  });

  it("知らない区分はエラー（「どちらとも言える」を作らない）", () => {
    expect(() =>
      parseResponsibility(
        minimal([{ id: "x", where: "maybe", title: "t", how: "h", keys: [], words: ["x"] }]),
      ),
    ).toThrow(/where は/);
  });

  it("枠組みの外なのにキーが書いてあれば落ちる（書けるなら外ではない）", () => {
    expect(() =>
      parseResponsibility(
        minimal([
          { id: "x", where: "outside", title: "t", how: "h", keys: ["roles"], words: ["x"] },
        ]),
      ),
    ).toThrow(/外ではありません/);
  });

  it("定義で書けると言うならキーが要る", () => {
    expect(() =>
      parseResponsibility(
        minimal([{ id: "x", where: "definition", title: "t", how: "h", keys: [], words: ["x"] }]),
      ),
    ).toThrow(/keys が空/);
  });

  it("引く言葉が無い項目は落ちる（引けない項目は無いのと同じ）", () => {
    expect(() =>
      parseResponsibility(
        minimal([{ id: "x", where: "server", title: "t", how: "h", keys: [], words: [] }]),
      ),
    ).toThrow(/words が空/);
  });

  it("持たないと決めたものに引ける項目が無ければ落ちる", () => {
    expect(() =>
      parseResponsibility(
        minimal(
          [{ id: "x", where: "server", title: "t", how: "h", keys: [], words: ["x"] }],
          [{ id: "workflow", claudeMd: "Workflow Engine" }],
        ),
      ),
    ).toThrow(/outside の項目がありません/);
  });
});

describe("表が嘘をつけないこと", () => {
  it("載せたキーは全部 DSL に在る", () => {
    const reference = buildReference(
      JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
    );
    const known = new Set(Object.keys(reference.keyIndex));
    const unknown = catalog()
      .areas.flatMap((area) => area.keys.map((key) => `${area.id}: ${key}`))
      .filter((one) => !known.has(one.split(": ")[1]));
    expect(unknown).toEqual([]);
  });

  it("「次に見る」の道具は --help に載っている", () => {
    const lines: string[] = [];
    runCli(["--help"], { ...fakeIo(), out: (text) => lines.push(text) });
    const help = lines.join("\n");
    const commands = new Set(
      [...help.matchAll(/^ {2}hatake ([a-z-]+)/gm)].map((one) => one[1]),
    );
    const flags = new Set([...help.matchAll(/--([a-z][a-z-]*)/g)].map((one) => one[1]));
    const problems: string[] = [];
    for (const area of catalog().areas) {
      if (area.tool === undefined) continue;
      const name = /^hatake ([a-z-]+)/.exec(area.tool)?.[1];
      if (name === undefined || !commands.has(name)) {
        problems.push(`${area.id}: ${area.tool}`);
        continue;
      }
      for (const flag of [...area.tool.matchAll(/--([a-z][a-z-]*)/g)].map((one) => one[1])) {
        if (!flags.has(flag)) problems.push(`${area.id}: --${flag}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("持たないと決めたものは CLAUDE.md の Scope と同じ字で書いてある", () => {
    // 散文（CLAUDE.md）と表が食い違えないようにするための突き合わせ。片方だけ直すと
    // ここで落ちる＝「持たない」と言っている一覧が2つになるのを防ぐ。
    const claude = readFileSync("../CLAUDE.md", "utf8");
    const missing = catalog()
      .notProvided.filter((one) => !claude.includes(one.claudeMd))
      .map((one) => one.claudeMd);
    expect(missing).toEqual([]);
  });

  it("持たないと決めたものは全部引ける", () => {
    const found = catalog();
    const outside = new Set(
      found.areas.filter((one) => one.where === "outside").map((one) => one.id),
    );
    expect(found.notProvided.map((one) => one.id).filter((id) => !outside.has(id))).toEqual(
      [],
    );
  });
});

describe("引く", () => {
  it("日本語の言葉で当たる", () => {
    const found = filterAreas(catalog(), "締め");
    expect(found.map((one) => one.id)).toContain("business-logic");
  });

  it("枠組みの外を先に出す（下に置くと読まれない）", () => {
    const found = filterAreas(catalog(), "権限");
    expect(found.length).toBeGreaterThan(1);
    expect(found[0].where).toBe("outside");
  });

  it("区分で絞れる（持たないものの一覧になる）", () => {
    const found = filterAreas(catalog(), undefined, "outside");
    expect(found.length).toBe(catalog().notProvided.length);
    expect(found.every((one) => one.where === "outside")).toBe(true);
  });

  it("読み返しには、書き始めるなという注意が必ず付く", () => {
    const text = responsibilityLines(filterAreas(catalog(), "承認"), {
      query: "承認",
    }).join("\n");
    expect(text).toContain("枠組みの外");
    expect(text).toContain(RESPONSIBILITY_NOTE);
  });
});

describe("CLI", () => {
  it("当たれば 0、当たらなければ 1（「載っていない」と「外」を混ぜない）", () => {
    const hit = fakeIo();
    expect(runCli(["where", "承認"], hit)).toBe(0);
    expect(hit.stdout.join("\n")).toContain("枠組みの外");

    const miss = fakeIo();
    expect(runCli(["where", "ぬるぽ"], miss)).toBe(1);
    expect(miss.stderr.join("\n")).toContain("載っていません");
    expect(miss.stderr.join("\n")).toContain("「枠組みの外」とは違います");
  });

  it("知らない区分を渡したら言う（黙って全部出さない）", () => {
    const io = fakeIo();
    expect(runCli(["where", "--where", "somewhere"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("outside");
  });

  it("--json は機械に渡せる形", () => {
    const io = fakeIo();
    expect(runCli(["where", "締め", "--json"], io)).toBe(0);
    const found = JSON.parse(io.stdout.join("\n"));
    expect(found[0].where).toBe("outside");
    expect(found[0].keys).toEqual([]);
  });
});

describe("指示文をまとめて仕分ける", () => {
  const ask = `# 受注入力の画面を作ってほしい

- 受注を一覧で見られるようにする
- 締めたあとの受注は直せないようにする
- 承認フローを組んでほしい
- ぬるぽの設定を足す

\`\`\`yaml
page:
  type: crud
  table:
    columns: [{ field: code }]
\`\`\`
`;

  const sorted = () => sortInstruction(catalog(), ask);

  it("行ごとに担当を当て、外が何件かを数える", () => {
    const found = sorted();
    expect(found.outside).toBe(2);
    expect(found.lines.map((one) => one.text)).toContain(
      "締めたあとの受注は直せないようにする",
    );
  });

  it("当てられなかった行は捨てない（仕分けたつもりで抜けるのを防ぐ）", () => {
    expect(sorted().unmatched).toContain("ぬるぽの設定を足す");
  });

  it("囲みの中は見ない（定義の断片があると語がいくらでも当たる）", () => {
    const texts = sorted().lines.map((one) => one.text);
    expect(texts.some((one) => one.includes("columns"))).toBe(false);
    expect(texts.some((one) => one.includes("type: crud"))).toBe(false);
  });

  it("枠組みの外を先に出し、下書きだと毎回言う", () => {
    const text = sortedLines(sorted()).join("\n");
    expect(text).toContain("うち 2 件は枠組みの外");
    const first = text.indexOf("[枠組みの外");
    const inner = text.indexOf("[定義で書ける");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(inner);
    expect(text).toContain(SORT_NOTE);
  });

  it("実際の依頼文で使う言葉で当たる（活用・言い回しの違い）", () => {
    const found = sortInstruction(
      catalog(),
      "- 受注番号と取引先で絞り込める\n- 却下の理由の選択肢を決める\n",
    );
    expect(found.unmatched).toEqual([]);
    expect(found.lines).toHaveLength(2);
  });
});
