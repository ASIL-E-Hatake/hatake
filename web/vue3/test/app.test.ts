import { parseAppYaml } from "@hatake-fw/api";
import { parseAppPagesYaml } from "@hatake-fw/api/internal";
import { FakeRepository, RepositoryRegistry, silentRouteUrl } from "@hatake-fw/runtime";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import { describe, expect, it } from "vitest";

import { HatakeApp } from "../src/app.js";
import { HatakeScope } from "../src/scope.js";

/**
 * **案件が書くのは `HatakeApp` 1つ**、の証明。
 *
 * メニュー・画面の行き来・役割での出し分けが、全部定義から出ること。画面のコードが
 * 1行も要らないのがこの枠組みの主張なので、ここが通らなければ Renderer を足した
 * 意味が無い。
 *
 * 定義は**1枚の app に画面ごと書く**（`spec/examples/*.yaml` と同じ形）。読むのは
 * 2行で、`parseAppYaml` がメニューと題、`parseAppPagesYaml` が画面の中身。
 * 後者は Java にしか無くて TypeScript に無かったので、ここを書く段で足した。
 */
const yaml = `
dsl_version: "1.0"
app:
  id: demo
  title: 見本アプリ
  home: customers
  roles: [clerk, admin]
  menu:
    - { id: customers, label: 顧客, page: customers }
    - group: 管理
      roles: [admin]
      items:
        - { id: orders, label: 受注, page: orders }
  pages:
    - type: search
      id: customers
      title: 顧客一覧
      repository: customerRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
        pagination: { pageSize: 10 }
    - type: search
      id: orders
      title: 受注一覧
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
        pagination: { pageSize: 10 }
`;

const app = parseAppYaml(yaml, { strict: true });
const pages = parseAppPagesYaml(yaml, { strict: true });

const show = (roles: string[], given = pages) =>
  mount(HatakeScope, {
    props: {
      registries: {
        repositories: new RepositoryRegistry({
          customerRepository: new FakeRepository([{ code: "C-1" }], ["code"]),
          orderRepository: new FakeRepository([{ orderNo: "SO-1" }], ["orderNo"]),
        }),
      },
    },
    // URL は触らない（試験にアドレス欄は無いし、触ると他の試験に混ざる）。
    slots: { default: () => h(HatakeApp, { app, pages: given, roles, url: silentRouteUrl }) },
  });

const settle = async (wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> => {
  await new Promise((done) => setTimeout(done, 0));
  await wrapper.vm.$nextTick();
};

describe("アプリ1本が定義から出る（Vue）", () => {
  it("メニューが定義から出て、家が最初に開く", async () => {
    const wrapper = show(["admin"]);
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="menu:customers"]').exists()).toBe(true);
    expect(wrapper.find('[data-hatake="page:customers"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("顧客一覧");
  });

  it("メニューを押すと画面が入れ替わる", async () => {
    const wrapper = show(["admin"]);
    await settle(wrapper);
    await wrapper.find('[data-hatake="menu:orders"]').trigger("click");
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="page:orders"]').exists()).toBe(true);
  });

  it("**役割で見えない束は出さない**（中身ごと消える）", async () => {
    const wrapper = show(["clerk"]);
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="menu:customers"]').exists()).toBe(true);
    expect(wrapper.find('[data-hatake="menu:orders"]').exists()).toBe(false);
  });

  it("**画面自身の roles**: メニューから消え、直に開いても中身を出さない", async () => {
    // 家（customers）を admin だけにする。メニューの項目には roles が無い。
    const gated = { ...pages, customers: { ...pages.customers, roles: ["admin"] } };
    const wrapper = show(["clerk"], gated);
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="menu:customers"]').exists()).toBe(false);
    expect(wrapper.find('[data-hatake="page:forbidden"]').text()).toBe("この画面を開く権限がありません");
    expect(wrapper.find('[data-hatake="page:customers"]').exists()).toBe(false);

    const admin = show(["admin"], gated);
    await settle(admin);
    expect(admin.find('[data-hatake="menu:customers"]').exists()).toBe(true);
    expect(admin.find('[data-hatake="page:customers"]').exists()).toBe(true);
  });

  it("定義を渡し忘れた画面は**黙って白くしない**", async () => {
    const wrapper = show(["admin"], {});
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="page:missing"]').exists()).toBe(true);
  });
});
