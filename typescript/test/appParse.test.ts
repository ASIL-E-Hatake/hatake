import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  argbOf,
  Brightnesses,
  Densities,
  DefinitionParseError,
  UnknownKeysError,
} from "../src/index.js";
import { menuIsGroup, parseAppJson, parseAppYaml } from "../src/index.js";

describe("parseAppYaml: shipped example", () => {
  const app = parseAppYaml(readFileSync("../spec/examples/sales_app.yaml", "utf8"));

  it("reads app metadata", () => {
    expect(app.id).toBe("sales_admin");
    expect(app.title).toBe("販売管理");
    expect(app.dslVersion).toBe("1.0");
    expect(app.home).toBe("dashboard");
  });

  it("parses the menu as leaf + group(with child) + leaves", () => {
    expect(app.menu).toHaveLength(7);

    const [
      dashboard,
      customers,
      master,
      orders,
      salesReport,
      orderEntry,
      orderEntryPaged,
    ] = app.menu;
    expect(salesReport.page).toBe("sales_report");
    expect(menuIsGroup(dashboard)).toBe(false);
    expect(dashboard.id).toBe("dashboard");
    expect(dashboard.page).toBe("sales_dashboard");

    expect(menuIsGroup(customers)).toBe(false);
    expect(customers.id).toBe("customers");
    expect(customers.page).toBe("customer_master");
    expect(customers.icon).toBe("people");

    expect(menuIsGroup(master)).toBe(true);
    expect(master.label).toBe("マスタ");
    expect(master.children).toHaveLength(1);
    expect(master.children[0].label).toBe("商品");
    expect(master.children[0].page).toBe("product_master");

    expect(menuIsGroup(orders)).toBe(false);
    expect(orders.id).toBe("orders");
    expect(orders.page).toBe("order_search");

    // Both master-detail entry screens are reachable from the menu too.
    expect(menuIsGroup(orderEntry)).toBe(false);
    expect(orderEntry.id).toBe("orderEntry");
    expect(orderEntry.page).toBe("order_entry");

    expect(menuIsGroup(orderEntryPaged)).toBe(false);
    expect(orderEntryPaged.id).toBe("orderEntryPaged");
    expect(orderEntryPaged.page).toBe("order_entry_paged");
  });

  it("parses the shallow page inventory (8 pages)", () => {
    expect(app.pages).toHaveLength(8);
    expect(app.pages.map((p) => p.id)).toEqual([
      "sales_dashboard",
      "customer_master",
      "product_master",
      "order_search",
      "sales_report",
      "order_detail",
      "order_entry",
      "order_entry_paged",
    ]);
    expect(app.pages.map((p) => p.type)).toEqual([
      "dashboard",
      "master",
      "master",
      "search",
      "report",
      "detail",
      "form",
      "form",
    ]);
    expect(app.pages[1].title).toBe("顧客マスタ");
    expect(app.pages[1].repository).toBe("customerRepository");
  });

  it("carries the theme (a backend does not render, but must not drop it)", () => {
    expect(app.theme).toEqual({
      primaryColor: "#1B5E20",
      secondaryColor: undefined,
      brightness: Brightnesses.light,
      density: Densities.compact,
      fontFamily: undefined,
      radius: 8,
      config: {},
    });
  });
});

describe("app.theme", () => {
  const withTheme = (theme: string) =>
    parseAppYaml(`
app:
  id: sales
  title: 販売管理
  theme:
${theme}
`);

  it("defaults to light / standard", () => {
    const theme = withTheme('    primaryColor: "#1B5E20"').theme!;
    expect(theme.brightness).toBe(Brightnesses.light);
    expect(theme.density).toBe(Densities.standard);
    expect(theme.radius).toBeUndefined();
  });

  it("reads #AARRGGBB and a missing #, same as the Dart edition", () => {
    expect(argbOf("#801B5E20")).toBe(0x801b5e20);
    expect(argbOf("1B5E20")).toBe(0xff1b5e20);
    expect(argbOf("navy")).toBeNull();
    expect(argbOf("#12345")).toBeNull();
  });

  // 黙って無視されるのが一番困る（定義は正しく見えるのに画面が変わらない）。
  it("refuses a colour that is not a colour, with the path", () => {
    expect(() => withTheme("    primaryColor: navy")).toThrow(
      DefinitionParseError,
    );
    try {
      withTheme("    primaryColor: navy");
    } catch (e) {
      expect((e as DefinitionParseError).path).toBe("app.theme.primaryColor");
      expect((e as Error).message).toContain("#RRGGBB");
    }
  });

  it("refuses an unknown brightness / density", () => {
    expect(() => withTheme("    density: cozy")).toThrow(/comfortable/);
    expect(() => withTheme("    brightness: auto")).toThrow(
      DefinitionParseError,
    );
  });

  it("a misspelled theme key is caught by strict", () => {
    expect(() =>
      parseAppYaml(
        `app: { id: a, title: A, theme: { primaryColour: "#1B5E20" } }`,
        { strict: true },
      ),
    ).toThrow(UnknownKeysError);
  });
});

describe("parseAppYaml vs parseAppJson convergence", () => {
  it("produces deep-equal results for the same app", () => {
    const yaml = `
dsl_version: "1.0"
app:
  id: tiny
  title: Tiny
  home: h
  menu:
    - { id: h, label: Home, icon: home, page: home_page }
    - group: Admin
      roles: [admin]
      items:
        - { label: Users, page: users_page, roles: [admin] }
  pages:
    - { type: search, id: home_page, title: Home, repository: homeRepo }
    - { type: master, id: users_page, title: Users, repository: userRepo }
`;
    const json = JSON.stringify({
      dsl_version: "1.0",
      app: {
        id: "tiny",
        title: "Tiny",
        home: "h",
        menu: [
          { id: "h", label: "Home", icon: "home", page: "home_page" },
          {
            group: "Admin",
            roles: ["admin"],
            items: [{ label: "Users", page: "users_page", roles: ["admin"] }],
          },
        ],
        pages: [
          { type: "search", id: "home_page", title: "Home", repository: "homeRepo" },
          { type: "master", id: "users_page", title: "Users", repository: "userRepo" },
        ],
      },
    });

    expect(parseAppYaml(yaml)).toEqual(parseAppJson(json));
  });
});
