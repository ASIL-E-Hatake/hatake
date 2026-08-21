import { describe, expect, it } from "vitest";
import {
  fetchSend,
  hasProbeError,
  type HttpRequest,
  probe,
  probeRequests,
  renderProbe,
  restTargets,
} from "../src/index.js";

/// 定義とサーバの食い違いを、実際に叩いて見る（`hatake probe`）。
///
/// ここで守るのは3つ。**静かに壊れる食い違いを言葉にする**（来なかった列・文字で来た
/// 金額は、エラーを出さずに画面を壊す）・**読むだけ**（書き込む口は叩かない）・
/// **飛ばしたものは黙らない**（叩かなかったのに「全部見た」に見えるのが一番危ない）。
///
/// 通信はしない。偽のサーバを渡す（CI で回る形にしておかないと、道具の試験は書かれない）。
const PAGE = `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    pagination: { pageSize: 2 }
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number }
`;

const CRUD = `
page:
  type: crud
  id: price_master
  title: 単価マスタ
  repository: priceRepository
  key: itemCode
  table:
    columns: [{ field: itemCode, label: 品目 }]
  form:
    sections:
      - fields:
          - { field: itemCode, label: 品目 }
          - { field: unitPrice, label: 単価, type: number }
`;

/** URL → 返す本文。叩かれた要求も覚える（読むだけ、を確かめるため）。 */
function server(routes: Record<string, { status?: number; body: unknown }>) {
  const sent: HttpRequest[] = [];
  const send = async (request: HttpRequest) => {
    sent.push(request);
    const route =
      routes[request.url] ??
      routes[request.url.split("?")[0]] ??
      { status: 404, body: { message: "no route" } };
    return {
      status: route.status ?? 200,
      body: typeof route.body === "string" ? route.body : JSON.stringify(route.body),
    };
  };
  return { send, sent };
}

const list = (items: unknown[], totalCount = items.length) => ({
  items,
  totalCount,
});

const targets = (source: string) =>
  restTargets(source, { baseUrl: "http://localhost:8080/api" });

