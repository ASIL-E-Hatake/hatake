import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADVICE_RULES,
  BUILTIN_RULES,
  type PitfallCatalog,
  renderRules,
  ruleNames,
  rulesCatalog,
  WARNING_RULES,
  WHERE_OWNERS,
} from "../src/internal.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 警告と助言の規則そのものを引く（`hatake rules`）。
 *
 * この1枚でいちばんまずいのは**実装とズレる**こと（引けない規則が出てくる／もう無い規則が
 * 載っている）。だから中身の文ではなく、**鍵の集合が一致すること**を機械で見る:
 *   ・実装が出しうる警告の名前 === 警告の表の鍵
 *   ・助言のつまみの表の鍵 === 助言の説明の表の鍵
 *   ・対照表への繋ぎは、実在する pitfall の id
 * 新しい規則を足したら、表に書くまでここが落ちる。
 */
const sources = {
  warnings: readFileSync(new URL("../src/warnings.ts", import.meta.url), "utf8"),
  actionNeeds: readFileSync(
    new URL("../src/actionNeeds.ts", import.meta.url),
    "utf8",
  ),
};

describe("表は実装とズレない", () => {
  const emitted = ruleNames(sources);

  it("**実装が出しうる警告の名前と、表の鍵が完全に一致する**", () => {
    expect(emitted).toEqual(Object.keys(WARNING_RULES).sort());
  });

  it("数え方そのものが効いている（数え漏らしたら上の一致は意味が無い）", () => {
    // そのまま書いてある名前・参照の種類の表・ボタンの表・使い回しの4つから拾う。
    expect(emitted).toContain("duplicate-action-id"); // そのまま書いてある
    expect(emitted).toContain("unknown-repository"); // 参照の種類の表
    expect(emitted).toContain("print-without-report"); // ボタンの表
    for (const owner of WHERE_OWNERS) {
      expect(emitted).toContain(`${owner}-where-mode`); // 使い回し
      expect(emitted).toContain(`${owner}-where-unknown-field`);
    }
    expect(emitted.length).toBeGreaterThan(80);
  });

  it("助言は、つまみの表と説明の表で鍵が同じ", () => {
    expect(Object.keys(ADVICE_RULES).sort()).toEqual(
      Object.keys(BUILTIN_RULES).sort(),
    );
  });

  it("対照表への繋ぎは、実在する id", () => {
    const catalog = JSON.parse(
      readFileSync("../spec/pitfalls.json", "utf8"),
    ) as PitfallCatalog;
    const known = new Set(catalog.pitfalls.map((one) => one.id));
    for (const [rule, doc] of Object.entries(WARNING_RULES)) {
      if (doc.pitfall === undefined) continue;
      expect(known, `${rule} → ${doc.pitfall}`).toContain(doc.pitfall);
    }
  });

  it("どの規則も、題・こうなる・直し方が空でない", () => {
    for (const [rule, doc] of Object.entries({
      ...WARNING_RULES,
      ...ADVICE_RULES,
    })) {
      for (const key of ["what", "happens", "fix"] as const) {
        expect(doc[key].length, `${rule}.${key}`).toBeGreaterThan(4);
      }
    }
  });
});

describe("引く", () => {
  it("全部を出すと、警告と助言に分かれている", () => {
    const catalog = rulesCatalog();
    expect(catalog.warnings.length).toBe(Object.keys(WARNING_RULES).length);
    expect(catalog.advice.length).toBe(Object.keys(ADVICE_RULES).length);
    expect(catalog.warnings.every((one) => one.kind === "warning")).toBe(true);
    expect(catalog.advice.every((one) => one.kind === "advice")).toBe(true);
  });

  it("名前を渡すと、その1件だけ", () => {
    const catalog = rulesCatalog("groupby-without-sort");
    expect(catalog.warnings).toHaveLength(1);
    expect(catalog.advice).toHaveLength(0);
    expect(catalog.warnings[0].pitfall).toBe("groupby-without-sort");
  });

  it("助言のつまみも引ける（無い規則には付けない）", () => {
    const withKnob = rulesCatalog("too-many-row-actions").advice[0];
    expect(withKnob.knobs).toEqual({ maxActions: "number" });
    expect(rulesCatalog("key-not-in-table").advice[0].knobs).toBeUndefined();
  });

  it("**知らない名前は空ではなく落とす**（引けなかったのか無いのか分かるように）", () => {
    expect(() => rulesCatalog("no-such-rule")).toThrow(/という規則はありません/);
  });

  it("人が読む形は、警告と助言の違いを毎回書く", () => {
    const text = renderRules(rulesCatalog());
    expect(text).toContain("書いたのに効かない");
    expect(text).toContain("終了コードは変わりません");
    expect(text).toContain("hatake ask の担当");
  });
});

describe("規則の表は、1件ごとの言い方の正でもある", () => {
  it("直し方を渡していない警告は、表の字がそのまま出る", async () => {
    const { findWarnings } = await import("../src/internal.js");
    const found = findWarnings({
      page: {
        type: "crud",
        id: "p",
        title: "t",
        repository: "r",
        actions: [
          { id: "a", type: "delete", label: "削除" },
          { id: "a", type: "delete", label: "削除2" },
        ],
      },
    } as Record<string, unknown>);
    const one = found.find((w) => w.rule === "duplicate-action-id");
    expect(one?.fix).toBe(WARNING_RULES["duplicate-action-id"].fix);
  });

  it("対照表への繋ぎも表から入る（呼び出し側は持たない）", async () => {
    const { findWarnings } = await import("../src/internal.js");
    const found = findWarnings({
      page: {
        type: "report",
        id: "p",
        title: "t",
        repository: "r",
        table: { columns: [{ field: "a", label: "A" }] },
        report: { groupBy: ["a"] },
      },
    } as Record<string, unknown>);
    expect(found.find((w) => w.rule === "groupby-without-sort")?.pitfall).toBe(
      "groupby-without-sort",
    );
  });
});

const fakeIo = () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo & { stdout: string[]; stderr: string[] } = {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: () => {},
    listFiles: () => null,
  };
  return io;
};

describe("hatake rules", () => {
  it("定義を渡さなくても引ける（書く前に読める）", () => {
    const io = fakeIo();
    expect(runCli(["rules", "--json"], io)).toBe(0);
    const catalog = JSON.parse(io.stdout.join(String.fromCharCode(10)));
    expect(catalog.warnings.length).toBeGreaterThan(80);
    expect(catalog.advice.length).toBeGreaterThan(15);
  });

  it("種類で絞れる", () => {
    const io = fakeIo();
    expect(runCli(["rules", "--kind", "advice", "--json"], io)).toBe(0);
    const catalog = JSON.parse(io.stdout.join(String.fromCharCode(10)));
    expect(catalog.warnings).toHaveLength(0);
    expect(catalog.advice.length).toBeGreaterThan(15);
  });

  it("知らない種類は落とす", () => {
    const io = fakeIo();
    expect(runCli(["rules", "--kind", "warnings"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain("warning か advice");
  });

  it("知らない規則名も落とす", () => {
    const io = fakeIo();
    expect(runCli(["rules", "no-such-rule"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain(
      "という規則はありません",
    );
  });
});
