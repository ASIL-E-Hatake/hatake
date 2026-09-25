import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DRAFT_NOTE,
  draftLines,
  draftProject,
  looksLikeDefinition,
  parseProject,
} from "../src/internal.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 資料から前書きの下書きを起こす（`hatake project --draft --from`）。
 *
 * この道具でいちばんまずいのは**定義から起こしてしまう**こと（起こせば必ず一致して、
 * 前書きを読む値打ちが消える）。注記で守っていたものを、機械で守る。守るのは3つ:
 *   ・定義を渡されたら落ちる
 *   ・出したものは前書きとして読める（貼れる形）
 *   ・拾えなかった行を捨てない
 */
const MEMO = `# このシステム
卸売の受注。営業が電話で受けた注文を入れる。

# 使う人
- 営業（10人・PC）

# 前提
- 商品マスタは購買部の別システムが正。

# 用語
- 取引先 = partnerCode
- 締め

# 見出しはあるが行き先が無い
なにか
`;

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

describe("前書きを定義から起こさない", () => {
  it("定義を渡したら落ちる（注記ではなく機械で守る）", () => {
    for (const source of [
      "page:\n  type: search\n",
      "app:\n  id: x\n",
      'dsl_version: "1.0"\npage: {}\n',
    ]) {
      expect(looksLikeDefinition(source), source).toBe(true);
      expect(() => draftProject(source)).toThrow(/定義から起こしてはいけません/);
    }
  });

  it("人が書いた資料は定義に見えない", () => {
    expect(looksLikeDefinition(MEMO)).toBe(false);
  });
});

describe("資料から下書きを起こす", () => {
  it("**出したものは前書きとして読める**（貼れる形）", () => {
    const project = parseProject(draftProject(MEMO).yaml);
    expect(project.system.what).toContain("卸売の受注");
    expect(project.system.users).toEqual(["営業（10人・PC）"]);
    expect(project.system.premises[0]).toContain("購買部");
    expect(project.glossary.map((one) => one.term)).toContain("取引先");
    expect(project.glossary.find((one) => one.term === "取引先")?.field).toBe(
      "partnerCode",
    );
  });

  it("項目名は**書いてある対だけ**拾う（機械が名前を作らない）", () => {
    const project = parseProject(draftProject(MEMO).yaml);
    // 「締め」は対になっていないので、field は書かない。
    expect(project.glossary.find((one) => one.term === "締め")?.field).toBeUndefined();
  });

  it("拾えなかった行を捨てない", () => {
    const draft = draftProject(MEMO);
    expect(draft.leftovers.length).toBeGreaterThan(0);
    const text = draftLines(draft).join("\n");
    expect(text).toContain("拾えなかった行");
    expect(text).toContain("行き先が無い");
  });

  it("見出しの外に書かれた行も、捨てずに出す", () => {
    const draft = draftProject("いきなり本文\n\n# 使う人\n- 営業\n");
    expect(draft.leftovers.map((one) => one.text)).toContain("いきなり本文");
    expect(draft.leftovers[0].why).toContain("見出しの外");
  });

  it("何も拾えなければ、そこは TODO のまま（機械が埋めない）", () => {
    const draft = draftProject("# 使う人\n- 営業\n");
    expect(draft.yaml).toContain("TODO_この案件が何のシステムかを");
    expect(parseProject(draft.yaml).system.what).toContain("TODO_");
  });

  it("下書きだと、出したものに書いてある", () => {
    const text = draftLines(draftProject(MEMO)).join("\n");
    expect(text).toContain("下書き");
    expect(text).toContain("人が読んで直すまでは正ではありません");
    expect(text).toContain(DRAFT_NOTE);
    // `$comment` にも印が残る（貼ったあとも読める）。
    expect(parseProject(draftProject(MEMO).yaml).version).toBe("1.0");
    expect(draftProject(MEMO).yaml).toContain("$comment:");
  });

  it("外の相手は名前を作らない（定義に書く字は人が決める）", () => {
    const draft = draftProject("# 外の相手\n- 商品マスタ（購買システム）\n");
    expect(draft.yaml).toContain("name: TODO_定義に書く名前");
    expect(parseProject(draft.yaml).system.external[0].what).toContain("商品マスタ");
  });
});

describe("hatake project --draft", () => {
  it("--from が無ければ、そう言う", () => {
    const io = fakeIo({});
    expect(runCli(["project", "--draft"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain("--from");
  });

  it("資料から起こして、そのまま貼れる形を出す", () => {
    const io = fakeIo({ "memo.md": MEMO });
    expect(runCli(["project", "--draft", "--from", "memo.md"], io)).toBe(0);
    const text = io.stdout.join(String.fromCharCode(10));
    expect(text).toContain("project_version:");
    expect(() => parseProject(text)).not.toThrow();
  });

  it("定義を渡したら落ちる（CLI からも）", () => {
    const io = fakeIo({ "def.yaml": "page:\n  type: search\n" });
    expect(runCli(["project", "--draft", "--from", "def.yaml"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain(
      "定義から起こしてはいけません",
    );
  });
});
