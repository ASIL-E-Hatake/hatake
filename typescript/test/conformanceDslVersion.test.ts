import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkDslVersion,
  findWarnings,
  kDslVersion,
  parsePageYaml,
  DefinitionParseError,
} from "../src/index.js";

/**
 * DSL の版の受け取り方を、Dart 版・Java 版と同じ契約で回す。
 *
 * ここは**公開すると直せなくなる**所なので、印（`kind`）まで固定する。文面は版ごとの
 * 言葉でよいが、「通す／言う／落とす」と理由の印が3版で違ったら、同じ定義が版によって
 * 通ったり落ちたりする。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/dsl_version.json", "utf8"),
) as {
  current: string;
  warningRule: string;
  cases: { input: string | null; verdict: "ok" | "warn" | "error"; kind: string }[];
};

/** 版だけを差し替えた最小の定義。 */
const yamlOf = (version: string | null): string =>
  [
    version === null ? null : `dsl_version: ${JSON.stringify(version)}`,
    "type: form",
    "id: p",
    "title: 画面",
    "repository: r",
    "key: id",
    "form:",
    "  fields:",
    "    - { name: id, label: ID, type: text }",
  ]
    .filter((line) => line !== null)
    .join("\n");

describe("conformance: dsl_version", () => {
  it("この実装の版が、共有フィクスチャの現在の版と一致する", () => {
    expect(kDslVersion).toBe(fixture.current);
  });

  for (const one of fixture.cases) {
    const shown = one.input === null ? "（書かない）" : `"${one.input}"`;
    it(`${shown} → ${one.verdict} / ${one.kind}`, () => {
      const verdict = checkDslVersion(one.input ?? undefined);
      expect(verdict.kind).toBe(one.kind);
      expect(verdict.fatal).toBe(one.verdict === "error");
      expect(verdict.warn).toBe(one.verdict === "warn");
    });

    it(`${shown} → 解析と検証も同じ答えになる`, () => {
      const yaml = yamlOf(one.input);
      if (one.verdict === "error") {
        expect(() => parsePageYaml(yaml)).toThrow(DefinitionParseError);
        return;
      }
      expect(() => parsePageYaml(yaml)).not.toThrow();
      const rules = findWarnings(
        JSON.parse(JSON.stringify(yamlDocument(one.input))) as Record<string, unknown>,
      )
        .map((w) => w.rule)
        .filter((rule) => rule === fixture.warningRule);
      expect(rules.length).toBe(one.verdict === "warn" ? 1 : 0);
    });
  }
});

/** 検証は生のマップを見るので、YAML ではなく同じ中身のオブジェクトを渡す。 */
function yamlDocument(version: string | null): Record<string, unknown> {
  const page = {
    type: "form",
    id: "p",
    title: "画面",
    repository: "r",
    key: "id",
    form: { fields: [{ name: "id", label: "ID", type: "text" }] },
  };
  return version === null ? page : { dsl_version: version, ...page };
}
