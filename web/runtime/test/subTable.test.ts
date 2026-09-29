import { parsePageYaml } from "@hatake-fw/api";
import { formFields, type FormPageDefinition } from "@hatake-fw/api/internal";
import { describe, expect, it } from "vitest";

import { FakeRepository } from "../src/fakeRepository.js";
import { SubTableController } from "../src/subTableController.js";

/**
 * Repository に載っている明細（`subTable`）。**親が先に在ること**が要点で、
 * そこを黙って空の表にすると、入れられない理由が画面から読めない。
 *
 * 行の項目は `fields:` と書く（解析後の名前は `rowFields`）。ここを `rowFields:` と
 * 書いて strict に落とされた —— **また道具が先に見つけた**。
 */
const yaml = `
dsl_version: "1.0"
page:
  id: order_entry
  type: form
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - title: 明細
        fields:
          - field: lines
            label: 明細
            type: subTable
            source:
              repository: lineRepository
              parentKey: orderNo
              key: lineNo
              pageSize: 2
            fields:
              - { field: lineNo, label: 行番号, type: number }
              - { field: productCode, label: 商品, type: text, required: true }
              - { field: quantity, label: 数量, type: number }
`;

const page = parsePageYaml(yaml, { strict: true }) as FormPageDefinition;
const lines = formFields(page.form).find((one) => one.field === "lines")!;

const childRows = () => [
  { lineNo: 1, orderNo: "SO-1", productCode: "P001", quantity: 2 },
  { lineNo: 2, orderNo: "SO-1", productCode: "P002", quantity: 1 },
  { lineNo: 3, orderNo: "SO-1", productCode: "P003", quantity: 5 },
  { lineNo: 9, orderNo: "SO-9", productCode: "P009", quantity: 1 },
];

const make = (parentKey: unknown, rows = childRows()) => {
  const repository = new FakeRepository(rows, ["lineNo"]);
  return { repository, controller: new SubTableController({ field: lines, repository, parentKey }) };
};

describe("親が居ないとき", () => {
  it("**直せない**と言う（黙って空の表を出さない）", async () => {
    const { controller } = make(undefined);
    await controller.load();
    expect(controller.canEdit).toBe(false);
    expect(controller.rows).toEqual([]);
  });
});

describe("親の行だけを並べる", () => {
  it("親の鍵で絞り、ページの件数は定義から来る", async () => {
    const { controller } = make("SO-1");
    await controller.load();
    expect(controller.canEdit).toBe(true);
    expect(controller.totalCount).toBe(3);
    expect(controller.rows.map((one) => one.lineNo)).toEqual([1, 2]);
    expect(controller.pageCount).toBe(2);
  });

  it("ページを移る", async () => {
    const { controller } = make("SO-1");
    await controller.load();
    await controller.setPage(1);
    expect(controller.rows.map((one) => one.lineNo)).toEqual([3]);
  });
});

describe("行を保存する", () => {
  it("行の必須が空なら弾いて、**保存しない**", async () => {
    const { repository, controller } = make("SO-1");
    await controller.load();
    const result = await controller.saveRow({ lineNo: 4, productCode: "" });
    expect(result.valid).toBe(false);
    expect(repository.rows).toHaveLength(4);
  });

  it("鍵の無い行は作る。**親の鍵が自動で入る**", async () => {
    const { repository, controller } = make("SO-1");
    await controller.load();
    await controller.saveRow({ productCode: "P100", quantity: 1 });
    const made = repository.rows.find((one) => one.productCode === "P100");
    expect(made?.orderNo).toBe("SO-1");
  });

  it("鍵の在る行は直す（2件目を作らない）", async () => {
    const { repository, controller } = make("SO-1");
    await controller.load();
    await controller.saveRow({ lineNo: 1, productCode: "P001", quantity: 99 });
    expect(repository.rows).toHaveLength(4);
    expect(repository.rows.find((one) => one.lineNo === 1)?.quantity).toBe(99);
  });

  it("**保存が落ちたら、その失敗が消えない**（読み直しで上書きしない）", async () => {
    const { repository, controller } = make("SO-1");
    await controller.load();
    repository.update = async () => {
      throw new Error("ほかの人が先に直しています");
    };
    await controller.saveRow({ lineNo: 1, productCode: "P001", quantity: 1 });
    expect(controller.error).toBeInstanceOf(Error);
  });
});

describe("行を消す", () => {
  it("鍵の無い行は**取りに行かない**", async () => {
    const { repository, controller } = make("SO-1");
    await controller.load();
    await controller.deleteRow({ productCode: "まだ保存していない" });
    expect(repository.rows).toHaveLength(4);
  });

  it("消したら読み直す", async () => {
    const { repository, controller } = make("SO-1");
    await controller.load();
    await controller.deleteRow({ lineNo: 1 });
    expect(repository.rows).toHaveLength(3);
    expect(controller.totalCount).toBe(2);
  });
});
