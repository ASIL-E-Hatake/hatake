import type { ActionDefinition } from "@hatake-fw/api/internal";
import { ActionScopes, ActionTypes, isAllowed } from "@hatake-fw/api/internal";

/** 表の行の右端に出るもの1つ。 */
export type RowSlot =
  /**
   * 組み込みの「編集」「削除」。**画面の機能**なので宣言が無くても出せるが、出すのは
   * `table.rowActions` に**書いたときだけ**。宣言（`type: edit` / `delete` の action）が
   * 在れば、その `enabledWhen` / `confirm` / `roles` が効く。
   */
  | { readonly kind: "edit" | "delete"; readonly declaration?: ActionDefinition }
  /** 定義したボタン（`rowActions: [openDetail]` など）。 */
  | { readonly kind: "action"; readonly action: ActionDefinition };

/**
 * 行の右端に出すもの（**`table.rowActions` の並び順**）。Flutter 版の `_rowSlots` と同じ。
 *
 * 0.9.19 までブラウザ版は、CRUD の行に**書いていない「編集」「削除」を必ず出して**
 * いた＝`rowActions: []` と書いた画面でも消せた。定義に無いボタンを出すのは、
 * この枠組みがいちばん避けたい形なので、ここで定義どおりにする。
 *
 * 出さないもの: 宣言が無い id（`rowaction-not-declared`）・その役割には見せないもの・
 * 選んだ行に実行するボタン（`selection-as-rowaction`）。どれも `validate` が言う。
 */
export function rowSlots(
  rowActionIds: readonly string[],
  actions: readonly ActionDefinition[],
  roles: readonly string[],
): RowSlot[] {
  const out: RowSlot[] = [];
  for (const id of rowActionIds) {
    if (id === ActionTypes.edit || id === ActionTypes.delete) {
      const declaration = actions.find((one) => one.type === id);
      if (declaration !== undefined && !isAllowed(declaration.roles, roles)) continue;
      out.push({ kind: id, declaration });
      continue;
    }
    const action = actions.find((one) => one.id === id);
    if (action === undefined || action.scope === ActionScopes.selection) continue;
    if (!isAllowed(action.roles, roles)) continue;
    out.push({ kind: "action", action });
  }
  return out;
}

/**
 * 画面の上に出すボタンか。**行に出したものは出さない**（同じボタンを2か所に出さない）。
 * `scope: selection` は行には出せないので上に残す。組み込みの `edit` / `delete` は
 * 1件を指すボタンなので上には出さない（Flutter 版の `_pageOnlyActions` と同じ）。
 */
export function onPageTop(action: ActionDefinition, rowActionIds: readonly string[]): boolean {
  if (action.type === ActionTypes.edit || action.type === ActionTypes.delete) return false;
  return !rowActionIds.includes(action.id) || action.scope === ActionScopes.selection;
}
