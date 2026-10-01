import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "../src/cli.js";
import {
  attack,
  attackAll,
  attackHitNothing,
  type HttpRequest,
  probe,
  probeHitNothing,
  renderAttack,
  renderAttackSweep,
  renderProbe,
  restTargets,
  sweepHitNothing,
} from "../src/internal.js";

/**
 * **0件だったことを、通ったことと分けて言う。**
 *
 * 数える道具が「0 件すべて期待どおり。」「食い違い 0 件」で 0 を返すと、何も確かめて
 * いないのに通った run と字面がほとんど同じになる。人は数字で気づくが、**AI と CI は
 * 終了コードを見る**。見本を上げたとき、集計が「通った件数: 0」と出しただけで失敗に
 * ならず、実際にこれで足を取られた。
 */

const PAGE = `
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
`;

function fakeIo(files: Record<string, string>): CliIo & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such file: ${path}`);
      return source;
    },
    writeFile: () => {},
    listFiles: () => null,
  };
}

describe("hatake run", () => {
  it("cases が空なら、何も試していないと言って落とす", () => {
    const io = fakeIo({ "page.yaml": PAGE, "s.json": JSON.stringify({ cases: [] }) });
    expect(runCli(["run", "page.yaml", "--scenario", "s.json"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("1件もありません");
    expect(io.stdout.join("\n")).not.toContain("すべて期待どおり");
  });

  it("--json でも同じ（機械が読む口も 0 で終わらせない）", () => {
    const io = fakeIo({ "page.yaml": PAGE, "s.json": JSON.stringify({ cases: [] }) });
    expect(runCli(["run", "page.yaml", "--scenario", "s.json", "--json"], io)).toBe(1);
  });

  it("1件あれば今までどおり", () => {
    const scenario = {
      cases: [{ name: "空は止まる", record: {}, expect: { errors: [{ field: "orderNo" }] } }],
    };
    const io = fakeIo({ "page.yaml": PAGE, "s.json": JSON.stringify(scenario) });
    const code = runCli(["run", "page.yaml", "--scenario", "s.json"], io);
    expect(io.stdout.join("\n")).toContain("1 件");
    expect([0, 1]).toContain(code);
  });

  it("空から下書きを起こすのは正しい使い方なので止めない（--cover --draft）", () => {
    const io = fakeIo({ "page.yaml": PAGE, "s.json": JSON.stringify({ cases: [] }) });
    expect(
      runCli(["run", "page.yaml", "--scenario", "s.json", "--cover", "--draft"], io),
    ).toBe(0);
  });
});

/** 一覧を持たない画面だけの定義＝叩ける口が1つも無い。 */
const NOTHING_TO_HIT = `
app:
  id: entry_only
  title: 入力だけ
  menu:
    - { id: entry, label: 入力, page: order_entry }
  pages:
    - type: form
      id: order_entry
      title: 受注入力
      repository: orderRepository
      form:
        sections:
          - fields:
              - { field: orderNo, label: 受注番号 }
`;

const neverCalled = async (_request: HttpRequest) => ({ status: 200, body: "{}" });
/** サーバが落ちている（全部の要求が届かない）。穴 0 件の緑がいちばん出やすい形。 */
const serverDown = async (_request: HttpRequest): Promise<{ status: number; body: string }> => {
  throw new Error("connect ECONNREFUSED");
};
const targets = () => restTargets(NOTHING_TO_HIT, { baseUrl: "http://localhost:8080/api" });

describe("hatake probe / attack", () => {
  it("probe: 1件も叩けなければ、食い違い 0 件ではなく「叩いていない」と言う", async () => {
    const report = await probe(targets(), neverCalled);
    expect(probeHitNothing(report)).toBe(true);
    const text = renderProbe(report);
    expect(text).toContain("1件も叩いていません");
    expect(text).not.toContain("食い違い 0 件");
  });

  it("attack: サーバが落ちていて1件も届かなければ、穴 0 件と言わない", async () => {
    const report = await attack(targets(), "staff", serverDown);
    expect(attackHitNothing(report)).toBe(true);
    expect(renderAttack(report)).toContain("1件も叩いていません");
  });

  it("役割ぜんぶ: どの役割でも1件も届かなければそう言う", async () => {
    const sweep = await attackAll(targets(), {}, serverDown);
    expect(sweepHitNothing(sweep)).toBe(true);
    expect(renderAttackSweep(sweep)).toContain("1件も叩いていません");
  });
});
