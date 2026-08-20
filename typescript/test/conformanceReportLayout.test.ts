// 紙の上の座標が、刷る側（Dart）と読ませる側（TS）で1つも違わないこと。
//
// この表がズレていると、**AI や人が読んだ紙と、実際に刷った紙が別物**になる。
// 座標は数なので、比べれば必ず分かる。
//
// フィクスチャは strict で読む＝**本当に書ける定義**であることも同時に縛る
// （書けない形を固定してしまうのが、共有フィクスチャで一番まずい事故）。

import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  layoutReport,
  parsePageJson,
  printStyle,
  type PrintItem,
  type PrintLayout,
  type ReportPageDefinition,
} from "../src/index.js";

const PATH = "../spec/conformance/report_layout.json";

interface Case {
  name: string;
  page: Record<string, unknown>;
  rows: Record<string, unknown>[];
  roles?: string[];
  style?: Record<string, unknown>;
  expected: string[][];
}

const catalog = JSON.parse(readFileSync(PATH, "utf8")) as {
  encoding: string;
  cases: Case[];
};

/** 小数2桁まで・末尾の 0 と小数点は落とす（フィクスチャの決めごと）。 */
const num = (value: number): string =>
  value.toFixed(2).replace(/\.?0+$/, "") || "0";

/** 1つの item を1行の文字列にする。 */
const encode = (item: PrintItem): string =>
  item.kind === "text"
    ? [
        "T",
        num(item.x),
        num(item.y),
        num(item.width),
        num(item.size),
        item.align,
        item.bold ? "bold" : "-",
        item.text,
      ].join("|")
    : ["R", num(item.x), num(item.y), num(item.width), num(item.thickness)].join("|");

const encodeLayout = (layout: PrintLayout): string[][] =>
  layout.pages.map((page) => page.items.map(encode));

function layoutOf(one: Case): PrintLayout {
  const page = parsePageJson(JSON.stringify({ page: one.page }), {
    strict: true,
  }) as ReportPageDefinition;
  return layoutReport(page, buildReport(page.report, one.rows), {
    roles: one.roles ?? [],
    style: printStyle(one.style ?? {}),
  });
}

describe("conformance: 紙の上の座標（report_layout.json）", () => {
  it("フィクスチャに件数がある", () => {
    expect(catalog.cases.length).toBeGreaterThan(0);
  });

  for (const one of catalog.cases) {
    it(one.name, () => {
      expect(encodeLayout(layoutOf(one))).toEqual(one.expected);
    });
  }

  // 期待値の作り直し（体裁を変えたときだけ使う）。走らせたら**必ず中身を読む**こと。
  it.skipIf(process.env.WRITE_LAYOUT_FIXTURE !== "1")(
    "期待値を作り直す（WRITE_LAYOUT_FIXTURE=1 のときだけ）",
    () => {
      const next = {
        ...catalog,
        cases: catalog.cases.map((one) => ({
          ...one,
          expected: encodeLayout(layoutOf(one)),
        })),
      };
      writeFileSync(PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    },
  );
});
