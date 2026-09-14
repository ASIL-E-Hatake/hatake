import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  answeredBy,
  askQuestions,
  checkQuestionAreas,
  factsOf,
  parseProject,
  mergeQuestionKinds,
  parseQuestionKinds,
  parseResponsibility,
  QUESTION_TRIGGERS,
  questionKindLines,
  questionLines,
  type QuestionKind,
} from "../src/index.js";
import { runCli } from "../src/cli.js";

/**
 * 問い返し（`spec/question-kinds.json`）。
 *
 * この道具の値打ちは**聞く相手が人だ**ということに全部ある。なので守るのは3つ:
 *   ・**定義に書けることを問わない**（書けるなら助言の担当＝同じことを2か所で言わない）
 *   ・**思いついたことを聞かない**（問いは必ず定義の事実から出る）
 *   ・**答えたら消える**（消えない問いは、穴の在り処が間違っている）
 */
const kinds = () =>
  parseQuestionKinds(
    JSON.parse(readFileSync("../spec/question-kinds.json", "utf8")),
  );

const areas = () =>
  parseResponsibility(
    JSON.parse(readFileSync("../spec/responsibility.json", "utf8")),
  );

type Dict = Record<string, unknown>;

const doc = (source: string): Dict => parseYaml(source) as Dict;

/**
 * 引き金を9つ全部踏む定義。**表にある問いが全部ここで出る**ことを確かめる相手で、
 * 出ない問いが1つでもあれば「表に在るのに誰も聞けない問い」＝死んだ行になる。
 * 帳票は保存できる画面と同居しないので、2枚の app にしてある。
 */
const EVERYTHING = `app:
  id: demo
  title: デモ
  pages:
    - type: crud
      id: order_entry
      title: 受注入力
      repository: orderRepository
      key: orderNo
      table:
        rowActions: [edit, delete]
        columns:
          - { field: orderNo, label: 受注番号, sortable: true }
          - { field: unitPrice, label: 単価, type: number, roles: [manager] }
      form:
        sections:
          - fields:
              - { field: orderNo, label: 受注番号, required: true }
              - { field: quantity, label: 数量, type: number }
              - field: lineTotal
                label: 明細金額
                type: number
                computed: { op: product, fields: [unitPrice, quantity] }
              - field: note
                label: 備考
                readOnlyWhen: { field: closed, operator: equals, value: true }
      actions:
        - { id: create, type: create, label: 新規登録 }
        - { id: remove, type: delete, label: 削除 }
        - id: approve
          type: plugin
          plugin: approveOrders
          label: まとめて承認
          scope: selection
    - type: report
      id: sales_report
      title: 売上明細表
      repository: orderRepository
      table:
        columns:
          - { field: orderNo, label: 受注番号, width: 120 }
      report:
        paper: { size: A4, orientation: portrait }
        totals:
          - { field: amount, aggregate: sum }
`;

/** 読むだけの画面（問いが1つも出ない形）。 */
/** 改行（原本に `\n` を直接書くと、貼る道具で潰れることがあるので組み立てる）。 */
const BREAK = String.fromCharCode(10);

/** 排他の問いに答えた前書き。 */
const ANSWERED_CONCURRENCY = `project_version: "1.0"
system:
  what: 試験用。
logic:
  - what: 受注は更新日時で弾く
    where: server
    answers: [concurrency]
`;

/** 在りもしない問いに答えたと書いた前書き（辻褄が合わない形）。 */
const ANSWERED_NOTHING = `project_version: "1.0"
system:
  what: 試験用。
logic:
  - what: 何かを決めた
    where: server
    answers: [no-such-question]
`;

const READ_ONLY = `page:
  type: search
  id: product_search
  title: 商品検索
  repository: productRepository
  key: code
  search:
    filters:
      - { field: code, label: コード, operator: contains }
  table:
    columns:
      - { field: code, label: コード, sortable: true }
`;

const ask = (source: string, project?: string) => {
  const preamble = project === undefined ? undefined : parseProject(project);
  const catalog = areas();
  const table = mergeQuestionKinds(kinds(), preamble?.questions.ask ?? []);
  checkQuestionAreas(table, catalog);
  const answers = answeredBy(preamble, table, catalog);
  return {
    table,
    answers,
    questions: askQuestions(doc(source), table, catalog, {
      answered: answers.answered,
      decided: answers.decided,
    }),
  };
};

