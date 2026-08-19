import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  appDiagram,
  type Diagram,
  looksLikeDiagram,
  packNote,
  parseAppSource,
  parseDiagram,
  renderDiagram,
  roomForBoxes,
} from "../src/index.js";

const SIMPLE: Diagram = {
  title: "図の題",
  subtitle: "副題",
  rows: [
    { kind: "boxes", items: [{ label: "箱", note: "注記", tone: "input" }] },
    { kind: "arrow", label: "行き", back: "戻り" },
    { kind: "boxes", items: [{ label: "箱2", lines: ["+ できる", "! できない"] }] },
    { kind: "note", text: "下の注記" },
  ],
};

describe("図を描く", () => {
  const svg = renderDiagram(SIMPLE);

  it("SVG として妥当な形（viewBox と高さが中身から決まる）", () => {
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 900 \d+"/);
  });

  it("題・箱・矢印・注記が全部入る", () => {
    expect(svg).toContain("図の題");
    expect(svg).toContain("箱");
    expect(svg).toContain("行き");
    expect(svg).toContain("戻り");
    expect(svg).toContain("下の注記");
  });

  it("○ と × を書き分ける（してよいこと・してはいけないこと）", () => {
    expect(svg).toContain("○ できる");
    expect(svg).toContain("× できない");
  });

  it("明暗どちらのテーマでも読める（画像として読み込まれても付いてくる）", () => {
    expect(svg).toContain("@media (prefers-color-scheme: dark)");
  });

  it("強調（**…**）は太字にする", () => {
    const bold = renderDiagram({
      title: "題",
      rows: [{ kind: "note", text: "これは**大事**です" }],
    });
    expect(bold).toContain('<tspan class="caption strong">大事</tspan>');
  });

  it("同じ元データからは同じ SVG（生成物として差分が出ない）", () => {
    expect(renderDiagram(SIMPLE)).toBe(svg);
  });

  // 溢れたまま配るのが一番まずいので、警告ではなくエラーにしている。
  it("枠から溢れる文は、描かずに落ちる", () => {
    expect(() =>
      renderDiagram({
        title: "題",
        rows: [{ kind: "boxes", items: [{ label: "あ".repeat(80) }] }],
      }),
    ).toThrow("図が枠に入りません");
  });

  it("XML として危ない文字は逃がす", () => {
    const escaped = renderDiagram({
      title: "題",
      rows: [{ kind: "note", text: "a < b & c > d" }],
    });
    expect(escaped).toContain("a &lt; b &amp; c &gt; d");
  });
});

