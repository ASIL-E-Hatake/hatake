import { describe, expect, it } from "vitest";
import {
  attackAll,
  diffRuns,
  hasNewTrouble,
  type HttpRequest,
  probe,
  readRun,
  renderRunDiff,
  requestKey,
  restTargets,
} from "../src/index.js";

/// 前回叩いた結果と比べる（`probe` / `attack` の `--since`）。
///
/// ここで守るのは3つ。**変わっていないものを並べない**（毎晩同じ表は読まれない）・
/// **数が変わっただけを「新しい」と言わない**（食い違いの鍵に数を入れない）・
/// **叩けなくなった相手のぶんを「直った」と言わない**（資格が切れた晩に静かに緑になる
/// のが、この道具で一番まずい嘘）。
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

const targets = (source: string, baseUrl = "http://x/api") =>
  restTargets(source, { baseUrl });

/**
 * 偽のサーバ。`tight` なら単価マスタは admin の資格だけに開く（正しい API）。
 * `tight` でなければ誰にでも開く（遮断を忘れた API）。
 */
const server = (tight: boolean) => ({
  send: async (request: HttpRequest) => {
    const prices = request.url.startsWith("http://x/api/prices");
    const isAdmin = request.headers.authorization === "Bearer a";
    return {
      status: prices && tight && !isAdmin ? 403 : 200,
      body: JSON.stringify({
        items: [{ orderNo: "SO-1", itemCode: "A-1" }],
        totalCount: 1,
      }),
    };
  },
});

/** 一覧を返す偽のサーバ（probe 用）。 */
const listing = (items: unknown[], totalCount = items.length) => ({
  send: async () => ({
    status: 200,
    body: JSON.stringify({ items, totalCount }),
  }),
});

/** 保存して読み直す（`--save` → 次の晩の `--since` と同じ道）。 */
const saved = (report: unknown) => readRun(JSON.parse(JSON.stringify(report)));

const ACCOUNTS = { admin: { token: "a" }, staff: { token: "s" } };

