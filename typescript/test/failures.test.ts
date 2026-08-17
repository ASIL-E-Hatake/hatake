import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  describeFailure,
  explainPage,
  type FailureCatalog,
  failureSource,
  filterFailures,
  findWarnings,
  findUnknownKeys,
  parsePageYaml,
  type PitfallCatalog,
  renderExplain,
} from "../src/index.js";

const catalog = JSON.parse(
  readFileSync("../spec/failures.json", "utf8"),
) as FailureCatalog;

/** 定義を本当にかけ直す。返すのは道具が言うことだけ。 */
function diagnose(
  lines: string[],
  registry?: FailureCatalog["failures"][number]["registry"],
): { warnings: string[]; unknownKeys: string[] } {
  const document = parseYaml(failureSource(lines)) as Record<string, unknown>;
  return {
    warnings: findWarnings(document, { registry }).map((w) => w.rule),
    unknownKeys: findUnknownKeys(document).map((k) => k.key),
  };
}

describe("実際に転んだ実例のカタログ", () => {
  it("1件以上ある", () => {
    expect(catalog.failures.length).toBeGreaterThan(0);
  });

  it("id が重複していない", () => {
    const ids = catalog.failures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ここが本体。記録した診断が、いまの道具の答えと一致すること。ズレたら
  // 「カタログが古い」か「診断の質が落ちた」のどちらかで、どちらも知りたい。
  for (const failure of catalog.failures) {
    it(`${failure.id}: 記録どおりの診断が出る`, () => {
      const actual = diagnose(failure.wrote, failure.registry);
      expect([...actual.warnings].sort()).toEqual(
        [...(failure.diagnosis.warnings ?? [])].sort(),
      );
      expect([...actual.unknownKeys].sort()).toEqual(
        [...(failure.diagnosis.unknownKeys ?? [])].sort(),
      );
    });

    it(`${failure.id}: 直したものは問題ゼロで通る`, () => {
      const actual = diagnose(failure.fixed, failure.registry);
      expect(actual.warnings).toEqual([]);
      expect(actual.unknownKeys).toEqual([]);
    });
  }

  it("機械で拾えない件には、レビューの着眼点が書いてある", () => {
    for (const failure of catalog.failures) {
      const detected =
        (failure.diagnosis.warnings ?? []).length > 0 ||
        (failure.diagnosis.unknownKeys ?? []).length > 0;
      if (!detected) {
        expect(failure.review, failure.id).toBeTypeOf("string");
      }
    }
  });

  it("拾えない件も載っている（道具が万全だという嘘をつかない）", () => {
    const undetected = catalog.failures.filter(
      (f) =>
        (f.diagnosis.warnings ?? []).length === 0 &&
        (f.diagnosis.unknownKeys ?? []).length === 0,
    );
    expect(undetected.length).toBeGreaterThan(0);
  });

  // 拾えない件の review は「explain で読み返すと見える」と言っている。言っているだけに
  // しないで、本当に見えることを確かめる（言い放ちを許すと、この表も嘘をつき始める）。
  it("機械で拾えない件は、explain で読み返すと日本語で見える", () => {
    const failure = catalog.failures.find(
      (f) => f.id === "condition-looks-right-but-never-holds",
    );
    expect(failure).toBeDefined();
    const source = failureSource(failure!.wrote);
    const text = renderExplain(explainPage(parsePageYaml(source, { strict: true })));
    expect(text).toContain("請求先（区分 が 法人 のときだけ出る枠）");
    expect(text).toContain("区分 が 個人 のときは直せない");
  });

  it("どの件も「なぜそう書くか」を持つ（対照表との違いはそこ）", () => {
    for (const failure of catalog.failures) {
      expect(failure.why.length, failure.id).toBeGreaterThan(20);
      expect(failure.title.length, failure.id).toBeGreaterThan(5);
    }
  });

  it("対照表と id がぶつかっていない（別の表なので混ぜない）", () => {
    const pitfalls = JSON.parse(
      readFileSync("../spec/pitfalls.json", "utf8"),
    ) as PitfallCatalog;
    const ids = new Set(pitfalls.pitfalls.map((p) => p.id));
    for (const failure of catalog.failures) {
      expect(ids.has(failure.id), failure.id).toBe(false);
    }
  });
});

describe("引く", () => {
  it("query 無しなら全件", () => {
    expect(filterFailures(catalog)).toHaveLength(catalog.failures.length);
  });

  it("警告の規則名でも引ける（落ちてから引く道）", () => {
    const found = filterFailures(catalog, "unknown-repository");
    expect(found.map((f) => f.id)).toContain("repository-name-guessed");
  });

  it("日本語でも引ける", () => {
    expect(filterFailures(catalog, "遷移").length).toBeGreaterThan(0);
  });

  it("当たらなければ空", () => {
    expect(filterFailures(catalog, "そんな間違いはない")).toEqual([]);
  });

  it("人が読む形は「こう書いた → こう言われた → こう直す」", () => {
    const text = describeFailure(catalog.failures[0]);
    expect(text).toContain("なぜそう書くか:");
    expect(text).toContain("道具が言うこと:");
    expect(text).toContain("直し方:");
  });

  it("拾えない件は「何も言われない」と書く", () => {
    const undetected = catalog.failures.find(
      (f) => (f.diagnosis.warnings ?? []).length === 0,
    );
    expect(describeFailure(undetected!)).toContain("機械では拾えない");
  });
});
