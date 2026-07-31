import { describe, expect, it } from "vitest";
import { MessageResolver } from "../src/messageResolver.js";
import { ValidatorRegistry } from "../src/validators.js";

describe("MessageResolver", () => {
  it("defaults to Japanese (matches the former hardcoded text)", () => {
    const m = new MessageResolver();
    expect(m.resolve("required")).toBe("必須項目です");
    expect(m.resolve("maxLength", { value: 3 })).toBe("3文字以内で入力してください");
  });

  it("falls back to the key for unknown keys", () => {
    expect(new MessageResolver().resolve("nope")).toBe("nope");
  });

  it("supports locale override and switching", () => {
    const m = new MessageResolver({
      locale: "en",
      messages: { en: { required: "Required", maxLength: "Max {value} chars" } },
    });
    expect(m.resolve("required")).toBe("Required");
    expect(m.resolve("maxLength", { value: 3 })).toBe("Max 3 chars");
    // key missing in en falls back to ja
    expect(m.resolve("email")).toBe("メールアドレスの形式が正しくありません");
    // same tables, locale switched back to ja
    expect(m.withLocale("ja").resolve("required")).toBe("必須項目です");
  });
});

describe("ValidatorRegistry i18n", () => {
  it("keeps Japanese by default", () => {
    const r = new ValidatorRegistry();
    expect(r.run("", { type: "required", params: {} })).toBe("必須項目です");
  });

  it("localizes built-in messages via an injected resolver", () => {
    const r = new ValidatorRegistry(
      undefined,
      new MessageResolver({
        locale: "en",
        messages: { en: { required: "Required", maxLength: "Max {value} chars" } },
      }),
    );
    expect(r.run("", { type: "required", params: {} })).toBe("Required");
    expect(r.run("ABCD", { type: "maxLength", params: { value: 3 } })).toBe(
      "Max 3 chars",
    );
  });
});
