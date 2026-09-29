import { AggregateRegistry, ConverterRegistry, FormatterRegistry } from "@hatake-fw/api";
import { describe, expect, it } from "vitest";

import { ActionRegistry } from "../src/action.js";
import { FakeRepository } from "../src/fakeRepository.js";
import { registrySnapshot, registrySnapshotJson, registrySnapshotSource } from "../src/registry.js";
import { RepositoryRegistry } from "../src/repository.js";
import { appRoute, HatakeRouter, resolveRouteParams, routeFromUri, routeToUri } from "../src/router.js";

/** Dart 側の `HatakeRouter` と同じ振る舞いを見る（タブの決まりごとを含めて）。 */
describe("画面の行き来", () => {
  it("メニューで選ぶと入れ替わる（戻る先が溜まらない）", () => {
    const router = new HatakeRouter(appRoute("home"));
    router.push("detail", { id: 1 });
    expect(router.canPop).toBe(true);
    router.go("search");
    expect(router.current.pageId).toBe("search");
    expect(router.canPop).toBe(false);
  });

  it("遷移のボタンは重ねる（戻れる）", () => {
    const router = new HatakeRouter(appRoute("search"));
    router.push("detail", { orderNo: "SO-1" });
    expect(router.current.params.orderNo).toBe("SO-1");
    router.pop();
    expect(router.current.pageId).toBe("search");
  });

  it("パンくずで途中まで戻る", () => {
    const router = new HatakeRouter(appRoute("a"));
    router.push("b");
    router.push("c");
    router.popTo(0);
    expect(router.stack.map((one) => one.pageId)).toEqual(["a"]);
  });

  describe("タブで開くとき", () => {
    const tabs = () => new HatakeRouter(appRoute("home"), "tabs");

    it("同じ画面をもう一度選んだら、開いているほうを前に出す", () => {
      const router = tabs();
      router.select("orders", { orderNo: "SO-1" });
      router.select("home");
      expect(router.tabCount).toBe(2);
      router.select("orders", { orderNo: "SO-1" });
      expect(router.tabCount).toBe(2);
      expect(router.current.pageId).toBe("orders");
    });

    it("**引数が違えば別のタブ**（SO-1 と SO-2 は別物）", () => {
      const router = tabs();
      router.select("orders", { orderNo: "SO-1" });
      router.select("orders", { orderNo: "SO-2" });
      expect(router.tabCount).toBe(3);
    });

    it("上限に達したら開かず、**呼んだ側に false で言う**", () => {
      const router = tabs();
      for (let at = 0; at < 20; at += 1) router.select("p", { at });
      expect(router.tabCount).toBe(HatakeRouter.maxTabs);
      expect(router.select("p", { at: 999 })).toBe(false);
    });

    it("最後の1枚は閉じない（画面が無くなるので）", () => {
      const router = tabs();
      expect(router.closeTab(0)).toBe(false);
      router.select("orders");
      expect(router.closeTab(1)).toBe(true);
      expect(router.tabCount).toBe(1);
    });
  });
});

describe("道と URL", () => {
  it("`/<画面 id>?<引数>` になる（入れ子にしない）", () => {
    expect(routeToUri(appRoute("order_detail", { orderNo: "SO-1001" }))).toBe(
      "/order_detail?orderNo=SO-1001",
    );
  });

  it("読み直すと同じ道になる", () => {
    const route = appRoute("order_detail", { orderNo: "SO-1001" });
    expect(routeFromUri(routeToUri(route))).toEqual(route);
  });

  it("**引数は文字で返る**（`0012` は取引先コードであって 12 ではない）", () => {
    expect(routeFromUri("/customers?code=0012")?.params.code).toBe("0012");
  });

  it("知らない画面・深い道・`/` は null（何を開くかは呼んだ側が決める）", () => {
    const knows = (id: string): boolean => id === "home";
    expect(routeFromUri("/", knows)).toBeNull();
    expect(routeFromUri("/a/b", knows)).toBeNull();
    expect(routeFromUri("/unknown", knows)).toBeNull();
    expect(routeFromUri("/home", knows)?.pageId).toBe("home");
  });

  it("`$row.項目` は行の値になる", () => {
    expect(resolveRouteParams({ orderNo: "$row.orderNo", fixed: 1 }, { orderNo: "SO-9" })).toEqual({
      orderNo: "SO-9",
      fixed: 1,
    });
  });
});

describe("申告（registrySnapshot）", () => {
  const registries = {
    repositories: new RepositoryRegistry({ orderRepository: new FakeRepository() }),
    actions: new ActionRegistry({ ship: async () => {} }),
    exportSink: () => {},
    formatters: new FormatterRegistry({ orderNo: (v) => String(v) }),
    converters: new ConverterRegistry(),
    aggregates: new AggregateRegistry({ median: () => 0 }),
    knownRoles: ["clerk", "admin"],
  };

  it("アプリが足したものだけを、種類ごとに名前順で出す", () => {
    expect(registrySnapshot(registries)).toEqual({
      repositories: ["orderRepository"],
      plugins: ["ship"],
      sinks: ["exportSink"],
      formatters: ["orderNo"],
      aggregates: ["median"],
      roles: ["admin", "clerk"],
    });
  });

  it("**空の種類は出さない**（「無い」ではなく「言うことが無い」）", () => {
    const snapshot = registrySnapshot(registries);
    expect("validators" in snapshot).toBe(false);
    expect("converters" in snapshot).toBe(false);
  });

  it("**組み込みと同じ名前は出さない**（共有フィクスチャの決まり）", () => {
    const snapshot = registrySnapshot({
      repositories: new RepositoryRegistry(),
      // `currency` は組み込みに在る名前。上書きしても「足した」ことにはしない。
      formatters: new FormatterRegistry({ currency: (v) => String(v) }),
    });
    expect("formatters" in snapshot).toBe(false);
  });

  it("Renderer が自分の登録を名乗れる", () => {
    const snapshot = registrySnapshot(registries, { registeredNames: { fieldTypes: ["signature"] } });
    expect(snapshot.fieldTypes).toEqual(["signature"]);
  });

  it("書き出した紙は**申告の印**を持つ（手書きの一覧と区別する）", () => {
    const paper = JSON.parse(registrySnapshotJson(registries)) as Record<string, unknown>;
    expect(paper.$source).toBe(registrySnapshotSource);
  });
});