const ids = (source: string, project?: string) =>
  ask(source, project).questions.map((one) => one.kind.id);

describe("問いの表を読む", () => {
  it("同梱の表が読める（段は2つに収まっている）", () => {
    const table = kinds();
    expect(table.length).toBeGreaterThan(5);
    for (const kind of table) {
      expect(["must", "should"]).toContain(kind.step);
      expect(QUESTION_TRIGGERS).toContain(kind.trigger);
    }
  });

  it("知らない引き金はエラー（拾えない事実で聞こうとしていることになる）", () => {
    expect(() =>
      parseQuestionKinds({
        kinds: [{ ...kinds()[0], trigger: "whenever" }],
      }),
    ).toThrow(/引き金はありません/);
  });

  it("誰も使っていない引き金もエラー（拾うだけで聞かない事実を残さない）", () => {
    const one = kinds()[0];
    expect(() => parseQuestionKinds({ kinds: [one] })).toThrow(
      /使っていない引き金/,
    );
  });

  it("印が2回出てきたらエラー", () => {
    const table = kinds();
    expect(() =>
      parseQuestionKinds({ kinds: [...table, table[0]] }),
    ).toThrow(/2回出てきます/);
  });
});

describe("定義に書けることは問わない", () => {
  it("同梱の表は、担当が全部「サーバ」か「枠組みの外」", () => {
    const catalog = areas();
    const where = new Map(catalog.areas.map((area) => [area.id, area.where]));
    for (const kind of kinds()) {
      expect(["server", "outside"], kind.id).toContain(where.get(kind.area));
    }
    expect(() => checkQuestionAreas(kinds(), catalog)).not.toThrow();
  });

  it("定義で書ける担当を問いにしたら落ちる（助言と2か所で言わないため）", () => {
    const kind: QuestionKind = { ...kinds()[0], area: "screen-list" };
    expect(() => checkQuestionAreas([kind], areas())).toThrow(
      /問いではなく助言/,
    );
  });

  it("担当の表に無い項目を指していたら落ちる", () => {
    const kind: QuestionKind = { ...kinds()[0], area: "no-such-area" };
    expect(() => checkQuestionAreas([kind], areas())).toThrow(
      /という項目がありません/,
    );
  });
});

describe("問いは定義の事実から出る", () => {
  it("表にある問いは全部この定義で出る（聞けない問いを表に残さない）", () => {
    expect(ids(EVERYTHING).sort()).toEqual(
      kinds()
        .map((kind) => kind.id)
        .sort(),
    );
  });

  it("引き金は9つ全部踏んでいる（拾い漏れている事実が無い）", () => {
    const fired = new Set(factsOf(doc(EVERYTHING)).map((fact) => fact.trigger));
    expect([...fired].sort()).toEqual([...QUESTION_TRIGGERS].sort());
  });

  it("読むだけの画面では1つも聞かない（聞くことが無いなら黙る）", () => {
    expect(ids(READ_ONLY)).toEqual([]);
    expect(questionLines(ask(READ_ONLY).questions, { total: 12 })[0]).toContain(
      "見つかりませんでした",
    );
  });

  it("何を見て聞いたかを画面つきで言う（心当たりのある人が答えられる）", () => {
    const found = ask(EVERYTHING).questions.find(
      (one) => one.kind.id === "rounding",
    );
    expect(found?.facts.map((fact) => fact.page)).toContain("order_entry");
    expect(found?.facts[0].saw).toContain("product");
  });

  it("必ず決めることが先に出る（読む順は段のとおり）", () => {
    const steps = ask(EVERYTHING).questions.map((one) => one.kind.step);
    expect(steps.indexOf("must")).toBeLessThan(steps.indexOf("should"));
  });

  it("見ていない所を毎回言う（出なかった＝決まっている、にしない）", () => {
    const text = questionLines(ask(EVERYTHING).questions, {
      total: kinds().length,
    }).join("\n");
    expect(text).toContain("出なかった＝決まっている、ではありません");
    expect(text).toContain("終了コードは変えません");
  });
});

