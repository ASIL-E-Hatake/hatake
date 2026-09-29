import { parseAppYaml } from "@hatake-fw/api";
import { parseAppPagesYaml } from "@hatake-fw/api/internal";
import { FakeRepository, RepositoryRegistry, silentRouteUrl } from "@hatake-fw/runtime";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HatakeApp } from "../src/app.js";
import { HatakeScope } from "../src/scope.js";

/**
 * **Vue 版と同じ並びの試験。** 同じ定義・同じ印で、同じ答えになること。
 *
 * 2つの Renderer が同じ土台に乗っている証明で、片方だけ直したときにここで気づける。
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

// **毎回片付ける。** testing-library の自動片付けは `globals: true` のときだけ入る。
afterEach(cleanup);

const show = (roles: string[], given = pages) =>
  render(
    <HatakeScope
      registries={{
        repositories: new RepositoryRegistry({
          customerRepository: new FakeRepository([{ code: "C-1" }], ["code"]),
          orderRepository: new FakeRepository([{ orderNo: "SO-1" }], ["orderNo"]),
        }),
      }}
    >
      <HatakeApp app={app} pages={given} roles={roles} url={silentRouteUrl} />
    </HatakeScope>,
  );

const at = (mark: string): HTMLElement | null => document.querySelector(`[data-hatake="${mark}"]`);

describe("アプリ1本が定義から出る（React）", () => {
  it("メニューが定義から出て、家が最初に開く", async () => {
    show(["admin"]);
    await waitFor(() => expect(at("menu:customers")).toBeTruthy());
    expect(at("page:customers")).toBeTruthy();
    expect(document.body.textContent).toContain("顧客一覧");
  });

  it("メニューを押すと画面が入れ替わる", async () => {
    show(["admin"]);
    await waitFor(() => expect(at("menu:orders")).toBeTruthy());
    fireEvent.click(at("menu:orders") as HTMLElement);
    await waitFor(() => expect(at("page:orders")).toBeTruthy());
  });

  it("**役割で見えない束は出さない**（中身ごと消える）", async () => {
    show(["clerk"]);
    await waitFor(() => expect(at("menu:customers")).toBeTruthy());
    expect(at("menu:orders")).toBeNull();
  });

  it("定義を渡し忘れた画面は**黙って白くしない**", async () => {
    show(["admin"], {});
    await waitFor(() => expect(at("page:missing")).toBeTruthy());
  });
});
