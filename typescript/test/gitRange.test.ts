import { describe, expect, it } from "vitest";
import { describeGitRange, parseGitRange, readGitPair } from "../src/index.js";

/** 呼ばれた引数を記録する偽の git（試験に git を要らなくする）。 */
function fakeGit(answers: Record<string, string> = {}) {
  const calls: string[][] = [];
  const run = (args: string[]): string => {
    calls.push(args);
    const key = args.join(" ");
    for (const [pattern, answer] of Object.entries(answers)) {
      if (key.includes(pattern)) return answer;
    }
    throw new Error(`fatal: unknown revision (${key})`);
  };
  return { run, calls };
}

describe("リビジョンの範囲の読み方", () => {
  it("A..B は A と B", () => {
    expect(parseGitRange("HEAD~1..HEAD")).toEqual({
      old: "HEAD~1",
      new: "HEAD",
      mergeBase: false,
    });
  });

  it("A...B は枝分かれした所と B（PR の中身そのもの）", () => {
    expect(parseGitRange("main...HEAD")).toEqual({
      old: "main",
      new: "HEAD",
      mergeBase: true,
    });
  });

  it("A だけなら、いま手元にあるものと比べる", () => {
    expect(parseGitRange("HEAD")).toEqual({ old: "HEAD", mergeBase: false });
    expect(parseGitRange("HEAD..")).toEqual({ old: "HEAD", mergeBase: false });
  });

  it("空・左側が無いものは、書き方まで言って落ちる", () => {
    expect(() => parseGitRange("")).toThrow(/HEAD~1\.\.HEAD/);
    expect(() => parseGitRange("..HEAD")).toThrow(/左側が空/);
  });

  it("人が読む形", () => {
    expect(describeGitRange(parseGitRange("HEAD~1..HEAD"))).toBe("HEAD~1 → HEAD");
    expect(describeGitRange(parseGitRange("HEAD"))).toBe("HEAD → 作業中");
    expect(describeGitRange(parseGitRange("main...HEAD"))).toBe(
      "main（枝分かれした所） → HEAD",
    );
  });
});

describe("2つのリビジョンから定義を取る", () => {
  const file = "spec/examples/customer_master.yaml";

  it("ファイルのある所で git を叩く（どこから実行しても同じ）", () => {
    const git = fakeGit({ "HEAD~1:./customer_master.yaml": "page: {}\n" });
    const pair = readGitPair("HEAD~1", file, git.run, () => "page: {now: true}\n");
    expect(git.calls[0]).toEqual([
      "-C",
      "spec/examples",
      "show",
      "HEAD~1:./customer_master.yaml",
    ]);
    expect(pair.before).toBe("page: {}\n");
    // 新しい側が無いときは、作業中のファイルを読む。
    expect(pair.after).toBe("page: {now: true}\n");
    expect(pair.label).toBe("HEAD~1 → 作業中 の customer_master.yaml");
  });

  it("両側がリビジョンなら、git を2回叩く", () => {
    const git = fakeGit({
      "HEAD~2:./customer_master.yaml": "old\n",
      "HEAD:./customer_master.yaml": "new\n",
    });
    const pair = readGitPair("HEAD~2..HEAD", file, git.run, () => {
      throw new Error("作業中のファイルは読まないこと");
    });
    expect(pair.before).toBe("old\n");
    expect(pair.after).toBe("new\n");
    expect(git.calls).toHaveLength(2);
  });

  it("A...B は枝分かれした所を git に聞く", () => {
    const git = fakeGit({
      "merge-base main HEAD": "abc123\n",
      "abc123:./customer_master.yaml": "base\n",
      "HEAD:./customer_master.yaml": "head\n",
    });
    const pair = readGitPair("main...HEAD", file, git.run, () => "");
    expect(git.calls[0]).toEqual(["-C", "spec/examples", "merge-base", "main", "HEAD"]);
    expect(pair.before).toBe("base\n");
    expect(pair.after).toBe("head\n");
  });

  it("そのリビジョンに無いファイルは、理由まで言って落ちる", () => {
    const git = fakeGit({});
    expect(() => readGitPair("HEAD~1..HEAD", file, git.run, () => "")).toThrow(
      /新しく足したファイル/,
    );
  });

  it("枝分かれした所が分からないときも、理由まで言う", () => {
    const git = fakeGit({ ":./customer_master.yaml": "x" });
    expect(() => readGitPair("main...HEAD", file, git.run, () => "")).toThrow(
      /枝分かれした所が分かりません/,
    );
  });
});
