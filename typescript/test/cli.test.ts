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
