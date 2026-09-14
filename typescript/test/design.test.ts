import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 設計書を1枚に刷る（`hatake design`）。
 *
 * この紙の値打ちは**手で書く欄が無い**ことなので、守るのは2つだけ:
 *   ・渡していない紙の節を**消さない**（空にすると「要求が無い」「未決が無い」と読める）
 *   ・同じ入力なら**刷り直して1バイトも変わらない**（日付を入れない＝古くならない）
 * 中身そのもの（読み返し・問い・助言）は、それぞれの道具の試験が見ている。
 */
const DEFINITION = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: id
  search:
    filters:
      - { field: orderNo, label: 受注番号 }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額 }
`;

const INTENT = `intent_version: "1.0"
page: order_search
asked:
  - id: R1
    text: 受注を受注番号で探せる
    covers: [filter:orderNo]
  - id: R2
    text: 承認できる
    covers: [action:approve]
    source: ai-draft
undecided:
  - id: U1
    text: 却下の理由の選択肢は未定
acceptance:
  - validate --warn-as-error が通ること
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

const sheet = (args: string[], files: Record<string, string>): string => {
  const io = fakeIo(files);
  expect(runCli(["design", ...args], io)).toBe(0);
  return io.stdout.join(String.fromCharCode(10));
};

const HEADINGS = [
  "## 言ったこと（要求）",
  "## 読み返し（定義にこう書いてあります）",
  "## 決まっていないこと",
  "## 書き足したほうがいい所（助言）",
  "## 終わりの判定",
  "## この紙が見ていないもの",
];

describe("設計書1枚", () => {
  it("節は**いつも全部**ある（渡していなくても消えない）", () => {
    const withAll = sheet(["def.yaml", "--intent", "i.yaml"], {
      "def.yaml": DEFINITION,
      "i.yaml": INTENT,
    });
    const alone = sheet(["def.yaml"], { "def.yaml": DEFINITION });
    for (const heading of HEADINGS) {
      expect(withAll, heading).toContain(heading);
      expect(alone, heading).toContain(heading);
    }
  });

  it("渡していない紙は「渡されていません」と書く（空にしない）", () => {
    const alone = sheet(["def.yaml"], { "def.yaml": DEFINITION });
    expect(alone).toContain("渡されていません");
    expect(alone).toContain("案件の前書きは読んでいません");
    expect(alone).toContain("何をもって終わりとするか");
  });

  it("言ったことは、定義のどこに落ちたかと一緒に並ぶ", () => {
    const text = sheet(["def.yaml", "--intent", "i.yaml"], {
      "def.yaml": DEFINITION,
      "i.yaml": INTENT,
    });
    expect(text).toContain("`R1`");
    expect(text).toContain("受注を受注番号で探せる");
    expect(text).toContain("`filter:orderNo`");
    // 人が見ていない下書きは、そう出る（見た気にさせない）。
    expect(text).toContain("まだ（AI の下書き）");
    // 言ったのに入っていないものは、食い違いの節に出る。
    expect(text).toContain("言ったのに入っていない");
    expect(text).toContain("action:approve");
    // 人が「まだ決めていない」と書いたことは、機械の問いとは別の節。
    expect(text).toContain("人が「まだ決めていない」と書いたこと");
    expect(text).toContain("却下の理由の選択肢は未定");
    expect(text).toContain("validate --warn-as-error が通ること");
  });

  it("**刷り直しても1バイトも変わらない**（日付を入れない）", () => {
    const files = { "def.yaml": DEFINITION, "i.yaml": INTENT };
    expect(sheet(["def.yaml", "--intent", "i.yaml"], files)).toBe(
      sheet(["def.yaml", "--intent", "i.yaml"], files),
    );
  });

  it("助言はこの紙にも載り、位置づけを毎回書く", () => {
    const text = sheet(["def.yaml"], { "def.yaml": DEFINITION });
    expect(text).toContain("[key-not-in-table]");
    expect(text).toContain("助言");
    expect(text).toContain("警告ではありません");
  });

  it("定義の隣の印で黙らせたら、この紙にもそう出る", () => {
    const text = sheet(["def.yaml"], {
      "def.yaml": DEFINITION.replace(
        "  key: id\n",
        "  key: id\n  # advise-off: key-not-in-table # 社内の一覧なので\n",
      ),
    });
    expect(text).not.toContain("[key-not-in-table]");
    expect(text).toContain("1 件を黙らせました");
  });

  it("定義を1つ渡さなければ、そう言う", () => {
    const io = fakeIo({});
    expect(runCli(["design"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain("1つ指定");
  });
});
