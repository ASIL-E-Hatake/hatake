import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  draftWidgetTest,
  findWarnings,
  parseAppYaml,
  parsePageYaml,
  roleInventory,
  traceDiff,
  traceDiffLines,
  parseIntent,
  widgetDraftLines,
  WIDGET_DRAFT_NOTE,
  TRACE_DIFF_NOTE,
  type PageDefinition,
} from "../src/index.js";

/**
 * P0 の3本（画面の試験の下書き・変更の由来・`app.roles`）。
 *
 * どれも「AI が引けない／人が決めている」所を潰すものなので、守るのは**言えないことを
 * 言わない**こと。下書きは枠組みが必ずそうする所しか期待に書かず、由来は足された／消えた
 * 相手までしか言わず、役割の語彙は書いてあるときだけ綴りを見る。
 */
const CRUD = `page:
  type: crud
  id: order_master
  title: 受注
  repository: orderRepository
  key: id
  search:
    filters:
      - { field: code, label: コード, type: text, operator: contains }
  table:
    rowActions: [edit, delete]
    columns:
      - { field: code, label: コード }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
          - field: lines
            label: 明細
            type: subTable
            fields:
              - { field: item, label: 品名, required: true }
  actions:
    - { id: create, type: create, label: 新規 }
    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
`;

const page = (yaml: string): PageDefinition => parsePageYaml(yaml) as PageDefinition;

describe("画面の試験の下書き", () => {
  const draft = draftWidgetTest(page(CRUD), { from: "assets/p.yaml" });

  it("定義から決まる本だけを起こす", () => {
    const names = draft.cases.map((one) => one.name).join("\n");
    expect(names).toContain("一覧が出て");
    expect(names).toContain("行から編集");
    expect(names).toContain("必須を空で保存");
    expect(names).toContain("絞り込みが Repository に渡る");
    expect(names).toContain("「承認」が押せて");
    expect(names).toContain("明細「明細」の行を足せる");
  });

  it("**キーの字を1つも書かない**（規約を変えたら下書きも一緒に動く）", () => {
    // `HatakeFind` を呼ぶ＝規約は Dart 側の1か所にしか無い。
    expect(draft.source).toContain("HatakeFind.");
    expect(draft.source).not.toContain("hatake.form.");
    expect(draft.source).not.toContain("Key(");
  });

  it("定義は道から読む（試験と定義が1つの正を見る）", () => {
    expect(draft.source).toContain("File('assets/p.yaml').readAsStringSync()");
    // 道を渡さなければ、定義を文字列で埋め込む（どちらでも回る）。
    const inline = draftWidgetTest(page(CRUD), { source: CRUD });
    expect(inline.source).toContain("const definition = r'''");
    expect(inline.source).toContain("type: crud");
  });

  it("期待は**枠組みが必ずそうする所**だけ", () => {
    expect(draft.source).toContain("page.repository.calls");
    expect(draft.source).toContain("必須項目です");
    // 押した先の画面や、プラグインの中身は見ない。
    expect(draft.skipped.map((one) => one.what)).toContain("押した先の画面");
    expect(draft.skipped.map((one) => one.what)).toContain("プラグインの中身");
    expect(draft.todo.join("")).toContain("業務として正しいか");
  });

  it("一覧の無い画面では、一覧の試験を起こさない（理由を言う）", () => {
    const form = `page:
  type: form
  id: f
  title: t
  repository: r
  key: id
  form:
    sections:
      - fields:
          - { field: a, label: A, required: true }
`;
    const only = draftWidgetTest(page(form), { source: form });
    expect(only.cases.map((one) => one.name).join()).not.toContain("一覧が出て");
    expect(only.skipped.find((one) => one.what === "一覧が出る試験")?.why).toContain(
      "table",
    );
  });

  it("何を見ていないかを毎回書く", () => {
    expect(widgetDraftLines(draft).join("\n")).toContain(WIDGET_DRAFT_NOTE);
  });
});