describe("箱どうしの線", () => {
  /** 上に3つ・下に2つ、あいだに線を引く図。 */
  const linked: Diagram = {
    title: "遷移",
    rows: [
      {
        kind: "boxes",
        slots: 3,
        items: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" },
        ],
      },
      {
        kind: "links",
        items: [
          { from: "a", to: "x", label: "開く" },
          { from: "c", to: "y" },
          { from: "y", to: "b", label: "戻る", back: true },
        ],
      },
      {
        kind: "boxes",
        slots: 3,
        items: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
      },
    ],
  };
  const svg = renderDiagram(linked);

  it("1本ずつ道を引く（まとめて1本にしない）", () => {
    expect(svg.match(/class="flow link/g)?.length).toBe(3);
  });

  it("札は線に添える", () => {
    expect(svg).toContain("開く");
    expect(svg).toContain("戻る");
  });

  it("向きは行の上下で決まる（下から上なら戻り）", () => {
    // 戻りの線だけ細い灰色（back）で、矢先も別。
    expect(svg).toContain('marker-end="url(#tipBack)"');
    expect(svg).toContain('class="flow link back"');
  });

  it("同じ幅で割る（slots を渡すと行ごとに箱の幅が変わらない）", () => {
    const widths = [...svg.matchAll(/<rect class="box[^"]*"[^>]*width="([\d.]+)"/g)].map(
      (one) => one[1],
    );
    expect(new Set(widths).size).toBe(1);
  });

  // 図に出ていない遷移を黙って落とすと「線が無い＝遷移が無い」と読まれる。
  it("上下の行に居ない箱を指したら落ちる", () => {
    expect(() =>
      renderDiagram({
        title: "題",
        rows: [
          { kind: "boxes", items: [{ id: "a", label: "A" }] },
          { kind: "links", items: [{ from: "a", to: "zzz" }] },
          { kind: "boxes", items: [{ id: "x", label: "X" }] },
        ],
      }),
    ).toThrow("線を引けません");
  });

  it("箱の行に挟まれていない線は落ちる", () => {
    expect(() =>
      renderDiagram({
        title: "題",
        rows: [
          { kind: "note", text: "上" },
          { kind: "links", items: [{ from: "a", to: "b" }] },
          { kind: "note", text: "下" },
        ],
      }),
    ).toThrow("箱の行と箱の行のあいだ");
  });

  it("線の札も、入る幅を超えたら落ちる", () => {
    expect(() =>
      renderDiagram({
        title: "題",
        rows: [
          { kind: "boxes", items: [{ id: "a", label: "A" }] },
          { kind: "links", items: [{ from: "a", to: "x", label: "あ".repeat(80) }] },
          { kind: "boxes", items: [{ id: "x", label: "X" }] },
        ],
      }),
    ).toThrow("図が枠に入りません");
  });

  it("線を足すと図は縦に伸びる（帯の高さは本数で決まる）", () => {
    const height = (diagram: Diagram): number =>
      Number(/viewBox="0 0 900 (\d+)"/.exec(renderDiagram(diagram))![1]);
    const one: Diagram = {
      title: "題",
      rows: [
        { kind: "boxes", items: [{ id: "a", label: "A" }] },
        { kind: "links", items: [{ from: "a", to: "x" }] },
        { kind: "boxes", items: [{ id: "x", label: "X" }] },
      ],
    };
    const two: Diagram = {
      ...one,
      rows: [
        one.rows[0],
        { kind: "links", items: [{ from: "a", to: "x" }, { from: "a", to: "x" }] },
        one.rows[2],
      ],
    };
    expect(height(two)).toBeGreaterThan(height(one));
  });
});

describe("同梱の図解", () => {
  const dir = "../docs/diagrams";
  const sources = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("元データはどれも図として読める（$comment のような余分なキーは無視する）", () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const raw = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
      expect(looksLikeDiagram(raw), file).toBe(true);
      expect(() => parseDiagram(raw), file).not.toThrow();
    }
  });

  // これが「描画を2本持たない」ことの確かめ。コミットしてある絵と、いまの描画が一致する。
  it("コミットしてある SVG と、いまの描画が一致する", () => {
    for (const file of sources) {
      const raw = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
      const committed = readFileSync(
        `${dir}/${file.replace(/\.json$/, ".svg")}`,
        "utf8",
      );
      expect(renderDiagram(parseDiagram(raw)), file).toBe(
        committed.replaceAll("\r\n", "\n"),
      );
    }
  });
});

