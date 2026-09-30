import { readFileSync } from "node:fs";
import type { ActionDefinition } from "@hatake-fw/api/internal";
import { describe, expect, it } from "vitest";

import { rowSlots, type RowSlot } from "../src/rowSlots.js";

/**
 * 行の右端に出るものの共有フィクスチャを、Dart 版（`hatake_core` の `rowSlots`）と
 * 同じ契約で回す。0.9.21 まで Flutter だけが組み込みの編集・削除で宣言の `roles` を
 * 見ていなかった＝同じ定義で、ブラウザでは隠れて Flutter では誰にでも出た。
 */
interface Case {
  name?: string;
  rowActionIds: string[];
  roles: string[];
  expected: string[];
}

const fixture = JSON.parse(
  readFileSync("../../spec/conformance/row_slots.json", "utf8"),
) as {
  actions: { id: string; type: string; roles?: string[]; scope?: string }[];
  cases: Case[];
  undeclared: Case;
};

const actions = fixture.actions.map(
  (one) =>
    ({
      id: one.id,
      type: one.type,
      label: one.id,
      scope: one.scope ?? "page",
      roles: one.roles ?? [],
    }) as unknown as ActionDefinition,
);

const shown = (declared: readonly ActionDefinition[], one: Case): string[] =>
  rowSlots(one.rowActionIds, declared, one.roles).map((slot: RowSlot) =>
    slot.kind === "action"
      ? `action:${slot.action.id}`
      : `${slot.kind}:${slot.declaration?.id ?? "-"}`,
  );

describe("conformance: row slots", () => {
  for (const one of fixture.cases) {
    it(one.name ?? "", () => {
      expect(shown(actions, one)).toEqual(one.expected);
    });
  }

  it("宣言の無い画面", () => {
    expect(shown([], fixture.undeclared)).toEqual(fixture.undeclared.expected);
  });
});
