import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareAnswer,
  parsePageJson,
  runCase,
  type PageDefinition,
  type ScenarioCase,
} from "../src/index.js";

// シナリオ（定義を動かして答えを見る）の共有フィクスチャ。Dart 版も同じものを食べる
// ＝**画面の中と道具の答えがズレない**ことが、この道具の値打ちなので。
const fixture = JSON.parse(
  readFileSync("../spec/conformance/scenario.json", "utf8"),
);

describe("conformance: scenario", () => {
  // strict で読む＝フィクスチャが「本当に書ける定義」であることも縛る。
  const page = parsePageJson(JSON.stringify(fixture.page), {
    strict: true,
  }) as PageDefinition;

  for (const one of fixture.cases as ScenarioCase[]) {
    it(one.name, () => {
      const answer = runCase(page, one);
      expect(compareAnswer(one.expect, answer)).toEqual([]);
    });
  }

  // 期待の**全部**が答えと一致することも見る（`compareAnswer` は書いた欄だけ見るので、
  // 表の側が欄を書き忘れても通ってしまう。表は6つの欄を全部持っている）。
  it("表はどの件でも5つの欄を全部書いている（書き忘れで緩くならない）", () => {
    for (const one of fixture.cases as ScenarioCase[]) {
      expect(Object.keys(one.expect ?? {}).sort(), one.name).toEqual([
        "computed",
        "enabled",
        "errors",
        "hidden",
        "required",
      ]);
    }
  });

  it("答えの中身そのものが表と同じ（順不同ではなく、まるごと）", () => {
    for (const one of fixture.cases as ScenarioCase[]) {
      const answer = runCase(page, one);
      expect(
        {
          errors: [...answer.errors].sort((a, b) =>
            `${a.field}${a.message}`.localeCompare(`${b.field}${b.message}`),
          ),
          computed: answer.computed,
          enabled: answer.enabled,
          hidden: [...answer.hidden].sort(),
          required: [...answer.required].sort(),
        },
        one.name,
      ).toEqual({
        errors: [...(one.expect?.errors ?? [])].sort((a, b) =>
          `${a.field}${a.message}`.localeCompare(`${b.field}${b.message}`),
        ),
        computed: one.expect?.computed,
        enabled: one.expect?.enabled,
        hidden: [...(one.expect?.hidden ?? [])].sort(),
        required: [...(one.expect?.required ?? [])].sort(),
      });
    }
  });
});
