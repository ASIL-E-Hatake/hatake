import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, runCli, runCliAsync, type CliIo } from "../src/cli.js";
import { parsePageYaml, scaffold, scaffoldKinds } from "../src/index.js";

/** Collects what the CLI wrote, and serves files from memory. */
function fakeIo(
  files: Record<string, string> = {},
  // `--git` の試験に本物の git を要らなくする（無ければ「使えません」と言う道も試す）。
  git?: (args: string[]) => string,
): CliIo & {
  stdout: string[];
  stderr: string[];
  written: Record<string, string>;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const written: Record<string, string> = {};
  return {
    stdout,
    stderr,
    written,
    ...(git === undefined ? {} : { git }),
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such file: ${path}`);
      return source;
    },
    writeFile: (path, content) => {
      written[path] = content;
    },
    // ディレクトリは「末尾が / の名前」で表す（fake なので十分）。
    listFiles: (path) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const children = Object.keys(files).filter((name) => name.startsWith(prefix));
      return children.length > 0 ? children.sort() : null;
    },
  };
}

const GOOD = `
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns:
      - { field: code, label: コード }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true, validators: [{ type: maxLength, value: 20 }] }
`;

const WITH_TYPOS = `
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    columns:
      - { field: code, label: コード, witdh: 140 }
  form:
    sections:
      - fields:
          - { field: code, label: コード, readonly: true }
`;

describe("parseArgs", () => {
  it("真偽値フラグはファイル名を値として食わない", () => {
    // `validate --warn-as-error a.yaml` を「値つきフラグ」と読むと、ファイル指定が
    // 消えて「ファイルを指定してください」になる（実際にやった）。
    const args = parseArgs(["validate", "--warn-as-error", "a.yaml", "--json"]);
    expect(args.positional).toEqual(["a.yaml"]);
    expect(args.flags).toEqual({ "warn-as-error": true, json: true });
  });

  it("reads positionals, --key value, --key=value and bare flags", () => {
    const args = parseArgs([
      "types",
      "page.yaml",
      "--lang",
      "java",
      "--package=io.example.api",
      "--json",
    ]);
    expect(args.command).toBe("types");
    expect(args.positional).toEqual(["page.yaml"]);
    expect(args.flags).toEqual({
      lang: "java",
      package: "io.example.api",
      json: true,
    });
  });
});

describe("hatake validate", () => {
  it("passes a good definition and names its kind", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["validate", "page.yaml"], io)).toBe(0);
    expect(io.stdout[0]).toBe("OK   page.yaml (crud)");
  });

  it("fails on unknown keys and lists every one with its fix", () => {
    const io = fakeIo({ "page.yaml": WITH_TYPOS });
    expect(runCli(["validate", "page.yaml"], io)).toBe(1);
    expect(io.stdout[0]).toBe("FAIL page.yaml");
    expect(io.stderr.join("\n")).toContain("width の間違い？");
    expect(io.stderr.join("\n")).toContain("readOnly の間違い？");
  });

  it("--no-strict keeps the old forgiving behaviour", () => {
    const io = fakeIo({ "page.yaml": WITH_TYPOS });
    expect(runCli(["validate", "page.yaml", "--no-strict"], io)).toBe(0);
  });

  it("--json is machine readable, which is the point for tooling", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": WITH_TYPOS });
    expect(runCli(["validate", "a.yaml", "b.yaml", "--json"], io)).toBe(1);
    const report = JSON.parse(io.stdout.join("\n"));
    expect(report[0]).toEqual({ file: "a.yaml", ok: true, kind: "crud" });
    expect(report[1].ok).toBe(false);
    expect(report[1].unknownKeys).toEqual([
      {
        path: "page.form.sections[0].fields[0]",
        key: "readonly",
        suggestion: "readOnly",
      },
      {
        path: "page.table.columns[0]",
        key: "witdh",
        suggestion: "width",
      },
    ]);
  });

  it("reports a parse error with its path", () => {
    const io = fakeIo({ "page.yaml": "page: { type: crud, id: x }" });
    expect(runCli(["validate", "page.yaml"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("title");
  });

  it("accepts an app document too", () => {
    const io = fakeIo({
      "app.yaml": readFileSync("../spec/examples/sales_app.yaml", "utf8"),
    });
    expect(runCli(["validate", "app.yaml"], io)).toBe(0);
    expect(io.stdout[0]).toContain("app: 8 ページ");
  });

  it("validates every shipped example", () => {
    for (const file of [
      "customer_master",
      "product_search",
      "dept_master",
      "customer_detail",
      "customer_form",
      "order_entry",
      "order_entry_paged",
      "customer_wizard",
      "sales_dashboard",
      "sales_report",
    ]) {
      const path = `../spec/examples/${file}.yaml`;
      const io = fakeIo({ [path]: readFileSync(path, "utf8") });
      expect(runCli(["validate", path], io), io.stderr.join("\n")).toBe(0);
    }
  });

  it("needs a file", () => {
    const io = fakeIo();
    expect(runCli(["validate"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("ファイルを指定");
  });
});

describe("hatake validate の警告", () => {
  // strict もスキーマも通るが、実行すると意図どおり動かない定義。
  const SLOPPY = `
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    rowActions: [approve]
    columns: [{ field: amount, label: 金額, type: number }]
  report:
    groupBy: [{ field: customer, label: 顧客 }]
`;

  it("既定で警告を出すが、終了コードは変えない", () => {
    const io = fakeIo({ "page.yaml": SLOPPY });
    expect(runCli(["validate", "page.yaml"], io)).toBe(0);
    expect(io.stdout[0]).toBe("OK   page.yaml (report)");
    const err = io.stderr.join("\n");
    expect(err).toContain("警告 page.table.rowActions[0]");
    expect(err).toContain("警告 page.report.groupBy");
    expect(err).toContain("→ report.sort");
  });

  it("--warn-as-error で CI を落とせる", () => {
    const io = fakeIo({ "page.yaml": SLOPPY });
    expect(runCli(["validate", "page.yaml", "--warn-as-error"], io)).toBe(1);
  });

  it("--no-warn で黙る", () => {
    const io = fakeIo({ "page.yaml": SLOPPY });
    expect(runCli(["validate", "page.yaml", "--no-warn"], io)).toBe(0);
    expect(io.stderr.join("\n")).not.toContain("警告");
  });

  it("--json では warnings として返す", () => {
    const io = fakeIo({ "page.yaml": SLOPPY });
    runCli(["validate", "page.yaml", "--json"], io);
    const report = JSON.parse(io.stdout.join("\n"))[0];
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w: { rule: string }) => w.rule)).toEqual([
      "rowaction-not-declared",
      "groupby-without-sort",
    ]);
  });

  it("解析が落ちた定義には警告を出さない（順番に意味がある）", () => {
    const io = fakeIo({ "page.yaml": WITH_TYPOS });
    expect(runCli(["validate", "page.yaml"], io)).toBe(1);
    expect(io.stderr.join("\n")).not.toContain("警告");
  });

  it("同梱の例は警告ゼロで通る", () => {
    for (const file of ["customer_master", "sales_report", "sales_app"]) {
      const path = `../spec/examples/${file}.yaml`;
      const io = fakeIo({ [path]: readFileSync(path, "utf8") });
      expect(runCli(["validate", path, "--warn-as-error"], io), file).toBe(0);
    }
  });
});

describe("hatake dto / schema / openapi", () => {
  it("dto prints the shapes the page implies", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["dto", "page.yaml"], io)).toBe(0);
    const spec = JSON.parse(io.stdout.join("\n"));
    expect(spec.page).toBe("customer_master");
    expect(spec.shapes.map((s: { role: string }) => s.role)).toContain("request");
  });

  it("schema prints JSON Schema 2020-12", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["schema", "page.yaml"], io)).toBe(0);
    const schema = JSON.parse(io.stdout.join("\n"));
    expect(schema.$schema).toContain("2020-12");
  });

  it("openapi emits schemas only until a base path is given", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["openapi", "page.yaml"], io)).toBe(0);
    expect(JSON.parse(io.stdout.join("\n")).paths).toBeUndefined();

    const withPath = fakeIo({ "page.yaml": GOOD });
    runCli(
      ["openapi", "page.yaml", "--base-path", "/api/customers", "--title", "顧客 API"],
      withPath,
    );
    const doc = JSON.parse(withPath.stdout.join("\n"));
    expect(Object.keys(doc.paths)).toContain("/api/customers");
    expect(doc.info.title).toBe("顧客 API");
  });

  it("a generator refuses a definition with unknown keys", () => {
    // Generating from a typo'd definition would bake the mistake into an API.
    const io = fakeIo({ "page.yaml": WITH_TYPOS });
    expect(runCli(["dto", "page.yaml"], io)).toBe(1);
  });
});

describe("hatake diff", () => {
  const TIGHTENED = GOOD.replace(
    "{ field: code, label: コード, required: true, validators: [{ type: maxLength, value: 20 }] }",
    "{ field: code, label: コード, required: true, validators: [{ type: maxLength, value: 10 }] }",
  );

  it("何も変わらなければそう言う", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": GOOD });
    expect(runCli(["diff", "a.yaml", "b.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("変わりません");
  });

  it("壊す変更があれば終了コード 1 で、何が壊れるか言う", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": TIGHTENED });
    expect(runCli(["diff", "a.yaml", "b.yaml"], io)).toBe(1);
    const out = io.stdout.join("\n");
    // 受け取る形は壊れるが、返す形の同じ変更は互換。両方を並べて見せる。
    expect(out).toContain("✗ 破壊的 [api] page.CustomerMasterRequest.code");
    expect(out).toContain("maxLength が 20 から 10 に");
    expect(out).toContain("・安全  [api] page.CustomerMasterResponse.code");
    expect(out).toContain("後方互換を壊します");
  });

  it("--json は機械可読", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": TIGHTENED });
    expect(runCli(["diff", "a.yaml", "b.yaml", "--json"], io)).toBe(1);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.compatible).toBe(false);
    expect(result.changes[0].kind).toBe("constraint-changed");
  });

  it("2ファイル要る", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["diff", "a.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("2つ指定");
  });

  it("書き間違いのある定義は差分にしない（常に strict で読む）", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": WITH_TYPOS });
    expect(runCli(["diff", "a.yaml", "b.yaml"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("witdh");
  });
});

describe("hatake explain", () => {
  it("何をする画面かを日本語で出す", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["explain", "page.yaml"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("顧客マスタ（customer_master）—");
    expect(out).toContain("データの出どころは customerRepository");
  });

  it("--json は構造で返す（見出しと行）", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["explain", "page.yaml", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.headline).toContain("顧客マスタ");
    expect(Array.isArray(result.sections)).toBe(true);
  });

  it("書き間違いのある定義は説明しない（常に strict で読む）", () => {
    const io = fakeIo({ "page.yaml": WITH_TYPOS });
    expect(runCli(["explain", "page.yaml"], io)).toBe(1);
    expect(io.err ? io.stderr.join("\n") : "").toContain("witdh");
  });

  it("ファイルは1つ", () => {
    expect(runCli(["explain"], fakeIo())).toBe(1);
  });

  it("--brief は1行だけ（README や PR 本文に貼る形）", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["explain", "page.yaml", "--brief"], io)).toBe(0);
    expect(io.stdout).toHaveLength(1);
    expect(io.stdout[0]).toContain(
      "顧客マスタ（customer_master）… 検索＋一覧＋登録・修正・削除。",
    );
  });

  it("--brief --json は数も返す", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["explain", "page.yaml", "--brief", "--json"], io)).toBe(0);
    const brief = JSON.parse(io.stdout.join("\n"));
    expect(brief.counts).toEqual({
      columns: 1,
      sections: 1,
      fields: 1,
      required: 1,
    });
  });
});

describe("hatake explain --diff", () => {
  const WITH_FORMAT = GOOD.replace(
    "{ field: code, label: コード }",
    "{ field: code, label: コード, format: mask }",
  );

  it("変更を画面の言葉で言う", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": WITH_FORMAT });
    expect(runCli(["explain", "--diff", "a.yaml", "b.yaml"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("「コード」が変わりました");
    expect(out).toContain("後: コード（一部を隠して見せる）");
  });

  it("変わっていなければそう言う（終了コードは変えない＝止める道具ではない）", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": GOOD });
    expect(runCli(["explain", "--diff", "a.yaml", "b.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("見え方は変わりません。");
  });

  it("壊す変更でも終了コードは 0（後方互換の判定は hatake diff）", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": TIGHTENED_FOR_EXPLAIN });
    expect(runCli(["explain", "--diff", "a.yaml", "b.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("hatake diff で見てください");
  });

  it("2ファイル要る（git から取る道も案内する）", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["explain", "--diff", "a.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("2つ指定");
    expect(io.stderr.join("")).toContain("--git HEAD~1..HEAD");
  });
});

describe("PR 本文の形（--markdown）", () => {
  const CHANGED = GOOD.replace(
    "{ field: code, label: コード }",
    "{ field: code, label: コード, format: mask }",
  );

  it("説明を Markdown で出す", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["explain", "a.yaml", "--markdown"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toMatch(/^## 顧客マスタ/);
    expect(out).toContain("### 一覧に出る列");
    expect(out).toContain("- コード");
  });

  it("レビュー1枚も Markdown で出せる", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["explain", "a.yaml", "--review", "--markdown"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("### 書き足したほうがいい所（助言）");
  });

  it("変更も Markdown で出せる", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": CHANGED });
    expect(
      runCli(["explain", "--diff", "a.yaml", "b.yaml", "--markdown"], io),
    ).toBe(0);
    expect(io.stdout.join("\n")).toContain("変わったところ **");
  });

  it("--json と --markdown は同時に使えない（貼った先で形が違う事故を作らない）", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["explain", "a.yaml", "--json", "--markdown"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("同時に使えません");
  });
});

describe("変更前を git から取る（--git）", () => {
  const WITH_FORMAT_FOR_GIT = GOOD.replace(
    "{ field: code, label: コード }",
    "{ field: code, label: コード, format: mask }",
  );

  /** `git show <rev>:./<name>` に答える偽の git。 */
  const gitWith = (answers: Record<string, string>) => (args: string[]) => {
    const key = args.join(" ");
    if (args[0] === "--version") return "git version 2.0.0\n";
    for (const [rev, source] of Object.entries(answers)) {
      if (key.includes(`${rev}:./`)) return source;
    }
    throw new Error(`fatal: no such path (${key})`);
  };

  it("explain --diff が、前の版を git から読む", () => {
    const io = fakeIo(
      { "a.yaml": WITH_FORMAT_FOR_GIT },
      gitWith({ "HEAD~1": GOOD }),
    );
    expect(
      runCli(["explain", "--diff", "--git", "HEAD~1", "a.yaml"], io),
    ).toBe(0);
    const out = io.stdout.join("\n");
    // 何と何を比べたかを本文に書く（貼った先ではコマンドが見えない）。
    expect(out).toContain("HEAD~1 → 作業中 の a.yaml");
    expect(out).toContain("「コード」が変わりました");
  });

  it("diff も Markdown で表にできる（落ちた理由は PR で読む）", () => {
    const io = fakeIo(
      { "a.yaml": TIGHTENED_FOR_EXPLAIN },
      gitWith({ HEAD: GOOD }),
    );
    expect(runCli(["diff", "--git", "HEAD", "a.yaml", "--markdown"], io)).toBe(1);
    const out = io.stdout.join("\n");
    expect(out).toContain("## 定義の変更 — **後方互換を壊します**");
    expect(out).toContain("| 影響 | 区分 | 場所 | 内容 |");
    expect(out).toContain("✗ 破壊的");
  });

  it("diff（後方互換の判定）でも同じ書き方で使える", () => {
    const io = fakeIo(
      { "a.yaml": TIGHTENED_FOR_EXPLAIN },
      gitWith({ "HEAD": GOOD }),
    );
    // 制約を厳しくしたので壊す変更＝終了コード 1。
    expect(runCli(["diff", "--git", "HEAD", "a.yaml"], io)).toBe(1);
    expect(io.stdout.join("\n")).toContain("後方互換を壊します");
  });

  it("--git のときはファイルは1つだけ", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": GOOD }, gitWith({}));
    expect(
      runCli(["explain", "--diff", "--git", "HEAD", "a.yaml", "b.yaml"], io),
    ).toBe(1);
    expect(io.stderr.join("")).toContain("1つだけ");
  });

  it("git が無い所では、そう言う（別の失敗に化けさせない）", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["explain", "--diff", "--git", "HEAD", "a.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("--git を使えません");
  });

  it("git を呼べない所では、リビジョンの話にしない", () => {
    const io = fakeIo({ "a.yaml": GOOD }, () => {
      throw new Error("spawnSync git ENOENT");
    });
    expect(runCli(["explain", "--diff", "--git", "HEAD", "a.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("git を実行できません");
  });

  it("そのリビジョンに無いファイルは、理由まで言う", () => {
    const io = fakeIo({ "a.yaml": GOOD }, gitWith({}));
    expect(
      runCli(["explain", "--diff", "--git", "HEAD~1..HEAD", "a.yaml"], io),
    ).toBe(1);
    expect(io.stderr.join("")).toContain("新しく足したファイル");
  });
});

/** 制約を厳しくした版（`diff` なら破壊的、`explain --diff` は見え方の話だけ）。 */
const TIGHTENED_FOR_EXPLAIN = GOOD.replace(
  "{ type: maxLength, value: 20 }",
  "{ type: maxLength, value: 10 }",
);

describe("hatake harvest", () => {
  const undeclared = (id: string) => `
page:
  type: crud
  id: ${id}
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit, approve]
    columns:
      - { field: orderNo, label: 受注番号 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
`;

  const corpus = {
    "defs/a.yaml": undeclared("a"),
    "defs/b.yaml": undeclared("b"),
    "defs/pubspec.yaml": "name: demo\n",
  };

  it("ディレクトリを走査して、繰り返し出た診断を候補として出す", () => {
    const io = fakeIo(corpus);
    expect(runCli(["harvest", "defs"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("走査: 定義 2 本（定義でないファイル 1 件は飛ばした）");
    expect(out).toContain("# rowaction-not-declared  2 箇所 / 2 本");
    expect(out).toContain("人が書く: why:");
  });

  it("カタログにある診断は候補にしない（重複を増やさない）", () => {
    const io = fakeIo({ ...corpus, ...failureFiles });
    expect(runCli(["harvest", "defs", "--spec", SPEC], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("候補はありません");
    expect(out).toContain("rowaction-not-declared → invented-row-action");
  });

  it("--json は機械可読", () => {
    const io = fakeIo(corpus);
    expect(runCli(["harvest", "defs", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.scanned).toBe(2);
    expect(result.candidates[0].id).toBe("rowaction-not-declared");
  });

  it("読めない定義があれば終了コード 1（走査が不完全だと言う）", () => {
    const io = fakeIo({ "defs/broken.yaml": "page:\n  type: crud\n\tbad\n" });
    expect(runCli(["harvest", "defs"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("読めなかった定義が 1 件");
  });

  it("path 指定が要る", () => {
    expect(runCli(["harvest"], fakeIo())).toBe(1);
  });

  it("--repro は最小の再現まで作る（既定では作らない）", () => {
    const io = fakeIo(corpus);
    expect(runCli(["harvest", "defs", "--repro"], io)).toBe(0);
    const out = io.stdout.join("\n");
    // 見出しは「最小の再現（N 箇所削った下書き）:」。人が書く欄の文にも同じ語が出るので、
    // 括弧まで見て「本文が付いているか」を確かめる。
    expect(out).toContain("最小の再現（");
    expect(out).toContain("rowActions");
    // ラベルは記号に置き換わっている（客先の語彙を持ち出さない）。
    expect(out).not.toContain("受注一覧");

    const quiet = fakeIo(corpus);
    expect(runCli(["harvest", "defs"], quiet)).toBe(0);
    expect(quiet.stdout.join("\n")).not.toContain("最小の再現（");
  });
});

describe("hatake index", () => {
  const corpus = {
    "defs/order.yaml": GOOD.replace("customer_master", "order_list").replace(
      "顧客マスタ",
      "受注一覧",
    ),
    "defs/customer.yaml": GOOD,
    "defs/pubspec.yaml": "name: demo\n",
  };

  it("画面の索引を表で出す", () => {
    const io = fakeIo(corpus);
    expect(runCli(["index", "defs"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("画面 2 枚");
    expect(out).toContain("customer_master");
    expect(out).toContain("order_list");
  });

  it("--find は語の AND", () => {
    const io = fakeIo(corpus);
    expect(runCli(["index", "defs", "--find", "受注"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("画面 1 枚");
    expect(out).toContain("order_list");
    expect(out).not.toContain("顧客マスタ");
  });

  it("--by size は規模も見せる", () => {
    const io = fakeIo(corpus);
    expect(runCli(["index", "defs", "--by", "size"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("規模の大きい順");
  });

  it("--json / --out はそのまま機械に渡せる形", () => {
    const io = fakeIo(corpus);
    expect(runCli(["index", "defs", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.screens).toHaveLength(2);
    expect(result.ignored).toBe(1);
    expect(result.screens[0].words).toContain("コード");

    const written = fakeIo(corpus);
    expect(runCli(["index", "defs", "--out", "index.json"], written)).toBe(0);
    expect(JSON.parse(written.written["index.json"]).screens).toHaveLength(2);
  });

  it("読めない定義があれば終了コード 1（索引は不完全）", () => {
    const io = fakeIo({ "defs/broken.yaml": "page:\n  type: crud\n" });
    expect(runCli(["index", "defs"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("索引は不完全");
  });

  it("path 指定が要る", () => {
    expect(runCli(["index"], fakeIo())).toBe(1);
  });
});

describe("hatake diagram", () => {
  const app = `dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
`;

  it("app の定義から図を描く", () => {
    const io = fakeIo({ "app.yaml": app });
    expect(runCli(["diagram", "app.yaml"], io)).toBe(0);
    const svg = io.stdout.join("\n");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("販売管理（sales）の画面と遷移");
  });

  it("--json は元データ（手で直してから描ける）", () => {
    const io = fakeIo({ "app.yaml": app });
    expect(runCli(["diagram", "app.yaml", "--json"], io)).toBe(0);
    const picture = JSON.parse(io.stdout.join("\n"));
    expect(picture.rows.length).toBeGreaterThan(1);
  });

  it("図の元データを渡すと、それを描く（資料の図と同じ描画）", () => {
    const io = fakeIo({
      "d.json": JSON.stringify({
        $comment: "資料の図",
        title: "図の題",
        rows: [{ kind: "note", text: "注記" }],
      }),
    });
    expect(runCli(["diagram", "d.json", "--out", "d.svg"], io)).toBe(0);
    expect(io.written["d.svg"]).toContain("図の題");
    expect(io.stdout.join("\n")).toContain("書きました: d.svg");
  });

  it("1枚の画面は図にしない（explain のほうが読める）", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["diagram", "page.yaml"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("hatake explain");
  });

  it("ファイルは1つ", () => {
    expect(runCli(["diagram"], fakeIo())).toBe(1);
  });

  const gated = `dsl_version: "1.0"
app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: masters, label: マスタ, page: customer_master, roles: [admin] }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
      actions:
        - { id: csv, type: export, label: CSV出力 }
    - type: master
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
`;

  it("箱の中に「誰が開けるか」が出る", () => {
    const io = fakeIo({ "app.yaml": gated });
    expect(runCli(["diagram", "app.yaml", "--json"], io)).toBe(0);
    const lines = JSON.stringify(JSON.parse(io.stdout.join("\n")));
    expect(lines).toContain("admin だけ");
    // 誰でも開けて持ち出せる画面は赤枠。
    expect(lines).toContain('"warn"');
  });

  it("--role でその役割で通れる道だけの図になる", () => {
    const io = fakeIo({ "app.yaml": gated });
    expect(runCli(["diagram", "app.yaml", "--role", "admin", "--json"], io)).toBe(0);
    const picture = JSON.parse(io.stdout.join("\n"));
    expect(picture.subtitle).toContain("admin で通れる道");
  });

  // 綴り違いを黙って通すと「全部開ける」に見える＝一番まずい読み違えになる。
  it("知らない役割名はエラー", () => {
    const io = fakeIo({ "app.yaml": gated });
    expect(runCli(["diagram", "app.yaml", "--role", "admn"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("出てくるのは admin");
  });
});

describe("hatake minimize", () => {
  const VERBOSE = `dsl_version: "1.0"
