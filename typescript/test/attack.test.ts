import { describe, expect, it } from "vitest";
import {
  attack,
  attackRequests,
  hasHole,
  type HttpRequest,
  renderAttack,
  restTargets,
} from "../src/index.js";

/// 画面から見えない口を、その役割で実際に叩く（`hatake attack`）。
///
/// ここで守るのは4つ。**穴を穴と言う**（画面に出ないだけの「権限」は権限ではない）・
/// **反対向きも見る**（開ける画面が拒否されたら、その人は何もできない）・**資格が
/// 通っていないなら結果を信じない**（全部拒否＝安全、は一番まずい嘘）・**書き込む口は
/// 叩かない**（確かめた跡がデータに残る）。
const APP = `
app:
  id: sales_admin
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: prices, label: 単価マスタ, page: price_master, roles: [admin] }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
    - type: crud
      id: price_master
      title: 単価マスタ
      repository: priceRepository
      key: itemCode
      table:
        columns: [{ field: itemCode, label: 品目 }]
      form:
        sections: [{ fields: [{ field: itemCode, label: 品目 }] }]
      actions:
        - { id: delete, type: delete, label: 削除, roles: [admin] }
`;

/** URL → 返す状態。叩かれた要求も覚える。 */
function server(status: Record<string, number>) {
  const sent: HttpRequest[] = [];
  const send = async (request: HttpRequest) => {
    sent.push(request);
    const url = request.url.split("?")[0];
    return { status: status[url] ?? 200, body: "{}" };
  };
  return { send, sent };
}

const ORDERS = "http://localhost:8080/api/orders";
const PRICES = "http://localhost:8080/api/prices";

const targets = (source = APP) =>
  restTargets(source, { baseUrl: "http://localhost:8080/api" });

const verdictOf = (report: Awaited<ReturnType<typeof attack>>, page: string) =>
  report.results.find((one) => one.page === page)?.verdict;

describe("hatake attack", () => {
  it("見えない画面が開いていたら穴と言う", async () => {
    const { send } = server({ [ORDERS]: 200, [PRICES]: 200 });
    const report = await attack(targets(), "staff", send);

    // staff はメニューから単価マスタを開けない（roles: [admin]）。
    expect(verdictOf(report, "price_master")).toBe("hole");
    expect(hasHole(report)).toBe(true);
    expect(renderAttack(report)).toContain("API が遮断していません");
  });

  it("見えない画面が拒否されていれば、それでよい", async () => {
    const { send } = server({ [ORDERS]: 200, [PRICES]: 403 });
    const report = await attack(targets(), "staff", send);

    expect(verdictOf(report, "price_master")).toBe("blocked");
    expect(hasHole(report)).toBe(false);
  });

  it("開ける画面が拒否されたら、それも食い違い（画面は出てもデータが来ない）", async () => {
    const { send } = server({ [ORDERS]: 403, [PRICES]: 200 });
    const report = await attack(targets(), "admin", send);

    // admin は両方開ける。受注が拒否されるのは「逆」の食い違い。
    expect(verdictOf(report, "order_search")).toBe("locked");
    expect(hasHole(report)).toBe(true);
    expect(renderAttack(report)).toContain("画面は出てもデータが来ません");
  });

  it("開ける画面まで全部拒否なら「資格が通っていない疑い」と言う", async () => {
    const { send } = server({ [ORDERS]: 401, [PRICES]: 401 });
    const report = await attack(targets(), "admin", send);

    expect(report.unauthenticated).toBe(true);
    expect(hasHole(report)).toBe(true);
    expect(renderAttack(report)).toContain("「穴が無い」とは言えません");
  });

  it("404 は遮断と言わない（集合の名前が違うだけかもしれない）", async () => {
    const { send } = server({ [ORDERS]: 200, [PRICES]: 404 });
    const report = await attack(targets(), "staff", send);

    expect(verdictOf(report, "price_master")).toBe("unknown");
    expect(hasHole(report)).toBe(false);
  });

  it("押せないボタンは叩かず、人が確かめる一覧に出す", async () => {
    const { send, sent } = server({ [ORDERS]: 200, [PRICES]: 403 });
    const report = await attack(targets(), "staff", send);

    expect(sent.every((one) => one.method === "GET")).toBe(true);
    expect(report.unattacked).toEqual([
      {
        page: "price_master",
        action: {
          id: "delete",
          label: "削除",
          method: "DELETE",
          url: `${PRICES}/{itemCode}`,
          roles: ["admin"],
        },
      },
    ]);
    expect(renderAttack(report)).toContain("叩いていない口");
  });

  it("定義に出てこない役割でも進める（断り書きを添える）", async () => {
    // 突く相手は、たいてい定義に書かれていない役割（`roles:` に出るのは絞る側の
    // 名前だけなので、平社員の名前はどこにも出てこない）。ここで落とすと、
    // この道具の一番の使い道が塞がる。
    const { send } = server({ [ORDERS]: 200, [PRICES]: 200 });
    const report = await attack(targets(), "staff", send);

    expect(report.unknownRole).toBe(true);
    expect(verdictOf(report, "price_master")).toBe("hole");
    expect(renderAttack(report)).toContain("誰でも開ける画面だけが見える人");
  });

  it("定義に出てくる役割なら断り書きは出ない", async () => {
    const { send } = server({ [ORDERS]: 200, [PRICES]: 200 });
    const report = await attack(targets(), "admin", send);

    expect(report.unknownRole).toBe(false);
    expect(renderAttack(report)).not.toContain("綴り違いなら");
  });

  it("1枚の定義には入口が無いので落とす", async () => {
    const page = `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
`;
    const { send } = server({});
    await expect(attack(targets(page), "staff", send)).rejects.toThrow("app");
  });

  it("--dry-run は「どちらを期待して叩くか」まで出す", () => {
    const lines = attackRequests(targets(), "staff");
    expect(lines[0]).toContain("開ける画面");
    expect(lines[1]).toContain("拒否されるはず");
  });
});
