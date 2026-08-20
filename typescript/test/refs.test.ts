import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  collectRefs,
  type DefinitionRegistry,
  findWarnings,
  groupRefs,
  refsNeedingRegistration,
  unusedRegistrations,
} from "../src/index.js";

/** 素の document（refs も警告も、解析後のモデルではなくこれを見る）。 */
const doc = (source: string): Record<string, unknown> =>
  parseYaml(source) as Record<string, unknown>;

const refsOf = (source: string) => collectRefs(doc(source));

const rulesOf = (source: string, registry?: DefinitionRegistry): string[] =>
  findWarnings(doc(source), { registry }).map((w) => w.rule);

const page = (body: string) => `
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    columns:
      - { field: code, label: コード }
  form:
    sections:
      - fields:
${body}
`;

describe("定義が外に要求しているもの", () => {
  it("Repository は種類・名前・場所つきで拾う", () => {
    const found = refsOf(
      page("          - { field: code, label: コード }"),
    ).filter((r) => r.kind === "repositories");
    expect(found).toEqual([
      {
        kind: "repositories",
        name: "customerRepository",
        path: "page.repository",
        // Repository に組み込みは無いので、必ずアプリ側で登録が要る。
        builtIn: false,
      },
    ]);
  });

  it("選択肢の取得元・明細の子テーブルも Repository の要求として数える", () => {
    const found = refsOf(
      page(
        `          - field: city
            label: 市区町村
            type: select
            optionsSource: { repository: cityRepository }
          - field: lines
            label: 明細
            type: subTable
            source: { repository: orderLineRepository, parentKey: orderNo, key: id }`,
      ),
    ).filter((r) => r.kind === "repositories");
    expect(found.map((r) => r.name).sort()).toEqual([
      "cityRepository",
      "customerRepository",
      "orderLineRepository",
    ]);
  });

  it("組み込みかどうかを名前ごとに言う（登録が要るものだけ拾えるように）", () => {
    const found = refsOf(
      page(
        `          - { field: amount, label: 金額, format: currency }
          - { field: memo, label: 備考, format: sparkline }`,
      ),
    ).filter((r) => r.kind === "formatters");
    expect(found.map((r) => [r.name, r.builtIn])).toEqual([
      ["currency", true],
      ["sparkline", false],
    ]);
  });

  it("バリデータ・コンバータ・計算・集約も同じ扱い", () => {
    const grouped = groupRefs(
      refsOf(
        page(
          `          - field: zip
            label: 郵便番号
            normalize: [toHankaku, myTrim]
            validators: [{ type: postalCode }, { type: corporateNo }]
          - { field: total, label: 合計, computed: { op: product, fields: [a, b] } }`,
        ),
      ),
    );
    expect(grouped.converters).toEqual(["myTrim", "toHankaku"]);
    expect(grouped.validators).toEqual(["corporateNo", "postalCode"]);
    expect(grouped.computedOps).toEqual(["product"]);
  });

  it("登録が要るものだけに絞れる", () => {
    const grouped = refsNeedingRegistration(
      refsOf(
        page(
          `          - { field: amount, label: 金額, format: currency }
          - { field: memo, label: 備考, format: sparkline }`,
        ),
      ),
    );
    // currency は組み込みなので出ない。
    expect(grouped.formatters).toEqual(["sparkline"]);
    expect(grouped.repositories).toEqual(["customerRepository"]);
  });

  it("同じ app が抱えているページは外への要求ではない", () => {
    const app = `
app:
  id: sales
  title: 販売管理
  home: menu_top
  menu:
    - { id: menu_top, label: 受注, page: order_search }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: id
      table:
        columns: [{ field: id, label: ID }]
      actions:
        - { id: detail, type: navigate, label: 詳細, page: order_detail }
`;
    const pages = refsOf(app).filter((r) => r.kind === "pages");
    // order_search は同じ app にある。order_detail は無いので「外に要求している」。
    // home（メニュー項目の id）も定義の中の話なので数えない。
    expect(pages.map((r) => r.name)).toEqual(["order_detail"]);
  });

  it("単票の定義では遷移先が分からないので、ページも要求として数える", () => {
    const single = `
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: id
  table:
    columns: [{ field: id, label: ID }]
  actions:
    - { id: detail, type: navigate, label: 詳細, page: order_detail }
`;
    expect(
      refsOf(single)
        .filter((r) => r.kind === "pages")
        .map((r) => r.name),
    ).toEqual(["order_detail"]);
  });
});