page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号, type: text, sortable: false }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true, validators: [] }
`;
  const files = { ...specFiles, "page.yaml": VERBOSE };

  it("定義は標準出力、落としたものは標準エラー（リダイレクトで使える）", () => {
    const io = fakeIo(files);
    expect(runCli(["minimize", "page.yaml", "--spec", SPEC], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("type: crud");
    expect(out).not.toContain("sortable: false");
    expect(out).not.toContain("validators: []");
    expect(io.stderr.join("\n")).toContain("件の指定を落としました");
  });

  it("--json は落としたものと結果をまとめて返す", () => {
    const io = fakeIo(files);
    expect(runCli(["minimize", "page.yaml", "--spec", SPEC, "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.dropped.map((one: { where: string }) => one.where)).toContain(
      "page.table.columns[0].sortable",
    );
    expect(result.lines.after).toBeLessThan(result.lines.before + 1);
    expect(result.source).toContain("id: order_list");
  });

  it("--out でファイルに書く", () => {
    const io = fakeIo(files);
    expect(runCli(["minimize", "page.yaml", "--spec", SPEC, "--out", "min.yaml"], io)).toBe(
      0,
    );
    expect(io.written["min.yaml"]).toContain("type: crud");
    expect(io.written["min.yaml"]).not.toContain("sortable: false");
  });

  it("書き間違いのある定義は最小化しない", () => {
    const io = fakeIo({ ...specFiles, "page.yaml": WITH_TYPOS });
    expect(runCli(["minimize", "page.yaml", "--spec", SPEC], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("witdh");
  });

  it("ファイルは1つ", () => {
    expect(runCli(["minimize"], fakeIo())).toBe(1);
  });
});

describe("hatake fix", () => {
  const TYPOS = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    rowActions: [edit, aprove]
    columns:
      - { field: orderNo, label: 受注番号, witdh: 140 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
`;

  it("直した定義は標準出力、何をしたかは標準エラー", () => {
    const io = fakeIo({ "page.yaml": TYPOS });
    expect(runCli(["fix", "page.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("width: 140");
    expect(io.stdout.join("\n")).toContain("[edit, approve]");
    expect(io.stderr.join("\n")).toContain("2 件を直しました");
  });

  it("既定ではファイルを触らない（見せてから当てる）", () => {
    const io = fakeIo({ "page.yaml": TYPOS });
    runCli(["fix", "page.yaml"], io);
    expect(io.written).toEqual({});
  });

  it("--write で上書きする", () => {
    const io = fakeIo({ "page.yaml": TYPOS });
    expect(runCli(["fix", "page.yaml", "--write"], io)).toBe(0);
    expect(io.written["page.yaml"]).toContain("width: 140");
    expect(io.stdout.join("\n")).toContain("書きました: page.yaml");
  });

  it("直しても残る問題があれば終了コード 1（まだ人の手が要る）", () => {
    const io = fakeIo({
      "page.yaml": TYPOS.replace(
        "    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }",
        `    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
    - { id: approve, type: plugin, plugin: approveOrder, label: 承認2 }`,
      ),
    });
    expect(runCli(["fix", "page.yaml"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("残っている問題");
  });

  it("直せるものが無ければ、そう言って何も書かない", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["fix", "page.yaml", "--write"], io)).toBe(0);
    expect(io.written).toEqual({});
    expect(io.stdout.join("\n")).toContain("書き換えるものはありませんでした");
  });

  it("--json は機械可読（直したもの・直さなかったもの・残り）", () => {
    const io = fakeIo({ "page.yaml": TYPOS });
    expect(runCli(["fix", "page.yaml", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.applied).toHaveLength(2);
    expect(result.remaining).toEqual([]);
    expect(result.source).toContain("width: 140");
  });

  it("ファイルは1つ", () => {
    expect(runCli(["fix"], fakeIo())).toBe(1);
  });
});

describe("hatake advise", () => {
  const THIN = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: remove, type: delete, label: 削除 }
`;

  it("書き足すと良さそうな所を出す", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["advise", "page.yaml"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("no-search-filter");
    expect(out).toContain("open-dangerous-action");
  });

  it("助言では終了コードを変えない（好みを強制しない）", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["advise", "page.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("警告ではありません");
  });

  it("--json は機械可読", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["advise", "page.yaml", "--json"], io)).toBe(0);
    const advice = JSON.parse(io.stdout.join("\n"));
    expect(advice.map((one: { rule: string }) => one.rule)).toContain("no-search-filter");
  });

  it("ファイルは1つ", () => {
    expect(runCli(["advise"], fakeIo())).toBe(1);
  });

  it("--rules で物差しを差し替えられる（切った規則は出ない）", () => {
    const io = fakeIo({
      "page.yaml": THIN,
      "team.json": JSON.stringify({ off: ["open-dangerous-action"] }),
    });
    expect(runCli(["advise", "page.yaml", "--rules", "team.json"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).not.toContain("open-dangerous-action");
    expect(out).toContain("物差しは team.json を使いました");
  });

  it("--rules で案件の決めごとを足せる", () => {
    const io = fakeIo({
      "page.yaml": THIN,
      "team.json": JSON.stringify({
        require: [
          { rule: "team-column-width", node: "column", key: "width", every: true },
        ],
      }),
    });
    expect(runCli(["advise", "page.yaml", "--rules", "team.json"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("team-column-width");
  });

  // 設定が黙って効かないのが一番まずいので、読めない物差しは止める。
  it("読めない物差しはエラー（黙って組み込みに戻さない）", () => {
    const io = fakeIo({
      "page.yaml": THIN,
      "team.json": JSON.stringify({ off: ["no-such-rule"] }),
    });
    expect(runCli(["advise", "page.yaml", "--rules", "team.json"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("規則名ではありません");
  });

  it("助言に値の下書きが付く（値で止まらないように）", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["advise", "page.yaml"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("値の下書き:");
    expect(out).toContain("**下書きです**");
  });

  it("--apply で選んだ助言を当てる（既定はファイルを触らない）", () => {
    const io = fakeIo({
      "page.yaml": THIN,
      "picks.json": JSON.stringify([
        { rule: "no-search-filter", value: [{ field: "orderNo", label: "受注番号" }] },
      ]),
    });
    expect(runCli(["advise", "page.yaml", "--apply", "picks.json"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain(
      "search: { filters: [{ field: orderNo, label: 受注番号 }] }",
    );
    expect(io.stderr.join("\n")).toContain("1 件を当てました");
    // 当てた所を画面の言葉でも言う（道の書き方ではレビューできない）。
    expect(io.stderr.join("\n")).toContain("変わったところ");
    expect(io.written).toEqual({});
  });

  it("--apply --write はファイルを上書きする", () => {
    const io = fakeIo({
      "page.yaml": THIN,
      "picks.json": JSON.stringify({
        picks: [{ rule: "open-dangerous-action", value: ["manager"] }],
      }),
    });
    expect(runCli(["advise", "page.yaml", "--apply", "picks.json", "--write"], io)).toBe(0);
    expect(io.written["page.yaml"]).toContain("roles: [manager]");
    // 当てたところ以外は1文字も変えない。
    expect(io.written["page.yaml"].replace(", roles: [manager]", "")).toBe(THIN);
  });

  it("頼んだのに当てられなかったものがあれば 1（好みでは落とさないが、頼み事は落とす）", () => {
    const io = fakeIo({
      "page.yaml": THIN,
      "picks.json": JSON.stringify([{ rule: "open-dangerous-action" }]),
    });
    expect(runCli(["advise", "page.yaml", "--apply", "picks.json"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("value に渡してください");
  });

  it("当てる助言を並べていなければ、そう言う（全部当てる口は無い）", () => {
    const io = fakeIo({ "page.yaml": THIN, "picks.json": "[]" });
    expect(runCli(["advise", "page.yaml", "--apply", "picks.json"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("全部当てる口はありません");
  });
});

describe("hatake explain --review", () => {
  const THIN = `page:
  type: crud
  id: order_list
  title: 受注一覧
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
  form:
    sections:
      - fields:
          - { field: orderNo, label: 受注番号, required: true }
  actions:
    - { id: remove, type: delete, label: 削除 }
`;

  it("説明と助言が1枚に出る", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["explain", "page.yaml", "--review"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("受注一覧（order_list）");
    expect(out).toContain("## 書き足したほうがいい所（助言）");
    expect(out).toContain("警告ではありません");
  });

  it("助言があっても終了コードは 0（レビューの紙で CI を落とさない）", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["explain", "page.yaml", "--review"], io)).toBe(0);
  });

  it("--json は説明と助言の両方を持つ", () => {
    const io = fakeIo({ "page.yaml": THIN });
    expect(runCli(["explain", "page.yaml", "--review", "--json"], io)).toBe(0);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.explain.headline).toContain("受注一覧");
    expect(document.advice.length).toBeGreaterThan(0);
  });
});

describe("hatake failures", () => {
  it("実例を「こう書いた → こう言われた → こう直す」で出す", () => {
    const io = fakeIo(failureFiles);
    expect(runCli(["failures", "unknown-repository", "--spec", SPEC], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("なぜそう書くか:");
    expect(out).toContain("道具が言うこと: unknown-repository");
  });

  it("--json は機械可読", () => {
    const io = fakeIo(failureFiles);
    expect(runCli(["failures", "--json", "--spec", SPEC], io)).toBe(0);
    const found = JSON.parse(io.stdout.join("\n"));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].why).toBeTypeOf("string");
  });

  it("当たらなければ終了コード 1", () => {
    const io = fakeIo(failureFiles);
    expect(runCli(["failures", "そんな間違いはない", "--spec", SPEC], io)).toBe(1);
  });
});

describe("hatake registry", () => {
  const MAIN = `
void main() {
  runApp(HatakeApp(
    repositories: RepositoryRegistry({
      'customerRepository': CustomerRepository.seeded(),
      'orderRepository': OrderRepository.seeded(),
    }),
    actions: ActionRegistry({'csvExport': (ctx) async {}}),
  ));
}
`;

  it("実装から一覧を作る", () => {
    const io = fakeIo({ "lib/main.dart": MAIN });
    expect(runCli(["registry", "lib/main.dart", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.repositories).toEqual(["customerRepository", "orderRepository"]);
    expect(result.plugins).toEqual(["csvExport"]);
    expect(result.unreadable).toEqual([]);
  });

  it("--out で validate --registry にそのまま渡せる形を書く", () => {
    const io = fakeIo({ "lib/main.dart": MAIN });
    expect(runCli(["registry", "lib/main.dart", "--out", "reg.json"], io)).toBe(0);
    const written = JSON.parse(io.written["reg.json"]);
    expect(written.$comment).toContain("再生成");
    expect(written.repositories).toEqual([
      "customerRepository",
      "orderRepository",
    ]);
    expect(written.unreadable).toBeUndefined();
  });

  it("ディレクトリを渡すと、走査できる拡張子だけ読む", () => {
    const io = fakeIo({
      "lib/main.dart": MAIN,
      "lib/readme.md": "RepositoryRegistry({'nope': x});",
      "lib/sub/extra.dart": `final a = ActionRegistry({'openPlayground': p});`,
    });
    expect(runCli(["registry", "lib", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.plugins).toEqual(["csvExport", "openPlayground"]);
    expect(result.repositories).not.toContain("nope");
  });

  it("人が読む形では、どこで登録しているかまで出す", () => {
    const io = fakeIo({ "lib/main.dart": MAIN });
    expect(runCli(["registry", "lib/main.dart"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("customerRepository   lib/main.dart:4");
  });

  it("読めない登録があれば終了コード 1 で、どこが読めないか言う", () => {
    const io = fakeIo({
      "lib/main.dart": `final r = RepositoryRegistry(buildRepositories());`,
    });
    expect(runCli(["registry", "lib/main.dart"], io)).toBe(1);
    const err = io.stderr.join("\n");
    expect(err).toContain("不完全");
    expect(err).toContain("lib/main.dart:1");
  });

  it("生成した一覧は、そのまま validate に渡して食い違いを拾える", () => {
    const io = fakeIo({ "lib/main.dart": MAIN });
    runCli(["registry", "lib/main.dart", "--out", "hatake-registry.json"], io);
    const next = fakeIo({
      "page.yaml": GOOD,
      "hatake-registry.json": io.written["hatake-registry.json"],
    });
    // GOOD は customerRepository を使うので、これは通る。
    expect(runCli(["validate", "page.yaml", "--warn-as-error"], next)).toBe(0);
  });

  it("ファイルが要る", () => {
    expect(runCli(["registry"], fakeIo())).toBe(1);
  });
});

describe("hatake refs", () => {
  it("外に要求しているものを種類ごとに並べる", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["refs", "a.yaml", "--json"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.repositories).toEqual(["customerRepository"]);
    expect(result.validators).toEqual(["maxLength"]);
  });

  it("登録が要るものだけに絞れる（組み込みは出ない）", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["refs", "a.yaml", "--json", "--needs-registration"], io)).toBe(0);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.repositories).toEqual(["customerRepository"]);
    // maxLength は組み込みなので「登録が要るもの」には出ない。
    expect(result.validators).toBeUndefined();
  });

  it("人が読む形では、登録が要るものに印を付ける", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["refs", "a.yaml"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("customerRepository   ← 登録が要る");
    expect(out).toContain("maxLength");
    expect(out).not.toContain("maxLength   ←");
  });

  it("ファイルが要る", () => {
    expect(runCli(["refs"], fakeIo())).toBe(1);
  });
});

describe("hatake validate --registry", () => {
  const REGISTRY = JSON.stringify({ repositories: ["orderRepository"] });

  it("渡した一覧に無い名前を警告する", () => {
    const io = fakeIo({ "a.yaml": GOOD, "reg.json": REGISTRY });
    expect(runCli(["validate", "a.yaml", "--registry", "reg.json"], io)).toBe(0);
    const err = io.stderr.join("\n");
    expect(err).toContain("customerRepository");
    expect(err).toContain("データが来ません");
  });

  it("--warn-as-error なら終了コード 1", () => {
    const io = fakeIo({ "a.yaml": GOOD, "reg.json": REGISTRY });
    expect(
      runCli(
        ["validate", "a.yaml", "--registry", "reg.json", "--warn-as-error"],
        io,
      ),
    ).toBe(1);
  });

  it("定義の隣の hatake-registry.json は黙って拾う", () => {
    const io = fakeIo({
      "app/a.yaml": GOOD,
      "app/hatake-registry.json": REGISTRY,
    });
    expect(runCli(["validate", "app/a.yaml"], io)).toBe(0);
    expect(io.stderr.join("\n")).toContain("customerRepository");
  });

  it("一覧が無ければ、外との辻褄は見ない（今までどおり）", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["validate", "a.yaml"], io)).toBe(0);
    expect(io.stderr.join("\n")).toBe("");
  });

  it("--registry を指定したのに読めないのは指定間違いとして落とす", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["validate", "a.yaml", "--registry", "nope.json"], io)).toBe(1);
  });
});

describe("hatake diff（画面・権限・アプリ構成）", () => {
  const WITHOUT_COLUMN = GOOD.replace(
    "      - { field: code, label: コード }",
    "      - { field: name, label: 顧客名 }",
  );

  it("画面の話と契約の話が area で分かれて出る", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": WITHOUT_COLUMN });
    runCli(["diff", "a.yaml", "b.yaml"], io);
    const out = io.stdout.join("\n");
    expect(out).toContain("[ui]");
    expect(out).toContain("[api]");
  });

  it("--api-only なら契約の話だけ", () => {
    const io = fakeIo({ "a.yaml": GOOD, "b.yaml": WITHOUT_COLUMN });
    runCli(["diff", "a.yaml", "b.yaml", "--api-only"], io);
    const out = io.stdout.join("\n");
    expect(out).not.toContain("[ui]");
    expect(out).toContain("[api]");
  });

  it("要確認だけなら終了コード 0、--caution-as-error で 1", () => {
    // 選択肢を減らすのは画面の話だけ（api の形は変わらない）。
    const withOptions = (options: string) =>
      GOOD.replace(
        "          - { field: code, label: コード, required: true, validators: [{ type: maxLength, value: 20 }] }",
        `          - { field: code, label: コード, type: select, options: [${options}] }`,
      );
    const before = withOptions("{ value: a, label: A }, { value: b, label: B }");
    const after = withOptions("{ value: a, label: A }");

    const io = fakeIo({ "a.yaml": before, "b.yaml": after });
    expect(runCli(["diff", "a.yaml", "b.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("△ 要確認");

    const strict = fakeIo({ "a.yaml": before, "b.yaml": after });
    expect(
      runCli(["diff", "a.yaml", "b.yaml", "--caution-as-error"], strict),
    ).toBe(1);
  });
});

describe("hatake types", () => {
  it("writes TypeScript to stdout", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["types", "page.yaml", "--lang", "ts"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("export interface CustomerMasterRequest");
  });

  it("writes one Java file per record, into --out", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(
      runCli(
        ["types", "page.yaml", "--lang", "java", "--package", "io.example.api", "--out", "gen"],
        io,
      ),
    ).toBe(0);
    const names = Object.keys(io.written);
    expect(names).toContain("gen/CustomerMasterRequest.java");
    expect(io.written[names[0]]).toContain("package io.example.api;");
    expect(io.stdout.join("\n")).toContain("書きました: gen/");
  });

  it("needs a language", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["types", "page.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("--lang");
  });
});

describe("hatake new", () => {
  it("every kind scaffolds a definition that parses under strict", () => {
    for (const kind of scaffoldKinds) {
      const yaml = scaffold(kind, { id: `demo_${kind}`, title: "デモ" });
      expect(
        () => parsePageYaml(yaml, { strict: true }),
        `${kind}:\n${yaml}`,
      ).not.toThrow();
    }
  });

  it("derives the repository key from the id", () => {
    const io = fakeIo();
    expect(
      runCli(["new", "search", "--id", "order_search", "--title", "受注照会"], io),
    ).toBe(0);
    expect(io.stdout.join("\n")).toContain("repository: orderRepository");
  });

  it("writes to --out when asked", () => {
    const io = fakeIo();
    runCli(
      ["new", "form", "--id", "x", "--title", "X", "--repository", "xRepo", "--out", "x.yaml"],
      io,
    );
    expect(io.written["x.yaml"]).toContain("repository: xRepo");
  });

  it("explains itself when arguments are missing or the kind is unknown", () => {
    const missing = fakeIo();
    expect(runCli(["new", "form"], missing)).toBe(1);
    expect(missing.stderr.join("")).toContain("--id");

    const unknown = fakeIo();
    expect(
      runCli(["new", "kanban", "--id", "x", "--title", "X"], unknown),
    ).toBe(1);
    expect(unknown.stderr.join("")).toContain("知らないページ種別");
  });
});

// spec/ の場所は実行時に探すが、テストは中身を差し替えたいので --spec で渡す。
const SPEC = "../spec";
const specFiles = {
  [join(SPEC, "hatake-page.schema.json")]: readFileSync(
    "../spec/hatake-page.schema.json",
    "utf8",
  ),
  [join(SPEC, "examples", "index.json")]: readFileSync(
    "../spec/examples/index.json",
    "utf8",
  ),
};

/** 実例カタログつきの spec/（failures と harvest の両方で使う）。 */
const failureFiles = {
  ...specFiles,
  [join(SPEC, "failures.json")]: readFileSync("../spec/failures.json", "utf8"),
};

describe("hatake reference", () => {
  it("prints the whole reference as JSON", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["reference", "--spec", SPEC], io)).toBe(0);
    const reference = JSON.parse(io.stdout.join("\n"));
    expect(reference.pageKinds).toHaveLength(8);
    expect(reference.nodes.column.keys[0].key).toBe("field");
  });

  it("--placeholders は差し込みの一覧（スキーマは読まない）", () => {
    // spec/ を渡していなくても引ける＝差し込みはスキーマではなく、埋める側の取り決め。
    const io = fakeIo();
    expect(runCli(["reference", "--placeholders"], io)).toBe(0);
    const text = io.stdout.join("\n");
    expect(text).toContain("{failedKeys}");
    expect(text).toContain("埋まるのは");
    expect(text).toContain("ここに無いものは埋まりません");

    const asJson = fakeIo();
    expect(runCli(["reference", "--placeholders", "--json"], asJson)).toBe(0);
    const doc = JSON.parse(asJson.stdout.join("\n")) as {
      contexts: { id: string; placeholders: { name: string }[] }[];
    };
    expect(doc.contexts.map((one) => one.id)).toEqual([
      "action-message",
      "validation-message",
      "route-params",
    ]);
  });

  it("looks one name up — which is the point of having an index", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["reference", "rowsPerPage", "--spec", SPEC], io)).toBe(0);
    const found = JSON.parse(io.stdout.join("\n"));
    expect(found.keys[0].node).toBe("report");
    expect(found.keys[0].key.default).toBe(40);
  });

  it("narrows to one page kind", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["reference", "--page-kind", "report", "--spec", SPEC], io)).toBe(0);
    const reference = JSON.parse(io.stdout.join("\n"));
    expect(Object.keys(reference.nodes)).not.toContain("wizardStep");

    const unknown = fakeIo(specFiles);
    expect(
      runCli(["reference", "--page-kind", "kanban", "--spec", SPEC], unknown),
    ).toBe(1);
    expect(unknown.stderr.join("")).toContain("知らないページ種別");
  });

  it("suggests the right name when asked for a typo", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["reference", "rowsPerpage", "--spec", SPEC], io)).toBe(1);
    expect(io.stderr.join("")).toContain("rowsPerPage の間違い？");
  });

  it("writes to --out, which is how spec/reference.json is made", () => {
    const io = fakeIo(specFiles);
    expect(
      runCli(["reference", "--spec", SPEC, "--out", "reference.json"], io),
    ).toBe(0);
    expect(io.written["reference.json"].endsWith("\n")).toBe(true);
    expect(JSON.parse(io.written["reference.json"]).nodes.report).toBeDefined();
  });

  it("says where to point it when spec/ is nowhere to be found", () => {
    const io = fakeIo();
    expect(runCli(["reference", "--spec", "nope"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("--spec");
  });
});

describe("hatake examples", () => {
  it("lists the catalog with what each example is for", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["examples", "--spec", SPEC], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("customer_master.yaml  [crud]  顧客マスタ");
    expect(out).toContain("キー:");
  });

  it("filters by what you are trying to do", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["examples", "帳票", "--spec", SPEC], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("sales_report.yaml");
    expect(io.stdout.join("\n")).not.toContain("customer_master.yaml");
  });

  it("--json for tools, and a miss is an error", () => {
    const io = fakeIo(specFiles);
    expect(runCli(["examples", "小計", "--json", "--spec", SPEC], io)).toBe(0);
    expect(JSON.parse(io.stdout.join("\n"))[0].file).toBe("sales_report.yaml");

    const miss = fakeIo(specFiles);
    expect(runCli(["examples", "ブロックチェーン", "--spec", SPEC], miss)).toBe(1);
  });
});

describe("hatake pitfalls", () => {
  const pitfallFiles = {
    ...specFiles,
    [join(SPEC, "pitfalls.json")]: readFileSync("../spec/pitfalls.json", "utf8"),
  };

  it("なぜ駄目か・直し方・正しい書き方を出す", () => {
    const io = fakeIo(pitfallFiles);
    expect(runCli(["pitfalls", "groupBy", "--spec", SPEC], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("コントロールブレイク");
    expect(out).toContain("sort: { field: customer }");
  });

  it("--lang en で英語、--json で機械可読", () => {
    const en = fakeIo(pitfallFiles);
    runCli(["pitfalls", "groupBy", "--lang", "en", "--spec", SPEC], en);
    expect(en.stdout.join("\n")).toContain("control break");
    // 見出しまで英語にする（英語で引いたのに「なぜ:」が出ると読みにくい）。
    expect(en.stdout.join("\n")).toContain("Why:");
    expect(en.stdout.join("\n")).not.toContain("なぜ:");

    const asJson = fakeIo(pitfallFiles);
    runCli(["pitfalls", "--json", "--spec", SPEC], asJson);
    expect(JSON.parse(asJson.stdout.join("\n")).length).toBeGreaterThan(8);
  });

  it("validate は未知キーからヒントを引く", () => {
    // 「知らないキー form」だけでは直せないので、書ける種別まで教える。
    const io = fakeIo({
      ...pitfallFiles,
      "page.yaml": `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  form: { sections: [] }
`,
    });
    expect(runCli(["validate", "page.yaml", "--spec", SPEC], io)).toBe(1);
    const err = io.stderr.join("\n");
    expect(err).toContain('知らないキー "form"');
    expect(err).toContain("ヒント:");
    expect(err).toContain("crud");
  });

  it("spec/ が無くても検証そのものは成立する（ヒントは出ないだけ）", () => {
    const io = fakeIo({ "page.yaml": WITH_TYPOS });
    expect(runCli(["validate", "page.yaml", "--spec", "nope"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("width の間違い？");
    expect(io.stderr.join("\n")).not.toContain("ヒント:");
  });
});

describe("hatake --help", () => {
  it("lists the commands", () => {
    const io = fakeIo();
    expect(runCli(["--help"], io)).toBe(0);
    const help = io.stdout.join("\n");
    for (const command of [
      "validate",
      "dto",
      "schema",
      "openapi",
      "types",
      "new",
      "reference",
      "examples",
      "pitfalls",
    ]) {
      expect(help).toContain(`hatake ${command}`);
    }
  });

  it("with no arguments it is a usage error", () => {
    const io = fakeIo();
    expect(runCli([], io)).toBe(1);
  });

  it("reports an unknown command", () => {
    const io = fakeIo();
    expect(runCli(["frobnicate"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("知らないコマンド");
  });
});

describe("hatake refs --unused（登録の棚卸し）", () => {
  const APP = `
app:
  id: sales
  title: 受注
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      table:
        columns: [{ field: amount, label: 金額, format: currency }]
`;

  it("登録してあるのに使われていないものを出す", () => {
    const io = fakeIo({
      "app.yaml": APP,
      "reg.json": JSON.stringify({
        repositories: ["orderRepository", "oldStockRepository"],
        plugins: ["csvExport"],
      }),
    });
    expect(runCli(["refs", "app.yaml", "--unused", "--registry", "reg.json"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("oldStockRepository");
    expect(out).toContain("csvExport");
    expect(out).not.toContain("orderRepository\n");
    // 全部渡していないと嘘になる、を必ず書く（この道具で一番やりがちな読み違え）。
    expect(out).toContain("定義を全部渡していないと嘘になります");
  });

  it("全部使われていれば、そう言う", () => {
    const io = fakeIo({
      "app.yaml": APP,
      "reg.json": JSON.stringify({ repositories: ["orderRepository"] }),
    });
    expect(runCli(["refs", "app.yaml", "--unused", "--registry", "reg.json"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("登録はすべて使われています");
  });

  it("登録済みの一覧が無ければ、作り方まで言って落ちる", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["refs", "app.yaml", "--unused"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("hatake registry");
  });

  it("定義の隣の一覧を黙って拾う", () => {
    const io = fakeIo({
      "defs/app.yaml": APP,
      "defs/hatake-registry.json": JSON.stringify({ repositories: ["gone"] }),
    });
    expect(runCli(["refs", "defs/app.yaml", "--unused"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("gone");
  });

  it("--json は機械が読める形（何件の定義と突き合わせたかも返す）", () => {
    const io = fakeIo({
      "app.yaml": APP,
      "reg.json": JSON.stringify({ repositories: ["orderRepository", "gone"] }),
    });
    runCli(["refs", "app.yaml", "--unused", "--registry", "reg.json", "--json"], io);
    expect(JSON.parse(io.stdout.join("\n"))).toEqual({
      files: 1,
      unused: { repositories: ["gone"] },
    });
  });
});

describe("hatake fix --todo（残りを次の1往復に渡す）", () => {
  const MIXED = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: 顧客, witdh: 140 }
      - { field: amount, label: 金額, type: number }
  report:
    groupBy: [{ field: customer, label: 顧客 }]
    totals: [{ field: tax, aggregate: sum }]
`;

  it("そのまま次の指示にできる文を出す", () => {
    const io = fakeIo({ "page.yaml": MIXED });
    // 残っている問題があるので終了コードは 1（fix の既定と同じ）。
    expect(runCli(["fix", "page.yaml", "--todo"], io)).toBe(1);
    const out = io.stdout.join("\n");
    expect(out).toContain("件を直しました");
    expect(out).toContain("[total-without-column]");
    expect(out).toContain("ほかの所は触らないこと");
    // 定義そのものは出さない（指示だけを渡す）。
    expect(out).not.toContain("type: report");
  });

  it("--json には todo が入る（直した分は入っていない）", () => {
    const io = fakeIo({ "page.yaml": MIXED });
    runCli(["fix", "page.yaml", "--todo", "--json"], io);
    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.todo.fixed).toBeGreaterThan(0);
    expect(result.todo.items.map((i: { rule: string }) => i.rule)).toContain(
      "total-without-column",
    );
    expect(result.todo.items.map((i: { rule: string }) => i.rule)).not.toContain(
      "unknown-key:witdh",
    );
  });

  it("--write と組めば、直した分は書いて、残りだけを渡す", () => {
    const io = fakeIo({ "page.yaml": MIXED });
    runCli(["fix", "page.yaml", "--todo", "--write"], io);
    expect(io.written["page.yaml"]).toContain("width: 140");
    expect(io.stdout.join("\n")).toContain("ほかの所は触らないこと");
  });
});

describe("hatake paper（紙を文字で見せる）", () => {
  const REPORT = `page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  table:
    columns:
      - { field: item, label: 品名, width: 200 }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  report:
    rowsPerPage: 30
    totals: [{ field: amount, aggregate: sum }]
`;

  it("行を渡さなくても紙が見える（見本の行を作る）", () => {
    const io = fakeIo({ "r.yaml": REPORT });
    expect(runCli(["paper", "r.yaml"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("の紙 1 枚");
    expect(out).toContain("品名");
    expect(out).toContain("合計");
    // 作った行であることは必ず言う（本物のデータだと読まれたら困る）。
    expect(io.stderr.join("\n")).toContain("行は**見本**です");
  });

  it("行を渡せばその紙になる", () => {
    const io = fakeIo({
      "r.yaml": REPORT,
      "rows.json": JSON.stringify([{ item: "特注品", amount: 12345 }]),
    });
    expect(runCli(["paper", "r.yaml", "--rows", "rows.json"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("特注品");
    expect(out).toContain("¥12,345");
    // 渡した行のときは見本の注記を出さない。
    expect(io.stderr.join("\n")).not.toContain("見本");
  });

  it("--json は紙の上の座標そのもの", () => {
    const io = fakeIo({ "r.yaml": REPORT });
    expect(runCli(["paper", "r.yaml", "--json"], io)).toBe(0);
    const layout = JSON.parse(io.stdout.join("\n"));
    expect(layout.paper).toEqual({ width: 595.28, height: 841.89 });
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0].items[0]).toMatchObject({ kind: "text", bold: true });
  });

  it("桁数を選べる", () => {
    const io = fakeIo({ "r.yaml": REPORT });
    runCli(["paper", "r.yaml", "--columns", "60"], io);
    expect(io.stdout.join("\n")).toContain("60 桁に縮めて表示");
  });

  it("役割を渡すと、その人に見えない列は紙にも出ない", () => {
    const io = fakeIo({
      "r.yaml": REPORT.replace(
        "  report:",
        `      - { field: cost, label: 原価, type: number, roles: [manager] }
  report:`,
      ),
    });
    runCli(["paper", "r.yaml", "--role", "staff"], io);
    expect(io.stdout.join("\n")).not.toContain("原価");
  });

  it("帳票でない定義には、そう言う", () => {
    const io = fakeIo({ "page.yaml": GOOD });
    expect(runCli(["paper", "page.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("帳票（type: report）の定義がありません");
  });

  it("app に帳票が2枚あれば、選ばせる（何が在るかまで言う）", () => {
    const app = `
app:
  id: sales
  title: 受注
  pages:
    - type: report
      id: sales_report
      title: 売上明細表
      repository: orderRepository
      table:
        columns: [{ field: amount, label: 金額, type: number }]
      report: { rowsPerPage: 30 }
    - type: report
      id: stock_report
      title: 在庫表
      repository: stockRepository
      table:
        columns: [{ field: qty, label: 数量, type: number }]
      report: { rowsPerPage: 30 }
`;
    const io = fakeIo({ "app.yaml": app });
    expect(runCli(["paper", "app.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("sales_report / stock_report");
    const chosen = fakeIo({ "app.yaml": app });
    expect(runCli(["paper", "app.yaml", "--page", "stock_report"], chosen)).toBe(0);
    expect(chosen.stdout.join("\n")).toContain("在庫表");
  });
});

describe("hatake wire（アプリ側の配線の下書き）", () => {
  const APP = `app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
      actions:
        - { id: csv, type: export, label: CSV出力 }
`;

  it("標準出力に Dart を出す", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["wire", "app.yaml"], io)).toBe(0);
    const code = io.stdout.join("\n");
    expect(code).toContain("class SalesApp extends StatelessWidget");
    expect(code).toContain("'orderRepository'");
    expect(code).toContain("exportSink:");
    // 何がアプリの担当かは、黙らずに言う。
    expect(io.stderr.join("\n")).toContain("TODO の所はアプリの担当です");
  });

  it("--out でファイルに書く", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["wire", "app.yaml", "--out", "lib/wiring.dart"], io)).toBe(0);
    expect(io.written["lib/wiring.dart"]).toContain("class SalesApp");
    expect(io.stdout.join("\n")).toContain("書きました: lib/wiring.dart");
  });

  it("--base で REST の Repository を組む", () => {
    const io = fakeIo({ "app.yaml": APP });
    runCli(["wire", "app.yaml", "--base", "/api/v2"], io);
    const code = io.stdout.join("\n");
    expect(code).toContain("baseUrl: '/api/v2'");
    expect(code).toContain("'orderRepository': 'orders'");
  });

  it("--class と --assets を渡せる", () => {
    const io = fakeIo({ "app.yaml": APP });
    runCli(
      ["wire", "app.yaml", "--class", "Shell", "--assets", "assets/x.yaml"],
      io,
    );
    const code = io.stdout.join("\n");
    expect(code).toContain("class Shell extends StatelessWidget");
    expect(code).toContain("rootBundle.loadString('assets/x.yaml')");
  });

  it("ファイルを2つ渡したら、そう言う", () => {
    const io = fakeIo({ "a.yaml": APP, "b.yaml": APP });
    expect(runCli(["wire", "a.yaml", "b.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("1つ指定してください");
  });
});

describe("hatake probe / attack", () => {
  const APP = `app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: prices, label: 単価, page: price_master, roles: [admin] }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
    - type: search
      id: price_master
      title: 単価マスタ
      repository: priceRepository
      key: itemCode
      table:
        columns: [{ field: itemCode, label: 品目 }]
`;

  /** 叩かれた URL を覚える偽のサーバ。 */
  const server = (status: Record<string, number> = {}) => {
    const urls: string[] = [];
    return {
      urls,
      send: async (request: { method: string; url: string }) => {
        urls.push(request.url);
        const key = request.url.split("?")[0];
        return {
          status: status[key] ?? 200,
          body: JSON.stringify({ items: [{ orderNo: "SO-1", itemCode: "A-1" }], totalCount: 1 }),
        };
      },
    };
  };

  it("--base が無ければ、なぜ要るかまで言う", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server();
    expect(await runCliAsync(["probe", "app.yaml"], io, send)).toBe(1);
    expect(io.stderr.join("")).toContain("定義は URL を知りません");
  });

  it("宣言どおり返ってくれば 0（叩いたのは GET だけ）", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send, urls } = server();
    expect(
      await runCliAsync(["probe", "app.yaml", "--base", "http://x/api"], io, send),
    ).toBe(0);
    expect(urls).toEqual([
      "http://x/api/orders?page=0&pageSize=50",
      "http://x/api/prices?page=0&pageSize=50",
    ]);
  });

  it("食い違いがあれば 1", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server({ "http://x/api/prices": 404 });
    expect(
      await runCliAsync(["probe", "app.yaml", "--base", "http://x/api"], io, send),
    ).toBe(1);
    expect(io.stdout.join("\n")).toContain("--collection");
  });

  it("--dry-run は1件も叩かない（CI に置ける）", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send, urls } = server();
    expect(
      await runCliAsync(
        ["probe", "app.yaml", "--base", "http://x/api", "--dry-run"],
        io,
        send,
      ),
    ).toBe(0);
    expect(urls).toEqual([]);
    expect(io.stdout.join("\n")).toContain("送っていません");
  });

  it("--page で app の中の1枚だけ叩く", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send, urls } = server();
    await runCliAsync(
      ["probe", "app.yaml", "--base", "http://x/api", "--page", "price_master"],
      io,
      send,
    );
    expect(urls).toEqual(["http://x/api/prices?page=0&pageSize=50"]);
  });

  it("--token は authorization: Bearer になる", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const seen: Record<string, string>[] = [];
    const send = async (request: { method: string; url: string; headers: Record<string, string> }) => {
      seen.push(request.headers);
      return { status: 200, body: JSON.stringify({ items: [], totalCount: 0 }) };
    };
    await runCliAsync(
      ["probe", "app.yaml", "--base", "http://x/api", "--token", "jwt-1"],
      io,
      send,
    );
    expect(seen[0].authorization).toBe("Bearer jwt-1");
  });

  it("--headers はファイルから読む（引数だとログに残る）", async () => {
    const io = fakeIo({
      "app.yaml": APP,
      "h.json": JSON.stringify({ "x-tenant": "acme" }),
    });
    const seen: Record<string, string>[] = [];
    const send = async (request: { method: string; url: string; headers: Record<string, string> }) => {
      seen.push(request.headers);
      return { status: 200, body: JSON.stringify({ items: [], totalCount: 0 }) };
    };
    await runCliAsync(
      ["probe", "app.yaml", "--base", "http://x/api", "--headers", "h.json"],
      io,
      send,
    );
    expect(seen[0]["x-tenant"]).toBe("acme");
  });

  it("attack は --role が要る", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server();
    expect(
      await runCliAsync(["attack", "app.yaml", "--base", "http://x/api"], io, send),
    ).toBe(1);
    expect(io.stderr.join("")).toContain("誰として叩くか");
  });

  it("穴があれば 1（見えない画面が開いている）", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server();
    expect(
      await runCliAsync(
        ["attack", "app.yaml", "--base", "http://x/api", "--role", "staff"],
        io,
        send,
      ),
    ).toBe(1);
    expect(io.stdout.join("\n")).toContain("API が遮断していません");
  });

  it("--all-roles は役割ごとの資格が要る（1つの資格で全部を判定しない）", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server();
    // --accounts が無い。
    expect(
      await runCliAsync(
        ["attack", "app.yaml", "--base", "http://x/api", "--all-roles"],
        io,
        send,
      ),
    ).toBe(1);
    expect(io.stderr.join("")).toContain("--accounts");

    // --token を併用するのは断る（200 が穴なのか正しいのか区別できなくなる）。
    const io2 = fakeIo({ "app.yaml": APP, "a.json": '{"admin":{"token":"t"}}' });
    expect(
      await runCliAsync(
        [
          "attack",
          "app.yaml",
          "--base",
          "http://x/api",
          "--all-roles",
          "--accounts",
          "a.json",
          "--token",
          "t",
        ],
        io2,
        send,
      ),
    ).toBe(1);
    expect(io2.stderr.join("")).toContain("役割ごとに渡します");
  });

  it("--all-roles は役割ぜんぶ＋誰でもない人を1枚の表にする", async () => {
    const io = fakeIo({
      "app.yaml": APP,
      "accounts.json": JSON.stringify({
        $comment: "役割ごとの資格",
        accounts: { admin: { token: "admin-token" }, staff: { token: "staff-token" } },
      }),
    });
    // 単価マスタは誰にでも 200（遮断を忘れた API）。
    const { send, urls } = server();
    expect(
      await runCliAsync(
        [
          "attack",
          "app.yaml",
          "--base",
          "http://x/api",
          "--all-roles",
          "--accounts",
          "accounts.json",
        ],
        io,
        send,
      ),
    ).toBe(1);
    const out = io.stdout.join("\n");
    expect(out).toContain("price_master");
    expect(out).toContain("staff=穴");
    expect(out).toContain("admin=ok");
    expect(out).toContain("誰でもない人=穴");
    // 役割 2 ＋ 誰でもない人 = 3 本 × 2 画面。
    expect(urls).toHaveLength(6);
  });

  it("--all-roles --dry-run は送らずに、何を叩くかを役割ごとに出す", async () => {
    const io = fakeIo({
      "app.yaml": APP,
      "accounts.json": '{"admin":{"token":"t"}}',
    });
    const { send, urls } = server();
    expect(
      await runCliAsync(
        [
          "attack",
          "app.yaml",
          "--base",
          "http://x/api",
          "--all-roles",
          "--accounts",
          "accounts.json",
          "--dry-run",
        ],
        io,
        send,
      ),
    ).toBe(0);
    expect(urls).toEqual([]);
    const out = io.stdout.join("\n");
    expect(out).toContain("admin");
    expect(out).toContain("誰でもない人（資格なし）");
  });

  it("見えない口が拒否されていれば 0", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server({ "http://x/api/prices": 403 });
    expect(
      await runCliAsync(
        ["attack", "app.yaml", "--base", "http://x/api", "--role", "staff"],
        io,
        send,
      ),
    ).toBe(0);
  });

  it("--collection の書き方を間違えたら、形を言う", async () => {
    const io = fakeIo({ "app.yaml": APP });
    const { send } = server();
    expect(
      await runCliAsync(
        ["probe", "app.yaml", "--base", "http://x/api", "--collection", "orders"],
        io,
        send,
      ),
    ).toBe(1);
    expect(io.stderr.join("")).toContain("orderRepository=sales-orders");
  });

  it("同期の入口からは呼べない（通信するので）", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["probe", "app.yaml", "--base", "http://x/api"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("この入口からは呼べません");
  });
});

