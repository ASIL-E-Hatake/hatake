import { parsePageJson } from "@hatake-fw/api";
import type { CrudPageDefinition, SearchPageDefinition } from "@hatake-fw/api/internal";
import { expandVocabularies, findUnknownKeys } from "@hatake-fw/api/internal";
import { FakeRepository, RepositoryRegistry } from "@hatake-fw/runtime";
import { mount } from "@vue/test-utils";
import { parse as parseYaml } from "yaml";
import { h } from "vue";
import { describe, expect, it } from "vitest";

import { HatakePage } from "../src/page.js";
import { HatakeScope } from "../src/scope.js";

/**
 * **定義から本当に画面が出るか。**
 *
 * 見ているのは「業務の判断が土台に在ること」で、見た目そのものではない。
 * 要素は `data-hatake` の印で探す（契約 — Renderer の中を読み解かせない）。
 *
 * 語彙は app に書く（0.9.5）。列には `optionsOf: <名前>` だけを書いて、解析の前に
 * 実体へ展開する＝**同じ表を2か所に持たない**。
 *
 * この定義を書くのに2回間違えて、2回とも**道具が先に見つけた**ので残しておく:
 *
 *   ・列に `options:` を直接書いた
 *     → strict が「知らないキー "options"（optionsOf の間違い？）」
 *   ・`vocabularies` を入れ子の地図で書いた（正しくは**並び**）
 *     → `vocabularies` は「黙って捨てます＝書いたことは一度も効きません」、
 *       `optionsOf` は「選択肢は**空のまま**出ます（開くまで気づけません）」
 *
 * どちらも画面は出てしまう形なので、道具が言わなければ気づけなかった。
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

/**
 * YAML を**語彙を展開してから**1枚の画面定義にする。
 *
 * `parsePageJson` は1枚ぶんしか見ないので、`app.vocabularies` はここで展開する
 * （枠組みの中では `parseAppMap` が同じ順番でやっている）。
 */
const pageOf = (source: string): unknown => {
  const raw = parseYaml(source) as Record<string, unknown>;

  // **strict は「人が書いたもの」に当てる。** 展開したあとに当てると、機械が入れた
  // `options` を「知らないキー」と言って落ちる（枠組みの中の `parseAppMap` も、
  // 同じ理由で生の文書に当てている）。ここを間違えて3回目の足止めを食った。
  const unknown = findUnknownKeys(raw);
  if (unknown.length > 0) {
    throw new Error(`知らないキー: ${unknown.map((one) => one.key).join(", ")}`);
  }

  return parsePageJson(JSON.stringify(expandVocabularies(raw)));
};

const mountPage = (definition: unknown, repositories: Record<string, FakeRepository>) =>
  mount(HatakeScope, {
    props: { registries: { repositories: new RepositoryRegistry(repositories) } },
    slots: { default: () => h(HatakePage, { definition: definition as never }) },
  });

const settle = async (wrapper: { vm: { $nextTick: () => Promise<void> } }): Promise<void> => {
  await new Promise((done) => setTimeout(done, 0));
  await wrapper.vm.$nextTick();
};

