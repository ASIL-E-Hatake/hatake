import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type FailureCatalog,
  renderRuleCase,
  renderRuleCases,
  type RuleCaseCatalog,
  ruleCaseEntries,
  rulesCatalog,
  runRuleCases,
} from "../src/index.js";
import { parseAppYaml, parsePageYaml } from "../src/index.js";
import { stringify as toYaml } from "yaml";

/**
 * 規則ごとの「転ぶ定義」。
 *
 * 規則の表は**名前の集合**までしか突き合わせていなかった＝説明だけが古くなっても
 * 誰も気づけない。ここで見るのは4つ:
 *   ・**書いた定義で、本当にその規則が出る**（出なければ落とす）
 *   ・表に無い規則の定義が残っていない（規則が消えた／名前が変わった）
 *   ・**覆いが減っていない**（規則を足して定義を書かない、を通さない）
 *   ・**その定義が定義として通る**（スキーマに通らない紙は実例にならない）
 */
const read = <T>(name: string): T =>
  JSON.parse(readFileSync(`../spec/${name}`, "utf8")) as T;

const rules = rulesCatalog();
const collected = ruleCaseEntries({
  rules,
  cases: read<RuleCaseCatalog>("rule-cases.json"),
  failures: read<FailureCatalog>("failures.json"),
});
const report = runRuleCases(collected.entries, rules, collected.unknown);

/**
 * いま覆えている数の**下限**。
 *
 * 全部（`total`）を要求すると、規則を足した瞬間に落ちる＝それでよい（足したら定義も
 * 書く）。減らす方向の変更を黙って通さないための数でもある。
 */
const FLOOR = 114;

describe("規則ごとの「転ぶ定義」", () => {
  it("**書いた定義で、本当にその規則が出る**", () => {
    expect(
      report.broken.map((one) => `${one.rule}（出たのは ${one.got.join(" / ")}）`),
    ).toEqual([]);
  });

  it("表に無い規則の定義は残っていない", () => {
    expect(report.unknown).toEqual([]);
  });

  it("**規則の全部に転ぶ定義がある**（覆いは減らせない）", () => {
    expect(report.missing).toEqual([]);
    expect(report.covered).toBe(report.total);
    expect(report.covered).toBeGreaterThanOrEqual(FLOOR);
  });

  it("警告と助言の両方を覆っている（片方だけ走らせていない）", () => {
    const kinds = new Set(report.results.map((one) => one.kind));
    expect([...kinds].sort()).toEqual(["advice", "warning"]);
  });

  it("実例が在る規則は、実例のほうを使う（同じ規則に2つ持たない）", () => {
    const seen = report.results.map((one) => one.rule);
    expect(new Set(seen).size).toBe(seen.length);
    const failure = report.results.find((one) => one.source === "failure");
    expect(failure?.from).toBeDefined();
  });

  it("**転ぶ定義は、定義としては通る**（読めない紙は実例にならない）", () => {
    // 読み手は CLI と同じもの（strict のキー検査つき）＝試験用の緩い読み手を作らない。
    // `readable: false` と書いたものは**逆向きに**見る（読めてしまったら印が古い）。
    for (const one of report.results) {
      const yaml = toYaml(one.document);
      const read = () => {
        if ("app" in one.document) parseAppYaml(yaml, { strict: true });
        else parsePageYaml(yaml, { strict: true });
      };
      if (one.readable) expect(read, one.rule).not.toThrow();
      else expect(read, one.rule).toThrow();
    }
  });

  it("読み手が断る書き方は、そう断ってから渡す（黙って実例にしない）", () => {
    const unreadable = report.results.filter((one) => !one.readable);
    expect(unreadable.length).toBeGreaterThan(0);
    expect(renderRuleCase(unreadable[0])).toContain("読み手が先に断ります");
  });

  it("**転ばない定義を混ぜたら落ちる**（この検査そのものが効いている）", () => {
    const broken = runRuleCases(
      ruleCaseEntries({
        rules,
        cases: {
          cases: [
            {
              rule: "groupby-without-sort",
              page: {
                type: "report",
                id: "r",
                title: "R",
                repository: "repo",
                table: { columns: [{ field: "a", label: "A" }] },
                report: { sort: { field: "a" } },
              },
            },
          ],
        },
      }).entries,
      rules,
    );
    expect(broken.broken.map((one) => one.rule)).toEqual([
      "groupby-without-sort",
    ]);
    expect(renderRuleCases(broken)).toContain("説明のとおりに転びません");
  });

  it("消えた規則の置き土産も言う", () => {
    const stale = ruleCaseEntries({
      rules,
      cases: { cases: [{ rule: "no-such-rule", page: {} }] },
    });
    expect(stale.entries).toHaveLength(0);
    expect(stale.unknown).toEqual(["no-such-rule（rule-cases）"]);
  });

  it("引ける形で渡す（そのまま貼れる YAML と、要る登録済み一覧）", () => {
    const one = report.results.find((x) => x.rule === "unknown-plugin");
    const text = renderRuleCase(one!);
    expect(text).toContain("dsl_version:");
    expect(text).toContain("plugin: rejectOrders");
    expect(text).toContain("登録済み一覧を渡したときだけ");
    const plain = report.results.find((x) => x.rule === "groupby-without-sort");
    expect(renderRuleCase(plain!)).not.toContain("登録済み一覧を渡したときだけ");
  });

  it("数は先に出す（読まれるのは数のほう）", () => {
    const text = renderRuleCases(report);
    expect(text).toContain(`規則 ${report.total} 件のうち ${report.covered} 件`);
    expect(text).toContain("実際にかけました");
    // 見ていないことも言う（言い回しが正しいかは見ていない）。
    expect(text).toContain("その規則が出ること");
  });
});
