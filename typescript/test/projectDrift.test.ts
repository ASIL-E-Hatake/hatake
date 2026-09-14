import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  compareDrift,
  DRIFT_DIFF_NOTE,
  DRIFT_NOTE,
  driftDiffLines,
  driftDraft,
  driftLines,
  parseDriftReport,
  findDrift,
  namedSpots,
  parseProject,
} from "../src/index.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 用語の揺れ（`hatake project --drift`）。
 *
 * 数字と場所を出す道具なので、守るのは3つ:
 *   ・**場所が嘘をつかない**（出した道を辿ると、本当にその字に行き当たる）
 *   ・**辞書を作らない**（どちらが正しいかは言わない＝業務の言葉は人が決める）
 *   ・**決着済みは出さない**（辞書に載せたら、次から静かになる）
 */
type Dict = Record<string, unknown>;

const doc = (source: string): Dict => parseYaml(source) as Dict;

const DEFINITION = `app:
  id: demo
  title: デモ
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: r
      key: orderNo
      search:
        filters:
          - { field: customer, label: 顧客名 }
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: customer, label: 顧客 }
          - { field: amount, label: 金額 }
    - type: search
      id: salary_search
      title: 給与照会
      repository: r
      key: id
      table:
        columns:
          - { field: id, label: 受注番号 }
          - { field: amount, label: 支給額 }
`;

const bare = () =>
  parseProject(`project_version: "1.0"
system:
  what: 試験用。
`);

/** 道を辿る（道具とは別の実装で辿る）。 */
function valueAt(node: unknown, path: string): unknown {
  let here: unknown = node;
  for (const step of path.split(".")) {
    const name = step.replace(/\[\d+\]/g, "");
    if (name !== "") {
      if (typeof here !== "object" || here === null) return undefined;
      here = (here as Dict)[name];
    }
    for (const index of step.matchAll(/\[(\d+)\]/g)) {
      if (!Array.isArray(here)) return undefined;
      here = here[Number(index[1])];
    }
  }
  return here;
}

const fakeIo = (files: Record<string, string>) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo & { stdout: string[]; stderr: string[] } = {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => files[path] ?? readFileSync(path, "utf8"),
    writeFile: () => {},
    listFiles: () => null,
  };
  return io;
};

describe("用語の揺れを数える", () => {
  it("同じ項目名に違う言葉が付いていれば言う", () => {
    const found = findDrift(bare(), [doc(DEFINITION)]);
    const labels = found.filter((one) => one.kind === "labels");
    expect(labels.map((one) => one.name).sort()).toEqual(["amount", "customer"]);
  });

  it("同じ言葉が違う項目名に付いていても言う（逆向きも見る）", () => {
    const found = findDrift(bare(), [doc(DEFINITION)]);
    const fields = found.filter((one) => one.kind === "fields");
    expect(fields.map((one) => one.name)).toEqual(["受注番号"]);
  });

  it("揺れていないものは出さない（1種類しか呼び方が無い）", () => {
    const found = findDrift(bare(), [doc(DEFINITION)]);
    expect(found.map((one) => one.name)).not.toContain("orderNo");
  });

  it("**辞書に載せたら静かになる**（決着済みは見ない）", () => {
    const settled = parseProject(`project_version: "1.0"
system:
  what: 試験用。
glossary:
  - term: 顧客
    field: customer
`);
    const found = findDrift(settled, [doc(DEFINITION)]);
    expect(found.map((one) => one.name)).not.toContain("customer");
    expect(found.map((one) => one.name)).not.toContain("顧客");
    // 決めていない方は残る。
    expect(found.map((one) => one.name)).toContain("amount");
  });

  it("**出した道を辿ると、本当にその字に行き当たる**", () => {
    const document = doc(DEFINITION);
    for (const one of findDrift(bare(), [document])) {
      for (const spot of one.spots) {
        expect(valueAt(document, spot.path), spot.path).toBe(spot.label);
      }
    }
  });

  it("明細（subTable）の中の名前も読む（そこで揺れることが多い）", () => {
    const spots = namedSpots([
      doc(`page:
  type: form
  id: order_entry
  title: 受注入力
  repository: r
  key: id
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            columns:
              - { field: price, label: 単価 }
            fields:
              - { field: price, label: 売価 }
`),
    ]);
    expect(spots.map((one) => one.label)).toContain("単価");
    expect(spots.map((one) => one.label)).toContain("売価");
  });
});

