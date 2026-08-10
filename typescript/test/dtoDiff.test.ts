import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveDto, diffDto, parsePageYaml } from "../src/index.js";

/** 定義2つを比べる。 */
function diff(before: string, after: string) {
  return diffDto(
    deriveDto(parsePageYaml(before, { strict: true })),
    deriveDto(parsePageYaml(after, { strict: true })),
  );
}

/** 顧客マスタ。fields / columns を差し替えて使う。 */
const page = ({
  id = "customer_master",
  columns = "      - { field: code, label: コード }\n      - { field: name, label: 顧客名 }",
  fields = "          - { field: code, label: コード, required: true }\n" +
    "          - { field: name, label: 顧客名 }",
  filters = "      - { field: name, label: 顧客名 }",
}: {
  id?: string;
  columns?: string;
  fields?: string;
  filters?: string;
} = {}) => `
page:
  type: crud
  id: ${id}
  title: 顧客マスタ
  repository: customerRepository
  search:
    filters:
${filters}
  table:
    columns:
${columns}
  form:
    sections:
      - fields:
${fields}
`;

const kinds = (result: { changes: { kind: string }[] }) =>
  result.changes.map((c) => c.kind);

describe("変えていなければ何も出ない", () => {
  it("同じ定義なら差分ゼロ・互換", () => {
    const result = diff(page(), page());
    expect(result.changes).toEqual([]);
    expect(result.compatible).toBe(true);
    expect(result.page).toBe("customer_master");
  });
});

describe("受け取る形（クライアント → サーバ）", () => {
  it("必須項目を足すのは壊す", () => {
    const result = diff(
      page(),
      page({
        fields:
          "          - { field: code, label: コード, required: true }\n" +
          "          - { field: name, label: 顧客名 }\n" +
          "          - { field: tel, label: 電話, required: true }",
      }),
    );
    const added = result.changes.filter((c) => c.member === "tel");
    expect(added.some((c) => c.kind === "member-added" && c.breaking)).toBe(true);
    expect(result.compatible).toBe(false);
    expect(added[0].message).toContain("弾かれます");
  });

  it("任意項目を足すのは互換", () => {
    const result = diff(
      page(),
      page({
        fields:
          "          - { field: code, label: コード, required: true }\n" +
          "          - { field: name, label: 顧客名 }\n" +
          "          - { field: memo, label: 備考 }",
      }),
    );
    expect(result.compatible).toBe(true);
    expect(kinds(result)).toContain("member-added");
  });

  it("任意を必須に変えるのは壊す", () => {
    const result = diff(
      page(),
      page({
        fields:
          "          - { field: code, label: コード, required: true }\n" +
          "          - { field: name, label: 顧客名, required: true }",
      }),
    );
    expect(kinds(result)).toContain("required-added");
    expect(result.compatible).toBe(false);
  });

  it("必須を任意にするのは互換", () => {
    const result = diff(
      page({
        fields:
          "          - { field: code, label: コード, required: true }\n" +
          "          - { field: name, label: 顧客名, required: true }",
      }),
      page(),
    );
    expect(kinds(result)).toContain("required-removed");
    expect(result.compatible).toBe(true);
  });

  it("型を変えるのは壊す", () => {
    const result = diff(
      page(),
      page({
        fields:
          "          - { field: code, label: コード, required: true, type: number }\n" +
          "          - { field: name, label: 顧客名 }",
      }),
    );
    const changed = result.changes.find((c) => c.kind === "type-changed");
    expect(changed).toMatchObject({ from: "string", to: "number", breaking: true });
  });

  it("制約を厳しくするのは壊す / 緩めるのは互換", () => {
    const withMax = (value: number) =>
      page({
        fields:
          `          - { field: code, label: コード, required: true, validators: [{ type: maxLength, value: ${value} }] }\n` +
          "          - { field: name, label: 顧客名 }",
      });
    const tighter = diff(withMax(20), withMax(10));
    expect(tighter.compatible).toBe(false);
    expect(tighter.changes[0]).toMatchObject({
      kind: "constraint-changed",
      from: "maxLength=20",
      to: "maxLength=10",
    });

    const looser = diff(withMax(10), withMax(20));
    expect(looser.compatible).toBe(true);

    // 無かった制約が増えるのも、今まで通っていた値が弾かれるので壊す。
    expect(diff(page(), withMax(10)).compatible).toBe(false);
    // 消えるのは緩む方向なので互換。
    expect(diff(withMax(10), page()).compatible).toBe(true);
  });
});

describe("返す形（サーバ → クライアント）", () => {
  it("列を消すのは壊す（読んでいる側が壊れる）", () => {
    const result = diff(
      page(),
      page({ columns: "      - { field: code, label: コード }" }),
    );
    const removed = result.changes.find(
      (c) => c.kind === "member-removed" && c.member === "name",
    );
    expect(removed?.breaking).toBe(true);
    expect(removed?.message).toContain("返らなくなりました");
  });

  it("列を足すのは互換", () => {
    const result = diff(
      page(),
      page({
        columns:
          "      - { field: code, label: コード }\n" +
          "      - { field: name, label: 顧客名 }\n" +
          "      - { field: status, label: 状態 }",
      }),
    );
    expect(result.compatible).toBe(true);
  });
});

describe("検索パラメータ", () => {
  it("消すと絞り込みが黙って効かなくなるので壊す扱い", () => {
    const result = diff(
      page(),
      page({ filters: "      - { field: code, label: コード }" }),
    );
    const removed = result.changes.find(
      (c) => c.shape.includes("Query") && c.kind === "member-removed",
    );
    expect(removed?.breaking).toBe(true);
    expect(removed?.message).toContain("黙って効かなくなります");
  });
});

describe("形そのものの増減", () => {
  it("読み取り専用にすると受け取る形が消える＝壊す", () => {
    const search = `
page:
  type: search
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    columns:
      - { field: code, label: コード }
      - { field: name, label: 顧客名 }
`;
    const result = diff(page(), search);
    const removed = result.changes.find((c) => c.kind === "shape-removed");
    expect(removed?.breaking).toBe(true);
    expect(removed?.message).toContain("受け取る形");
    expect(result.compatible).toBe(false);
  });

  it("ページ id を変えると id で引いている所が全部ズレる", () => {
    const result = diff(page(), page({ id: "customers" }));
    expect(kinds(result)).toContain("page-renamed");
    expect(result.compatible).toBe(false);
    // 形の名前も id から作るので、増減としても出る。
    expect(kinds(result)).toContain("shape-removed");
  });
});

describe("同梱の例", () => {
  it("例を自分自身と比べれば必ず互換（＝判定が壊れていない）", () => {
    for (const file of ["customer_master", "product_search", "order_entry"]) {
      const yaml = readFileSync(`../spec/examples/${file}.yaml`, "utf8");
      const result = diff(yaml, yaml);
      expect(result, file).toMatchObject({ compatible: true, changes: [] });
    }
  });
});
