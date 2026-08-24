import { describe, expect, it } from "vitest";
import {
  ANONYMOUS,
  attackAll,
  type HttpRequest,
  parseAttackAccounts,
  renderAttackSweep,
  restTargets,
  rolesToSweep,
  sweepHasHole,
} from "../src/index.js";

/// 役割ぜんぶ＋誰でもない人で叩く（`hatake attack --all-roles`）。
///
/// ここで守るのは3つ。**資格は役割ごと**（1つの資格で他の役割を判定すると、200 が穴なのか
/// 正しいのか区別できない）・**資格の無い役割は叩かず理由を残す**（黙って飛ばすと表が
/// 「全部 ok」に見える）・**誰でもない人を必ず入れる**（穴でいちばん多いのがそこ）。
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
    - type: search
      id: price_master
      title: 単価マスタ
      repository: priceRepository
      key: itemCode
      table:
        columns: [{ field: itemCode, label: 品目 }]
`;

const ORDERS = "http://localhost:8080/api/orders";
const PRICES = "http://localhost:8080/api/prices";

/** URL とヘッダで返す状態を変える小さなサーバ。叩かれた要求も覚える。 */
function server(rules: (request: HttpRequest) => number) {
  const sent: HttpRequest[] = [];
  const send = async (request: HttpRequest) => {
    sent.push(request);
    return { status: rules(request), body: "{}" };
  };
  return { send, sent };
}

const targets = (source = APP) =>
  restTargets(source, { baseUrl: "http://localhost:8080/api" });

/** 資格を見て遮断する「正しい」API（単価マスタは admin だけ）。 */
const strict = (request: HttpRequest): number => {
  const url = request.url.split("?")[0];
  const auth = request.headers?.authorization ?? "";
  if (url === PRICES) return auth === "Bearer admin-token" ? 200 : 403;
  return auth === "" ? 401 : 200;
};

describe("役割ぜんぶで叩く", () => {
  it("役割ごとの資格で叩き、誰でもない人を必ず1本入れる", async () => {
    const { send, sent } = server(strict);
    const sweep = await attackAll(
      targets(),
      { admin: { token: "admin-token" }, staff: { token: "staff-token" } },
      send,
    );
    expect(sweep.runs.map((one) => one.label)).toEqual([
      "admin",
      "staff",
      "誰でもない人",
    ]);
    // 誰でもない人は資格を送らない。
    const last = sent.slice(-2);
    expect(last.every((one) => one.headers?.authorization === undefined)).toBe(true);
    // 役割ごとに違う資格が飛んでいる。
    expect(sent.some((one) => one.headers?.authorization === "Bearer admin-token")).toBe(true);
    expect(sent.some((one) => one.headers?.authorization === "Bearer staff-token")).toBe(true);
    // 遮断が正しい API なら、穴は出ない（誰でもない人は 401 なので「あるべき姿」）。
    expect(sweep.runs.find((one) => one.role === "admin")?.report.results.map((r) => r.verdict))
      .toEqual(["blocked", "blocked"]);
    // 誰でもない人が全部 401 なのは「ログインが要る」だけ＝食い違いではない。
    const anonymous = sweep.runs.find((one) => one.role === ANONYMOUS);
    expect(anonymous?.report.results.map((one) => one.verdict)).toEqual([
      "locked",
      "blocked",
    ]);
    expect(anonymous?.report.unauthenticated).toBe(false);
    expect(renderAttackSweep(sweep)).toContain("誰でもない人=要ログイン");
    expect(sweepHasHole(sweep)).toBe(false);
  });

  it("見えないはずの画面が開いていたら、その役割の穴として出す", async () => {
    // 単価マスタが誰にでも 200 を返す（遮断を忘れた API）。
    const { send } = server((request) =>
      request.url.split("?")[0] === PRICES ? 200 : 200,
    );
    const sweep = await attackAll(
      targets(),
      { admin: { token: "admin-token" }, staff: { token: "staff-token" } },
      send,
    );
    const staff = sweep.runs.find((one) => one.role === "staff");
    expect(staff?.report.results.find((one) => one.page === "price_master")?.verdict).toBe("hole");
    // admin は開けてよいので穴ではない。
    const admin = sweep.runs.find((one) => one.role === "admin");
    expect(admin?.report.results.find((one) => one.page === "price_master")?.verdict).toBe("blocked");
    // 誰でもない人にも穴（ログインしていない人に見えている）。
    const anonymous = sweep.runs.find((one) => one.role === ANONYMOUS);
    expect(anonymous?.report.results.find((one) => one.page === "price_master")?.verdict).toBe("hole");
    expect(sweepHasHole(sweep)).toBe(true);

    const text = renderAttackSweep(sweep);
    // 表に1枚で並ぶ（役割が増えたときに他が緩んでいないかは、並べないと読めない）。
    expect(text).toContain("price_master");
    expect(text).toContain("staff=穴");
    expect(text).toContain("admin=ok");
    expect(text).toContain("誰でもない人=穴");
    // 穴は API 側の話だと毎回言う。
    expect(text).toContain("API 側で塞ぐもの");
  });

  it("資格の無い役割は叩かず、理由を残す（黙って飛ばさない）", async () => {
    const { send, sent } = server(strict);
    const sweep = await attackAll(targets(), { admin: { token: "admin-token" } }, send);
    expect(sweep.skipped).toEqual([]);
    // 定義に出てくる役割は admin だけなので、飛ばすものは無い。
    expect(sweep.runs.map((one) => one.label)).toEqual(["admin", "誰でもない人"]);

    // 定義に出てこない役割を accounts に足せば、それも叩く（穴を突く相手は
    // たいてい定義に書かれていない役割）。
    const { send: send2 } = server(strict);
    const wide = await attackAll(
      targets(),
      { admin: { token: "admin-token" }, staff: { token: "staff-token" } },
      send2,
    );
    expect(wide.runs.map((one) => one.label)).toContain("staff");
    expect(sent.length).toBeGreaterThan(0);
  });

  it("定義に出てくるのに資格が無い役割は、飛ばした理由が出る", async () => {
    const { send } = server(strict);
    const sweep = await attackAll(targets(), {}, send);
    expect(sweep.skipped.map((one) => one.role)).toEqual(["admin"]);
    expect(sweep.skipped[0].reason).toContain("資格が無いので叩いていません");
    const text = renderAttackSweep(sweep);
    expect(text).toContain("叩かなかった役割");
  });

  it("資格が通っていない役割は、結果を信じるなと言う", async () => {
    // 何を送っても 401（資格が通っていない）。
    const { send } = server(() => 401);
    const sweep = await attackAll(targets(), { admin: { token: "stale" } }, send);
    expect(sweep.runs[0].report.unauthenticated).toBe(true);
    expect(renderAttackSweep(sweep)).toContain("資格が通っていない");
    // 「穴が無い」と言えないので、終了コードは 1。
    expect(sweepHasHole(sweep)).toBe(true);
  });

  it("誰でもない人には「定義に出てこない役割」の断り書きを出さない", async () => {
    const { send } = server(strict);
    const sweep = await attackAll(targets(), { admin: { token: "admin-token" } }, send);
    const anonymous = sweep.runs.find((one) => one.role === ANONYMOUS);
    expect(anonymous?.report.unknownRole).toBe(false);
    expect(renderAttackSweep(sweep)).not.toContain("定義に出てきません");
  });

  it("突く役割は「定義に出てくる役割 ∪ 資格を書いた役割」", () => {
    expect(rolesToSweep(targets(), { staff: { token: "x" } })).toEqual([
      "admin",
      "staff",
    ]);
  });
});

describe("役割ごとの資格を読む", () => {
  it("token でも headers でも書ける（accounts で包んでもよい）", () => {
    expect(parseAttackAccounts({ hr: { token: "t" } })).toEqual({
      hr: { token: "t" },
    });
    expect(
      parseAttackAccounts({
        $comment: "説明",
        accounts: { hr: { headers: { "X-Role": "hr" } } },
      }),
    ).toEqual({ hr: { headers: { "x-role": "hr" } } });
  });

  it("知らないキーはエラー（設定が黙って効かないのが一番まずい）", () => {
    expect(() => parseAttackAccounts({ hr: { tokne: "t" } })).toThrow("知らないキー");
    expect(() => parseAttackAccounts({ hr: {} })).toThrow("token も headers も");
    expect(() => parseAttackAccounts("hr")).toThrow("map");
    expect(() => parseAttackAccounts({ "": { token: "t" } })).toThrow("誰でもない人");
  });
});
