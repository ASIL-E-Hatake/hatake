import { parsePageJson } from "@hatake-fw/api";
import type { CrudPageDefinition, SearchPageDefinition } from "@hatake-fw/api/internal";
import { expandVocabularies, findUnknownKeys } from "@hatake-fw/api/internal";
import { FakeRepository, type PrintRequest, RepositoryRegistry } from "@hatake-fw/runtime";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { HatakePage } from "../src/page.js";
import { HatakeScope } from "../src/scope.js";

/**
 * **Vue 版（`@hatake-fw/vue3`）と同じ並びの試験。**
 *
 * 同じ定義・同じ印（`data-hatake`）・同じクラス名で、同じ答えになることを確かめる。
 * 2つの Renderer が同じ土台（`@hatake-fw/runtime`）に乗っている証明でもあり、
 * **片方だけ直したときにここで気づける**。
 */
const yaml = `
dsl_version: "1.0"
app:
  id: demo
  title: 見本
  vocabularies:
    - name: customerStatus
      options:
        - { value: active, label: 取引中 }
        - { value: closed, label: 取引終了 }
page:
  id: customers
  type: crud
  title: 顧客マスタ
  repository: customerRepository
  key: code
  search:
    filters:
      - { field: name, label: 名前, type: text }
  table:
    columns:
      - { field: code, label: コード }
      - { field: name, label: 名前 }
      - { field: status, label: 状態, optionsOf: customerStatus }
    pagination: { pageSize: 2 }
    # 行の「編集」「削除」は**書いたときだけ**出る（Flutter 版と同じ）。
    rowActions: [edit, delete]
  # 「新規登録」も**書いたときだけ**（0.9.19 までブラウザ版は書かなくても出していた）。
  actions:
    - { id: create, type: create, label: 新規登録 }
  form:
    sections:
      - title: 基本
        fields:
          - { field: code, label: コード, type: text, required: true }
          # **条件を1つも書いていない欄。** これが「読むだけ・必須」にならない
          # ことを下の試験が見る（0.9.19 まで、こういう欄が全部そうなっていた）。
          - { field: note, label: 備考, type: text }
          - { field: name, label: 名前, type: text, required: true }
`;

const searchYaml = `
dsl_version: "1.0"
page:
  id: orders
  type: search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: total, label: 合計, type: number }
    pagination: { pageSize: 10 }
`;

/** 同じ列に合計を2つ書いた帳票（升の中で積んで、何の数かを添える）。 */
const reportYaml = `
dsl_version: "1.0"
page:
  id: sales
  type: report
  title: 売上明細表
  repository: orderRepository
  search:
    filters:
      - { field: status, label: 状態, type: text }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  report:
    totals:
      - { field: amount, aggregate: sum }
      - { field: amount, aggregate: count }
`;

const orders = [
  { orderNo: "SO-1", amount: 1200 },
  { orderNo: "SO-2", amount: 5160 },
];

/** 刷るボタンつきの帳票（刷る口に何が届くか）。 */
const printYaml = `${reportYaml}  actions:
    - { id: printPdf, type: print, label: 印刷, config: { filename: 売上 } }
`;

const lookupYaml = `
dsl_version: "1.0"
page:
  id: employees
  type: search
  title: 社員
  repository: employeeRepository
  key: code
  table:
    columns:
      - { field: code, label: 社員番号 }
      - field: dept
        label: 部署
        optionsSource: { repository: deptRepository, value: code, label: name }
`;

const copyYaml = `
dsl_version: "1.0"
page:
  id: order_entry
  type: form
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - fields:
          - field: productCode
            label: 商品
            type: select
            optionsSource: { repository: productRepository, copy: { unitPrice: price, taxRate: taxRate } }
          - { field: unitPrice, label: 単価, type: number }
          - { field: taxRate, label: 税率, type: number, readOnly: true }
`;

const products = [
  { code: "P-1", name: "りんご", price: 120, taxRate: 0.08 },
  { code: "P-2", name: "皿", price: 900, taxRate: 0.1 },
];

const rows = [
  { code: "C-1", name: "あおぞら商事", status: "active" },
  { code: "C-2", name: "北山フーズ", status: "closed" },
  { code: "C-3", name: "みどり物産", status: "active" },
];