describe("答えたら消える", () => {
  /** その問いに答えた前書き（担当は表の区分に合わせる）。 */
  const answering = (kind: QuestionKind): string => {
    const where = new Map(areas().areas.map((area) => [area.id, area.where]));
    const at = where.get(kind.area);
    return `project_version: "1.0"
system:
  what: 試験用。
logic:
  - what: ${kind.id} はこう決めた
    where: ${at}
    name: rule_${kind.id.replace(/-/g, "_")}
    why: 試験のための理由
    answers: [${kind.id}]
`;
  };

  it("表にある問いは、1つずつ答えれば1つずつ消える", () => {
    for (const kind of kinds()) {
      const before = ids(EVERYTHING);
      const after = ids(EVERYTHING, answering(kind));
      expect(before, kind.id).toContain(kind.id);
      expect(after, kind.id).not.toContain(kind.id);
      expect(after.length, kind.id).toBe(before.length - 1);
    }
  });

  it("知らない印を書いたら言う（答えたつもりで答えていないのを黙らない）", () => {
    const project = `project_version: "1.0"
system:
  what: 試験用。
logic:
  - what: 何かを決めた
    where: server
    answers: [no-such-question]
`;
    const found = ask(EVERYTHING, project);
    expect(found.answers.problems.join("")).toContain("no-such-question");
    expect(found.answers.answered.size).toBe(0);
  });

  it("担当が食い違う答えは受け取らない（区分が違うなら答えになっていない）", () => {
    const project = `project_version: "1.0"
system:
  what: 試験用。
logic:
  - what: 排他は画面で書くことにした
    where: definition
    answers: [concurrency]
`;
    const found = ask(EVERYTHING, project);
    expect(found.answers.problems.join("")).toContain("concurrency");
    expect(ids(EVERYTHING, project)).toContain("concurrency");
  });
});

describe("表そのものを引く", () => {
  it("定義が無くても全種類が読める（書く前に何を聞かれるか分かる）", () => {
    const text = questionKindLines(kinds(), areas()).join("\n");
    for (const kind of kinds()) {
      expect(text, kind.id).toContain(`[${kind.id}]`);
      expect(text, kind.id).toContain(kind.trigger);
    }
    expect(text).toContain("出なかった＝決まっている、ではありません");
  });
});

/**
 * 記憶の中の定義と、本物の `spec/` を混ぜて読む入れ物。表は同梱のものを読みたいが、
 * 定義と前書きは試験の中で作りたいので。
 */
const fakeIo = (files: Record<string, string>) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text: string) => stdout.push(text),
    err: (text: string) => stderr.push(text),
    readFile: (path: string) => files[path] ?? readFileSync(path, "utf8"),
    writeFile: () => {},
    listFiles: () => null,
  };
};

const said = (lines: string[]): string => lines.join(BREAK);

describe("hatake ask（問い返しの口）", () => {
  it("問いが出ても終了コードは 0（問いは人への依頼で、機械の合否ではない）", () => {
    const io = fakeIo({ "page.yaml": EVERYTHING });
    expect(runCli(["ask", "page.yaml"], io)).toBe(0);
    expect(said(io.stdout)).toContain("決めてください");
    expect(said(io.stdout)).toContain("必ず決めること");
  });

  it("--kinds は定義が無くても表を出す（書く前に、何を聞かれるか分かる）", () => {
    const io = fakeIo({});
    expect(runCli(["ask", "--kinds"], io)).toBe(0);
    expect(said(io.stdout)).toContain("[concurrency]");
  });

  it("定義も --kinds も無ければ、そう言う", () => {
    const io = fakeIo({});
    expect(runCli(["ask"], io)).toBe(1);
    expect(said(io.stderr)).toContain("--kinds");
  });

  it("隣の前書きを読む（渡さなくても答えが効く）", () => {
    const io = fakeIo({
      "near/page.yaml": EVERYTHING,
      "near/hatake.project.yaml": ANSWERED_CONCURRENCY,
    });
    expect(runCli(["ask", "near/page.yaml"], io)).toBe(0);
    expect(said(io.stdout)).not.toContain("[concurrency]");
    expect(said(io.stdout)).toContain("答えが済んでいるもの 1件");
  });

  it("答えの辻褄が合っていなければ落とす（ここだけは事実の間違い）", () => {
    const io = fakeIo({ "page.yaml": EVERYTHING, "pre.yaml": ANSWERED_NOTHING });
    expect(runCli(["ask", "page.yaml", "--project", "pre.yaml"], io)).toBe(1);
    expect(said(io.stderr)).toContain("no-such-question");
  });
});