describe("定義から画面が出る", () => {
  it("一覧が1ページ分だけ出る（件数は定義の pageSize）", async () => {
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: new FakeRepository(rows, ["code"]),
    });
    await settle(wrapper);
    expect(wrapper.findAll('[data-hatake^="row:"]')).toHaveLength(2);
    expect(wrapper.find('[data-hatake="pagination"]').text()).toContain("3 件");
  });

  it("**選択肢のラベルで出る**（`closed` ではなく「取引終了」）", async () => {
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: new FakeRepository(rows, ["code"]),
    });
    await settle(wrapper);
    // 一覧と詳細で字が食い違う事故（0.9.12 で見本が踏んだ）を、ここで止める。
    expect(wrapper.text()).toContain("取引中");
    expect(wrapper.text()).not.toContain("active");
  });

  it("検索欄は定義に書いた条件だけ出る", async () => {
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: new FakeRepository(rows, ["code"]),
    });
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="filter:name"]').exists()).toBe(true);
    expect(wrapper.find('[data-hatake="filter:code"]').exists()).toBe(false);
  });

  it("新規登録を押すと入力の面に変わり、必須が印される", async () => {
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: new FakeRepository(rows, ["code"]),
    });
    await settle(wrapper);
    await wrapper.find('[data-hatake="action:create"]').trigger("click");
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="form"]').exists()).toBe(true);
    expect(wrapper.find('[data-hatake="field:code"]').attributes("aria-required")).toBe("true");
  });

  it("必須が空のまま保存すると、**弾かれて入力の面に留まる**", async () => {
    const repository = new FakeRepository([], ["code"]);
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: repository,
    });
    await settle(wrapper);
    await wrapper.find('[data-hatake="action:create"]').trigger("click");
    await settle(wrapper);
    await wrapper.find('[data-hatake="form"]').trigger("submit");
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="form"]').exists()).toBe(true);
    expect(wrapper.find('[data-hatake="error:code"]').exists()).toBe(true);
    expect(repository.rows).toHaveLength(0);
  });

  it("入れて保存すると一覧に戻り、行が増える", async () => {
    const repository = new FakeRepository([], ["code"]);
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: repository,
    });
    await settle(wrapper);
    await wrapper.find('[data-hatake="action:create"]').trigger("click");
    await settle(wrapper);
    await wrapper.find('[data-hatake="field:code"]').setValue("C-9");
    await wrapper.find('[data-hatake="field:name"]').setValue("新しい取引先");
    await wrapper.find('[data-hatake="form"]').trigger("submit");
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="form"]').exists()).toBe(false);
    expect(repository.rows).toHaveLength(1);
  });

  it("数値の列は右に寄る（業務の表の読みやすさ）", async () => {
    const wrapper = mountPage(pageOf(searchYaml) as SearchPageDefinition, {
      orderRepository: new FakeRepository([{ orderNo: "SO-1", total: 1200 }], ["orderNo"]),
    });
    await settle(wrapper);
    expect(wrapper.find('[data-hatake="cell:total"]').classes()).toContain("hatake-cell-number");
  });

  it("繋がっていない Repository は**落とす**（白い画面にしない）", () => {
    expect(() => mountPage(pageOf(searchYaml) as SearchPageDefinition, {})).toThrow(
      /登録されていません/,
    );
  });
  it("条件を書いていない欄は**入力できて、必須でもない**", async () => {
    // `evaluateCondition` は「条件が無ければ満たしている」と答える（表示の条件では
    // それが正しい）。そのまま `requiredWhen` / `readOnlyWhen` に渡すと、**何も
    // 書いていない欄が全部「読むだけ・必須」になる**。
    //
    // 0.9.19 の見本で実際にそうなっていて、**画面は普通に出るのにどこにも入力
    // できなかった**。`setValue` は readonly でも値が入るので、試験も素通りした
    // ＝**属性そのものを見ないと捕まらない**。
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, {
      customerRepository: new FakeRepository([], ["code"]),
    });
    await settle(wrapper);
    await wrapper.find('[data-hatake="action:create"]').trigger("click");
    await settle(wrapper);

    const note = wrapper.find('[data-hatake="field:note"]');
    expect(note.attributes("readonly")).toBeUndefined();
    expect(note.attributes("aria-required")).toBeUndefined();

    // 書いてあるほうは効いている（見張りが「全部ゆるい」になっていない）。
    expect(wrapper.find('[data-hatake="field:code"]').attributes("aria-required")).toBe("true");
  });
  it("**書いていないボタンは出さない**（新規登録・編集・削除）", async () => {
    // 0.9.19 までブラウザ版は、定義に無くても「新規登録」「編集」「削除」を必ず出して
    // いた＝`rowActions: []` の画面でも消せた。Flutter 版は書いたものしか出さない。
    const bare = yaml
      .replace("    rowActions: [edit, delete]\n", "")
      .replace("  actions:\n    - { id: create, type: create, label: 新規登録 }\n", "");
    const wrapper = mountPage(pageOf(bare) as CrudPageDefinition, {
      customerRepository: new FakeRepository(rows, ["code"]),
    });
    await settle(wrapper);
    expect(wrapper.findAll('[data-hatake^="row:"]').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-hatake="action:create"]').exists()).toBe(false);
    expect(wrapper.find('[data-hatake^="edit:"]').exists()).toBe(false);
    expect(wrapper.find('[data-hatake^="delete:"]').exists()).toBe(false);
  });

  it("削除は**必ず聞いて**から消す（confirm を書いていなくても）", async () => {
    const repository = new FakeRepository(rows.slice(0, 1), ["code"]);
    const wrapper = mountPage(pageOf(yaml) as CrudPageDefinition, { customerRepository: repository });
    await settle(wrapper);
    await wrapper.find('[data-hatake="delete:C-1"]').trigger("click");
    await settle(wrapper);
    // 聞いている間は消えていない。
    expect(wrapper.find('[data-hatake="ask"]').exists()).toBe(true);
    expect(wrapper.find('[data-hatake="ask:ok"]').text()).toBe("削除");
    expect(repository.rows).toHaveLength(1);
    await wrapper.find('[data-hatake="ask:ok"]').trigger("click");
    await settle(wrapper);
    await settle(wrapper);
    expect(repository.rows).toHaveLength(0);
  });
});
