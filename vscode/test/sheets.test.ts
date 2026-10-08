import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hatakeTools } from "@hatake-fw/api/tools";

import { outlineOf } from "../src/outline";
import { checkArgs, PROJECT_FILE, projectNear, sheetsOf } from "../src/sheets";
import { viewTables } from "../src/viewModel";

// AI と同じ紙を、前書きつきで作る（0.9.31 は前書きを渡しておらず、見本の受注入力で
// 答え済みの問いが 1 件のはずが 8 件並んだ）。
const SPEC = join(__dirname, "..", "..", "spec");
const tools = hatakeTools({ specDir: SPEC, readFile: (path) => readFileSync(path, "utf8") });
const call = (name: string, args: Record<string, unknown>) => tools.find((one) => one.name === name)!.run(args);
const source = readFileSync(join(SPEC, "examples", "customer_master.yaml"), "utf8");
const project = readFileSync(join(SPEC, "projects", "wholesale.project.yaml"), "utf8");
const questionIds = (sheet: { questions?: { list?: { kind: { id: string } }[] } } | undefined) =>
  (sheet?.questions?.list ?? []).map((one) => one.kind.id);

describe("前書きを探す（CLI の hatake check と同じ規則＝定義の隣）", () => {
  const root = mkdtempSync(join(tmpdir(), "hatake-sheets-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("隣にあれば読む", () => {
    mkdirSync(join(root, "a"));
    writeFileSync(join(root, "a", "app.yaml"), source);
    writeFileSync(join(root, "a", PROJECT_FILE), project);
    expect(projectNear(join(root, "a", "app.yaml"))?.source).toBe(project);
  });

  it("隣に無ければ読まない（親のフォルダは探さない＝CLI と答えを変えない）", () => {
    mkdirSync(join(root, "a", "b"));
    writeFileSync(join(root, "a", "b", "page.yaml"), source);
    expect(projectNear(join(root, "a", "b", "page.yaml"))).toBeUndefined();
  });
});

describe("紙（hatake_check）に前書きを渡す", () => {
  const outline = outlineOf(source);
  const page = outline.pages[0];

  it("前書きで答えた問いは出ない（渡さないと出る）", () => {
    const without = sheetsOf(call, outline, source).get(page.id);
    const withProject = sheetsOf(call, outline, source, project).get(page.id);
    expect(questionIds(without)).toContain("concurrency");
    expect(questionIds(withProject)).not.toContain("concurrency");
    expect(withProject?.questions?.answered).toContain("concurrency");
  });

  it("問題の一覧（extension.ts）とツリー（project.ts）は同じ引数で呼ぶ", () => {
    expect(checkArgs(source, { project })).toEqual({ source, project });
    expect(checkArgs(source)).toEqual({ source });
    expect(JSON.parse(call("hatake_check", checkArgs(source, { project, explain: false })))).toEqual(
      sheetsOf(call, outline, source, project).get(page.id),
    );
  });

  it("確認のタブは、どの前書きで見た紙かと答え済みの数を持つ", () => {
    const sheet = sheetsOf(call, outline, source, project).get(page.id) ?? {};
    const shown = viewTables(outline, page, [], sheet, "", "definitions/hatake.project.yaml").check.project;
    expect(shown.file).toBe("definitions/hatake.project.yaml");
    expect(shown.answered).toBe(sheet.questions?.answered?.length);
    expect(shown.answered).toBeGreaterThan(0);
    expect(viewTables(outline, page, [], sheet, "").check.project).toEqual({ file: null, answered: 0 });
  });
});
