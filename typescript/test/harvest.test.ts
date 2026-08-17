import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type FailureCatalog,
  failureSource,
  HARVEST_NOTE,
  harvestFailures,
  type HarvestInput,
  renderHarvest,
} from "../src/index.js";

const catalog = JSON.parse(
  readFileSync("../spec/failures.json", "utf8"),
) as FailureCatalog;

/** 宣言していない行アクション（警告 rowaction-not-declared が1つ出る定義）。 */
const undeclaredRowAction = (id: string): string => `
page:
  type: crud
  id: ${id}
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit, approve]
    columns:
      - { field: orderNo, label: 受注番号 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
`;

/** 小計の出る帳票なのに並べ替えが無い（groupby-without-sort）。 */
const groupWithoutSort = (id: string): string => `
page:
  type: report
  id: ${id}
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: 顧客 }
      - { field: amount, label: 金額, type: number }
  report:
    groupBy:
      - { field: customer, label: 顧客 }
`;

const inputs = (...sources: string[]): HarvestInput[] =>
  sources.map((source, index) => ({ file: `def${index}.yaml`, source }));

describe("転び方を集める", () => {
  it("繰り返し出ている診断だけを候補にする（1回は転び方ではない）", () => {
    const result = harvestFailures(
      inputs(undeclaredRowAction("a"), undeclaredRowAction("b"), groupWithoutSort("c")),
    );
    expect(result.scanned).toBe(3);
    expect(result.candidates.map((c) => c.id)).toEqual(["rowaction-not-declared"]);
    expect(result.rare.map((r) => r.diagnosis)).toEqual(["groupby-without-sort"]);
  });

  it("--min を下げれば1回でも候補になる", () => {
    const result = harvestFailures(inputs(groupWithoutSort("c")), { min: 1 });
    expect(result.candidates.map((c) => c.id)).toEqual(["groupby-without-sort"]);
  });

  it("同じ定義の中で2回でも数える（同じ手が2度伸びたということ）", () => {
    const twice = `
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [approve, reject]
    columns:
      - { field: orderNo, label: 受注番号 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
`;
    const result = harvestFailures(inputs(twice));
    expect(result.candidates[0].hits).toBe(2);
    expect(result.candidates[0].files).toBe(1);
  });

  it("回数の多い順に並ぶ（同じ入力なら always 同じ順）", () => {
    const result = harvestFailures(
      inputs(
        undeclaredRowAction("a"),
        undeclaredRowAction("b"),
        groupWithoutSort("c"),
        groupWithoutSort("d"),
        groupWithoutSort("e"),
      ),
    );
    expect(result.candidates.map((c) => c.id)).toEqual([
      "groupby-without-sort",
      "rowaction-not-declared",
    ]);
  });

  it("未知キー（綴り間違い）も転び方として集める", () => {
    const typo = (id: string) => `
page:
  type: search
  id: ${id}
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号, witdh: 140 }
`;
    const result = harvestFailures(inputs(typo("a"), typo("b")));
    expect(result.candidates[0].diagnosis).toEqual({ unknownKeys: ["witdh"] });
    expect(result.candidates[0].says).toContain("width の間違い？");
  });

  it("外との辻褄は、登録済み一覧を渡したときだけ見る", () => {
    const guessed = (id: string) => `
page:
  type: search
  id: ${id}
  title: 受注照会
  repository: orderRepo
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
`;
    const both = inputs(guessed("a"), guessed("b"));
    expect(harvestFailures(both).candidates).toEqual([]);
    const withRegistry = harvestFailures(both, {
      registry: { repositories: ["orderRepository"] },
      min: 2,
    });
    expect(withRegistry.candidates.map((c) => c.id)).toEqual(["unknown-repository"]);
  });
});

