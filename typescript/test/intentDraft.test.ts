import { describe, expect, it } from "vitest";
import {
  draftIntent,
  intentYaml,
  parseIntent,
  parsePageYaml,
  suggestCovers,
  type PageDefinition,
} from "../src/index.js";

/**
 * 指示文から意図の下書きを起こす。
 *
 * ここで確かめたいのは**やらないこと**のほう。要約しない・推し量って分類しない・
 * 当てずっぽうの covers を書かない ── そこを踏み外すと、言った言ってないを潰すための
 * 紙が、逆に「AI がそう読んだこと」を人の言葉として固めてしまう。
 */
const definition = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  search:
    filters:
      - { field: orderNo, label: 受注番号, operator: contains }
      - { field: customer, label: 顧客名, operator: contains }
  table:
    rowActions: [detail]
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: customer, label: 顧客名 }
      - { field: amount, label: 金額, type: number }
  actions:
    - { id: detail, type: plugin, plugin: showDetail, label: 詳細 }
    - { id: approve, type: plugin, plugin: approveOrders, label: 承認, scope: selection }
`;

const page = parsePageYaml(definition, { strict: true }) as PageDefinition;

const instruction = `## やること
受注を探せる画面を作って。営業が使う。

## 画面でやること
- 探す: 受注番号・顧客名
- 見る: 受注番号・顧客名・金額
- 押す: 承認（選んだ行をまとめて）

## 業務の決めごと
- 出荷済の受注は直せない

## 決まっていないこと
- 却下の理由の選択肢は未定

## 終わりの判定
- validate を警告ゼロで通す
`;

describe("指示文を1枚に開く", () => {
  const drafted = draftIntent(instruction, page);

  it("1行が1件になる（箇条書きは分けない）", () => {
    expect(drafted.document.asked.map((one) => one.text)).toEqual([
      "受注を探せる画面を作って。",
      "営業が使う。",
      "探す: 受注番号・顧客名",
      "見る: 受注番号・顧客名・金額",
      "押す: 承認（選んだ行をまとめて）",
    ]);
  });

  it("言われたままの文を持つ（要約しない・言い換えない）", () => {
    expect(drafted.document.decisions[0].text).toBe("出荷済の受注は直せない");
  });

  it("見出しで分類する（決めごと・未決・終わりの判定）", () => {
    expect(drafted.document.decisions).toHaveLength(1);
    expect(drafted.document.undecided.map((one) => one.text)).toEqual([
      "却下の理由の選択肢は未定",
    ]);
    expect(drafted.document.acceptance).toEqual(["validate を警告ゼロで通す"]);
  });

  it("全部 AI の下書き（人が見るまで未確認）", () => {
    for (const one of [
      ...drafted.document.asked,
      ...drafted.document.decisions,
      ...drafted.document.undecided,
    ]) {
      expect(one.source).toBe("ai-draft");
      expect(one.confirmed).toBe(false);
    }
  });

  it("id は分類ごとに振る（R / D / U）", () => {
    expect(drafted.document.asked[0].id).toBe("R1");
    expect(drafted.document.decisions[0].id).toBe("D1");
    expect(drafted.document.undecided[0].id).toBe("U1");
  });

  it("書き出しの合図で、当てる種類を絞る", () => {
    // 「受注番号」は絞り込みにも列にも在る。`探す:` / `見る:` で書いてあれば、
    // どちらの話かは字で決まる（推し量りではない）。
    const search = drafted.document.asked[2];
    const list = drafted.document.asked[3];
    expect(search.covers).toEqual(["filter:orderNo", "filter:customer"]);
    expect(list.covers).toEqual([
      "column:orderNo",
      "column:customer",
      "column:amount",
    ]);
  });

  it("人がやることを残す（誰が・いつは書けない）", () => {
    expect(drafted.todo.join("\n")).toContain("confirmed: true");
    expect(drafted.todo.join("\n")).toContain("誰が言ったか");
  });

  it("言われていないのに在るものを、その場で挙げる", () => {
    // 「詳細」は指示文に出てこない＝AI が足したか、言い方が違うだけ。
    expect(drafted.todo.join("\n")).toContain("action:detail");
    expect(drafted.trace?.findings.some((one) => one.kind === "orphan")).toBe(
      true,
    );
  });

  it("そのまま置ける YAML になり、読み返せる（往復する）", () => {
    const text = intentYaml(drafted.document);
    expect(text).toContain("source: ai-draft");
    const again = parseIntent(text);
    expect(again).toEqual(drafted.document);
  });
});

describe("推し量らない", () => {
  it("見出しが無ければ全部 asked（決めごとに格上げしない）", () => {
    const drafted = draftIntent(
      "受注を探せる画面を作って。出荷済は直せない。",
      page,
    );
    expect(drafted.document.asked).toHaveLength(2);
    expect(drafted.document.decisions).toEqual([]);
  });

  it("行に「未定」と書いてあれば、見出しが無くても未決に置く", () => {
    // これだけは合図が字で在るので拾う（拾わないと、未定が要求として固まる）。
    const drafted = draftIntent("却下の理由は未定。", page);
    expect(drafted.document.undecided).toHaveLength(1);
    expect(drafted.document.asked).toEqual([]);
  });

  it("定義を渡さなければ covers は空（当てずっぽうを書かない）", () => {
    const drafted = draftIntent("- 探す: 受注番号");
    expect(drafted.document.asked[0].covers).toEqual([]);
    expect(drafted.document.page).toBeUndefined();
    expect(drafted.todo.join("\n")).toContain("covers は空");
  });

  it("業務の言葉が当たらなければ空にして、人に振る", () => {
    const drafted = draftIntent("- 見る: 担当者名", page);
    expect(drafted.document.asked[0].covers).toEqual([]);
    expect(drafted.todo.join("\n")).toContain("どこに落ちるか分かりません");
  });

  it("テンプレの案内文は要求にしない", () => {
    const drafted = draftIntent(
      "## やること\n（1文。例: 受注を探して、状態を直せる画面を作る）\n",
      page,
    );
    expect(drafted.document.asked).toEqual([]);
    expect(drafted.todo.join("\n")).toContain("案内文");
  });

  it("コードブロックの中は読まない（貼った定義を要求にしない）", () => {
    const drafted = draftIntent(
      "受注を探せる画面。\n```yaml\npage:\n  type: search\n```\n",
      page,
    );
    expect(drafted.document.asked).toHaveLength(1);
  });

  it("何も起こせなければ、そう言う", () => {
    const drafted = draftIntent("\n\n---\n", page);
    expect(drafted.todo.join("\n")).toContain("1件も起こせませんでした");
  });
});

describe("業務の言葉の当て方", () => {
  it("短い項目名では当てない（偶然当たるので）", () => {
    // `key` や `id` のような短い名前は、文のどこにでも出てくる。
    expect(suggestCovers("id を出す", page)).toEqual([]);
  });

  it("項目名そのものが指示文に出てきたら当てる（API の名前で来ることがある）", () => {
    expect(suggestCovers("orderNo で探せるようにする", page)).toContain(
      "filter:orderNo",
    );
  });
});