/** 案件が足した問い（保存できる画面で必ず聞く）。 */
const PROJECT_ASKS = `project_version: "1.0"
system:
  what: 試験用。
questions:
  ask:
    - id: retention
      step: must
      where: outside
      trigger: saves
      ask: この画面で入れたものは何年残しますか。
      why: 保存期間は業務と法律の決めごとで、定義には書けない。
      ifNot: 消してよいものが分からず、誰も消せなくなる。
      answer: logic に1行（what 受注は7年保存 / where outside）。
`;

describe("案件ごとの問いを足せる", () => {
  it("足した問いが、組み込みと一緒に出る（案件の決めごとだと分かる印つき）", () => {
    const found = ask(EVERYTHING, PROJECT_ASKS);
    const mine = found.questions.find((one) => one.kind.id === "retention");
    expect(mine?.kind.from).toBe("project");
    expect(mine?.where).toBe("outside");
    expect(mine?.facts[0].trigger).toBe("saves");
    expect(found.questions.length).toBe(kinds().length + 1);
  });

  it("読む人には「この案件の決めごと」と見える（組み込みと混ぜない）", () => {
    const found = ask(EVERYTHING, PROJECT_ASKS);
    const text = said(
      questionLines(found.questions, {
        total: found.table.length,
        fromProject: 1,
      }),
    );
    expect(text).toContain("[retention]（この案件の決めごと）");
    expect(text).toContain("うち 1 件はこの案件の決めごと");
  });

  it("定義で書けることは案件でも問いにできない（助言の担当）", () => {
    const rotten = PROJECT_ASKS.replace("where: outside", "where: definition");
    expect(() => parseProject(rotten)).toThrow(/問いではなく助言/);
  });

  it("引き金は組み込みと同じ閉じた集合（案件の紙にだけ緩い形は書けない）", () => {
    const rotten = PROJECT_ASKS.replace("trigger: saves", "trigger: whenever");
    expect(() => parseProject(rotten)).toThrow(/という引き金はありません/);
  });

  it("組み込みと同じ印は使えない（答えがどちらに対するものか分からなくなる）", () => {
    const clash = PROJECT_ASKS.replace("id: retention", "id: concurrency");
    expect(() =>
      mergeQuestionKinds(kinds(), parseProject(clash).questions.ask),
    ).toThrow(/組み込みの印と同じ/);
  });
});

describe("既定のままでよいと決めたら、もう聞かない", () => {
  const decided = (id: string, extra = "") => `project_version: "1.0"
system:
  what: 試験用。
questions:
  decided:
    - id: ${id}
      why: 後工程は同じ画面を見るので要らない
      date: "2026-09-14"
${extra}`;

  it("決めた問いは出ない（答えとは別の道で消える）", () => {
    const before = ids(EVERYTHING);
    const after = ids(EVERYTHING, decided("notify"));
    expect(before).toContain("notify");
    expect(after).not.toContain("notify");
    expect(after.length).toBe(before.length - 1);
  });

  it("決めた件数は必ず出す（黙って消すと「聞かれなかった」と区別が付かない）", () => {
    const found = ask(EVERYTHING, decided("notify"));
    const text = said(
      questionLines(found.questions, {
        total: found.table.length,
        decided: found.answers.decided,
      }),
    );
    expect(text).toContain("既定のままでよいと決めたもの 1件");
  });

  it("理由は必須（なぜ聞かれなくなったのかが消えると、後から直せない）", () => {
    const rotten = `project_version: "1.0"
system:
  what: 試験用。
questions:
  decided:
    - id: notify
`;
    expect(() => parseProject(rotten)).toThrow(/why/);
  });

  it("知らない印は黙って捨てない", () => {
    const found = ask(EVERYTHING, decided("no-such-question"));
    expect(found.answers.problems.join("")).toContain("no-such-question");
    expect(found.answers.decided.size).toBe(0);
  });

  it("答えと「決めた」を両方書いたら言う（どちらが本当か分からない）", () => {
    const both = `project_version: "1.0"
system:
  what: 試験用。
logic:
  - what: 受注は更新日時で弾く
    where: server
    answers: [concurrency]
questions:
  decided:
    - id: concurrency
      why: 既定でよい
`;
    const found = ask(EVERYTHING, both);
    expect(found.answers.problems.join("")).toContain("どちらか片方");
  });
});
