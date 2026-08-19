import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  COMPARE_OPERATORS,
  type DslReference,
  em,
  explainPhrases,
  fill,
  type PhraseCategory,
  SHORT_KINDS,
} from "../src/index.js";

/** 語彙の正。各エディションはここを転記する。 */
const vocabulary = JSON.parse(
  readFileSync("../spec/vocabulary.json", "utf8"),
) as Record<string, Record<string, unknown>>;

const reference: DslReference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

/** そのキーに書ける組み込みの値（リファレンス＝スキーマ由来）。 */
function builtInValues(node: string, key: string): string[] {
  const found = reference.nodes[node]?.keys.find((one) => one.key === key);
  return found?.values ?? [];
}

/** 語彙のカテゴリ → リファレンスのどこの値か。 */
const SOURCES: Record<PhraseCategory, () => string[]> = {
  pageKinds: () => reference.pageKinds.map((kind) => kind.type),
  filterOperators: () => builtInValues("filter", "operator"),
  conditionOperators: () => builtInValues("condition", "operator"),
  fieldTypes: () => builtInValues("field", "type"),
  validators: () => builtInValues("validator", "type"),
  // compare の突合はスキーマの enum ではなく**検証のパラメータ**なので、
  // 突き合わせの相手は実装側の一覧になる（片方だけ増えたらここで落ちる）。
  compareOperators: () => [...COMPARE_OPERATORS],
  formatters: () => builtInValues("column", "format"),
  converters: () => builtInValues("field", "normalize"),
  actionTypes: () => builtInValues("action", "type"),
  aggregates: () => builtInValues("dashboardValue", "aggregate"),
  chartKinds: () => builtInValues("chart", "kind"),
};

const categories = Object.keys(explainPhrases) as PhraseCategory[];

describe("語彙は spec が正", () => {
  it("TypeScript 版の表は spec/vocabulary.json の日本語と完全に一致する", () => {
    for (const category of categories) {
      const spec = vocabulary[category];
      expect(spec, category).toBeDefined();
      const mine = explainPhrases[category] as Record<string, unknown>;
      expect(Object.keys(mine).sort(), category).toEqual(Object.keys(spec).sort());
      for (const [name, value] of Object.entries(spec)) {
        const entry = value as Record<string, any>;
        const where = `${category}.${name}`;
        if (category === "pageKinds") {
          expect(mine[name], where).toEqual({
            what: entry.what.ja,
            short: entry.short.ja,
            cannot: entry.cannot.ja,
          });
        } else {
          expect(mine[name], where).toBe(entry.ja);
        }
      }
    }
  });

  it("英語版も同じ語を持つ（説明の英語版はこの列から作る）", () => {
    for (const category of categories) {
      for (const [name, value] of Object.entries(vocabulary[category])) {
        const entry = value as Record<string, any>;
        const where = `${category}.${name}`;
        if (category === "pageKinds") {
          for (const key of ["what", "short"] as const) {
            expect(entry[key].en, `${where}.${key}`).toBeTypeOf("string");
            expect(entry[key].en.length, `${where}.${key}`).toBeGreaterThan(0);
          }
          expect(entry.cannot.en.length, where).toBe(entry.cannot.ja.length);
        } else {
          expect(entry.en, where).toBeTypeOf("string");
          expect(entry.en.length, where).toBeGreaterThan(0);
        }
      }
    }
  });

  // ここが「嘘をつけない」ところ。組み込みの値を増やしたら、語彙にも語が要る。
  it("組み込みの値には全部、語がある（増やしたら語も要る）", () => {
    for (const category of categories) {
      const values = SOURCES[category]();
      expect(values.length, category).toBeGreaterThan(0);
      for (const value of values) {
        expect(
          Object.keys(vocabulary[category]),
          `${category}: ${value} の語が spec/vocabulary.json に無い`,
        ).toContain(value);
      }
    }
  });

  it("語彙に、DSL から消えた値が残っていない", () => {
    for (const category of categories) {
      const values = new Set(SOURCES[category]());
      for (const name of Object.keys(vocabulary[category])) {
        expect(
          values.has(name),
          `${category}: ${name} は DSL の組み込みの値ではない`,
        ).toBe(true);
      }
    }
  });

  // 短い見出し語は「1行に収める」ためだけに在る。長い語を書いたら索引の桁が崩れるので、
  // 語を足すときに気づけるようにしておく（全角15文字ぶんを上限とする）。
  it("見出し語（short）は1行に収まる長さ", () => {
    for (const [kind, value] of Object.entries(vocabulary.pageKinds)) {
      const short = (value as Record<string, any>).short.ja as string;
      expect(em(short), `${kind}: ${short}`).toBeLessThanOrEqual(15);
      expect(SHORT_KINDS[kind], kind).toBe(short);
    }
  });

  it("差し込みが要る語には差し込み位置がある（両方の言語で）", () => {
    // 値を見せる語（`{value} 文字以内`）は、片方の言語だけ埋め忘れると意味が変わる。
    for (const category of ["conditionOperators", "validators"] as const) {
      for (const [name, value] of Object.entries(vocabulary[category])) {
        const entry = value as Record<string, string>;
        expect(entry.ja.includes("{value}"), `${category}.${name}`).toBe(
          entry.en.includes("{value}"),
        );
      }
    }
  });
});

describe("差し込み", () => {
  it("{value} を埋める", () => {
    expect(fill("{value} 文字以内", 20)).toBe("20 文字以内");
    expect(fill("が {value} のとき", "法人")).toBe("が 法人 のとき");
  });

  it("埋める所が無ければそのまま", () => {
    expect(fill("必須", undefined)).toBe("必須");
  });
});