describe("言い方", () => {
  it("同じ呼び方は1行にまとめて、何か所かを言う", () => {
    const text = driftLines(findDrift(bare(), [doc(DEFINITION)]), 8).join("\n");
    expect(text).toContain("・金額（1か所。最初: order_search:");
    expect(text).toContain("・支給額（1か所。最初: salary_search:");
  });

  it("**どちらが正しいかは言わない**（辞書も作らない）", () => {
    const text = driftLines(findDrift(bare(), [doc(DEFINITION)]), 8).join("\n");
    expect(text).toContain(DRIFT_NOTE);
    expect(text).toContain("どちらの言葉が正しいかは言いません");
    expect(text).toContain("前書きを書き換えません");
  });

  it("揺れが無ければ、読んだ件数を言って終わる", () => {
    const text = driftLines([], 12).join("\n");
    expect(text).toContain("見つかりませんでした（項目とラベルの対を 12 件");
  });
});

describe("hatake project --drift", () => {
  it("揺れが在っても落とさない（直すかは業務の判断）", () => {
    const io = fakeIo({
      "pre.yaml": `project_version: "1.0"\nsystem:\n  what: 試験用。\n`,
      "def.yaml": DEFINITION,
    });
    expect(runCli(["project", "pre.yaml", "--drift", "def.yaml"], io)).toBe(0);
    expect(io.stdout.join(String.fromCharCode(10))).toContain("揺れている所が");
  });

  it("定義を渡さなければ、そう言う", () => {
    const io = fakeIo({
      "pre.yaml": `project_version: "1.0"\nsystem:\n  what: 試験用。\n`,
    });
    expect(runCli(["project", "pre.yaml", "--drift"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain("定義を指定して");
  });
});

/** 決めごとに反した定義（画面 id が snake_case ではない）。 */
const ROTTEN = `page:
  type: search
  id: badName
  title: X
  repository: r
  table:
    columns:
      - { field: code, label: コード, sortable: true }
`;

const STRICT_PRE = `project_version: "1.0"
system:
  what: 試験用。
naming:
  page: snake_case
`;

describe("案件が決めたときだけ落とす（--project-as-error）", () => {
  const files = { "pre.yaml": STRICT_PRE, "def.yaml": ROTTEN };

  it("**既定では絶対に落ちない**（助言を勝手に落とすと、警告まで読まれなくなる）", () => {
    const io = fakeIo(files);
    expect(runCli(["advise", "def.yaml", "--project", "pre.yaml"], io)).toBe(0);
    expect(io.stdout.join(String.fromCharCode(10))).toContain("project-name-shape");
  });

  it("旗を渡したときだけ 1（決めるのは案件の側）", () => {
    const io = fakeIo(files);
    expect(
      runCli(
        ["advise", "def.yaml", "--project", "pre.yaml", "--project-as-error"],
        io,
      ),
    ).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain(
      "--project-as-error を渡したので落としました",
    );
  });

  it("**組み込みの助言では落ちない**（落ちるのは project- だけ）", () => {
    // 決めごとに合っている定義。組み込みの助言（絞り込みが無い等）は出るが、落ちない。
    const clean = {
      "pre.yaml": STRICT_PRE,
      "def.yaml": ROTTEN.replace("id: badName", "id: good_name"),
    };
    const io = fakeIo(clean);
    expect(
      runCli(
        ["advise", "def.yaml", "--project", "pre.yaml", "--project-as-error"],
        io,
      ),
    ).toBe(0);
  });

  it("--json でも同じ終わり方（機械に渡しても答えが変わらない）", () => {
    const io = fakeIo(files);
    expect(
      runCli(
        [
          "advise",
          "def.yaml",
          "--project",
          "pre.yaml",
          "--project-as-error",
          "--json",
        ],
        io,
      ),
    ).toBe(1);
    const parsed = JSON.parse(io.stdout.join("")) as { rule: string }[];
    expect(parsed.some((one) => one.rule.startsWith("project-"))).toBe(true);
  });
});

describe("揺れを辞書の下書きにする", () => {
  const draft = () => driftDraft(findDrift(bare(), [doc(DEFINITION)]));

  it("**貼れる形**で出す（前書きに貼ると読める）", () => {
    // 下書きは glossary の断片なので、前書きに貼って読めることを確かめる。
    const pasted = `project_version: "1.0"
system:
  what: 試験用。
${draft()}
`;
    const project = parseProject(pasted);
    expect(project.glossary.length).toBeGreaterThan(0);
    const amount = project.glossary.find((one) => one.field === "amount");
    expect(amount?.term).toBe("金額");
    expect(amount?.avoid).toEqual(["支給額"]);
  });

  it("term は**仮**だと書く（多いだけで、正しいという意味ではない）", () => {
    const text = draft();
    expect(text).toContain("正しいという意味ではありません");
    expect(text).toContain("仮。");
    expect(text).toContain("書き込みません");
  });

  it("避ける言葉に、選んだ言葉は入らない", () => {
    const project = parseProject(`project_version: "1.0"
system:
  what: 試験用。
${draft()}
`);
    for (const entry of project.glossary) {
      expect(entry.avoid, entry.term).not.toContain(entry.term);
    }
  });

  it("同じ言葉が違う項目名に付いている側は、下書きにしない（辞書では直らない）", () => {
    const text = draft();
    // 「受注番号」は orderNo と id の両方に付いているが、glossary の項目にはしない。
    expect(text).toContain("辞書では直りません");
    const pasted = parseProject(`project_version: "1.0"
system:
  what: 試験用。
${text}
`);
    expect(pasted.glossary.map((one) => one.term)).not.toContain("受注番号");
  });

  it("揺れが無ければ、無いと書く（空の glossary を作らない）", () => {
    const text = driftDraft([]);
    expect(text).toContain("ありませんでした");
    expect(() =>
      parseProject(`project_version: "1.0"
system:
  what: 試験用。
${text}
`),
    ).not.toThrow();
  });
});

describe("揺れの移り変わり", () => {
  const before = () => findDrift(bare(), [doc(DEFINITION)]);
  const after = () =>
    findDrift(bare(), [
      doc(
        DEFINITION.replace(
          "          - { field: amount, label: 支給額 }",
          "          - { field: amount, label: 支給額 }\n          - { field: memo, label: 備考 }",
        ).replace(
          "          - { field: customer, label: 顧客 }",
          "          - { field: customer, label: 顧客 }\n          - { field: memo, label: メモ }",
        ),
      ),
    ]);

  it("増えた揺れを出す（新しい画面を足した回に効く）", () => {
    const diff = compareDrift(before(), after());
    expect(diff.added.map((one) => one.name)).toContain("memo");
    expect(diff.gone).toEqual([]);
    expect(diff.same).toBeGreaterThan(0);
  });

  it("消えた揺れを「直した」と言わない（画面を消しただけかもしれない）", () => {
    const diff = compareDrift(after(), before());
    expect(diff.gone.map((one) => one.name)).toContain("memo");
    const text = driftDiffLines(diff).join(String.fromCharCode(10));
    expect(text).toContain(DRIFT_DIFF_NOTE);
    expect(text).toContain("「直した」とは限りません");
  });

  it("増えていなければ、そう言う", () => {
    const text = driftDiffLines(compareDrift(before(), before())).join(
      String.fromCharCode(10),
    );
    expect(text).toContain("増えた揺れはありません");
  });

  it("読めない紙は**落とす**（黙って空と比べると「全部増えた」と出る）", () => {
    expect(() => parseDriftReport({ なんか: 1 })).toThrow(/読めません/);
    expect(() => parseDriftReport({ drift: [{ kind: "nope", name: "x" }] })).toThrow(
      /読めません/,
    );
    // 自分の出力は読める（往復できる）。
    expect(() =>
      parseDriftReport(JSON.parse(JSON.stringify({ drift: before() }))),
    ).not.toThrow();
  });

  it("CLI から前回を渡すと、移り変わりが出る", () => {
    const io1 = fakeIo({
      "pre.yaml": `project_version: "1.0"\nsystem:\n  what: 試験用。\n`,
      "def.yaml": DEFINITION,
    });
    expect(
      runCli(["project", "pre.yaml", "--drift", "def.yaml", "--json"], io1),
    ).toBe(0);
    const io2 = fakeIo({
      "pre.yaml": `project_version: "1.0"\nsystem:\n  what: 試験用。\n`,
      "def.yaml": DEFINITION,
      "before.json": io1.stdout.join(""),
    });
    expect(
      runCli(
        ["project", "pre.yaml", "--drift", "def.yaml", "--since", "before.json"],
        io2,
      ),
    ).toBe(0);
    expect(io2.stdout.join(String.fromCharCode(10))).toContain("増えた揺れはありません");
  });
});
