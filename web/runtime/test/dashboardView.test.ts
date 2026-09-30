import { FormatterRegistry } from "@hatake-fw/api";
import { describe, expect, it } from "vitest";

import { cardSpan, chartShape, dashboardValueText } from "../src/dashboardView.js";

/**
 * ダッシュボードの見せ方の決めごと（Flutter の `dashboard_page.dart` と同じ規則）。
 *
 * 0.9.19 までブラウザ版は `format` を読まずに `6480`、表のカードは行を
 * `Object.values().join(" / ")` で潰して **`[object Object]`** まで出していた。
 */
const item = (extra: Record<string, unknown> = {}) =>
  ({ id: "x", type: "metric", title: "x", span: 1, limit: 5, config: {}, columns: [], filters: {}, roles: [], ...extra }) as never;

describe("ダッシュボードの字", () => {
  const formatters = new FormatterRegistry();

  it("カードの format を通す（書いていれば ¥6,480）", () => {
    expect(dashboardValueText(formatters, item({ format: "currency", config: { symbol: "¥" } }), 6480)).toBe("¥6,480");
  });

  it("format を書いていなければ素の字", () => {
    expect(dashboardValueText(formatters, item(), 12)).toBe("12");
  });

  it("定まらないときは — （0 と出さない）", () => {
    expect(dashboardValueText(formatters, item({ format: "currency" }), null)).toBe("—");
  });
});

describe("段組み", () => {
  it("span は列の数を超えない", () => {
    expect(cardSpan(item({ span: 6 }), 4)).toBe(4);
    expect(cardSpan(item({ span: 2 }), 4)).toBe(2);
    expect(cardSpan(item({ span: 0 }), 4)).toBe(1);
  });
});

describe("図", () => {
  const text = (v: number | null) => String(v);

  it("棒は値の大きいほうが高い・底の線は 0", () => {
    const shape = chartShape("bar", [{ label: "G2", value: 1440 }, { label: "G1", value: 5040 }], text);
    if (shape.kind !== "bar") throw new Error(shape.kind);
    expect(shape.bars[1].height).toBeGreaterThan(shape.bars[0].height);
    expect(shape.bars[0].y + shape.bars[0].height).toBeCloseTo(shape.baseline);
    expect(shape.bars.map((one) => one.label)).toEqual(["G2", "G1"]);
  });

  it("点が無ければ空・知らない種類は黙って空にしない", () => {
    expect(chartShape("bar", [], text).kind).toBe("empty");
    expect(chartShape("radar", [{ label: "a", value: 1 }], text)).toEqual({ kind: "unsupported", name: "radar" });
  });

  it("円は1切れで全部でも消えない", () => {
    const shape = chartShape("pie", [{ label: "a", value: 3 }], text);
    if (shape.kind !== "pie") throw new Error(shape.kind);
    expect(shape.slices[0].path).toContain(" a ");
  });
});
