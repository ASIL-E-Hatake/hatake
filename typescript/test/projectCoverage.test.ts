import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  COVERAGE_NOTE,
  coverageLines,
  parseProject,
  projectCoverage,
  projectLines,
} from "../src/index.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 決めごとの棚卸し（`hatake project --coverage`）。
 *
 * 数字を出す道具でいちばん危ないのは、**数えていないものを 0 に見せる**こと（辞書に
 * 無い項目名が 0 件と出たら「全部載っている」と読む）。だから守るのは2つ:
 *   ・数える元は定義そのもの（助言と同じ walk）
 *   ・数えていないものは 0 ではなく「数えていない」と言う
 */
type Dict = Record<string, unknown>;

const doc = (source: string): Dict => parseYaml(source) as Dict;

const PREAMBLE = `project_version: "1.0"
system:
  what: 試験用。
glossary:
  - term: 取引先
    field: partnerCode
  - term: 受注番号
    field: orderNo
  - term: 在りもしない
    field: nowhere
logic:
  - what: CSV を出す
    where: plugin
    name: csvExport
  - what: 受注は更新日時で弾く
    where: server
    answers: [concurrency]
naming:
  page: snake_case
questions:
  decided:
    - id: notify
      why: 後工程は同じ画面を見る
`;

const DEFINITION = `page:
  type: crud
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: partnerCode, label: 取引先 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
          - { field: quantity, label: 数量, type: number }
`;

const project = () => parseProject(PREAMBLE);

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

describe("決めごとの棚卸し", () => {
  it("定義の項目を数え、辞書が名指ししている数を出す", () => {
    const found = projectCoverage(project(), [doc(DEFINITION)]);
    expect(found.pages).toBe(1);
    // orderNo / partnerCode / quantity（同じ項目名は1つ）。
    expect(found.fields).toBe(3);
    expect(found.glossary.terms).toBe(3);
    expect(found.glossary.covered).toBe(2);
  });

  it("辞書にあるのに定義に無い項目名を出す（辞書が腐っている印）", () => {
    const found = projectCoverage(project(), [doc(DEFINITION)]);
    expect(found.glossary.missing).toEqual(["nowhere"]);
    expect(coverageLines(found).join("\n")).toContain(
      '"nowhere" は辞書にありますが',
    );
  });

  it("定義を渡さなければ**数えていない**と言う（0 件とは違う）", () => {
    const found = projectCoverage(project());
    expect(found.glossary.missing).toEqual([]);
    expect(found.questions.open).toBeUndefined();
    const text = coverageLines(found).join("\n");
    expect(text).toContain("定義を渡していないので");
    expect(text).toContain("まだ答えていない数は、定義を渡すと出ます");
  });

  it("業務ロジックを担当ごとに数える", () => {
    const found = projectCoverage(project(), [doc(DEFINITION)]);
    expect(found.logic.total).toBe(2);
    expect(found.logic.byWhere.plugin).toBe(1);
    expect(found.logic.byWhere.server).toBe(1);
    expect(found.logic.byWhere.outside).toBe(0);
  });

  it("答えたもの・決めたもの・足した問いを数える", () => {
    const found = projectCoverage(project(), [doc(DEFINITION)]);
    expect(found.questions.answered).toBe(1);
    expect(found.questions.decided).toBe(1);
    expect(found.questions.added).toBe(0);
  });

  it("数えていないものを毎回言う（総合点は付けない）", () => {
    const text = coverageLines(projectCoverage(project())).join("\n");
    expect(text).toContain(COVERAGE_NOTE);
    expect(text).toContain("総合点は付けません");
  });

  it("項目を1つ足すと、数も1つ増える（本当に定義を読んでいる）", () => {
    const more = DEFINITION.replace(
      "          - { field: quantity, label: 数量, type: number }\n",
      "          - { field: quantity, label: 数量, type: number }\n" +
        "          - { field: note, label: 備考 }\n",
    );
    const before = projectCoverage(project(), [doc(DEFINITION)]).fields;
    expect(projectCoverage(project(), [doc(more)]).fields).toBe(before + 1);
  });

  it("CLI から数えると、まだ答えていない問いも出る", () => {
    const io = fakeIo({ "pre.yaml": PREAMBLE, "def.yaml": DEFINITION });
    expect(
      runCli(["project", "pre.yaml", "--coverage", "def.yaml"], io),
    ).toBe(0);
    const text = io.stdout.join("\n");
    expect(text).toContain("まだ答えていない");
    // 排他は答えてあり、知らせ先は決めてあるので、そこは残らない。
    expect(text).toContain("答えた 1件");
    expect(text).toContain("既定のままでよいと決めた 1件");
  });

  it("読み返しにも出る（前書きに書いたのに、読み返しで見えないのは嘘）", () => {
    const text = projectLines(project()).join(String.fromCharCode(10));
    expect(text).toContain("問い返し（決めていないことを聞く側の決めごと）:");
    expect(text).toContain("既定のままでよいと決めた: notify");
    expect(text).toContain("後工程は同じ画面を見る");
    // 見るのは別の道具だとはっきり書く（advise ではなく ask）。
    expect(text).toContain("問い返しを読むのは `hatake ask");
    // 決めたことが守られているかは誰も見ていない、も言う。
    expect(text).toContain("決めたことが本当に守られているか");
  });
});
