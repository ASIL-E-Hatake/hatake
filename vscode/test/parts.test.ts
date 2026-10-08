import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { hatakeTools } from "@hatake-fw/api/tools";

import { pathSegments, placeProblems, rangeOf } from "../src/diagnostics";
import { hoverMarkdown, wordAt } from "../src/hover";
import { PREVIEW_ROWS, previewModel, rolesOf } from "../src/previewData";
import { versionStatus } from "../src/status";

// 拡張機能の部品（VS Code に依らない純関数）。道具は MCP と同じ束を、同じ spec で呼ぶ。
const SPEC = join(__dirname, "..", "..", "spec");
const tools = hatakeTools({ specDir: SPEC, readFile: (path) => readFileSync(path, "utf8") });
const call = (name: string, args: Record<string, unknown>) => tools.find((one) => one.name === name)!.run(args);
const example = (file: string) => readFileSync(join(SPEC, "examples", file), "utf8");
const repositoriesOf = (source: string): string[] => JSON.parse(call("hatake_refs", { source })).all.repositories;

describe("プレビューのデータ", () => {
  it("1画面: Repository ごとに行を作り、鍵は重ならず、選択肢は順に回る", () => {
    const source = example("customer_master.yaml");
    const model = previewModel(source, repositoriesOf(source));
    expect(model.kind).toBe("page");
    const repository = Object.values(model.repositories)[0];
    expect(repository.rows).toHaveLength(PREVIEW_ROWS);
    const keys = repository.rows.map((row) => JSON.stringify(repository.keyFields.map((key) => row[key])));
    expect(new Set(keys).size).toBe(PREVIEW_ROWS);
    expect(repository.from).toContain("作り物");
  });

  it("app: メニューの出し分けに書いた役割も拾う", () => {
    const source = example("roles_app.yaml");
    const model = previewModel(source, repositoriesOf(source));
    expect(model.kind).toBe("app");
    expect(model.roles).toEqual(["executive", "hr", "manager"]);
    expect(rolesOf({ maxRows: { byRole: { clerk: 10 } } })).toEqual(["clerk"]);
  });

  it("置いてあった行（preview/<名前>.json）があれば、作らずにそれを使う", () => {
    const source = example("customer_master.yaml");
    const [name] = repositoriesOf(source);
    const model = previewModel(source, [name], { [name]: { rows: [{ customerCode: "A" }], from: `preview/${name}.json` } });
    expect(model.repositories[name].rows).toEqual([{ customerCode: "A" }]);
    expect(model.repositories[name].from).toBe(`preview/${name}.json`);
  });
});

describe("問題の一覧（check の紙 → 行と桁）", () => {
  it("道を分ける", () => {
    expect(pathSegments("page.actions[0].type")).toEqual(["page", "actions", 0, "type"]);
    expect(pathSegments("app.pages[1].table.columns[3].roles")).toEqual(["app", "pages", 1, "table", "columns", 3, "roles"]);
  });

  it("道のキーに当てる。先が無ければ在る所まで遡る", () => {
    const source = "page:\n  actions:\n    - { id: del, type: delete }\n";
    const [from, to] = rangeOf(source, "page.actions[0].type");
    expect(source.slice(from, to)).toBe("type");
    // roles はまだ書いていない（書いていないから言われている）→ その行の項目に当たる。
    const [parent] = rangeOf(source, "page.actions[0].roles");
    expect(source.slice(parent, parent + 4)).toBe("{ id");
  });

  it("欄ごとに重さが違い、場所が付く（事実・好み・人が決めること）", () => {
    const source = example("customer_master.yaml");
    const placed = placeProblems(source, JSON.parse(call("hatake_check", { source })));
    for (const one of placed) {
      expect(["fact", "preference", "question"]).toContain(one.severity);
      expect(one.start.line).toBeLessThan(source.split("\n").length);
    }
    expect(placed.some((one) => one.severity === "question")).toBe(true);
  });

  it("規則ごとの転ぶ定義を全部流すと、事実はどれも定義の中に場所が当たる", () => {
    const cases = JSON.parse(readFileSync(join(SPEC, "rule-cases.json"), "utf8")).cases as Record<string, unknown>[];
    let facts = 0;
    for (const one of cases) {
      const definition = Object.fromEntries(Object.entries(one).filter(([key]) => key === "page" || key === "app"));
      if (Object.keys(definition).length === 0) continue;
      const source = stringify(definition);
      let sheet: Record<string, unknown>;
      try {
        sheet = JSON.parse(call("hatake_check", { source }));
      } catch {
        continue;
      }
      for (const problem of placeProblems(source, sheet as never).filter((p) => p.severity === "fact")) {
        facts += 1;
        expect(problem.start.line, String(one.rule)).toBeLessThan(source.split("\n").length);
      }
    }
    expect(facts).toBeGreaterThan(50);
  });
});

describe("ホバー（reference）", () => {
  it("カーソルの下のキーと値を拾う", () => {
    const source = "page:\n  report:\n    rowsPerPage: 40\n  validators:\n    - { type: maxLength }\n";
    expect(wordAt(source, source.indexOf("rowsPerPage") + 2)).toBe("rowsPerPage");
    expect(wordAt(source, source.indexOf("maxLength") + 2)).toBe("maxLength");
  });

  it("キーは型・既定値・書ける場所、値はどのキーに書くかを言う", () => {
    const key = hoverMarkdown(JSON.parse(call("hatake_reference", { name: "rowsPerPage" })));
    expect(key).toContain("rowsPerPage");
    expect(key).toContain("report");
    expect(key).toContain("40");
    const value = hoverMarkdown(JSON.parse(call("hatake_reference", { name: "maxLength" })));
    expect(value).toContain("validator.type");
  });
});

describe("状態バーの版（物差しは doctor）", () => {
  const report = (pinned: string[]) => ({
    tool: { version: "0.9.31" },
    versions: pinned.map((version) => ({ file: "x", what: "y", version, kind: "pinned" as const })),
  });
  it("そろっていれば目立たせない・違えば両方の版を言う", () => {
    expect(versionStatus(report(["0.9.31"])).differs).toBe(false);
    expect(versionStatus(report([])).differs).toBe(false);
    const differs = versionStatus(report(["0.9.30"]));
    expect(differs.differs).toBe(true);
    expect(differs.text).toContain("0.9.30");
  });
});