describe("変更の由来", () => {
  const INTENT = `intent_version: "1.0"
page: order_master
asked:
  - id: R1
    text: コードで探せる
    covers: [filter:code, column:code]
  - id: R2
    text: 承認できる
    covers: [action:approve]
`;
  const before = page(CRUD);
  const intent = parseIntent(INTENT);

  it("足された相手の由来を言う", () => {
    const after = page(
      CRUD.replace(
        "    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }",
        "    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }\n" +
          "    - { id: reject, type: plugin, plugin: rejectOrder, label: 却下 }",
      ),
    );
    const result = traceDiff(before, after, intent);
    const one = result.changes.find((c) => c.target === "action:reject");
    expect(one?.kind).toBe("added");
    expect(one?.from).toEqual([]);
    expect(result.orphans).toHaveLength(1);
    expect(traceDiffLines(result).join("\n")).toContain("どの要求からも来ていません");
  });

  it("由来のある変更は、その要求 id を言う", () => {
    const thin = CRUD.replace("      - { field: code, label: コード }\n", "");
    const result = traceDiff(page(thin), before, intent);
    const one = result.changes.find((c) => c.target === "column:code");
    expect(one?.from).toEqual(["R1"]);
    expect(result.orphans).toEqual([]);
  });

  it("消えた相手を指していた要求を言う（その要求は空を指すようになる）", () => {
    const after = page(CRUD.replace("    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }\n", ""));
    const result = traceDiff(before, after, intent);
    const one = result.changes.find((c) => c.target === "action:approve");
    expect(one?.kind).toBe("removed");
    expect(one?.from).toEqual(["R2"]);
    // 消えたものは「由来が無い変更」には数えない（足したものだけを疑う）。
    expect(result.orphans).toEqual([]);
  });

  it("**書き換えは由来を言わない**（指せる相手が動かない）", () => {
    const after = page(CRUD.replace("label: コード, required: true", "label: 品番, required: true"));
    const result = traceDiff(before, after, intent, [{ subject: "コード" }]);
    expect(result.changes).toEqual([]);
    expect(result.reworded).toBe(1);
    expect(traceDiffLines(result).join("\n")).toContain("由来は言えません");
  });

  it("足した相手の説明の差は、二重に数えない", () => {
    const after = page(
      CRUD.replace(
        "      - { field: code, label: コード }",
        "      - { field: code, label: コード }\n      - { field: memo, label: メモ }",
      ),
    );
    // 説明の差にも「メモ」が出るが、足された相手として言っているので数えない。
    const result = traceDiff(before, after, intent, [{ subject: "メモ" }]);
    expect(result.changes.map((c) => c.target)).toContain("column:memo");
    expect(result.reworded).toBe(0);
  });

  it("意図が無ければ「由来が無い」とは言わない（全部そうなるので意味が無い）", () => {
    const after = page(CRUD + "\n");
    const result = traceDiff(before, after, undefined);
    expect(result.hasIntent).toBe(false);
    expect(result.orphans).toEqual([]);
    expect(traceDiffLines(result).join("\n")).toContain(TRACE_DIFF_NOTE);
  });
});

describe("app.roles（配りうる役割の語彙）", () => {
  const app = (roles: string, used: string) => `app:
  id: sales
  title: 販売
  ${roles}
  menu:
    - { id: m1, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns:
          - { field: orderNo, label: 受注番号, roles: [${used}] }
`;

  it("読める（3版で同じキー）", () => {
    const parsed = parseAppYaml(app("roles: [manager, staff]", "manager"));
    expect(parsed.roles).toEqual(["manager", "staff"]);
    // 書いていなければ空（＝語彙は分からない）。
    expect(parseAppYaml(app("", "manager")).roles).toEqual([]);
  });

  it("**一覧を渡さなくても綴り違いを言える**（定義1枚で閉じる）", () => {
    const found = findWarnings(
      parseYaml(app("roles: [manager, staff]", "mgr")) as Record<string, unknown>,
    );
    const one = found.find((w) => w.rule === "role-not-in-app");
    expect(one?.message).toContain("mgr");
    expect(one?.message).toContain("誰にも見えません");
    expect(one?.fix).toContain("app.roles");
  });

  it("宣言した名前なら言わない", () => {
    const found = findWarnings(
      parseYaml(app("roles: [manager, staff]", "manager")) as Record<string, unknown>,
    );
    expect(found.map((w) => w.rule)).not.toContain("role-not-in-app");
  });

  it("書いていなければ、今までどおり黙る（語彙が分からないので言えない）", () => {
    const found = findWarnings(parseYaml(app("", "mgr")) as Record<string, unknown>);
    expect(found.map((w) => w.rule)).not.toContain("role-not-in-app");
  });

  it("**語彙の宣言は「使っている所」ではない**（棚卸しに混ぜない）", () => {
    const inventory = roleInventory(
      parseYaml(app("roles: [manager, staff]", "manager")) as Record<string, unknown>,
    );
    // 使っているのは manager だけ（staff は宣言しただけ）。
    expect(inventory.map((one) => one.role)).toEqual(["manager"]);
    expect(inventory[0].spots).toHaveLength(1);
  });

  it("同梱の例が、宣言した語彙で通る", () => {
    const yaml = readFileSync("../spec/examples/roles_app.yaml", "utf8");
    expect(parseAppYaml(yaml).roles).toEqual(["hr", "manager", "executive"]);
    const found = findWarnings(parseYaml(yaml) as Record<string, unknown>);
    expect(found.map((w) => w.rule)).not.toContain("role-not-in-app");
  });
});