describe("カタログとの関係", () => {
  it("既に載っている診断は候補にせず、数えるだけ（重複を増やさない）", () => {
    const result = harvestFailures(
      inputs(undeclaredRowAction("a"), undeclaredRowAction("b")),
      { catalog },
    );
    expect(result.candidates).toEqual([]);
    expect(result.known).toEqual([
      {
        diagnosis: "rowaction-not-declared",
        hits: 2,
        files: 2,
        known: "invented-row-action",
      },
    ]);
  });

  // カタログの実例そのものを走査すると、全部「既に載っている」になるはず。
  // ならなければ、カタログと診断のどちらかがズレている。
  it("カタログに載っている実例からは、新しい候補が出ない", () => {
    const detected = catalog.failures.filter(
      (failure) => (failure.diagnosis.warnings ?? []).length > 0,
    );
    const result = harvestFailures(
      detected.map((failure) => ({
        file: `${failure.id}.yaml`,
        source: failureSource(failure.wrote),
      })),
      { catalog, min: 1, registry: { repositories: ["orderRepository"] } },
    );
    expect(result.candidates).toEqual([]);
    expect(result.known.length).toBeGreaterThan(0);
  });

  it("人が書く欄は空のまま出す（機械には書けないものだけを並べる）", () => {
    const [candidate] = harvestFailures(
      inputs(undeclaredRowAction("a"), undeclaredRowAction("b")),
    ).candidates;
    expect(candidate.todo.join("\n")).toContain("why:");
    expect(candidate.todo.join("\n")).toContain("wrote / fixed:");
    // 候補は failures.json に入れられる形をしていない（人の手が要ると分かるように）。
    expect(candidate).not.toHaveProperty("why");
    expect(candidate).not.toHaveProperty("wrote");
    expect(candidate).not.toHaveProperty("fix");
  });

  it("定義そのものは持ち出さない（ファイル名・場所・回数だけ）", () => {
    const source = undeclaredRowAction("a");
    const result = harvestFailures(inputs(source, undeclaredRowAction("b")));
    const dumped = JSON.stringify(result);
    expect(dumped).not.toContain("受注番号"); // 客先の語彙が混ざる所
    expect(result.candidates[0].where[0]).toEqual({
      file: "def0.yaml",
      path: "page.table.rowActions[1]",
    });
  });
});

describe("走査できないもの", () => {
  it("定義でないファイルは黙って飛ばす（pubspec.yaml が混ざるのは普通）", () => {
    const result = harvestFailures([
      { file: "pubspec.yaml", source: "name: demo\ndependencies:\n  flutter:\n" },
      { file: "a.yaml", source: undeclaredRowAction("a") },
    ]);
    expect(result.scanned).toBe(1);
    expect(result.ignored).toBe(1);
    expect(result.unreadable).toEqual([]);
  });

  it("定義を名乗っているのに読めないものは報告する（走査が不完全だと言う）", () => {
    const result = harvestFailures([
      { file: "broken.yaml", source: "page:\n  type: crud\n   id: bad\n\tbad\n" },
    ]);
    expect(result.scanned).toBe(0);
    expect(result.unreadable).toHaveLength(1);
    expect(result.unreadable[0].file).toBe("broken.yaml");
  });
});

describe("人が読む形", () => {
  it("候補と、数えただけのものを分けて出す", () => {
    const result = harvestFailures(
      inputs(undeclaredRowAction("a"), undeclaredRowAction("b"), groupWithoutSort("c")),
      { catalog },
    );
    const text = renderHarvest(result, 2);
    expect(text).toContain("既にカタログにある");
    expect(text).toContain("2 回に届かなかった");
    expect(text).toContain(HARVEST_NOTE);
  });

  // 収穫できる範囲を毎回言う。黙ると「これで全部」という嘘になる。
  it("機械が言えない転び方は出ないと、必ず書く", () => {
    expect(renderHarvest(harvestFailures([]), 2)).toContain(HARVEST_NOTE);
    expect(HARVEST_NOTE).toContain("hatake explain");
  });
});

describe("同梱の例", () => {
  it("例からは候補が出ない（＝配っている定義が汚れていない）", () => {
    const dir = "../spec/examples";
    const result = harvestFailures(
      readdirSync(dir)
        .filter((file) => file.endsWith(".yaml"))
        .map((file) => ({
          file,
          source: readFileSync(`${dir}/${file}`, "utf8"),
        })),
      { catalog, min: 1 },
    );
    expect(result.candidates).toEqual([]);
    expect(result.known).toEqual([]);
    expect(result.rare).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });
});
