import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReference,
  type DslReference,
  findWarnings,
  minimizeSource,
  parseAppMap,
  parsePageMap,
  parsePageYaml,
  removals,
  renderMinimize,
  shrink,
  without,
} from "../src/index.js";
import { parse as parseYaml } from "yaml";

const reference: DslReference = buildReference(
  JSON.parse(readFileSync("../spec/hatake-page.schema.json", "utf8")),
);

const minimize = (source: string) => minimizeSource(source, reference);

const VERBOSE = `dsl_version: "1.0"
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号, type: text, operator: contains }
  table:
    pagination: { enabled: true, pageSize: 50 }
    columns:
      # 金額は右寄せ（見せ方は format が決める）。
      - { field: amount, label: 金額, type: number, format: currency, sortable: false }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, type: text, required: true, validators: [] }
  actions:
    - { id: create, type: create, label: 新規, roles: [] }
`;

describe("意味を変えずに短くする", () => {
  it("既定値と同じ指定を落とす", () => {
    const result = minimize(VERBOSE);
    const where = result.dropped.map((one) => one.where);
    expect(where).toContain("page.search.filters[0].operator");
    expect(where).toContain("page.table.columns[0].sortable");
    expect(result.source).not.toContain("operator: contains");
    expect(result.source).not.toContain("sortable: false");
  });

  it("空の指定を落とす（書いてあるだけで何もしていない）", () => {
    const result = minimize(VERBOSE);
    const empties = result.dropped.filter((one) => one.why === "空");
    expect(empties.map((one) => one.where)).toContain("page.actions[0].roles");
    expect(result.source).not.toContain("roles: []");
    expect(result.source).not.toContain("validators: []");
  });

  it("入れ子ごと空になったら、その入れ物も落とす", () => {
    // pagination は enabled と pageSize を落とすと空になる。
    const result = minimize(VERBOSE);
    expect(result.source).not.toContain("pagination");
  });

  it("必須のキーは落とさない（スキーマ検証に落ちる形にしない）", () => {
    const result = minimize(VERBOSE);
    expect(result.source).toContain("type: crud");
    expect(result.source).toContain("id: order_list");
    expect(result.source).toContain("title: 受注一覧");
  });

  it("dsl_version は既定値と同じでも残す（版は必ず持つ）", () => {
    const result = minimize(VERBOSE);
    expect(result.source).toContain('dsl_version: "1.0"');
    expect(result.dropped.map((one) => one.key)).not.toContain("dsl_version");
  });

  it("コメントは残る（なぜこう書いたかが消えるなら誰も使わない）", () => {
    expect(minimize(VERBOSE).source).toContain(
      "# 金額は右寄せ（見せ方は format が決める）。",
    );
  });

  it("落とした所以外は1文字も変えない（消すだけ＝部分列になる）", () => {
    const result = minimize(VERBOSE);
    // 触っていない行がそのまま残っていること（折り返しや空白を作り直していない）。
    expect(result.source).toContain(
      "      - { field: amount, label: 金額, type: number, format: currency }",
    );
    // 出力は元の文字列から文字を消しただけ＝部分列。書き換えが1文字でもあれば落ちる。
    let at = 0;
    for (const character of result.source) {
      at = VERBOSE.indexOf(character, at);
      expect(at, `${character} が元の順番で見つからない`).toBeGreaterThanOrEqual(0);
      at++;
    }
  });

  it("改行コードは元のまま（CRLF のファイルを LF に書き換えない）", () => {
    const crlf = VERBOSE.replaceAll("\n", "\r\n");
    const result = minimize(crlf);
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.source).toContain("\r\n");
    expect(result.source.replaceAll("\r\n", "\n")).not.toContain("\r");
  });

  it("落とせるものが無ければ、何も触らない", () => {
    const minimal = minimize(VERBOSE).source;
    const again = minimize(minimal);
    expect(again.dropped).toEqual([]);
    expect(again.source).toBe(minimal);
  });

  it("書き間違いのある定義は最小化しない（黙って未知キーを消す道具にしない）", () => {
    const typo = VERBOSE.replace("label: 金額", "label: 金額, witdh: 140");
    expect(() => minimize(typo)).toThrow("witdh");
  });

  it("人が読む形は、落としたものを全部並べる", () => {
    const text = renderMinimize(minimize(VERBOSE));
    expect(text).toContain("件の指定を落としました");
    expect(text).toContain("（既定値と同じ）");
    expect(text).toContain("モデルが1バイトも変わらない");
  });
});

describe("同梱の例", () => {
  const dir = "../spec/examples";
  const files = readdirSync(dir).filter((file) => file.endsWith(".yaml"));

  it("どの例も、最小化してもモデルが変わらない", () => {
    for (const file of files) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const result = minimize(source);
      const model = (text: string): unknown => {
        const raw = parseYaml(text) as Record<string, unknown>;
        return raw.app === undefined ? parsePageMap(raw) : parseAppMap(raw);
      };
      expect(model(result.source), file).toEqual(model(source));
    }
  });

  it("最小化した例も、警告ゼロで strict に通る", () => {
    for (const file of files) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      const result = minimize(source);
      const raw = parseYaml(result.source) as Record<string, unknown>;
      expect(findWarnings(raw), file).toEqual([]);
      if (raw.app === undefined) {
        expect(() => parsePageYaml(result.source, { strict: true })).not.toThrow();
      }
    }
  });

  it("実際に短くなる（既定値を書いた例が混ざっている）", () => {
    const total = files.reduce(
      (sum, file) => sum + minimize(readFileSync(`${dir}/${file}`, "utf8")).dropped.length,
      0,
    );
    expect(total).toBeGreaterThan(10);
  });
});

describe("消す機械（shrink）", () => {
  const sample = { a: { b: [1, 2, 3] }, c: "x" };

  it("深いものから、配列は後ろから並べる（切ったあとの位置がずれないように）", () => {
    const where = removals(sample).map((one) => one.where);
    expect(where.slice(0, 4)).toEqual(["a.b[2]", "a.b[1]", "a.b[0]", "a.b"]);
    expect(where[where.length - 1]).toBe("c");
  });

  it("消すのは複製（元は触らない）", () => {
    expect(without(sample, ["a", "b", 1])).toEqual({ a: { b: [1, 3] }, c: "x" });
    expect(sample.a.b).toEqual([1, 2, 3]);
  });

  it("無い場所は null", () => {
    expect(without(sample, ["a", "z"])).toBeNull();
    expect(without(sample, ["a", "b", 9])).toBeNull();
  });

  it("条件が通らなければ1つも消さない", () => {
    const result = shrink(sample, () => false);
    expect(result.removed).toEqual([]);
    expect(result.document).toEqual(sample);
  });

  it("条件が通る限り消す", () => {
    const result = shrink(sample, (candidate) => JSON.stringify(candidate).includes('"c"'));
    expect(result.document).toEqual({ c: "x" });
  });
});
