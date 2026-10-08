import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hatakeTools } from "@hatake-fw/api/tools";

import { rangeOf } from "../src/diagnostics";
import { optionsText, outlineOf, rulesText } from "../src/outline";
import { asTab, tabFor, viewTables } from "../src/viewModel";

// 左のツリーの元（outline）と、タブ付きの画面の中身（viewModel）。
const SPEC = join(__dirname, "..", "..", "spec");
const tools = hatakeTools({ specDir: SPEC, readFile: (path) => readFileSync(path, "utf8") });
const call = (name: string, args: Record<string, unknown>) => tools.find((one) => one.name === name)!.run(args);
const example = (file: string) => readFileSync(join(SPEC, "examples", file), "utf8");

describe("ツリーの元（定義を業務の言葉で並べる）", () => {
  it("1画面: 検索条件・一覧の列・入力欄・操作を、書いたラベルと順で並べる", () => {
    const outline = outlineOf(example("customer_master.yaml"));
    expect(outline.kind).toBe("page");
    const page = outline.pages[0];
    expect(page.title).toBe("顧客マスタ");
    expect(page.groups.map((one) => one.title)).toEqual(["検索条件", "一覧の列", "入力欄", "操作"]);
    expect(page.groups[0].items[0]).toMatchObject({ label: "顧客名", key: "name" });
  });

  it("app: メニュー（グループの入れ子）と画面を並べる", () => {
    const outline = outlineOf(example("roles_app.yaml"));
    expect(outline.kind).toBe("app");
    expect(outline.title).toBe("人事管理");
    const group = outline.menu.find((one) => one.children.length > 0)!;
    expect(group.label).toBe("給与");
    expect(group.roles).toEqual(["hr"]);
    expect(outline.pages.length).toBeGreaterThan(1);
  });

  it("どの行も、定義のその場所を指している（「定義を開く」で飛べる）", () => {
    for (const file of ["customer_master.yaml", "sales_app.yaml", "roles_app.yaml", "order_entry.yaml", "customer_wizard.yaml"]) {
      const source = example(file);
      for (const page of outlineOf(source).pages) {
        for (const item of page.groups.flatMap((one) => one.items)) {
          const [from, to] = rangeOf(source, item.path);
          expect(to, `${file} ${item.path}`).toBeGreaterThan(from);
          // 行の場所に、その行の鍵（項目名か id）が書いてある。
          if (item.key !== "") expect(source.slice(from, to + 200), `${file} ${item.path}`).toContain(item.key);
        }
      }
    }
  });

  it("決めごとと選択肢を、人が読む字に", () => {
    expect(rulesText({ required: true, validators: [{ type: "maxLength", value: 10 }], readOnlyWhen: { mode: "edit" } })).toEqual([
      "必須",
      "10文字まで",
      "条件で読むだけ",
    ]);
    expect(optionsText({ optionsOf: "kind" }, { kind: [{ value: "a", label: "法人" }, { value: "b", label: "個人" }] })).toBe("法人／個人");
  });
});

describe("タブ付きの画面の中身", () => {
  it("項目・操作・権限・確認の表を作る（確認は AI と同じ紙）", () => {
    const source = example("roles_app.yaml");
    const outline = outlineOf(source);
    const page = outline.pages.find((one) => one.groups.some((g) => g.kind === "column"))!;
    const sheet = JSON.parse(call("hatake_check", { source, page: page.id, explain: false }));
    const tables = viewTables(outline, page, ["executive", "hr", "manager"], sheet, "読み返しの文");
    expect(tables.columns.length).toBeGreaterThan(0);
    expect(tables.roles.roles).toEqual(["executive", "hr", "manager"]);
    // 役割を書いた列があれば、表に行が出る（給与の列は hr だけ）。
    expect(tables.roles.rows.some((row) => row.cells.includes(false))).toBe(true);
    expect(tables.check.readback).toBe("読み返しの文");
    expect(tables.check.questions.length).toBeGreaterThan(0);
    // 紙の字の太字の印（**…**）は素の字で出すので外す（画像を撮って見つけた）。
    const shown = [...tables.check.questions, ...tables.check.preferences, ...tables.check.facts].flatMap((one) => [one.text, one.more]);
    expect(shown.filter((one) => one.includes("**"))).toEqual([]);
  });

  it("削除は確認を書いていなくても「聞く」と言う（枠組みの決めごと）", () => {
    const source = "page:\n  type: crud\n  id: x\n  title: X\n  repository: r\n  key: id\n  actions:\n    - { id: del, type: delete, label: 消す }\n";
    const outline = outlineOf(source);
    const tables = viewTables(outline, outline.pages[0], [], {}, "");
    expect(tables.actions[0]).toMatchObject({ label: "消す", what: "削除", confirm: "聞く（削除は必ず）" });
  });

  it("選んだ所 → 開くタブ（既定は設定。知らない値は画面）", () => {
    expect(tabFor("field", "screen")).toBe("fields");
    expect(tabFor("action", "screen")).toBe("actions");
    expect(tabFor("question", "screen")).toBe("check");
    expect(tabFor(undefined, "roles")).toBe("roles");
    expect(asTab("check")).toBe("check");
    expect(asTab("nonsense")).toBe("screen");
  });
});