describe("hatake wire --merge", () => {
  const APP = `app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
      actions:
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
        - { id: reject, type: plugin, plugin: rejectOrders, label: 却下 }
`;

  /** 「承認」だけを繋いだ状態の配線（`却下` は後から増えた）。 */
  const WIRING = [
    "class SalesApp extends StatelessWidget {",
    "  @override",
    "  Widget build(BuildContext context) {",
    "    return HatakeScope(",
    "      repositories: const RepositoryRegistry({",
    "        'orderRepository': _UnwiredRepository('orderRepository'),",
    "      }),",
    "      actions: ActionRegistry({",
    "        'approveOrders': (ctx) async => api.approve(ctx.records),",
    "      }),",
    "      renderer: const MaterialRenderer(),",
    "      child: HatakeApp(app: definition),",
    "    );",
    "  }",
    "}",
    "",
  ].join("\n");

  it("足りない登録だけを足して、既定は標準出力に出す", async () => {
    const io = fakeIo({ "app.yaml": APP, "wiring.dart": WIRING });
    expect(runCli(["wire", "app.yaml", "--merge", "wiring.dart"], io)).toBe(0);

    const out = io.stdout.join("\n");
    expect(out).toContain("'rejectOrders':");
    // 手で書いた中身はそのまま。
    expect(out).toContain("api.approve(ctx.records)");
    // 何をしたかは標準エラー（出力に混ぜない）。
    expect(io.stderr.join("\n")).toContain("足した actions: rejectOrders");
    // ファイルは触らない（--write を付けていない）。
    expect(io.written).toEqual({});
  });

  it("--write で元のファイルを上書きする", () => {
    const io = fakeIo({ "app.yaml": APP, "wiring.dart": WIRING });
    expect(
      runCli(["wire", "app.yaml", "--merge", "wiring.dart", "--write"], io),
    ).toBe(0);

    expect(io.written["wiring.dart"]).toContain("'rejectOrders':");
    expect(io.stdout.join("")).toContain("書きました: wiring.dart");
  });

  it("足すものが無ければ書かない（日付だけが変わるのを避ける）", () => {
    const merged = fakeIo({ "app.yaml": APP, "wiring.dart": WIRING });
    runCli(["wire", "app.yaml", "--merge", "wiring.dart", "--write"], merged);
    const io = fakeIo({
      "app.yaml": APP,
      "wiring.dart": merged.written["wiring.dart"],
    });
    expect(
      runCli(["wire", "app.yaml", "--merge", "wiring.dart", "--write"], io),
    ).toBe(0);

    expect(io.written).toEqual({});
    expect(io.stdout.join("")).toContain("変わりません: wiring.dart");
  });

  it("--json で機械可読（足した・残った・触らなかった）", () => {
    const io = fakeIo({ "app.yaml": APP, "wiring.dart": WIRING });
    runCli(["wire", "app.yaml", "--merge", "wiring.dart", "--json"], io);

    const result = JSON.parse(io.stdout.join("\n"));
    expect(result.added.actions).toEqual(["rejectOrders"]);
    expect(result.code).toContain("'rejectOrders':");
  });

  it("配線ではないものを渡されたら、何もせず理由を言う", () => {
    const io = fakeIo({ "app.yaml": APP, "x.dart": "void main() {}\n" });
    expect(runCli(["wire", "app.yaml", "--merge", "x.dart"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("足す場所が決められません");
    expect(io.written).toEqual({});
  });
});

describe("explain --diff --if-changed", () => {
  const BEFORE = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
`;
  // 並べ替えただけ（見え方は変わらない）。
  const REORDERED = `page:
  id: order_search
  type: search
  repository: orderRepository
  key: orderNo
  title: 受注照会
  table:
    columns: [{ label: 受注番号, field: orderNo }]
`;
  const CHANGED = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額, type: number }
`;

  it("変わっていなければ何も出さない（PR に貼らないため）", () => {
    const io = fakeIo({ "a.yaml": BEFORE, "b.yaml": REORDERED });
    expect(
      runCli(["explain", "--diff", "a.yaml", "b.yaml", "--if-changed"], io),
    ).toBe(0);
    expect(io.stdout).toEqual([]);
  });

  it("変わっていれば普通に出す", () => {
    const io = fakeIo({ "a.yaml": BEFORE, "b.yaml": CHANGED });
    expect(
      runCli(
        ["explain", "--diff", "a.yaml", "b.yaml", "--if-changed", "--markdown"],
        io,
      ),
    ).toBe(0);
    expect(io.stdout.join("\n")).toContain("金額");
  });

  it("旗を付けなければ「変わりません」と言う（既定は黙らない）", () => {
    const io = fakeIo({ "a.yaml": BEFORE, "b.yaml": REORDERED });
    expect(runCli(["explain", "--diff", "a.yaml", "b.yaml"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("変わりません");
  });
});

describe("hatake explain --roles", () => {
  const APP = `app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: costs, label: 原価, page: order_search, roles: [manager] }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      search:
        filters: [{ field: orderNo, label: 受注番号 }]
      table:
        columns: [{ field: orderNo, label: 受注番号, sortable: true }]
      actions:
        - { id: exportCsv, type: export, label: CSV 出力, roles: [manager, admin] }
`;

  it("出てくる役割と、書いてある場所を出す", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["explain", "app.yaml", "--roles"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("販売管理（sales）");
    expect(out).toContain("manager … 2 か所");
    expect(out).toContain("app.pages[0].actions[0].roles");
    expect(out).toContain("アプリ側の権限判定");
  });

  it("--json は機械可読（AI に役割名を渡す口）", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["explain", "app.yaml", "--roles", "--json"], io)).toBe(0);
    const inventory = JSON.parse(io.stdout.join("\n")) as {
      role: string;
      spots: { where: string }[];
    }[];
    expect(inventory.map((one) => one.role)).toEqual(["manager", "admin"]);
  });

  it("--page では絞れないと言う（黙って無視しない）", () => {
    const io = fakeIo({ "app.yaml": APP });
    expect(runCli(["explain", "app.yaml", "--roles", "--page", "order_search"], io)).toBe(1);
    expect(io.stderr.join("\n")).toContain("定義全体で数えます");
  });

  it("1つも書いていなければ、そう言う（読むための道具なので 0 を返す）", () => {
    const io = fakeIo({
      "page.yaml": `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  search:
    filters: [{ field: orderNo, label: 受注番号 }]
  table:
    columns: [{ field: orderNo, label: 受注番号, sortable: true }]
`,
    });
    expect(runCli(["explain", "page.yaml", "--roles"], io)).toBe(0);
    expect(io.stdout.join("\n")).toContain("全部の人に全部見えます");
  });
});
