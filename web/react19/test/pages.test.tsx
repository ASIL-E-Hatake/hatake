import { parsePageJson } from "@hatake-fw/api";
import type { CrudPageDefinition, SearchPageDefinition } from "@hatake-fw/api/internal";
import { expandVocabularies, findUnknownKeys } from "@hatake-fw/api/internal";
import { FakeRepository, RepositoryRegistry } from "@hatake-fw/runtime";
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