/** **strict は「人が書いたもの」に当てる**（機械が入れた `options` を咎めない）。 */
const pageOf = (source: string): never => {
  const raw = parseYaml(source) as Record<string, unknown>;
  const unknown = findUnknownKeys(raw);
  if (unknown.length > 0) {
    throw new Error(`知らないキー: ${unknown.map((one) => one.key).join(", ")}`);
  }
  return parsePageJson(JSON.stringify(expandVocabularies(raw))) as never;
};

const show = (definition: unknown, repositories: Record<string, FakeRepository>) =>
  render(
    <HatakeScope registries={{ repositories: new RepositoryRegistry(repositories) }}>
      <HatakePage definition={definition as never} />
    </HatakeScope>,
  );

const at = (mark: string): HTMLElement | null => document.querySelector(`[data-hatake="${mark}"]`);

// **毎回片付ける。** testing-library の自動片付けは `globals: true` のときだけ入る。
// 入れないと前の試験の画面が body に残り、`document.querySelector` が**古いほうを
// 拾う**（「保存しても行が増えない」に見えて、実は別の画面を触っていた）。
afterEach(cleanup);

describe("定義から画面が出る（React）", () => {
  it("一覧が1ページ分だけ出る（件数は定義の pageSize）", async () => {
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: new FakeRepository(rows, ["code"]) });
    await waitFor(() => expect(document.querySelectorAll('[data-hatake^="row:"]')).toHaveLength(2));
    expect(at("pagination")?.textContent).toContain("3 件");
  });

  it("帳票: 同じ列の合計は積んで添える・列の書式を通す・見出しは「合計」", async () => {
    show(pageOf(reportYaml), { orderRepository: new FakeRepository(orders, ["orderNo"]) });
    fireEvent.submit(at("search") as HTMLElement);
    await waitFor(() => expect(at("block:grandTotal")).not.toBeNull());
    const grand = at("block:grandTotal") as HTMLElement;
    expect([...grand.querySelectorAll("td")].map((one) => one.textContent)).toEqual([
      "合計",
      "合計 ¥6,360件数 2",
    ]);
    expect([...grand.querySelectorAll("td div")].map((one) => one.textContent)).toEqual([
      "合計 ¥6,360",
      "件数 2",
    ]);
  });

  it("刷るボタン: 帳票の定義・役割・config が刷る口に届く（0.9.25）", async () => {
    const got: PrintRequest[] = [];
    render(
      <HatakeScope
        registries={{
          repositories: new RepositoryRegistry({
            orderRepository: new FakeRepository(orders, ["orderNo"]),
          }),
          printSink: (request) => {
            got.push(request);
          },
        }}
      >
        <HatakePage definition={pageOf(printYaml) as never} />
      </HatakeScope>,
    );
    fireEvent.submit(at("search") as HTMLElement);
    await waitFor(() => expect(at("block:grandTotal")).not.toBeNull());
    fireEvent.click(at("action:printPdf") as HTMLElement);
    await waitFor(() => expect(got).toHaveLength(1));
    expect(got[0].page?.id).toBe("sales");
    expect(got[0].filename).toBe("売上.pdf");
    expect(got[0].config.filename).toBe("売上");
  });

  it("検索欄の既定値: 最初の一覧もその条件で読み、欄にも同じ値（範囲は2つの欄）", async () => {
    const yamlWithDefaults = `
dsl_version: "1.0"
page:
  id: orders
  type: search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: status, label: 状態, type: select, operator: equals, defaultValue: open,
          options: [{ value: open, label: 未出荷 }, { value: shipped, label: 出荷済 }] }
      - { field: total, label: 合計, type: number, operator: between, defaultValue: [100, null] }
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: total, label: 合計, type: number }
`;
    const orders = [
      { orderNo: "SO-1", status: "open", total: 50 },
      { orderNo: "SO-2", status: "open", total: 300 },
      { orderNo: "SO-3", status: "shipped", total: 500 },
    ];
    show(pageOf(yamlWithDefaults) as SearchPageDefinition, { orderRepository: new FakeRepository(orders, ["orderNo"]) });
    await waitFor(() => expect(document.querySelectorAll('[data-hatake^="row:"]')).toHaveLength(1));
    expect(at("row:SO-2")).not.toBeNull();
    expect((at("filter:status") as HTMLSelectElement).value).toBe("open");
    expect((at("filter:total:from") as HTMLInputElement).value).toBe("100");
    expect((at("filter:total:to") as HTMLInputElement).value).toBe("");
  });

  it("選択肢をマスタから引き、選ぶと書いた項目に写す（optionsSource.copy）", async () => {
    show(pageOf(copyYaml), {
      orderRepository: new FakeRepository([], ["orderNo"]),
      productRepository: new FakeRepository(products, ["code"]),
    });
    await waitFor(() => expect(at("field:productCode")?.querySelectorAll("option")).toHaveLength(3));
    fireEvent.change(at("field:productCode") as HTMLSelectElement, { target: { value: "P-2" } });
    await waitFor(() => expect((at("field:unitPrice") as HTMLInputElement).value).toBe("900"));
    expect((at("field:taxRate") as HTMLInputElement).value).toBe("0.1");
  });

  it("列に optionsSource: キーから別マスタの名前を引いて出す", async () => {
    show(pageOf(lookupYaml) as SearchPageDefinition, {
      employeeRepository: new FakeRepository([{ code: "E-1", dept: "D01" }, { code: "E-2", dept: "D99" }], ["code"]),
      deptRepository: new FakeRepository([{ code: "D01", name: "営業部" }], ["code"]),
    });
    await waitFor(() =>
      expect([...document.querySelectorAll('[data-hatake="cell:dept"]')].map((one) => one.textContent)).toEqual([
        "営業部",
        "D99",
      ]),
    );
  });

  it("`pagination.enabled: false` は送る口を出さず、出しきれないとそう言う", async () => {
    const unpaged = yaml.replace("pagination: { pageSize: 2 }", "pagination: { pageSize: 2, enabled: false }");
    show(pageOf(unpaged) as CrudPageDefinition, { customerRepository: new FakeRepository(rows, ["code"]) });
    await waitFor(() => expect(document.querySelectorAll('[data-hatake^="row:"]')).toHaveLength(2));
    expect(at("pagination")?.textContent).toBe("3 件中 2 件を表示しています（絞り込んでください）");
    expect(at("pagination:next")).toBeNull();
  });

  it("**選択肢のラベルで出る**（`active` ではなく「取引中」）", async () => {
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: new FakeRepository(rows, ["code"]) });
    // 0.9.15 で3版そろえた所。Vue 版とまったく同じ答えになる。
    await waitFor(() => expect(screen.getByText("取引中")).toBeTruthy());
    expect(document.body.textContent).not.toContain("active");
  });

  it("検索欄は定義に書いた条件だけ出る", async () => {
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: new FakeRepository(rows, ["code"]) });
    await waitFor(() => expect(at("filter:name")).toBeTruthy());
    expect(at("filter:code")).toBeNull();
  });

  it("新規登録を押すと入力の面に変わり、必須が印される", async () => {
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: new FakeRepository(rows, ["code"]) });
    await waitFor(() => expect(at("action:create")).toBeTruthy());
    fireEvent.click(at("action:create") as HTMLElement);
    await waitFor(() => expect(at("form")).toBeTruthy());
    expect(at("field:code")?.getAttribute("aria-required")).toBe("true");
  });

  it("必須が空のまま保存すると、**弾かれて入力の面に留まる**", async () => {
    const repository = new FakeRepository([], ["code"]);
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: repository });
    await waitFor(() => expect(at("action:create")).toBeTruthy());
    fireEvent.click(at("action:create") as HTMLElement);
    await waitFor(() => expect(at("form")).toBeTruthy());
    fireEvent.submit(at("form") as HTMLElement);
    await waitFor(() => expect(at("error:code")).toBeTruthy());
    expect(at("form")).toBeTruthy();
    expect(repository.rows).toHaveLength(0);
  });

  it("入れて保存すると一覧に戻り、行が増える", async () => {
    const repository = new FakeRepository([], ["code"]);
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: repository });
    await waitFor(() => expect(at("action:create")).toBeTruthy());
    fireEvent.click(at("action:create") as HTMLElement);
    await waitFor(() => expect(at("field:code")).toBeTruthy());
    fireEvent.change(at("field:code") as HTMLElement, { target: { value: "C-9" } });
    await waitFor(() => expect((at("field:code") as HTMLInputElement).value).toBe("C-9"));
    fireEvent.change(at("field:name") as HTMLElement, { target: { value: "新しい取引先" } });
    await waitFor(() => expect((at("field:name") as HTMLInputElement).value).toBe("新しい取引先"));
    fireEvent.submit(at("form") as HTMLElement);
    await waitFor(() => expect(repository.rows).toHaveLength(1));
    expect(at("form")).toBeNull();
  });

  it("数値の列は右に寄る（業務の表の読みやすさ）", async () => {
    show(pageOf(searchYaml) as SearchPageDefinition, {
      orderRepository: new FakeRepository([{ orderNo: "SO-1", total: 1200 }], ["orderNo"]),
    });
    await waitFor(() => expect(at("cell:total")).toBeTruthy());
    expect(at("cell:total")?.className).toContain("hatake-cell-number");
  });

  it("繋がっていない Repository は**落とす**（白い画面にしない）", () => {
    expect(() => show(pageOf(searchYaml) as SearchPageDefinition, {})).toThrow(/登録されていません/);
  });
  it("条件を書いていない欄は**入力できて、必須でもない**", async () => {
    // `evaluateCondition` は「条件が無ければ満たしている」と答える（表示の条件では
    // それが正しい）。そのまま `requiredWhen` / `readOnlyWhen` に渡すと、**何も
    // 書いていない欄が全部「読むだけ・必須」になる**。
    //
    // 0.9.19 の見本で実際にそうなっていて、**画面は普通に出るのにどこにも入力
    // できなかった**。値を入れる試験は readonly でも通ってしまうので、
    // **属性そのものを見る**。
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: new FakeRepository([], ["code"]) });
    await waitFor(() => expect(at("action:create")).toBeTruthy());
    fireEvent.click(at("action:create") as HTMLElement);
    await waitFor(() => expect(at("field:note")).toBeTruthy());

    const note = at("field:note") as HTMLInputElement;
    expect(note.hasAttribute("readonly")).toBe(false);
    expect(note.getAttribute("aria-required")).toBeNull();

    // 書いてあるほうは効いている（見張りが「全部ゆるい」になっていない）。
    expect(at("field:code")?.getAttribute("aria-required")).toBe("true");
  });
  it("**書いていないボタンは出さない**（新規登録・編集・削除）", async () => {
    // 0.9.19 までブラウザ版は、定義に無くても「新規登録」「編集」「削除」を必ず出して
    // いた＝`rowActions: []` の画面でも消せた。Flutter 版は書いたものしか出さない。
    const bare = yaml
      .replace("    rowActions: [edit, delete]\n", "")
      .replace("  actions:\n    - { id: create, type: create, label: 新規登録 }\n", "");
    show(pageOf(bare) as CrudPageDefinition, { customerRepository: new FakeRepository(rows, ["code"]) });
    await waitFor(() => expect(document.querySelectorAll('[data-hatake^="row:"]').length).toBeGreaterThan(0));
    expect(at("action:create")).toBeNull();
    expect(document.querySelector('[data-hatake^="edit:"]')).toBeNull();
    expect(document.querySelector('[data-hatake^="delete:"]')).toBeNull();
  });

  it("削除は**必ず聞いて**から消す（confirm を書いていなくても）", async () => {
    const repository = new FakeRepository(rows.slice(0, 1), ["code"]);
    show(pageOf(yaml) as CrudPageDefinition, { customerRepository: repository });
    await waitFor(() => expect(at("delete:C-1")).toBeTruthy());
    fireEvent.click(at("delete:C-1") as HTMLElement);
    await waitFor(() => expect(at("ask")).toBeTruthy());
    expect(at("ask:ok")?.textContent).toBe("削除");
    expect(repository.rows).toHaveLength(1);
    fireEvent.click(at("ask:ok") as HTMLElement);
    await waitFor(() => expect(repository.rows).toHaveLength(0));
  });
});
