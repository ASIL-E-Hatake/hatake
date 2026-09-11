import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENTS_BEGIN,
  AGENTS_END,
  agentsSection,
  findProjectAdvice,
  matchesShape,
  parseProject,
  ProjectParseError,
  projectLines,
  replaceAgentsSection,
  scaffold,
  toShape,
} from "../src/index.js";
import { parse as parseYamlText } from "yaml";
import { runCli, type CliIo } from "../src/cli.js";

/** CLI が書いたものを集めて、ファイルは記憶から出す（cli.test.ts と同じ手）。 */
function fakeIo(
  files: Record<string, string>,
): CliIo & { stdout: string[]; written: Record<string, string> } {
  const stdout: string[] = [];
  const written: Record<string, string> = {};
  return {
    stdout,
    written,
    out: (text) => stdout.push(text),
    err: () => {},
    readFile: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such file: ${path}`);
      return source;
    },
    writeFile: (path, content) => {
      written[path] = content;
    },
    listFiles: () => null,
  };
}

/**
 * 案件の前書き（定義の手前に置く1枚）の読み方と、決めごとの突き合わせ。
 *
 * ここで守りたいのは2つ。
 *   ・**黙って通さない**（知らないキー・知らない名前はエラー）。設定が効いていない
 *     のに効いているつもりになるのが一番まずい
 *   ・**見ていない所は見ていると言わない**（システムの説明と業務の前提は誰も
 *     突き合わせていない、を読み返しが毎回言う）
 */
const PREAMBLE = `project_version: "1.0"
system:
  what: 卸売の受注。営業が電話で受けた注文を入れる。
  users:
    - 営業（10人）
  premises:
    - 商品マスタは購買部の別システムが正。
  external:
    - name: productRepository
      what: 商品マスタ
      owner: 購買部
glossary:
  - term: 商品名
    field: name
    avoid: [品目名]
  - term: カテゴリ
    field: category
    avoid: [区分]
    note: 購買システムの区分コードとは別物
logic:
  - what: 会議資料用の CSV を出す
    where: plugin
    name: csvExport
  - what: 締めたあとの受注は直せない
    where: server
    name: orderCloseGuard
    why: 締めは会計側が持っている
naming:
  page: snake_case
  field: camelCase
  action: camelCase
  repository: camelCase
  role: snake_case
  suffix:
    date: Date
`;

const project = () => parseProject(PREAMBLE);

const definition = (body: string): Record<string, unknown> =>
  parseYamlText(body) as Record<string, unknown>;

describe("案件の前書きを読む", () => {
  it("書いたものがそのまま入る（要約しない）", () => {
    const found = project();
    expect(found.system.what).toContain("卸売の受注");
    expect(found.system.premises).toHaveLength(1);
    expect(found.system.external[0]).toEqual({
      name: "productRepository",
      what: "商品マスタ",
      owner: "購買部",
    });
    expect(found.glossary[1].avoid).toEqual(["区分"]);
    expect(found.naming.shapes.page).toBe("snake_case");
    expect(found.naming.suffix.date).toBe("Date");
  });

  it("何のシステムかは必須（前書きの意味が無くなるので）", () => {
    expect(() => parseProject('project_version: "1.0"')).toThrow(ProjectParseError);
  });

  it("知らないキーは黙って捨てず、近い名前を言う", () => {
    expect(() =>
      parseProject('project_version: "1.0"\nsystem: { what: x }\nglosary: []\n'),
    ).toThrow(/glossary の間違い/);
  });

  it("知らない名前の形はエラー（黙って効かない設定を作らない）", () => {
    expect(() =>
      parseProject('project_version: "1.0"\nsystem: { what: x }\nnaming: { field: CamelCase }\n'),
    ).toThrow(/camelCase/);
  });

  it("項目の型に無い suffix はエラー", () => {
    expect(() =>
      parseProject(
        'project_version: "1.0"\nsystem: { what: x }\nnaming: { suffix: { datetime: At } }\n',
      ),
    ).toThrow(/dateTime の間違い/);
  });

  it("版が違えばエラー（形が変わったのに黙って読まない）", () => {
    expect(() => parseProject('project_version: "2.0"\nsystem: { what: x }\n')).toThrow(
      /project_version/,
    );
  });

  it("同じ言葉を2回決めたら落ちる（どちらが正か決まらない）", () => {
    expect(() =>
      parseProject(
        'project_version: "1.0"\nsystem: { what: x }\nglossary: [{ term: 商品 }, { term: 商品 }]\n',
      ),
    ).toThrow(/2回/);
  });

  it("呼ばない言葉が別の見出し語なら落ちる（辞書が自分と食い違う）", () => {
    expect(() =>
      parseProject(
        'project_version: "1.0"\nsystem: { what: x }\n' +
          "glossary: [{ term: 取引先, avoid: [顧客] }, { term: 顧客 }]\n",
      ),
    ).toThrow(/どちらで呼ぶ/);
  });
});

describe("業務ロジックの置き場", () => {
  const preamble = (logic: string) =>
    `project_version: "1.0"\nsystem: { what: 受注 }\nlogic:\n${logic}`;

  it("担当の表と同じ区分で書ける", () => {
    const found = project().logic;
    expect(found.map((one) => one.where)).toEqual(["plugin", "server"]);
    expect(found[0].name).toBe("csvExport");
  });

  it("plugin なら name が要る（登録名と突き合わせるため）", () => {
    expect(() => parseProject(preamble("  - { what: x, where: plugin }\n"))).toThrow(
      /name が要ります/,
    );
  });

  it("外に置くなら理由が要る（無いと後から誰も直せない）", () => {
    expect(() => parseProject(preamble("  - { what: x, where: outside }\n"))).toThrow(
      /why が要ります/,
    );
  });

  it("知らない区分はエラー（担当の表と語彙を2つ持たない）", () => {
    expect(() =>
      parseProject(preamble("  - { what: x, where: screen }\n")),
    ).toThrow(/definition \/ plugin \/ server \/ outside/);
  });

  it("同じ名前を2回書いたら落ちる", () => {
    expect(() =>
      parseProject(
        preamble(
          "  - { what: a, where: plugin, name: same }\n" +
            "  - { what: b, where: plugin, name: same }\n",
        ),
      ),
    ).toThrow(/2回/);
  });

  it("宣言したのに**どの画面からも**呼んでいなければ言う（app のときだけ）", () => {
    const source = `dsl_version: "1.0"
app:
  id: sales
  title: 受注
  pages:
    - type: search
      id: product_search
      title: 商品照会
      repository: productRepository
      key: id
      table:
        columns:
          - { field: code, label: コード }
`;
    const found = findProjectAdvice(definition(source), project());
    const one = found.find((advice) => advice.rule === "project-logic-unused");
    expect(one?.says).toContain("csvExport");
    expect(one?.add).toContain("plugin: csvExport");

    // 1画面だけ渡されたときは言わない（他の画面で呼んでいるかもしれない）。
    const single = findProjectAdvice(
      definition(`dsl_version: "1.0"
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  key: id
  table:
    columns:
      - { field: code, label: コード }
`),
      project(),
    );
    expect(single.filter((advice) => advice.rule === "project-logic-unused")).toEqual([]);
  });

  it("サーバの担当と書いたのに画面から呼んでいれば言う（食い違い）", () => {
    const found = findProjectAdvice(
      definition(`dsl_version: "1.0"
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  key: id
  table:
    columns:
      - { field: code, label: コード }
  actions:
    - { id: csvExport, type: plugin, plugin: csvExport, label: CSV出力 }
    - { id: close, type: plugin, plugin: orderCloseGuard, label: 締め }
`),
      project(),
    );
    const one = found.find((advice) => advice.rule === "project-logic-misplaced");
    expect(one?.says).toContain("サーバの担当");
    expect(one?.says).toContain("締めは会計側が持っている");
    // 呼んでいる側は言うが、呼んでいない csvExport は言わない（使われている）。
    expect(found.filter((advice) => advice.rule === "project-logic-unused")).toEqual([]);
  });

  it("読み返しと貼る断片に載る（AI が読む1枚に「これは外」が入る）", () => {
    const text = projectLines(project()).join("\n");
    expect(text).toContain("業務ロジックの置き場:");
    expect(text).toContain("サーバの担当");
    expect(text).toContain("業務ロジックの名前（定義が呼んでいるか）");

    const section = agentsSection(project(), { from: "hatake.project.yaml" });
    expect(section).toContain("**業務ロジックの置き場**");
    expect(section).toContain("画面側に実装しない");
  });
});

describe("読み返し", () => {
  it("機械が見る所と見ない所を必ず言う", () => {
    const text = projectLines(project()).join("\n");
    expect(text).toContain("機械が見るもの:");
    expect(text).toContain("機械が見ないもの:");
    // 前提は「読むだけ」だと言う（縛れたつもりにさせない）。
    expect(text).toContain("人と AI が読むだけ");
  });

  it("決めごとを何も書いていなければ、読み物だけだと言う", () => {
    const text = projectLines(
      parseProject('project_version: "1.0"\nsystem: { what: 受注 }\n'),
    ).join("\n");
    expect(text).toContain("機械が見るもの: ありません");
  });
});

const ROTTEN = `dsl_version: "1.0"
page:
  type: search
  id: ProductSearch
  title: 商品照会
  repository: product_repo
  key: id
  search:
    filters:
      - { field: order_day, label: 受注日, type: date, operator: equals }
  table:
    columns:
      - { field: item_name, label: 品目名, sortable: true }
      - { field: kubun, label: 区分, type: badge }
  actions:
    - { id: csv_export, type: plugin, plugin: csvExport, label: CSV出力, roles: [SalesManager] }
`;

describe("決めごとと定義を突き合わせる", () => {
  const advice = () => findProjectAdvice(definition(ROTTEN), project());

  it("形が違う名前を全部言う（画面 id・Repository・項目・ボタン・役割）", () => {
    const shapes = advice().filter((one) => one.rule === "project-name-shape");
    expect(shapes.map((one) => one.says).join("\n")).toContain("ProductSearch");
    expect(shapes.map((one) => one.where)).toEqual([
      "page",
      "page",
      "page.table.columns.0",
      "page.search.filters.0",
      "page.actions.0",
      "page.actions.0.roles",
    ]);
    // 直す形まで出す（並びで書くキーは並びで見せる）。
    expect(shapes.map((one) => one.add).join("\n")).toContain("`id: product_search`");
    expect(shapes.map((one) => one.add).join("\n")).toContain("`roles: [sales_manager]`");
  });

  it("型に合わない終わり方を言う（`type: date` なのに Date で終わらない）", () => {
    const found = advice().find((one) => one.rule === "project-name-suffix");
    expect(found?.says).toContain("order_day");
    // 足す字は決めない（`orderDayDate` のような名前を作ってしまう）。
    expect(found?.add).not.toContain("order_dayDate");
  });

  it("呼ばないことにした言葉を言う（理由も一緒に）", () => {
    const words = advice().filter((one) => one.rule === "project-glossary-word");
    expect(words.map((one) => one.says).join("\n")).toContain("「商品名」と呼びます");
    expect(words.map((one) => one.says).join("\n")).toContain("区分コードとは別物");
  });

  it("辞書の言葉なのに名前が辞書から来ていないときは、推測だと言う", () => {
    const found = findProjectAdvice(
      definition(`dsl_version: "1.0"
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  key: id
  table:
    columns:
      - { field: itemLabel, label: 商品名 }
`),
      project(),
    );
    const one = found.find((advice) => advice.rule === "project-glossary-name");
    expect(one?.guess).toBe(true);
    expect(one?.says).toContain("itemLabel");
    // 別の属性なら辞書の語で始めればよい、まで言う（言い直しを塞がない）。
    expect(one?.add).toContain("name");
  });

  it("同じ名前が何か所にも出たら1件にまとめて、何か所かを言う", () => {
    const found = findProjectAdvice(
      definition(`dsl_version: "1.0"
page:
  type: crud
  id: product_master
  title: 商品マスタ
  repository: productRepository
  key: id
  search:
    filters:
      - { field: item_name, label: 名称, type: text, operator: contains }
  table:
    columns:
      - { field: item_name, label: 名称 }
  form:
    sections:
      - fields:
          - { field: item_name, label: 名称, required: true }
`),
      project(),
    );
    const shapes = found.filter((one) => one.rule === "project-name-shape");
    expect(shapes).toHaveLength(1);
    expect(shapes[0].says).toContain("他に 2 か所");
  });

  it("決めごとに合っている定義には何も言わない", () => {
    const found = findProjectAdvice(
      definition(readFileSync("../spec/examples/product_search.yaml", "utf8")),
      parseProject(
        readFileSync("../spec/projects/wholesale.project.yaml", "utf8"),
      ),
    );
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });

  it("雛形の埋め忘れの印（TODO_）は名前として見ない", () => {
    const found = findProjectAdvice(
      definition(`dsl_version: "1.0"
page:
  type: search
  id: product_search
  title: 商品照会
  repository: productRepository
  key: id
  table:
    columns:
      - { field: TODO_group_field, label: 見出し }
`),
      project(),
    );
    expect(found).toEqual([]);
  });
});

describe("レビューの1枚", () => {
  it("案件の決めごとも同じ1枚に載る（advise で出てここで出ないのは嘘になる）", () => {
    const io = fakeIo({
      "page.yaml": ROTTEN,
      "hatake.project.yaml": PREAMBLE,
    });
    expect(runCli(["explain", "page.yaml", "--review"], io)).toBe(0);
    const text = io.stdout.join("\n");
    expect(text).toContain("project-name-shape");
    expect(text).toContain("案件の前書きは hatake.project.yaml を読みました");
  });
});

describe("雛形を案件の形で出す", () => {
  it("名前の決めごとの形で名前が出る（DSL のキーは触らない）", () => {
    const yaml = scaffold("report", {
      id: "sales_report",
      title: "売上帳票",
      naming: { shapes: { action: "snake_case", field: "snake_case" }, suffix: {} },
    });
    expect(yaml).toContain("id: print_pdf");
    expect(yaml).toContain("rowsPerPage: 30");
    // 埋め忘れの印はそのまま（形を直すと目立たなくなる）。
    expect(yaml).toContain("TODO_group_field");
  });

  it("前書きを渡さなければ、今までと同じものが出る", () => {
    const options = { id: "sales_report", title: "売上帳票" };
    expect(scaffold("report", options)).toBe(
      scaffold("report", { ...options, naming: { shapes: {}, suffix: {} } }),
    );
  });
});

describe("AI の設定ファイルに貼る断片", () => {
  const section = () => agentsSection(project(), { from: "hatake.project.yaml" });

  it("印で挟んで、前書きの中身をそのまま並べる", () => {
    const text = section();
    expect(text.startsWith(AGENTS_BEGIN)).toBe(true);
    expect(text.trimEnd().endsWith(AGENTS_END)).toBe(true);
    expect(text).toContain("卸売の受注");
    expect(text).toContain("商品マスタは購買部の別システムが正");
    expect(text).toContain("`productRepository`");
    expect(text).toContain("| 商品名 | `name` | 品目名 |");
    expect(text).toContain("画面 id は `snake_case`");
  });

  it("生成物だと断り、直す場所を1か所に寄せる", () => {
    const text = section();
    expect(text).toContain("から生成した節です");
    expect(text).toContain("前書きを直して貼り直す");
  });

  it("機械が見ていない所は、貼った先でも言う", () => {
    // 設定ファイルに前提が載ると「守られている」と読まれるので、そこは断る。
    expect(section()).toContain("機械が見ていない");
  });

  it("印の中だけを差し替え、人が書いた所は触らない", () => {
    const before = [
      "# AGENTS",
      "",
      "- ブランチは feat/<機能>",
      "",
      AGENTS_BEGIN,
      "古い中身",
      AGENTS_END,
      "",
      "## その他",
      "",
    ].join("\n");
    const after = replaceAgentsSection(before, section());
    expect(after).not.toBeNull();
    expect(after).toContain("- ブランチは feat/<機能>");
    expect(after).toContain("## その他");
    expect(after).not.toContain("古い中身");
    // 2回当てても増えない（印は1組のまま）。
    const twice = replaceAgentsSection(after as string, section()) as string;
    expect(twice.split(AGENTS_BEGIN)).toHaveLength(2);
  });

  it("印が無ければ書かない（どこに入れるかは人が決める）", () => {
    expect(replaceAgentsSection("# AGENTS\n", section())).toBeNull();
  });

  it("改行はその紙のものに合わせる（差分が全行にならないように）", () => {
    const before = `# AGENTS\r\n\r\n${AGENTS_BEGIN}\r\n古い\r\n${AGENTS_END}\r\n`;
    const after = replaceAgentsSection(before, section()) as string;
    expect(after.includes("\n\n")).toBe(false);
  });

  it("貼った節が古いと言う（--check。書かない）", () => {
    const io = fakeIo({
      "hatake.project.yaml": PREAMBLE,
      "AGENTS.md": `# AGENTS\n\n${AGENTS_BEGIN}\n古い\n${AGENTS_END}\n`,
    });
    expect(
      runCli(["project", "--agents", "--merge", "AGENTS.md", "--check"], io),
    ).toBe(1);
    // 見るだけ＝直すのは人（CI に置くので、勝手に書き換えない）。
    expect(io.written["AGENTS.md"]).toBeUndefined();
  });

  it("貼った節が最新なら通る", () => {
    const pasted = `# AGENTS\n\n${section().trimEnd()}\n`;
    const io = fakeIo({
      "hatake.project.yaml": PREAMBLE,
      "AGENTS.md": pasted,
    });
    expect(
      runCli(["project", "--agents", "--merge", "AGENTS.md", "--check"], io),
    ).toBe(0);
  });

  it("CLI から書ける（印が無ければ 1 を返して理由を言う）", () => {
    const io = fakeIo({
      "hatake.project.yaml": PREAMBLE,
      "AGENTS.md": `# AGENTS\n\n${AGENTS_BEGIN}\n古い\n${AGENTS_END}\n`,
      "plain.md": "# AGENTS\n",
    });
    expect(runCli(["project", "--agents", "--merge", "AGENTS.md"], io)).toBe(0);
    expect(io.written["AGENTS.md"]).toContain("卸売の受注");
    expect(runCli(["project", "--agents", "--merge", "plain.md"], io)).toBe(1);
    expect(io.written["plain.md"]).toBeUndefined();
  });
});

describe("名前の形", () => {
  it("形を見分ける", () => {
    expect(matchesShape("orderDate", "camelCase")).toBe(true);
    expect(matchesShape("order_date", "camelCase")).toBe(false);
    expect(matchesShape("order_date", "snake_case")).toBe(true);
    expect(matchesShape("OrderDate", "PascalCase")).toBe(true);
    expect(matchesShape("order-date", "kebab-case")).toBe(true);
  });

  it("形を直す（語の割り方は3つの書き方に対応する）", () => {
    expect(toShape("order_date", "camelCase")).toBe("orderDate");
    expect(toShape("orderDate", "snake_case")).toBe("order_date");
    expect(toShape("order-date", "PascalCase")).toBe("OrderDate");
    expect(toShape("TODO_group_field", "camelCase")).toBe("TODO_group_field");
  });
});
