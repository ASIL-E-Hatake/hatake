import { parsePageYaml } from "@hatake-fw/api";
import type { CrudPageDefinition, FormPageDefinition } from "@hatake-fw/api/internal";
import { describe, expect, it } from "vitest";

import { CrudController, CrudMode } from "../src/crudController.js";
import { DetailController } from "../src/detailController.js";
import { FakeRepository } from "../src/fakeRepository.js";
import { FormController } from "../src/formController.js";
import { ListController } from "../src/listController.js";
import { RepositoryRegistry } from "../src/repository.js";

/**
 * 土台の振る舞い。**Renderer を書く前に、ここが Flutter と同じ答えを出すこと**を
 * 確かめる。Vue と React はこの上に乗るだけなので、ここが違うと2つとも違う。
 *
 * 定義は**その場で書いた YAML を本物の解析器に通す**（手で組んだ模型を使わない＝
 * 模型と本物がズレたときに、この試験が嘘をつく）。
 */
const crudYaml = `
dsl_version: "1.0"
page:
  id: customers
  type: crud
  title: 顧客マスタ
  repository: customerRepository
  key: code
  table:
    columns:
      - { field: code, label: コード }
      - { field: name, label: 名前 }
    pagination: { pageSize: 2 }
  form:
    sections:
      - title: 基本
        fields:
          - { field: code, label: コード, type: text, required: true }
          - { field: name, label: 名前, type: text, required: true }
          - { field: rank, label: 区分, type: text, defaultValue: B }
`;

const formYaml = `
dsl_version: "1.0"
page:
  id: customerForm
  type: form
  title: 顧客登録
  repository: customerRepository
  key: code
  form:
    sections:
      - title: 基本
        fields:
          - { field: code, label: コード, type: text, required: true }
          - { field: name, label: 名前, type: text, required: true }
`;

// **strict で読む。** 知らないキーは黙って捨てられるので、この試験の定義自体が
// 「書いたのに効かない」になりうる（実際に `default:` と書いて既定値が入らず、
// 原因を探すことになった。`defaultValue` が正しい）。
const crud = parsePageYaml(crudYaml, { strict: true }) as CrudPageDefinition;
const form = parsePageYaml(formYaml, { strict: true }) as FormPageDefinition;

const someRows = [
  { code: "C-1", name: "あおぞら商事" },
  { code: "C-2", name: "北山フーズ" },
  { code: "C-3", name: "みどり物産" },
];

describe("一覧の読み取り（ListController）", () => {
  it("1ページ分だけ持ち、総件数からページ数を出す", async () => {
    const list = new ListController({ repository: new FakeRepository(someRows, ["code"]), pageSize: 2 });
    await list.init();
    expect(list.items.map((one) => one.code)).toEqual(["C-1", "C-2"]);
    expect(list.totalCount).toBe(3);
    expect(list.pageCount).toBe(2);
  });

  it("条件を入れ替えたら1ページ目から読み直す", async () => {
    const list = new ListController({ repository: new FakeRepository(someRows, ["code"]), pageSize: 2 });
    await list.init();
    await list.setPage(1);
    expect(list.page).toBe(1);
    await list.search({ name: "みどり" });
    expect(list.page).toBe(0);
    expect(list.items.map((one) => one.code)).toEqual(["C-3"]);
  });

  it("範囲の外のページは何もしない（読み直しも起こさない）", async () => {
    const list = new ListController({ repository: new FakeRepository(someRows, ["code"]), pageSize: 2 });
    await list.init();
    await list.setPage(9);
    expect(list.page).toBe(0);
  });

  it("最後の1件を消したら1ページ戻る（空のページに留まらない）", async () => {
    const repository = new FakeRepository(someRows, ["code"]);
    const list = new ListController({ repository, pageSize: 2 });
    await list.init();
    await list.setPage(1);
    expect(list.items.map((one) => one.code)).toEqual(["C-3"]);
    await list.deleteRecord("C-3");
    expect(list.page).toBe(0);
    expect(list.items.map((one) => one.code)).toEqual(["C-1", "C-2"]);
  });

  it("Repository が消すのを断ったら、読み込みの失敗と同じように出す", async () => {
    const repository = new FakeRepository(someRows, ["code"]);
    const list = new ListController({ repository, pageSize: 2 });
    await list.init();
    // **投げっぱなしにしない。** 押した人にも呼んだ側にも「消えなかった」が要る。
    await list.deleteRecord("居ない");
    expect(list.error).toBeInstanceOf(Error);
    expect(repository.rows).toHaveLength(3);
  });

  it("出力は画面の1ページではなく、条件そのままで大きく引く", async () => {
    const list = new ListController({ repository: new FakeRepository(someRows, ["code"]), pageSize: 2 });
    await list.init();
    expect(await list.fetchForExport(100)).toHaveLength(3);
  });
});

