import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { menuIsGroup, parseAppJson, parseAppYaml } from "../src/index.js";

describe("parseAppYaml: shipped example", () => {
  const app = parseAppYaml(readFileSync("../spec/examples/sales_app.yaml", "utf8"));

  it("reads app metadata", () => {
    expect(app.id).toBe("sales_admin");
    expect(app.title).toBe("販売管理");
    expect(app.dslVersion).toBe("1.0");
    expect(app.home).toBe("customers");
  });

  it("parses the menu as leaf + group(with child) + leaves", () => {
    expect(app.menu).toHaveLength(5);

    const [customers, master, orders, orderEntry, orderEntryPaged] = app.menu;
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

  it("parses the shallow page inventory (6 pages)", () => {
    expect(app.pages).toHaveLength(6);
    expect(app.pages.map((p) => p.id)).toEqual([
      "customer_master",
      "product_master",
      "order_search",
      "order_detail",
      "order_entry",
      "order_entry_paged",
    ]);
    expect(app.pages.map((p) => p.type)).toEqual([
      "master",
      "master",
      "search",
      "detail",
      "form",
      "form",
    ]);
    expect(app.pages[0].title).toBe("顧客マスタ");
    expect(app.pages[0].repository).toBe("customerRepository");
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