describe("定義から図を作る", () => {
  const source = readFileSync("../spec/examples/sales_app.yaml", "utf8");
  const raw = parseYaml(source) as Record<string, unknown>;
  const picture = appDiagram(parseAppSource(source).app, raw);

  it("題と副題で「何の図か」を言う", () => {
    expect(picture.title).toBe("販売管理（sales_admin）の画面と遷移");
    expect(picture.subtitle).toContain("メニューから開ける画面");
  });

  it("メニューから開ける画面が1段目、遷移で開く画面が2段目", () => {
    const boxes = picture.rows.filter((row) => row.kind === "boxes");
    const first = boxes[0] as { items: { note?: string }[] };
    expect(first.items.map((box) => box.note)).toContain("sales_dashboard");
    // 受注詳細はメニューに無く、受注照会の「詳細」から開く＝後の段に出る。
    const last = boxes[boxes.length - 1] as { items: { note?: string }[] };
    expect(last.items.map((box) => box.note)).toContain("order_detail");
  });

  it("遷移は1本ずつ線になる（どの画面からどの画面へ、が読める）", () => {
    const links = picture.rows.filter((row) => row.kind === "links") as {
      items: { from: string; to: string; label?: string }[];
    }[];
    const all = links.flatMap((row) => row.items);
    expect(all).toContainEqual({
      from: "order_search",
      to: "order_detail",
      label: "詳細",
    });
  });

  it("線を引ける行に来るよう、次の段へ進む画面を段の後ろに置く", () => {
    const boxes = picture.rows.filter((row) => row.kind === "boxes") as {
      items: { id?: string }[];
    }[];
    // 受注照会（次の段へ進む画面）は1段目の最後の行に居る＝線の帯と隣り合う。
    const beforeLinks = picture.rows.findIndex((row) => row.kind === "links");
    const rowAbove = picture.rows[beforeLinks - 1] as { items: { id?: string }[] };
    expect(rowAbove.items.map((one) => one.id)).toContain("order_search");
    expect(boxes.length).toBeGreaterThan(2);
  });

  it("線にできなかった遷移は文で全部挙げる（黙って落とさない）", () => {
    const notes = picture.rows
      .filter((row) => row.kind === "note")
      .map((row) => (row as { text: string }).text)
      .join("\n");
    expect(notes).toContain("線にできなかった遷移");
    // ダッシュボード → 受注照会は同じ段の中なので線にできない（が、挙げてはある）。
    expect(notes).toContain("売上ダッシュボード → 受注照会（受注照会）");
    expect(notes).toContain("受注照会 → 受注入力（明細編集）");
  });

  it("そのまま描ける（溢れない）", () => {
    expect(() => renderDiagram(picture)).not.toThrow();
  });

  it("長い画面名は入る幅に収める（機械が作る図で落ちないように）", () => {
    const boxes = picture.rows
      .filter((row) => row.kind === "boxes")
      .flatMap((row) => (row as { items: { label: string }[] }).items);
    for (const box of boxes) {
      expect(box.label.length, box.label).toBeLessThanOrEqual(20);
    }
    expect(roomForBoxes(3)).toBeGreaterThan(200);
  });

  it("どこからも開けない画面を別に出す（図にする一番の値打ち）", () => {
    const orphan = `dsl_version: "1.0"
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
    - type: detail
      id: order_detail
      title: 受注詳細
      repository: orderRepository
      key: orderNo
      form:
        sections:
          - fields: [{ field: orderNo, label: 受注番号 }]
`;
    const picture = appDiagram(
      parseAppSource(orphan).app,
      parseYaml(orphan) as Record<string, unknown>,
    );
    const notes = picture.rows
      .filter((row) => row.kind === "note")
      .map((row) => (row as { text: string }).text);
    expect(notes.join("\n")).toContain("どこからも開けない画面");
    expect(notes.join("\n")).toContain("1 枚は、メニューに足すか遷移で繋がないと開けない");
    const boxes = picture.rows.filter((row) => row.kind === "boxes");
    const orphans = (boxes[boxes.length - 1] as { items: { tone?: string }[] }).items;
    expect(orphans[0].tone).toBe("outside");
  });

  it("全部たどれるときは、そう言う", () => {
    const notes = picture.rows
      .filter((row) => row.kind === "note")
      .map((row) => (row as { text: string }).text);
    expect(notes).toContain("すべての画面がメニューか遷移からたどれる。");
  });
});

describe("注記の行割り", () => {
  it("入る幅で行に割る（機械が作る図は長さが定義次第なので）", () => {
    const parts = Array.from({ length: 30 }, (_, i) => `マスタ保守${i}: 3`);
    const lines = packNote("内訳: ", parts);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].startsWith("内訳: ")).toBe(true);
    // 割った各行はそのまま描ける（溢れない）。
    expect(() =>
      renderDiagram({
        title: "題",
        rows: lines.map((text) => ({ kind: "note", text })),
      }),
    ).not.toThrow();
  });

  it("短ければ1行のまま", () => {
    expect(packNote("内訳: ", ["帳票: 1", "照会: 2"])).toEqual([
      "内訳: 帳票: 1 / 照会: 2",
    ]);
  });
});
