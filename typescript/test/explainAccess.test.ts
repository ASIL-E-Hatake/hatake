import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  ACCESS_OVERVIEW_TITLE,
  ACCESS_TITLE,
  appAccess,
  describeAudience,
  explainDiffSources,
  explainSource,
  renderExplain,
} from "../src/index.js";

/** 見出しの節を引く（無ければ undefined）。 */
const section = (source: string, title: string, page?: string) =>
  explainSource(source, page === undefined ? {} : { page }).sections.find(
    (one) => one.title === title,
  );

const APP = `
app:
  id: sales
  title: 受注
  home: order_search
  menu:
    - { label: 受注照会, page: order_search }
    - label: マスタ
      roles: [admin]
      items:
        - { label: 顧客, page: customer_master }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      search:
        filters: [{ field: orderNo, label: 受注番号 }]
      table:
        columns: [{ field: orderNo, label: 受注番号 }]
      actions:
        - { id: open, type: navigate, label: 明細, page: order_detail, roles: [manager] }
    - type: detail
      id: order_detail
      title: 受注詳細
      repository: orderRepository
      key: orderNo
      form:
        sections:
          - fields: [{ field: orderNo, label: 受注番号 }]
    - type: master
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      key: code
      table:
        columns: [{ field: code, label: コード }]
      form:
        sections:
          - fields: [{ field: code, label: コード, required: true }]
`;

describe("この画面を開けるのは誰か（説明に出す）", () => {
  it("app の説明に、画面ごとの一覧が出る", () => {
    const found = section(APP, ACCESS_OVERVIEW_TITLE);
    expect(found?.lines).toEqual([
      "受注照会（order_search） … 誰でも開ける",
      "受注詳細（order_detail） … manager だけ",
      "顧客マスタ（customer_master） … admin だけ",
    ]);
  });

  it("1枚を読むと、開ける人と入口が出る", () => {
    const found = section(APP, ACCESS_TITLE, "customer_master");
    expect(found?.lines).toEqual([
      "開けるのは … admin だけ",
      "入口「顧客」（メニュー） … admin だけが通れる",
    ]);
  });

  it("入口は「どこから来られるか」まで言う（直す場所は入口なので）", () => {
    const found = section(APP, ACCESS_TITLE, "order_detail");
    expect(found?.lines).toContain(
      "入口「明細」（order_search から） … manager だけが通れる",
    );
  });

  it("単票の定義には出さない（入口の話が無い）", () => {
    const page = `
page:
  type: master
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: code
  table:
    columns: [{ field: code, label: コード }]
  form:
    sections:
      - fields: [{ field: code, label: コード, required: true }]
`;
    expect(section(page, ACCESS_TITLE)).toBeUndefined();
  });

  it("開ける人と、画面の中で隠れるものは別の節", () => {
    const source = APP.replace(
      "        columns: [{ field: code, label: コード }]",
      "        columns: [{ field: code, label: コード }, { field: cost, label: 原価, roles: [manager] }]",
    );
    const text = renderExplain(explainSource(source, { page: "customer_master" }));
    expect(text).toContain(`## ${ACCESS_TITLE}`);
    expect(text).toContain("## 画面の中で隠れるもの（権限）");
    expect(text).toContain("列「原価」 … manager だけ");
  });

  it("メニューが無い app は、最初に開く画面だけが誰でも開ける", () => {
    const source = `
app:
  id: tools
  title: 道具
  home: second
  pages:
    - type: search
      id: first
      title: 1枚目
      repository: r
      table:
        columns: [{ field: a, label: あ }]
    - type: search
      id: second
      title: 2枚目
      repository: r
      table:
        columns: [{ field: a, label: あ }]
`;
    expect(section(source, ACCESS_OVERVIEW_TITLE)?.lines).toEqual([
      "1枚目（first） … 入口が書かれていない（アプリのコードから開く）",
      "2枚目（second） … 誰でも開ける",
    ]);
    expect(section(source, ACCESS_TITLE, "second")?.lines).toEqual([
      "開けるのは … 誰でも（メニューが無いアプリなので、最初に開く画面として開く）",
    ]);
    expect(section(source, ACCESS_TITLE, "first")?.lines).toEqual([
      "入口 … 書かれていない（メニューにも他の画面からの遷移にも出てこない" +
        "＝アプリのコードから開く画面）",
    ]);
  });

  // 同じ定義を2箇所が違う読み方をするのが一番まずい（前に一度やった）。
  it("図・警告と同じ計算を使う（答えがズレない）", () => {
    const document = parseYaml(APP) as Record<string, unknown>;
    const access = appAccess(document);
    const lines = section(APP, ACCESS_OVERVIEW_TITLE)?.lines ?? [];
    for (const [id, audience] of access.audience) {
      const line = lines.find((one) => one.includes(`（${id}）`));
      expect(line, id).toContain(describeAudience(audience));
    }
  });
});

describe("同梱の見本（roles-app.yaml）", () => {
  const source = readFileSync("../docs/diagrams/roles-app.yaml", "utf8");

  it("誰も開けない画面を、説明でもそう言う", () => {
    const lines = section(source, ACCESS_OVERVIEW_TITLE)?.lines ?? [];
    expect(lines).toContain(
      "単価マスタ（price_master） … 誰も開けない（入口の権限が食い違っている）",
    );
    expect(section(source, ACCESS_TITLE, "price_master")?.lines[0]).toBe(
      "開けるのは … 誰も開けない（入口はあるが、権限が食い違っている）",
    );
  });
});

describe("権限の変化は explain --diff に出る", () => {
  // 入口を1つ直すと、遠くの画面が開けなくなる。機械の言葉の差分では、直した入口の
  // 行しか動かないので気づけない。
  const before = APP;
  const after = APP.replace("roles: [manager] }", "roles: [admin] }");

  it("入口の roles を変えると、その先の画面の「開ける人」も変わったと言う", () => {
    const diff = explainDiffSources(before, after);
    const messages = diff.changes.map((one) => `${one.section} ${one.message}`);
    expect(
      messages.some(
        (line) => line.includes(ACCESS_OVERVIEW_TITLE) && line.includes("受注詳細"),
      ),
    ).toBe(true);
    expect(
      diff.changes.some(
        (one) =>
          one.section === `受注詳細 / ${ACCESS_TITLE}` &&
          one.after?.includes("admin だけ") === true,
      ),
    ).toBe(true);
  });

  it("権限が変わらなければ、その節は動かない", () => {
    const diff = explainDiffSources(before, before);
    expect(diff.same).toBe(true);
  });
});