describe("一覧と入力の1枚（CrudController）", () => {
  it("作りはじめると既定値が入る", () => {
    const crudController = new CrudController({ definition: crud, repository: new FakeRepository([], ["code"]) });
    crudController.startCreate();
    expect(crudController.mode).toBe(CrudMode.create);
    expect(crudController.draft).toEqual({ rank: "B" });
    expect(crudController.formMode).toBe("create");
  });

  it("直しはじめると写しを持つ（やめれば元に戻る）", async () => {
    const repository = new FakeRepository(someRows, ["code"]);
    const crudController = new CrudController({ definition: crud, repository });
    await crudController.init();
    crudController.startEdit({ code: "C-1", name: "あおぞら商事" });
    expect(crudController.formMode).toBe("edit");
    crudController.cancelForm();
    expect(crudController.mode).toBe(CrudMode.list);
    expect(repository.rows[0].name).toBe("あおぞら商事");
  });

  it("必須が空なら弾いて、入力の面に留まる", async () => {
    const repository = new FakeRepository([], ["code"]);
    const crudController = new CrudController({ definition: crud, repository });
    await crudController.init();
    crudController.startCreate();
    await crudController.submitForm({ code: "", name: "" });
    expect(crudController.validation.valid).toBe(false);
    expect(crudController.mode).toBe(CrudMode.create);
    expect(repository.rows).toHaveLength(0);
  });

  it("通れば保存して一覧に戻り、読み直す", async () => {
    const repository = new FakeRepository([], ["code"]);
    const crudController = new CrudController({ definition: crud, repository });
    await crudController.init();
    crudController.startCreate();
    await crudController.submitForm({ code: "C-9", name: "新しい取引先" });
    expect(crudController.validation.valid).toBe(true);
    expect(crudController.mode).toBe(CrudMode.list);
    expect(crudController.items.map((one) => one.code)).toEqual(["C-9"]);
  });

  it("直したものは更新になる（2件目を作らない）", async () => {
    const repository = new FakeRepository(someRows, ["code"]);
    const crudController = new CrudController({ definition: crud, repository });
    await crudController.init();
    crudController.startEdit({ code: "C-1", name: "あおぞら商事" });
    await crudController.submitForm({ code: "C-1", name: "あおぞら商事（改）" });
    expect(repository.rows).toHaveLength(3);
    expect(repository.rows[0].name).toBe("あおぞら商事（改）");
  });
});

describe("入力だけの画面（FormController）", () => {
  it("鍵が無ければ作る側（既定値だけ持つ）", async () => {
    const controller = new FormController({ definition: form, repository: new FakeRepository([], ["code"]) });
    await controller.init();
    expect(controller.isEdit).toBe(false);
    expect(controller.formMode).toBe("create");
  });

  it("鍵が在れば読んで直す側", async () => {
    const controller = new FormController({
      definition: form,
      repository: new FakeRepository(someRows, ["code"]),
      recordKey: "C-2",
    });
    await controller.init();
    expect(controller.isEdit).toBe(true);
    expect(controller.draft.name).toBe("北山フーズ");
  });

  it("**2回押しても2件目を作らない**（できた1件の鍵で更新に変わる）", async () => {
    const repository = new FakeRepository([], ["code"]);
    const controller = new FormController({ definition: form, repository });
    await controller.init();
    await controller.submit({ code: "C-9", name: "一度目" });
    await controller.submit({ code: "C-9", name: "二度目" });
    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0].name).toBe("二度目");
  });

  it("弾かれたら保存しない", async () => {
    const repository = new FakeRepository([], ["code"]);
    const controller = new FormController({ definition: form, repository });
    await controller.init();
    const saved = await controller.submit({ code: "", name: "" });
    expect(saved).toBeNull();
    expect(controller.validation.valid).toBe(false);
    expect(repository.rows).toHaveLength(0);
  });
});

describe("詳細（DetailController）", () => {
  it("鍵で1件読む", async () => {
    const controller = new DetailController({
      repository: new FakeRepository(someRows, ["code"]),
      recordKey: "C-3",
    });
    await controller.init();
    expect(controller.record?.name).toBe("みどり物産");
  });

  it("鍵が無ければ**取りに行かない**（足りない鍵で別の1件を開かない）", async () => {
    const repository = new FakeRepository(someRows, ["code"]);
    const controller = new DetailController({ repository, recordKey: undefined });
    await controller.init();
    expect(controller.record).toBeNull();
  });
});

describe("Repository の登録", () => {
  it("登録していない名前は**落とす**（画面は出たのに一覧が空、を作らない）", () => {
    const registry = new RepositoryRegistry({ customerRepository: new FakeRepository() });
    expect(registry.has("customerRepository")).toBe(true);
    expect(() => registry.resolve("居ないRepository")).toThrow(/登録されていません/);
  });

  it("登録した名前は全部がアプリの登録（申告に使う）", () => {
    const registry = new RepositoryRegistry({
      orderRepository: new FakeRepository(),
      customerRepository: new FakeRepository(),
    });
    expect(registry.customKeys).toEqual(["customerRepository", "orderRepository"]);
  });
});