describe("hatake probe", () => {
  it("宣言どおり返ってくれば何も言わない", async () => {
    const { send, sent } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1", amount: 1200 }]),
      },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings).toEqual([]);
    expect(hasProbeError(report)).toBe(false);
    // 一覧を1回だけ。1件を指さない画面なので1件取得は叩かない。
    expect(sent.map((one) => one.url)).toEqual([
      "http://localhost:8080/api/orders?page=0&pageSize=2",
    ]);
    expect(report.skipped[0].reason).toContain("1件を指す画面ではない");
  });

  it("どの行にも列が無いなら言う（画面は空欄の列になる）", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1" }, { orderNo: "SO-2" }]),
      },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].level).toBe("error");
    expect(report.findings[0].what).toContain("どの行にも amount");
  });

  it("値が空の項目を省く実装では言わない（Jackson の NON_NULL など）", async () => {
    // 1行目に無いだけで言うと、空欄のある画面で毎回鳴る＝報告が読まれなくなる。
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1" }, { orderNo: "SO-2", amount: 300 }]),
      },
    });
    expect((await probe(targets(PAGE), send)).findings).toEqual([]);
  });

  it("空欄（null）は言わない（業務では普通のこと）", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1", amount: null }]),
      },
    });
    expect((await probe(targets(PAGE), send)).findings).toEqual([]);
  });

  it("金額が文字で返っていたら言う（合計から漏れるのに、エラーは出ない）", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1", amount: "1200" }]),
      },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].level).toBe("error");
    expect(report.findings[0].what).toContain("number の約束");
    expect(report.findings[0].fix).toContain("合計");
  });

  it("{items, totalCount} でなければ、その形を言う", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: { content: [], page: 0, size: 20 },
      },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings[0].level).toBe("error");
    expect(report.findings[0].what).toContain("content");
    expect(report.findings[0].fix).toContain("totalCount");
  });

  it("pageSize を無視して返してきたら言う（ページ送りが効かない）", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: list([
          { orderNo: "SO-1", amount: 1 },
          { orderNo: "SO-2", amount: 2 },
          { orderNo: "SO-3", amount: 3 },
        ]),
      },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].level).toBe("caution");
    expect(report.findings[0].what).toContain("2 件を頼んで 3 件");
  });

  it("行に鍵が無ければ言う（列に出していなくても要る）", async () => {
    const source = PAGE.replace("key: orderNo", "key: orderId");
    const { send } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1", amount: 1200 }]),
      },
    });
    const report = await probe(targets(source), send);

    expect(report.findings[0].what).toContain("鍵（orderId）");
    expect(report.findings[0].fix).toContain("消す");
  });

  it("0 件なら「確かめられない」と言う（通ったことにしない）", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": { body: list([]) },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings[0].level).toBe("caution");
    expect(report.findings[0].what).toContain("0 件");
  });

  it("1件を指す画面なら、一覧の1行目で1件取得も叩く", async () => {
    const { send, sent } = server({
      "http://localhost:8080/api/prices": { body: list([{ itemCode: "A-1" }]) },
      "http://localhost:8080/api/prices/A-1": {
        body: { itemCode: "A-1", unitPrice: 100 },
      },
    });
    const report = await probe(targets(CRUD), send);

    expect(report.findings).toEqual([]);
    expect(sent.map((one) => one.url)).toEqual([
      "http://localhost:8080/api/prices?page=0&pageSize=50",
      "http://localhost:8080/api/prices/A-1",
    ]);
  });

  it("一覧に在る行が1件取得で見つからないなら言う", async () => {
    const { send } = server({
      "http://localhost:8080/api/prices": { body: list([{ itemCode: "A-1" }]) },
      "http://localhost:8080/api/prices/A-1": { status: 404, body: "" },
    });
    const report = await probe(targets(CRUD), send);

    expect(report.findings[0].level).toBe("error");
    expect(report.findings[0].what).toContain("1件取得で見つかりません");
  });

  it("1件取得に宣言した項目が無ければ言う（フォームが空欄で開く）", async () => {
    const { send } = server({
      "http://localhost:8080/api/prices": { body: list([{ itemCode: "A-1" }]) },
      "http://localhost:8080/api/prices/A-1": { body: { itemCode: "A-1" } },
    });
    const report = await probe(targets(CRUD), send);

    expect(report.findings[0].what).toContain("1件取得に unitPrice");
  });

  it("口が無ければ「集合の名前が違う」と言う（404 を黙って通さない）", async () => {
    const { send } = server({});
    const report = await probe(targets(PAGE), send);

    expect(report.findings[0].what).toContain("404");
    expect(report.findings[0].fix).toContain("--collection");
  });

  it("拒否されたら資格の話だと言う（食い違いと混ぜない）", async () => {
    const { send } = server({
      "http://localhost:8080/api/orders": { status: 403, body: "" },
    });
    const report = await probe(targets(PAGE), send);

    expect(report.findings[0].what).toContain("403");
    expect(report.findings[0].fix).toContain("--token");
  });

  it("繋がらなくても落ちない（残りの画面を見られなくなるのが一番困る）", async () => {
    const send = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8080");
    };
    const report = await probe(targets(PAGE), send);

    expect(report.findings[0].what).toContain("ECONNREFUSED");
    expect(hasProbeError(report)).toBe(true);
  });

  it("--collection で集合の名前を上書きできる", async () => {
    const { send, sent } = server({
      "http://localhost:8080/api/sales-orders": {
        body: list([{ orderNo: "SO-1", amount: 1 }]),
      },
    });
    const report = await probe(
      restTargets(PAGE, {
        baseUrl: "http://localhost:8080/api",
        collections: { orderRepository: "sales-orders" },
      }),
      send,
    );

    expect(report.findings).toEqual([]);
    expect(sent[0].url).toContain("/sales-orders?");
  });

  it("--dry-run は叩かずに「何を叩くか」を出す", () => {
    expect(probeRequests(targets(CRUD))).toEqual([
      "GET http://localhost:8080/api/prices?page=0&pageSize=50",
      "GET http://localhost:8080/api/prices/{itemCode}",
    ]);
  });

  it("送るのは GET だけ（書き込む口は叩かない）", async () => {
    const { send, sent } = server({
      "http://localhost:8080/api/prices": { body: list([{ itemCode: "A-1" }]) },
      "http://localhost:8080/api/prices/A-1": {
        body: { itemCode: "A-1", unitPrice: 1 },
      },
    });
    await probe(targets(CRUD), send);

    expect(sent.every((one) => one.method === "GET")).toBe(true);
    expect(renderProbe(await probe(targets(CRUD), send))).toContain(
      "書き込み（POST / PUT / DELETE）は叩いていません",
    );
  });

  it("GET 以外は送る前に落ちる（道具が壊れても業務データは壊れない）", async () => {
    await expect(
      fetchSend({ method: "DELETE", url: "http://localhost:1/x", headers: {} }),
    ).rejects.toThrow("読むだけ");
  });

  it("資格は渡したヘッダだけで決まる", async () => {
    const { send, sent } = server({
      "http://localhost:8080/api/orders": {
        body: list([{ orderNo: "SO-1", amount: 1 }]),
      },
    });
    await probe(targets(PAGE), send, { authorization: "Bearer t" });

    expect(sent[0].headers.authorization).toBe("Bearer t");
    expect(sent[0].headers.accept).toBe("application/json");
  });
});
