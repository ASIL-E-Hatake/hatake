import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  findUnknownKeys,
  findWarnings,
  fixSource,
  fixTodo,
  parsePath,
  pathText,
  renderFix,
  renderFixTodo,
  soleClosestKey,
} from "../src/index.js";

const document = (source: string): Record<string, unknown> =>
  parseYaml(source) as Record<string, unknown>;

/** 綴り違いが3つ入った定義（キー2つと行アクション1つ）。 */
const TYPOS = `dsl_version: "1.0"
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit, aprove]
    columns:
      # 幅を指定したつもり
      - { field: orderNo, label: 受注番号, witdh: 140 }
      - { field: amount, label: 金額, type: number, format: currency }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true, readonly: true }
  actions:
    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
`;

describe("一意に決まるものだけ直す", () => {
  const result = fixSource(TYPOS);

  it("知らないキーは、近い既知キーが1つに決まるときだけ直す", () => {
    const keys = result.applied.filter((fix) => fix.kind === "キー名を直す");
    expect(keys.map((fix) => `${fix.from} → ${fix.to}`)).toEqual([
      "witdh → width",
      "readonly → readOnly",
    ]);
    expect(result.source).toContain("witdh: 140".replace("witdh", "width"));
    expect(result.source).not.toContain("witdh");
  });

  it("行アクションの綴り違いは、宣言済みの id に寄せる", () => {
    expect(result.source).toContain("rowActions: [edit, approve]");
  });

  it("直したあとは strict でも警告でも問題が無くなる", () => {
    expect(findUnknownKeys(document(result.source))).toEqual([]);
    expect(findWarnings(document(result.source))).toEqual([]);
    expect(result.remaining).toEqual([]);
  });

  it("直した所以外は触らない（コメントも書き方もそのまま）", () => {
    expect(result.source).toContain("      # 幅を指定したつもり");
    expect(result.source).toContain(
      "      - { field: amount, label: 金額, type: number, format: currency }",
    );
  });

  it("改行コードは元のまま", () => {
    const crlf = fixSource(TYPOS.replaceAll("\n", "\r\n"));
    expect(crlf.applied.length).toBeGreaterThan(0);
    expect(crlf.source).toContain("\r\n");
    expect(crlf.source.replaceAll("\r\n", "\n")).not.toContain("\r");
  });

  it("2度目は何も直さない（1回で終わる）", () => {
    const again = fixSource(result.source);
    expect(again.applied).toEqual([]);
    expect(again.source).toBe(result.source);
  });

  it("候補が2つあるものは直さず、理由を言う", () => {
    // xprove は approve とも improve とも同じ距離。どちらかは人が決める。
    const ambiguous = TYPOS.replace("[edit, aprove]", "[edit, xprove]").replace(
      "    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }",
      `    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
    - { id: improve, type: plugin, plugin: improveOrder, label: 改善 }`,
    );
    expect(soleClosestKey("xprove", ["approve", "improve"])).toBeNull();
    const refused = fixSource(ambiguous);
    expect(refused.source).toContain("[edit, xprove]");
    const reason = refused.skipped.find((one) => one.rule === "rowaction-not-declared");
    expect(reason?.reason).toContain("1つに決まりません");
  });

  it("意図が要るものは触らない（どちらを残すかは人が決める）", () => {
    const duplicate = `page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
      - fields:
          - { field: code, label: 顧客コード }
`;
    const result = fixSource(duplicate);
    expect(result.applied).toEqual([]);
    expect(result.remaining).toEqual(["duplicate-field"]);
    expect(renderFix(result)).toContain("hatake validate");
  });
});

