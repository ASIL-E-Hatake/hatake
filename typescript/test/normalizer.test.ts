import { describe, expect, it } from "vitest";
import { normalizeRecord } from "../src/normalizer.js";
import type { FieldDefinition, FormDefinition } from "../src/definition.js";

const field = (name: string, normalize: string[]): FieldDefinition => ({
  field: name,
  label: name,
  type: "text",
  required: false,
  readOnly: false,
  validators: [],
  options: [],
  normalize,
  config: {},
});

describe("normalizeRecord", () => {
  const form: FormDefinition = {
    sections: [{ columns: 1, fields: [field("code", ["toHankaku", "trim"]), field("name", [])] }],
  };

  it("applies converter chains per field, leaves others untouched", () => {
    const out = normalizeRecord(form, { code: "　ＡＢ１２　", name: "　x　" });
    expect(out.code).toBe("AB12");
    expect(out.name).toBe("　x　");
  });
});
