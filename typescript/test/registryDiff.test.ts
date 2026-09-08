import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ANSWER_KINDS,
  SKIP_REASONS,
  compareRegistries,
  comparisonLines,
} from "../src/registryDiff.js";
import { RefKinds } from "../src/refs.js";

/**
 * 画面とサーバの「足したもの」を突き合わせる道具。
 *
 * 見るのは**答えを決める種類だけ**。片側にしか無くて当然の種類を食い違いとして並べると
 * 報告が読まれなくなるので、そこは理由つきで「見なかった」に落とす。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/registry_snapshot.json", "utf8"),
) as {
  answerKinds: string[];
  compare: {
    app: Record<string, string[]>;
    server: Record<string, string[]>;
    expected: {
      gaps: { kind: string; name: string; missingFrom: string }[];
      skipped: string[];
    };
  };
};

describe("conformance: 画面とサーバの登録を突き合わせる", () => {
  it("答えを決める種類は spec と一致する", () => {
    expect([...ANSWER_KINDS].sort()).toEqual([...fixture.answerKinds].sort());
  });

  it("片側にしか無い登録を、種類 → 名前の順で挙げる", () => {
    const result = compareRegistries(fixture.compare.app, fixture.compare.server);
    expect(result.gaps).toEqual(fixture.compare.expected.gaps);
  });

  it("見なかった種類は、実際に一覧に出ているものだけ挙げる", () => {
    const result = compareRegistries(fixture.compare.app, fixture.compare.server);
    expect(result.skipped.map((one) => one.kind)).toEqual(
      fixture.compare.expected.skipped,
    );
    // 理由の無い「見なかった」は、黙って見ていないのと同じ。
    for (const one of result.skipped) expect(one.why).not.toBe("");
  });
});

describe("registry --compare", () => {
  it("答えを決めない種類は、どれも理由を持っている", () => {
    // 種類が増えたときに「黙って見ない」を作らせないための突き合わせ。
    for (const kind of Object.values(RefKinds)) {
      if (ANSWER_KINDS.includes(kind)) continue;
      expect(SKIP_REASONS[kind], kind).toBeTypeOf("string");
    }
  });

  it("答えを決める種類には、逆に理由を書かない（見るものなので）", () => {
    for (const kind of ANSWER_KINDS) {
      expect(SKIP_REASONS[kind], kind).toBeUndefined();
    }
  });

  it("同じものを足していれば、食い違いは無い", () => {
    const both = { validators: ["memberCode"], computedOps: ["consumptionTax"] };
    const result = compareRegistries(both, { ...both });
    expect(result.gaps).toEqual([]);
    expect(result.nothingToCompare).toBe(false);
    expect(comparisonLines(result)[0]).toContain("画面とサーバで同じ");
  });

  it("どちらも何も足していなければ、突き合わせるものが無いと言う", () => {
    // 「同じです」と言うと、確かめた気になる（確かめていない）。
    const result = compareRegistries({ repositories: ["orderRepository"] }, {});
    expect(result.nothingToCompare).toBe(true);
    expect(comparisonLines(result)[0]).toContain("突き合わせるものがありません");
  });

  it("種類が無い側は「足していない」と読む（空と同じ）", () => {
    // 一覧は「足したもの全部」なので、種類が無いのは足していないという意味。
    const result = compareRegistries({ validators: ["even"] }, {});
    expect(result.gaps).toEqual([
      { kind: "validators", name: "even", missingFrom: "server" },
    ]);
  });

  it("文字列でない名前は読まない（壊れた一覧で落ちない）", () => {
    const result = compareRegistries({ validators: [1, "even"] } as never, {
      validators: ["even"],
    });
    expect(result.gaps).toEqual([]);
  });
});