describe("外との辻褄（登録済み一覧を渡したとき）", () => {
  const page = (repository: string) => `page:
  type: search
  id: order_search
  title: 受注照会
  repository: ${repository}
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
`;

  it("略して書いた名前は、登録名に戻す（いちばん多い転び方）", () => {
    const result = fixSource(page("orderRepo"), {
      registry: { repositories: ["orderRepository", "customerRepository"] },
    });
    expect(result.source).toContain("repository: orderRepository");
    expect(result.applied[0].rule).toBe("unknown-repositories");
  });

  it("当てはまる登録名が2つあるときは直さない", () => {
    const result = fixSource(page("order"), {
      registry: { repositories: ["orderRepository", "orderLineRepository"] },
    });
    expect(result.applied).toEqual([]);
    expect(result.skipped[0].reason).toContain("1つに決まりません");
  });

  it("近いものが無ければ、無いと言う（名前を決めるのは人）", () => {
    const result = fixSource(page("zzz"), {
      registry: { repositories: ["orderRepository"] },
    });
    expect(result.applied).toEqual([]);
    expect(result.skipped[0].reason).toContain("近いものがありません");
  });

  it("登録済み一覧を渡さなければ、外との辻褄は直さない", () => {
    const result = fixSource(page("orderRepo"));
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe("足りない指定を足す", () => {
  const report = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: 得意先 }
      - { field: amount, label: 金額, type: number }
  report:
    groupBy:
      - { field: customer, label: 得意先, pageBreak: true }
    totals:
      - { field: amount, aggregate: sum }
`;

  it("小計の出る帳票に、印字順を足す（入れる値が決まっている）", () => {
    const result = fixSource(report);
    expect(result.applied[0].kind).toBe("行を足す");
    expect(result.source).toContain("    sort: { field: customer }");
    // 足した行の字下げが groupBy と揃っている（report の直下）。
    expect(result.source).toMatch(/\n    sort: \{ field: customer \}\n    groupBy:/);
    expect(findWarnings(document(result.source))).toEqual([]);
  });
});

describe("app の中も直す", () => {
  const app = `dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  home: order_serch
  menu:
    - { id: orders, label: 受注, page: order_serch }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
`;

  it("メニューと初期ルートのページ id の綴り違いを直す", () => {
    const result = fixSource(app);
    expect(result.source).toContain("home: order_search");
    expect(result.source).toContain("page: order_search");
    expect(findWarnings(document(result.source))).toEqual([]);
  });
});

describe("守っているもの", () => {
  it("新しい問題を出す直し方はしない（同梱の例を壊した形で確かめる）", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      // 綴りを1文字ずつ壊して、直したあとに新しい規則が出ないことを見る。
      const broken = source.replace("label:", "labe:");
      if (broken === source) continue;
      const before = new Set(
        findWarnings(document(broken)).map((warning) => warning.rule),
      );
      const result = fixSource(broken);
      for (const rule of findWarnings(document(result.source)).map((w) => w.rule)) {
        expect(before.has(rule), `${file}: ${rule}`).toBe(true);
      }
    }
  });

  it("同梱の例には直すものが無い（配っているものは健康）", () => {
    const dir = "../spec/examples";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const result = fixSource(readFileSync(`${dir}/${file}`, "utf8"));
      expect(result.applied, file).toEqual([]);
      expect(result.source, file).toBe(readFileSync(`${dir}/${file}`, "utf8"));
    }
  });
});

describe("道の書き方（警告と行き来する）", () => {
  it("文字列の道と配列の道が往復する", () => {
    for (const text of [
      "page.table.columns[0].label",
      "app.pages[2].form.sections[1].fields[0].optionsFrom",
      "dsl_version",
    ]) {
      expect(pathText(parsePath(text))).toBe(text);
    }
  });
});

describe("直せなかったものを次の1往復で渡す", () => {
  /** 機械が直せるもの（綴り違い）と、直せないもの（意図が要る）を両方持つ定義。 */
  const MIXED = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: 顧客, witdh: 140 }
      - { field: amount, label: 金額, type: number }
  report:
    groupBy: [{ field: customer, label: 顧客 }]
    totals: [{ field: tax, aggregate: sum }]
`;

  const todo = fixTodo(fixSource(MIXED));

  it("機械が直した件数を持つ（もう見なくていい所を言うため）", () => {
    // witdh → width と、groupBy に対する report.sort は機械が直せる。
    expect(todo.fixed).toBeGreaterThan(0);
  });

  it("残りには場所が付いている（remaining は名前だけなので付け直す）", () => {
    const totals = todo.items.find((one) => one.rule === "total-without-column");
    expect(totals).toBeDefined();
    expect(totals?.where).toBe("page.report.totals[0].field");
    expect(totals?.reason).toContain("table.columns にありません");
  });

  it("直した所は残りに入らない（触ると戻る所を渡さない）", () => {
    expect(todo.items.map((one) => one.rule)).not.toContain("unknown-key:witdh");
    expect(todo.items.map((one) => one.rule)).not.toContain("groupby-without-sort");
  });

  it("手掛かりを渡せる（実例カタログの直し方を添える）", () => {
    const withHint = fixTodo(fixSource(MIXED), (rule) =>
      rule === "total-without-column" ? "列に足すか、列にある項目で合計する。" : undefined,
    );
    expect(
      withHint.items.find((one) => one.rule === "total-without-column")?.hint,
    ).toContain("列に足すか");
  });

  it("同じ所の同じ規則は1回だけ（skipped と診断で二重に出さない）", () => {
    const keys = todo.items.map((one) => `${one.rule}@${one.where}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("渡す文は「この件だけ・ほかは触らない」まで言う", () => {
    const text = renderFixTodo(todo);
    expect(text).toContain("件を直しました");
    expect(text).toContain("ほかの所は触らないこと");
    expect(text).toContain("hatake validate");
    // 場所と規則名が読める形。
    expect(text).toContain("[total-without-column]");
  });

  it("残りが無ければ、そう言う（空の指示を渡さない）", () => {
    const clean = `page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns: [{ field: code, label: コード }]
  form:
    sections:
      - fields: [{ field: code, label: コード, required: true }]
`;
    const empty = fixTodo(fixSource(clean));
    expect(empty.items).toEqual([]);
    expect(renderFixTodo(empty)).toContain("残っている仕事はありません");
  });
});
