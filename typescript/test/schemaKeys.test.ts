import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { YAML11_WORDS } from "../src/index.js";

/**
 * spec のスキーマが決めるキー名は、**どちらの読み手でも同じキーになる**こと。
 *
 * YAML には版が2つあり、読み手によって解釈が違う:
 *   ・YAML 1.2（TypeScript の `yaml`）… `on:` は文字の "on"
 *   ・YAML 1.1（PyYAML＝スキーマ検証）… `on:` は**真偽値の true**
 *
 * つまり `on` というキーを作ると、TS 側では通るのに検証では「知らないキー `True`」で
 * 落ちる（実際に落ちた）。読み手が2つあるものは、**書ける字も2つの読み手の共通部分**に
 * しておかないと、片方でしか動かない紙ができる。
 *
 * 語の一覧は書く側（[yamlWrite]）と同じものを使う＝同じことを2か所に持たない。
 */
const SCHEMAS = "../spec";

const schemaFiles = (): string[] =>
  readdirSync(SCHEMAS)
    .filter((name) => name.endsWith(".schema.json"))
    .map((name) => `${SCHEMAS}/${name}`);

/** スキーマの中の `properties` のキーを全部集める（入れ子も見る）。 */
function propertyNames(node: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const one of node) propertyNames(one, found);
    return found;
  }
  if (typeof node !== "object" || node === null) return found;
  const dict = node as Record<string, unknown>;
  const properties = dict.properties;
  if (typeof properties === "object" && properties !== null) {
    for (const key of Object.keys(properties)) found.add(key);
  }
  for (const value of Object.values(dict)) propertyNames(value, found);
  return found;
}

/** そのスキーマの中で、読み手によって別のキーになる名前。 */
const badNames = (schema: unknown): string[] => {
  const bad = new Set(YAML11_WORDS.map((word) => word.toLowerCase()));
  return [...propertyNames(schema)].filter((name) =>
    bad.has(name.toLowerCase()),
  );
};

describe("スキーマのキー名は、どちらの YAML でも同じキーになる", () => {
  it("同梱のスキーマに YAML 1.1 で真偽値になる名前は無い", () => {
    const files = schemaFiles();
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const schema: unknown = JSON.parse(readFileSync(file, "utf8"));
      expect(propertyNames(schema).size, file).toBeGreaterThan(0);
      expect(badNames(schema), file).toEqual([]);
    }
  });

  it("その名前を足したら見つける（見張りが本当に動く）", () => {
    // 実際に落ちた形＝`on:` は PyYAML では真偽値になり、キーが `True` になる。
    expect(
      badNames({
        type: "object",
        properties: {
          questions: {
            properties: { decided: { items: { properties: { on: {} } } } },
          },
        },
      }),
    ).toEqual(["on"]);
  });

  it("見張っている語には on / off / yes / no が入っている（この事故そのもの）", () => {
    for (const word of ["on", "off", "yes", "no", "true", "false"]) {
      expect(YAML11_WORDS as readonly string[]).toContain(word);
    }
  });
});