describe("画面の外との辻褄（登録済み一覧との突き合わせ）", () => {
  const definition = page(
    `          - { field: amount, label: 金額, format: currency }`,
  );

  it("一覧を渡さなければ何も言わない（定義の中だけで閉じた検査に戻る）", () => {
    expect(rulesOf(definition)).toEqual([]);
  });

  it("渡したカテゴリだけを見る", () => {
    // repositories を渡していないので、Repository の名前は見ない。
    expect(rulesOf(definition, { formatters: [] })).toEqual([]);
    expect(rulesOf(definition, { repositories: [] })).toEqual([
      "unknown-repository",
    ]);
  });

  it("登録済みなら黙る", () => {
    expect(
      rulesOf(definition, { repositories: ["customerRepository"] }),
    ).toEqual([]);
  });

  it("組み込みの名前は一覧に書かなくてよい", () => {
    // format: currency は組み込み。formatters: [] でも警告しない。
    expect(rulesOf(definition, { formatters: [] })).toEqual([]);
  });

  it("近い名前があれば「もしかして」を出す", () => {
    const found = findWarnings(doc(definition), {
      registry: { repositories: ["customerRepositry"] },
    });
    expect(found[0].rule).toBe("unknown-repository");
    expect(found[0].path).toBe("page.repository");
    expect(found[0].message).toContain("データが来ません");
    expect(found[0].fix).toContain("customerRepositry");
  });

  it("プラグイン・バリデータ・コンバータ・集約も同じ規則で見る", () => {
    const definition = `
page:
  type: dashboard
  id: sales_dashboard
  title: 売上
  repository: orderRepository
  items:
    - { id: total, title: 売上, type: metric, value: { aggregate: median, field: amount } }
  actions:
    - { id: send, type: plugin, plugin: sendMail, label: 送信 }
  form:
    sections:
      - fields:
          - { field: zip, label: 郵便番号, normalize: [zenkakuOnly], validators: [{ type: corporateNo }] }
`;
    expect(
      rulesOf(definition, {
        repositories: ["orderRepository"],
        plugins: [],
        validators: [],
        converters: [],
        aggregates: [],
      }).sort(),
    ).toEqual([
      "unknown-aggregate",
      "unknown-converter",
      "unknown-plugin",
      "unknown-validator",
    ]);
  });

  it("何が起きるかを種類ごとの言葉で言う（黙って効かない類なので）", () => {
    const found = findWarnings(
      doc(
        page(
          `          - { field: zip, label: 郵便番号, validators: [{ type: myRule }] }`,
        ),
      ),
      { registry: { validators: [] } },
    );
    expect(found[0].message).toContain("黙って行われません");
  });
});

describe("デモアプリとの辻褄", () => {
  const ASSETS = "../flutter/packages/hatake_example/assets";
  const definition = readFileSync(`${ASSETS}/sales_app.yaml`, "utf8");
  const registry = JSON.parse(
    readFileSync(`${ASSETS}/hatake-registry.json`, "utf8"),
  ) as DefinitionRegistry;

  it("登録済み一覧は、定義が要求しているものと一致する（＝この表は嘘をつけない）", () => {
    const needed = refsNeedingRegistration(collectRefs(doc(definition)));
    expect([...(registry.repositories ?? [])].sort()).toEqual(
      needed.repositories,
    );
    expect([...(registry.plugins ?? [])].sort()).toEqual(needed.plugins);
  });

  // 一覧が実装とズレたら警告そのものが嘘になる。その確認は
  // registryScan.test.ts（実装から生成したものと一致するか）の担当。

  it("デモの定義は、登録済み一覧と突き合わせても警告ゼロ", () => {
    expect(findWarnings(doc(definition), { registry })).toEqual([]);
  });
});

describe("使われていない登録（逆向きの突き合わせ）", () => {
  const source = page(
    "          - { field: code, label: コード, format: postalCode }",
  );

  it("登録してあるのに、どの定義も使っていない名前を出す", () => {
    const unused = unusedRegistrations(
      {
        repositories: ["customerRepository", "oldPriceRepository"],
        formatters: ["postalCode", "eraDate"],
      },
      refsOf(source),
    );
    expect(unused).toEqual({
      repositories: ["oldPriceRepository"],
      formatters: ["eraDate"],
    });
  });

  it("組み込みの上書き登録は、定義が使っていれば「使われている」", () => {
    // 自分の currency を登録して、定義が currency を使っている＝消してはいけない。
    const withCurrency = page(
      "          - { field: amount, label: 金額, format: currency }",
    );
    expect(
      unusedRegistrations({ formatters: ["currency"] }, refsOf(withCurrency)),
    ).toEqual({});
  });

  it("一覧に書いていない種類は見ない（勝手に厳しくしない）", () => {
    // plugins を渡していないので、プラグインの話は一切しない。
    const unused = unusedRegistrations(
      { repositories: ["customerRepository"] },
      refsOf(source),
    );
    expect(unused).toEqual({});
  });

  it("同じ名前が2回書いてあっても1回だけ出す", () => {
    expect(
      unusedRegistrations(
        { repositories: ["gone", "gone"] },
        refsOf(source),
      ).repositories,
    ).toEqual(["gone"]);
  });

  it("全部使われていれば空（空の報告と「一覧が無い」は別）", () => {
    expect(
      unusedRegistrations(
        { repositories: ["customerRepository"], formatters: ["postalCode"] },
        refsOf(source),
      ),
    ).toEqual({});
  });

  it("デモアプリの登録は全部使われている（配っているものが汚れていない証拠）", () => {
    const app = readFileSync(
      "../flutter/packages/hatake_example/assets/sales_app.yaml",
      "utf8",
    );
    const registry = JSON.parse(
      readFileSync(
        "../flutter/packages/hatake_example/assets/hatake-registry.json",
        "utf8",
      ),
    ) as DefinitionRegistry;
    expect(unusedRegistrations(registry, refsOf(app))).toEqual({});
  });
});