describe("--since（前回と比べる）", () => {
  it("同じ結果なら「変わった所はありません」。残っている数だけ言う", async () => {
    const before = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    const after = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    const diff = diffRuns(saved(before), saved(after));

    expect(diff.added).toEqual([]);
    expect(diff.gone).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(hasNewTrouble(diff)).toBe(false);
    const out = renderRunDiff(diff);
    expect(out).toContain("前回と同じです");
    // 穴は前から在る（staff と 誰でもない人の単価マスタ）。隠さずに数で言う。
    expect(out).toContain("前から続いているもの: 2 件");
  });

  it("新しく穴が空いたら、それだけを出す（前から在る穴は並べない）", async () => {
    // 前: 単価マスタは admin だけに開く。後: 遮断が外れて誰にでも開いた。
    const before = await attackAll(targets(APP), ACCOUNTS, server(true).send);
    const after = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    const diff = diffRuns(saved(before), saved(after));

    // staff と 誰でもない人の2本ぶんが「遮断されている → 穴」に変わった。
    // admin は前も後も開けている＝並べない。
    expect(diff.added).toEqual([]);
    expect(diff.changed.map((one) => one.item.where)).toEqual([
      "staff: price_master",
      "誰でもない人: price_master",
    ]);
    expect(diff.changed[0].was).toBe("遮断されている");
    expect(diff.changed[0].item.state).toBe("穴");
    expect(hasNewTrouble(diff)).toBe(true);
    expect(renderRunDiff(diff)).toContain("遮断されている → 穴");
  });

  it("穴が塞がったら、それも出す（落としはしない）", async () => {
    const before = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    const after = await attackAll(targets(APP), ACCOUNTS, server(true).send);
    const diff = diffRuns(saved(before), saved(after));

    expect(diff.changed.map((one) => `${one.was} → ${one.item.state}`)).toEqual([
      "穴 → 遮断されている",
      "穴 → 遮断されている",
    ]);
    // admin は前後どちらも開けている（締めたせいで仕事ができなくなっていない）。
    expect(diff.changed.map((one) => one.item.scope)).toEqual([
      "staff: price_master",
      "誰でもない人: price_master",
    ]);
    // 良くなった側では落とさない。
    expect(hasNewTrouble(diff)).toBe(false);
  });

  it("叩けなくなった役割の穴を「直った」と言わない（分からないと言う）", async () => {
    const before = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    // staff の資格が期限で取れなかった晩。
    const after = await attackAll(
      targets(APP),
      { admin: { token: "a" } },
      server(false).send,
      { staff: "資格が取れませんでした（401 が返りました）" },
    );
    const diff = diffRuns(saved(before), saved(after));

    expect(diff.lost.map((one) => one.scope)).toEqual(["staff"]);
    expect(diff.lost[0].reason).toContain("401");
    // staff の穴は消えたが、直ったとは言わない。
    const gone = diff.gone.filter((one) => one.item.scope === "staff");
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.every((one) => one.unknown)).toBe(true);
    // 何も見ていない晩に静かに通らない。
    expect(hasNewTrouble(diff)).toBe(true);
    const out = renderRunDiff(diff);
    expect(out).toContain("前回は叩けていたのに、今回叩いていない相手");
    expect(out).toContain("直ったかは分かりません");
    expect(out).not.toContain("[直った]");
  });

  it("1画面だけ繋がらなかったときも、その画面の穴を「直った」と言わない", async () => {
    const before = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    // 単価マスタだけが繋がらない晩（他の画面と他の役割は叩けている）。
    const flaky = {
      send: async (request: HttpRequest) => {
        if (request.url.startsWith("http://x/api/prices")) {
          throw new Error("ECONNREFUSED");
        }
        return {
          status: 200,
          body: JSON.stringify({ items: [{ orderNo: "SO-1" }], totalCount: 1 }),
        };
      },
    };
    const after = await attackAll(targets(APP), ACCOUNTS, flaky.send);
    const diff = diffRuns(saved(before), saved(after));

    // 役割ぜんぶで単価マスタが叩けていない＝役割は生きているので、画面の組で出る。
    expect(diff.lost.map((one) => one.scope)).toEqual([
      "admin: price_master",
      "staff: price_master",
      "誰でもない人: price_master",
    ]);
    expect(diff.lost[0].reason).toContain("ECONNREFUSED");
    expect(diff.gone.every((one) => one.unknown)).toBe(true);
    expect(hasNewTrouble(diff)).toBe(true);
    // 受注照会は今晩も叩けている＝そちらは何も言わない。
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("役割ごと叩けなかったときは、その役割の画面を1行ずつ並べない", async () => {
    const before = await attackAll(targets(APP), ACCOUNTS, server(false).send);
    const after = await attackAll(
      targets(APP),
      { admin: { token: "a" } },
      server(false).send,
      { staff: "資格が取れませんでした（401 が返りました）" },
    );
    const diff = diffRuns(saved(before), saved(after));
    // 「staff」だけ。「staff: order_search」「staff: price_master」は畳む。
    expect(diff.lost).toEqual([
      { scope: "staff", reason: "資格が取れませんでした（401 が返りました）" },
    ]);
  });

  it("数が変わっただけでは「新しく出た」にしない", async () => {
    // pageSize 2 を頼んで 3 件 → 5 件（同じ食い違いが続いているだけ）。
    const before = await probe(targets(PAGE), listing([1, 2, 3].map(row)).send);
    const after = await probe(targets(PAGE), listing([1, 2, 3, 4, 5].map(row)).send);
    const diff = diffRuns(saved(before), saved(after));

    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.staying).toBe(0); // 要確認（caution）なので落ちる側には数えない
    expect(hasNewTrouble(diff)).toBe(false);
  });

  it("基点が変わっても同じものとして扱う（環境の引っ越しで全部新しくならない）", async () => {
    expect(requestKey("GET http://x/api/orders?page=0&pageSize=2")).toBe(
      requestKey("GET https://staging.example.com/api/orders?page=0&pageSize=50"),
    );
    const before = await probe(
      targets(PAGE, "http://x/api"),
      listing([{ orderNo: "SO-1" }]).send,
    );
    const after = await probe(
      targets(PAGE, "http://y/api"),
      listing([{ orderNo: "SO-1" }]).send,
    );
    const diff = diffRuns(saved(before), saved(after));
    expect(diff.added).toEqual([]);
    expect(diff.gone).toEqual([]);
  });

  it("画面ごと叩かなかったぶんは「相手が減った」として出る", async () => {
    const before = await probe(targets(PAGE), listing([{ orderNo: "SO-1" }]).send);
    const snapshot = saved(before);
    // 次の晩、その画面を定義から外した（＝叩いていない）。
    const after = readRun({
      findings: [],
      requests: [],
      pages: [],
      skipped: [{ page: "order_search", reason: "repository が無い" }],
    });
    const diff = diffRuns(snapshot, after);
    expect(diff.lost).toEqual([
      { scope: "order_search", reason: "repository が無い" },
    ]);
  });
});

describe("保存された結果を読む", () => {
  it("--dry-run の出力は比べる相手にならない（黙って 0 件にしない）", () => {
    expect(() => readRun({ requests: ["GET /api/orders"], skipped: [] })).toThrow(
      /probe \/ attack の --json/,
    );
  });

  it("古い形（叩いた画面が無い）は読めないと言う", () => {
    expect(() => readRun({ findings: [], requests: [], skipped: [] })).toThrow(
      /--save で作り直して/,
    );
  });

  it("別の道具の結果は比べない", async () => {
    const one = saved(await probe(targets(PAGE), listing([{ orderNo: "SO-1" }]).send));
    const other = saved(await attackAll(targets(APP), ACCOUNTS, server(false).send));
    expect(() => diffRuns(one, other)).toThrow(/別の道具の結果は比べられません/);
  });
});

/** 一覧の行（金額は宣言どおり number）。 */
function row(no: number): Record<string, unknown> {
  return { orderNo: `SO-${no}`, amount: no * 100 };
}
