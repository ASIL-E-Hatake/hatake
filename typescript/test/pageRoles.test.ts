import { describe, expect, it } from "vitest";
import { canOpenPage, menuItemOpens, type MenuItem, parseAppYaml, parsePageYaml, visibleMenu } from "../src/internal.js";

/** 画面自身の `roles`（0.9.22）を、読む所と見せる所で見る。 */
const leaf = (id: string, roles: string[] = []): MenuItem => ({ id, label: id, page: id, children: [], roles });

describe("画面自身の roles", () => {
  it("読める（書かなければ空＝誰でも）", () => {
    const page = parsePageYaml(
      `page: { type: search, id: prices, title: 単価, repository: r, roles: [admin], table: { columns: [{ field: code, label: コード }] } }`,
      { strict: true },
    );
    expect(page.roles).toEqual(["admin"]);
    expect(canOpenPage(page, ["admin"])).toBe(true);
    expect(canOpenPage(page, ["clerk"])).toBe(false);
    expect(canOpenPage({ roles: [] }, [])).toBe(true);
    expect(canOpenPage({}, [])).toBe(true);
  });

  it("app の中の画面でも strict で通る", () => {
    expect(() =>
      parseAppYaml(
        `app: { id: a, title: A, pages: [{ type: form, id: f, title: F, repository: r, roles: [hr], form: { sections: [] } }] }`,
        { strict: true },
      ),
    ).not.toThrow();
  });

  it("メニューの項目は、項目と行き先の画面の両方を満たすときだけ", () => {
    expect(menuItemOpens(leaf("prices"), ["clerk"], { roles: ["admin"] })).toBe(false);
    expect(menuItemOpens(leaf("prices", ["clerk"]), ["clerk"], { roles: [] })).toBe(true);
    // 行き先が定義に無いときは項目だけで決める（無い画面は検証が言う）。
    expect(menuItemOpens(leaf("ghost"), ["clerk"], undefined)).toBe(true);
  });

  it("中身が全部隠れた見出しは出さない", () => {
    const menu: MenuItem[] = [
      leaf("customers"),
      { label: "管理", children: [leaf("prices")], roles: [] },
    ];
    const pages: Record<string, { roles?: string[] }> = { customers: {}, prices: { roles: ["admin"] } };
    const names = (items: MenuItem[]): string[] =>
      items.flatMap((one) => (one.children.length > 0 ? [one.label, ...names(one.children)] : [one.label]));
    expect(names(visibleMenu(menu, ["clerk"], (id) => pages[id]))).toEqual(["customers"]);
    expect(names(visibleMenu(menu, ["admin"], (id) => pages[id]))).toEqual(["customers", "管理", "prices"]);
  });
});
