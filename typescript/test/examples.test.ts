import { readdirSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  type ExampleCatalog,
  filterExamples,
  parseAppYaml,
  parsePageYaml,
} from "../src/index.js";

const DIR = "../spec/examples";

const catalog = JSON.parse(
  readFileSync(`${DIR}/index.json`, "utf8"),
) as ExampleCatalog;

const reference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

/** 定義の中に実際に書かれているキーを全部集める。 */
function keysIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysIn(item, found);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      keysIn(child, found);
    }
  }
  return found;
}

describe("例のカタログ", () => {
  it("spec/examples の中身と1対1で対応する", () => {
    // 例を足してカタログに載せ忘れる（＝誰にも見つけてもらえない）を防ぐ。
    const onDisk = readdirSync(DIR)
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    expect([...catalog.examples.map((e) => e.file)].sort()).toEqual(onDisk);
  });

  for (const example of catalog.examples) {
    describe(example.file, () => {
      const source = readFileSync(`${DIR}/${example.file}`, "utf8");
      const document = parseYaml(source);

      it("strict で読める", () => {
        // 例は真似される。間違ったまま置いておくと間違いが広まる。
        expect(() =>
          example.kind === "app"
            ? parseAppYaml(source, { strict: true })
            : parsePageYaml(source, { strict: true }),
        ).not.toThrow();
      });

      it("カタログの種別と画面名が定義と一致する", () => {
        if (example.kind === "app") {
          const app = parseAppYaml(source, { strict: true });
          expect(app.title).toEqual(example.title);
        } else {
          const page = parsePageYaml(source, { strict: true });
          expect(page.kind).toEqual(example.kind);
          expect(page.title).toEqual(example.title);
        }
      });

      it("カタログの keys が実在して、実際に使われている", () => {
        const used = keysIn(document);
        for (const key of example.keys) {
          expect(reference.keyIndex[key], `${key} は DSL に無いキー`).toBeDefined();
          expect(used.has(key), `${key} はこの例で使われていない`).toBe(true);
        }
      });
    });
  }
});

describe("カタログの引き方", () => {
  it("やりたいことでも機能名でも当たる", () => {
    expect(filterExamples(catalog, "帳票").map((e) => e.file)).toEqual([
      "sales_report.yaml",
    ]);
    expect(filterExamples(catalog, "subTable").map((e) => e.file)).toEqual([
      "order_entry.yaml",
      "order_entry_paged.yaml",
    ]);
    // 種別で引くと、その種別の例が出る。
    expect(filterExamples(catalog, "dashboard").map((e) => e.file)).toEqual([
      "sales_dashboard.yaml",
    ]);
    expect(filterExamples(catalog, "小計")).toHaveLength(1);
    expect(filterExamples(catalog)).toHaveLength(catalog.examples.length);
    expect(filterExamples(catalog, "ブロックチェーン")).toEqual([]);
  });

  it("8種別すべてに例がある", () => {
    const kinds = new Set(catalog.examples.map((e) => e.kind));
    for (const pageKind of reference.pageKinds) {
      expect(kinds.has(pageKind.type), `${pageKind.type} の例が無い`).toBe(true);
    }
    expect(kinds.has("app")).toBe(true);
  });
});
