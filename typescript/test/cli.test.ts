import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, runCli, type CliIo } from "../src/cli.js";
import { parsePageYaml, scaffold, scaffoldKinds } from "../src/index.js";

/** Collects what the CLI wrote, and serves files from memory. */
function fakeIo(files: Record<string, string> = {}): CliIo & {
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

  it("2ファイル要る", () => {
    const io = fakeIo({ "a.yaml": GOOD });
    expect(runCli(["explain", "--diff", "a.yaml"], io)).toBe(1);
    expect(io.stderr.join("")).toContain("2つ指定");
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
