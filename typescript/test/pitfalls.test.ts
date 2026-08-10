import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  filterPitfalls,
  parseAppYaml,
  parsePageYaml,
  type PitfallCatalog,
  pitfallsForKeys,
  snippet,
  UnknownKeysError,
} from "../src/index.js";

const catalog = JSON.parse(
  readFileSync("../spec/pitfalls.json", "utf8"),
) as PitfallCatalog;

const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

const parse = (source: string) =>
  /^\s*app\s*:/m.test(source)
    ? parseAppYaml(source, { strict: true })
    : parsePageYaml(source, { strict: true });

describe("よくある間違いの対照表", () => {
  it("id が重複していない", () => {
    const ids = catalog.pitfalls.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("日本語と英語が両方入っている（片方の使い回しでもない）", () => {
    for (const pitfall of catalog.pitfalls) {
      for (const field of ["wrong", "why", "fix"] as const) {
        const text = pitfall[field];
        expect(text.ja.length, `${pitfall.id}.${field}.ja`).toBeGreaterThan(5);
        expect(text.en.length, `${pitfall.id}.${field}.en`).toBeGreaterThan(5);
        expect(text.ja, `${pitfall.id}.${field}`).not.toEqual(text.en);
      }
    }
  });

  it("参照しているキーとページ種別が実在する", () => {
    const kinds = new Set(reference.pageKinds.map((k) => k.type));
    for (const pitfall of catalog.pitfalls) {
      expect(pitfall.keys.length, pitfall.id).toBeGreaterThan(0);
      for (const key of pitfall.keys) {
        expect(reference.keyIndex[key], `${pitfall.id}: ${key}`).toBeDefined();
      }
      for (const kind of pitfall.pageKinds) {
        expect(kinds.has(kind), `${pitfall.id}: ${kind}`).toBe(true);
      }
    }
  });

  // ここが対照表の生命線。載せた「正しい書き方」が本当に通り、「間違い」が本当に
  // 落ちることを確かめる。そうでないと、間違いを教える表になる。
  for (const pitfall of catalog.pitfalls) {
    describe(pitfall.id, () => {
      it("正しい書き方は strict を通る", () => {
        const good = snippet(pitfall.good);
        expect(() => parse(good), good).not.toThrow();
      });

      if (pitfall.bad !== undefined) {
        const bad = snippet(pitfall.bad);

        it("間違った書き方は strict で落ちる", () => {
          expect(() => parse(bad), bad).toThrow(UnknownKeysError);
        });

        it("落ちたときに、この落とし穴が引ける", () => {
          // 未知キーの名前から助言を引く仕掛けが、自分の例で実際に効くこと。
          try {
            parse(bad);
            throw new Error("落ちるはずの例が通ってしまった");
          } catch (error) {
            expect(error).toBeInstanceOf(UnknownKeysError);
            const keys = (error as UnknownKeysError).keys.map((k) => k.key);
            const found = pitfallsForKeys(catalog, keys).map((p) => p.id);
            expect(found).toContain(pitfall.id);
          }
        });
      }
    });
  }
});

describe("引き方", () => {
  it("未知キーの名前から引ける", () => {
    expect(pitfallsForKeys(catalog, ["form"]).map((p) => p.id)).toEqual([
      "form-on-page-without-form",
    ]);
    expect(pitfallsForKeys(catalog, ["nope"])).toEqual([]);
    // 複数の未知キーがあれば、当てはまるものを全部返す。
    expect(pitfallsForKeys(catalog, ["columns", "fields"]).length).toBe(2);
  });

  it("キー名でも日本語でも絞れる", () => {
    expect(filterPitfalls(catalog, "groupBy").map((p) => p.id)).toEqual([
      "groupby-without-sort",
    ]);
    expect(filterPitfalls(catalog, "コントロールブレイク").length).toBe(1);
    expect(filterPitfalls(catalog)).toHaveLength(catalog.pitfalls.length);
    expect(filterPitfalls(catalog, "ブロックチェーン")).toEqual([]);
  });

  it("落ちない類の間違いも載っている（strict では気づけない分）", () => {
    // bad が無い＝「書いても落ちないが意図と違う」もの。ここが表の価値の半分。
    const silent = catalog.pitfalls.filter((p) => p.bad === undefined);
    expect(silent.length).toBeGreaterThan(2);
    expect(silent.map((p) => p.id)).toContain("groupby-without-sort");
  });
});
