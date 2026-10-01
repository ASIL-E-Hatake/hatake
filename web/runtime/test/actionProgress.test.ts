import { parsePageYaml } from "@hatake-fw/api";
import { describe, expect, it } from "vitest";
import { ActionRegistry } from "../src/action.js";
import { ActionRunner, type ActionProgress } from "../src/actionRunner.js";
import { Notifier } from "../src/notifier.js";

/**
 * 区切って実行する一括の進み具合（0.9.25）。
 *
 * 0.9.24 までのブラウザ版は「N / M 件おわりました」の字だけで、残り時間も中断も
 * 無かった（Flutter は棒・残り時間・中断を出していた）。
 */
const PAGE = parsePageYaml(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: archive, type: plugin, plugin: archive, label: しまう, scope: selection, batchSize: 2 }
`);
const action = PAGE.actions[0];
const rows = Array.from({ length: 6 }, (_, i) => ({ orderNo: `SO-${i + 1}` }));

/** 区切りごとに「どこまで送ったか」と、その時の進み具合を覚える。 */
function setup(options: { secondsPerBatch: number; onBatch?: (runner: ActionRunner, at: number) => void }) {
  let clock = 0;
  const seen: (ActionProgress | null)[] = [];
  const sent: number[] = [];
  let runner!: ActionRunner;
  runner = new ActionRunner({
    actions: new ActionRegistry({
      archive: async ({ records }) => {
        seen.push(runner.progress);
        sent.push(records.length);
        options.onBatch?.(runner, sent.length);
        clock += options.secondsPerBatch * 1000;
      },
    }),
    now: () => clock,
  });
  return { runner, seen, sent };
}

const around = { controller: new Notifier(), keyFields: ["orderNo"], setSelection: () => {} };

describe("進み具合", () => {
  it("区切りの境目で「あと何秒くらい」を出す（最初の区切りの前は言わない）", async () => {
    const { runner, seen } = setup({ secondsPerBatch: 10 });
    expect(await runner.run(action, { ...around, records: rows })).toBe(true);
    expect(seen.map((one) => one?.done)).toEqual([0, 2, 4]);
    // 1区切り目の前は見当が付かない＝言わない。2区切り目の前は 2件に10秒＝残り4件で20秒。
    expect(seen.map((one) => one?.remaining)).toEqual([null, "あと 20 秒くらい", "あと 10 秒くらい"]);
    expect(runner.progress).toBeNull();
  });

  it("中断すると、まだ送っていない区切りは送らない（送り残しを数える）", async () => {
    const { runner, sent } = setup({
      secondsPerBatch: 1,
      onBatch: (one, at) => {
        if (at === 1) one.cancel();
      },
    });
    expect(await runner.run(action, { ...around, records: rows })).toBe(false);
    // 1区切り目（2件）は送った＝取り消しではない。残り4件は送っていない。
    expect(sent).toEqual([2]);
    expect(runner.message?.text).toContain("4");
  });

  it("中断を頼んだら、終わるのを待っている間はそう分かる", async () => {
    let during: ActionProgress | null = null;
    const { runner } = setup({
      secondsPerBatch: 1,
      onBatch: (one, at) => {
        if (at === 1) {
          one.cancel();
          during = one.progress;
        }
      },
    });
    await runner.run(action, { ...around, records: rows });
    expect(during).toMatchObject({ cancelling: true });
  });
});
