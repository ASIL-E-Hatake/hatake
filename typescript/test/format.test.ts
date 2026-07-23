import { describe, expect, it } from "vitest";
import { FormatterRegistry } from "../src/formatter.js";
import { ConverterRegistry } from "../src/converter.js";
import { FormValidator } from "../src/formValidator.js";
import type { FormDefinition } from "../src/definition.js";

const fmt = new FormatterRegistry();
const conv = new ConverterRegistry();

describe("formatter parity", () => {
  it("currency", () => {
    expect(fmt.format("currency", 1234567)).toBe("1,234,567");
    expect(fmt.format("currency", 1234, { symbol: "¥", decimals: 2 })).toBe("¥1,234.00");
    expect(fmt.format("currency", -1234, { negative: "triangle" })).toBe("△1,234");
    expect(fmt.format("currency", -1234, { negative: "blackTriangle" })).toBe("▲1,234");
    expect(fmt.format("currency", -1234, { negative: "paren" })).toBe("(1,234)");
    expect(fmt.format("currency", -1234)).toBe("-1,234");
  });

  it("percent", () => {
    expect(fmt.format("percent", 12.34)).toBe("12.34%");
    expect(fmt.format("percent", 12, { decimals: 0 })).toBe("12%");
    expect(fmt.format("percent", 0.1234, { ratio: true, decimals: 2 })).toBe("12.34%");
  });

  it("date", () => {
    expect(fmt.format("date", "2026-07-22")).toBe("2026/07/22");
    expect(fmt.format("date", "2026-07-22", { pattern: "yyyy-MM-dd" })).toBe("2026-07-22");
    expect(fmt.format("date", "2026-07-22", { pattern: "yyyy年M月d日" })).toBe("2026年7月22日");
    expect(fmt.format("date", "2026-07-22", { pattern: "yyyyMMdd" })).toBe("20260722");
  });

  it("wareki", () => {
    expect(fmt.format("wareki", "2026-07-22")).toBe("令和8年7月22日");
    expect(fmt.format("wareki", "2026-07-22", { style: "short" })).toBe("R8/07/22");
    expect(fmt.format("wareki", "2019-05-01")).toBe("令和元年5月1日");
    expect(fmt.format("wareki", "2019-04-30")).toBe("平成31年4月30日");
  });

  it("postal / mask", () => {
    expect(fmt.format("postal", "1234567")).toBe("123-4567");
    expect(fmt.format("mask", "000012341234")).toBe("********1234");
  });
});

describe("converter parity", () => {
  it("hankaku / zenkaku", () => {
    expect(conv.convert("toHankaku", "１２３ＡＢ　")).toBe("123AB ");
    expect(conv.convert("toZenkaku", "12 ")).toBe("１２　");
  });
  it("kana", () => {
    expect(conv.convert("hiraToKata", "あいう")).toBe("アイウ");
    expect(conv.convert("kataToHira", "アイウ")).toBe("あいう");
  });
  it("spaces", () => {
    expect(conv.convert("trim", "　 x 　")).toBe("x");
    expect(conv.convert("collapseSpaces", "a　　b  c")).toBe("a b c");
  });
  it("parseNumber", () => {
    expect(conv.convert("parseNumber", "１，２３４")).toBe(1234);
  });
  it("convertAll chains", () => {
    expect(conv.convertAll(["toHankaku", "trim"], "　ＡＢ　")).toBe("AB");
  });
});

describe("postalCode validator", () => {
  const form: FormDefinition = {
    sections: [
      {
        columns: 1,
        fields: [
          {
            field: "zip",
            label: "郵便番号",
            type: "text",
            required: false,
            readOnly: false,
            validators: [{ type: "postalCode", params: {} }],
            options: [],
            normalize: [],
            config: {},
          },
        ],
      },
    ],
  };

  it("accepts valid, rejects invalid", () => {
    expect(new FormValidator().validate(form, { zip: "123-4567" }).valid).toBe(true);
    expect(new FormValidator().validate(form, { zip: "1234567" }).valid).toBe(true);
    const bad = new FormValidator().validate(form, { zip: "abc" });
    expect(bad.errors[0]).toEqual({ field: "zip", message: "郵便番号の形式が正しくありません" });
  });
});
