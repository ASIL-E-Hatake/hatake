import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runCli, type CliIo } from "../src/cli.js";
import { meaningsOf, parseKeyMeanings, referenceMiss } from "../src/keyMeanings.js";
import { buildReference } from "../src/reference.js";
import { hatakeTools } from "../src/tools.js";

// 意味で引かれる名前の表（spec/key-meanings.json）。AI はキーの名前を知らないとき、意味から
// 推し量って引く（0.9.30 / 0.9.31 の初見試験で、「作ったあとは変えられない」を書こうとして
// immutable / editable / editOnly を reference に、「作成後に変更不可の項目」を where に引いて、
// どれも空振りした）。表が嘘をつかないこと（行き先が在る・言葉が本物と重ならない・例が通る）と、
// 空振りしたときに添えることを確かめる。
const table = parseKeyMeanings(JSON.parse(readFileSync("../spec/key-meanings.json", "utf8")));
const reference = buildReference(JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")));
const tools = hatakeTools({ specDir: "../spec", readFile: (path) => readFileSync(path, "utf8") });
const tool = (name: string) => tools.find((one) => one.name === name)!;
const missOf = (name: string, args: Record<string, unknown>): string => {
  try {
    tool(name).run(args);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`${name} が空振りしませんでした`);
};

describe("表そのもの", () => {
  it("行き先のキーは全部 reference に在る", () => {
    for (const one of table.meanings) {
      for (const key of one.keys) expect(reference.keyIndex[key], `${one.id}: ${key}`).toBeDefined();
    }
  });

  it("本物の名前（キー・ノード・ページ種別・値）は言葉に書かない（引けば当たるので届かない）", () => {
    const real = new Set<string>([
      ...Object.keys(reference.keyIndex),
      ...Object.keys(reference.nodes),
      ...reference.pageKinds.map((one) => one.type),
      ...Object.values(reference.nodes).flatMap((node) => node.keys.flatMap((key) => key.values ?? [])),
    ]);
    for (const one of table.meanings) {
      for (const word of one.words) expect(real.has(word), `${one.id}: ${word}`).toBe(false);
    }
  });

  it("1つの言葉は1行にだけ書く（どちらを添えるかを推し量らせない）・id は重ならない", () => {
    const seen = new Map<string, string>();
    for (const one of table.meanings) {
      for (const word of one.words) {
        expect(seen.get(word.toLowerCase()), `${word}: ${one.id}`).toBeUndefined();
        seen.set(word.toLowerCase(), one.id);
      }
    }
    expect(new Set(table.meanings.map((one) => one.id)).size).toBe(table.meanings.length);
  });

  it("書き方の例は、そのまま書いて通る（知らないキー・書けない値が出ない）", () => {
    // 例のキーを書ける場所（入力欄・一覧の列・操作・一覧）に1行足して、足す前と比べる。
    const host = (example: string, place?: string): string => {
      const key = example.slice(0, example.indexOf(":"));
      const at = place ?? ["field", "column", "action", "table"].find((one) => reference.keyIndex[key]?.includes(one));
      const field = `{ field: name, label: 名前, type: text${at === "field" ? `, ${example}` : ""} }`;
      const column = `{ field: name, label: 名前${at === "column" ? `, ${example}` : ""} }`;
      const action = `{ id: delete, type: delete, label: 削除${at === "action" ? `, ${example}` : ""} }`;
      return [
        'dsl_version: "1.0"',
        "app:",
        "  id: a",
        "  title: A",
        "  vocabularies:",
        "    - { name: orderStatus, options: [{ value: draft, label: 入力中 }] }",
        "  pages:",
        "    - type: crud",
        "      id: p",
        "      title: P",
        "      repository: r",
        "      key: name",
        "      table:",
        ...(at === "table" ? [`        ${example}`] : []),
        "        rowActions: [delete]",
        `        columns: [${column}]`,
        "      form:",
        `        sections: [{ fields: [${field}, { field: kind, label: 種別, type: text }, { field: status, label: 状態, type: text }, { field: quantity, label: 数量, type: number }, { field: unitPrice, label: 単価, type: number }] }]`,
        `      actions: [${action}]`,
        "",
      ].join("\n");
    };
    // 知らないキー・書けない値は problems、効かない書き方は warnings に出る（両方見る）。
    const rules = (source: string): string[] => {
      const said = JSON.parse(tool("hatake_validate").run({ source })) as {
        problems?: string[];
        warnings?: { rule: string; message: string }[];
      };
      return [...(said.problems ?? []), ...(said.warnings ?? []).map((one) => `${one.rule}: ${one.message}`)];
    };
    const before = rules(host("none: x"));
    // 足す前の定義はきれい（汚れていると、足したものの問題が紛れる）。間違えた例は捕まる。
    expect(before).toEqual([]);
    expect(rules(host("readOnlyWhn: { mode: edit }", "field"))).not.toEqual([]);
    for (const one of table.meanings) {
      const after = rules(host(one.example)).filter((line) => !before.includes(line));
      expect(after, `${one.id}: ${one.example}`).toEqual([]);
      expect(one.keys, `${one.id}: 例のキーは行き先のどれか`).toContain(one.example.slice(0, one.example.indexOf(":")));
    }
  });
});

describe("意味で引く", () => {
  it("初見試験で空振りした名前は、全部 readOnlyWhen に当たる", () => {
    for (const name of ["immutable", "editable", "editOnly", "readonly", "read_only"]) {
      expect(meaningsOf(table, name).map((one) => one.id), name).toEqual(["read-only"]);
    }
    // 日本語の言い方は、含まれていれば当てる。
    expect(meaningsOf(table, "作成後に変更不可の項目").map((one) => one.id)).toEqual(["read-only"]);
    // 当たらないものは当てない（推し量りで別のキーを添えない）。
    expect(meaningsOf(table, "kanban")).toEqual([]);
    expect(meaningsOf(table, "")).toEqual([]);
  });

  it("MCP の reference: 「DSL に無い名前」とは言ったうえで、意味の近いキーと書き方を添える", () => {
    const said = missOf("hatake_reference", { name: "editOnly" });
    expect(said).toContain('"editOnly" は DSL に無い名前です');
    expect(said).toContain("readOnlyWhen");
    expect(said).toContain("readOnlyWhen: { mode: edit }");
    expect(said).toContain("name: readOnlyWhen");
  });

  it("MCP の reference: 綴りの近い名前も添える（0.9.31 まで CLI にしか出なかった）", () => {
    expect(missOf("hatake_reference", { name: "readOnlyWhn" })).toContain("綴りの近い名前: readOnlyWhen");
    expect(referenceMiss(reference, "witdh", table, "mcp")).toContain("width");
  });

  it("MCP の where: 「作成後に変更不可の項目」は、条件で出し分ける担当に当たる", () => {
    const found = JSON.parse(tool("hatake_where").run({ query: "作成後に変更不可の項目" }));
    expect(found.areas.map((one: { id: string }) => one.id)).toContain("conditional");
    expect(found.text).toContain("readOnlyWhen: { mode: edit }");
  });

  it("MCP の where: 担当表に無くても、意味の表に在れば定義のキーを添える", () => {
    const said = missOf("hatake_where", { query: "プルダウン" });
    expect(said).toContain("表に載っていません");
    expect(said).toContain("optionsOf");
  });

  it("CLI の reference も同じものを添える（綴りの言い方は今までどおり）", () => {
    const io = realIo();
    expect(runCli(["reference", "immutable", "--spec", "../spec"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("readOnlyWhen: { mode: edit }");
    expect(io.stderr.join("")).toContain("hatake reference readOnlyWhen");
    const typo = realIo();
    expect(runCli(["reference", "readOnlyWhn", "--spec", "../spec"], typo)).toBe(1);
    expect(typo.stderr.join("")).toContain("readOnlyWhen の間違い？");
  });
});

function realIo(): CliIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: () => undefined,
    listFiles: () => null,
  } as CliIo & { stdout: string[]; stderr: string[] };
}
