import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  collectRefs,
  filledReport,
  hasUnfilled,
  inState,
  looseTodos,
  mergeWiring,
  renderFilled,
  renderWireTodo,
  scanRegistrations,
  usesInCode,
  wireApp,
  wireTodo,
} from "../src/index.js";

/// 「足した所が本当に埋まったか」を数える（`refs --filled`）と、足した所を渡す
/// （`wire --merge --todo`）。
///
/// ここで守るのは3つ。**登録が在ることと動くことは別**（目印が残っていれば TODO の
/// まま）・**読めない登録が在る種類は「無い」と言わない**（登録してあるのに未登録と
/// 言うのが一番まずい嘘）・**「埋まっている」は目印が無いという意味しかない**
/// （中身が業務として正しいかは見ていない）。
const APP = `
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
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: amount, label: 金額, type: number, format: yen }
      actions:
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
`;

const document = () => parseYaml(APP) as Record<string, unknown>;
const refs = () => collectRefs(document());

/** 実装1枚を走査した結果。 */
const scanOf = (source: string) => ({
  scan: scanRegistrations([{ path: "lib/wiring.dart", source }]),
  files: [{ path: "lib/wiring.dart", source }],
});

/** `wire` が出したままの配線（全部 TODO）。 */
const draft = () => wireApp(document(), { source: "app.yaml" });

describe("refs --filled（埋まったかを数える）", () => {
  it("wire が出したままなら、全部「TODO のまま」", () => {
    const { scan, files } = scanOf(draft());
    const report = filledReport(refs(), scan, files.length);

    expect(report.items.length).toBeGreaterThan(1);
    // Repository も「まだ繋いでいない」仮の実装なので、埋まっていない側。
    expect(inState(report, "filled")).toEqual([]);
    expect(inState(report, "missing")).toEqual([]);
    const pending = inState(report, "pending").map((one) => one.name);
    expect(pending).toContain("approveOrders");
    expect(pending).toContain("orderRepository");
    expect(hasUnfilled(report)).toBe(true);
    // 場所を出す（渡す相手が開く所）。
    expect(inState(report, "pending")[0].where).toMatch(/lib\/wiring\.dart:\d+/);
  });

  it("中身を埋めたぶんは「埋まっている」に移る", () => {
    // 80桁を超える行は値が次の行に落ちるので、目印だけを置き換える。
    const filled = draft().replace(
      /throw UnimplementedError\('approveOrders[^']*'\)/,
      "api.approve(ctx.records)",
    );
    const { scan, files } = scanOf(filled);
    const report = filledReport(refs(), scan, files.length);

    expect(inState(report, "filled").map((one) => one.name)).toEqual([
      "approveOrders",
    ]);
    const pending = inState(report, "pending").map((one) => one.name);
    expect(pending).not.toContain("approveOrders");
    // 触っていない所は TODO のまま（1件埋めても他は数え続ける）。
    expect(pending).toContain("orderRepository");
  });

  it("登録が無いものは「登録が無い」（足せる）", () => {
    const { scan, files } = scanOf(`
      HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': OrderRepo()}),
        actions: ActionRegistry({}),
        child: const SizedBox(),
      );
    `);
    const report = filledReport(refs(), scan, files.length);
    expect(inState(report, "missing").map((one) => one.name)).toContain(
      "approveOrders",
    );
    expect(inState(report, "filled").map((one) => one.name)).toEqual([
      "orderRepository",
    ]);
    expect(renderFilled(report)).toContain("hatake wire --merge で足せます");
  });

  it("読めない登録が在る種類は「言えない」（無いとは言わない）", () => {
    const { scan, files } = scanOf(`
      HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': OrderRepo()}),
        actions: ActionRegistry(buildActions()),
        child: const SizedBox(),
      );
    `);
    const report = filledReport(refs(), scan, files.length);

    expect(scan.unreadable).toHaveLength(1);
    // 読めなかったのは actions（プラグイン）だけ。そこは「無い」と言わない。
    expect(inState(report, "unknown").map((one) => one.name)).toEqual([
      "approveOrders",
    ]);
    expect(inState(report, "missing").map((one) => one.kind)).not.toContain(
      "plugins",
    );
    // 読めた種類（見せ方）は、無ければ無いと言う。
    expect(inState(report, "missing").map((one) => one.name)).toEqual(["yen"]);
    expect(renderFilled(report)).toContain("読めなかった登録が 1 件");
  });

  it("「言えない」だけでは落とさない（道具の限界で、書いた人の落ち度ではない）", () => {
    const onlyPlugin = parseYaml(`
page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  key: orderNo
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
`) as Record<string, unknown>;
    const { scan, files } = scanOf(`
      HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': OrderRepo()}),
        actions: ActionRegistry(buildActions()),
        child: const SizedBox(),
      );
    `);
    const report = filledReport(collectRefs(onlyPlugin), scan, files.length);
    expect(inState(report, "unknown").map((one) => one.name)).toEqual([
      "approveOrders",
    ]);
    expect(hasUnfilled(report)).toBe(false);
  });

  it("組み込みは数えない（読む意味の無い数にしない）", () => {
    const { scan, files } = scanOf(draft());
    const report = filledReport(refs(), scan, files.length);
    // format: yen は組み込みではないので出るが、maxLength のような組み込みは出ない。
    expect(report.items.some((one) => one.name === "yen")).toBe(true);
    expect(report.items.some((one) => one.name === "maxLength")).toBe(false);
  });

  it("数を先に言う（一覧は読まれないが、数は読まれる）", () => {
    const { scan, files } = scanOf(draft());
    const out = renderFilled(filledReport(refs(), scan, files.length));
    expect(out.split("\n")[0]).toMatch(/^定義が要求している登録: \d+ 件（実装 1 ファイル/);
    expect(out).toContain("目印（UnimplementedError）が残っていない");
  });
});

describe("配線そのものの埋め忘れ", () => {
  it("REST で組んだ配線は「言えない」ではなく「埋まっている」", () => {
    // `wire --base` は RepositoryRegistry(restRepositories(…)) で組む。関数呼び出しは
    // 読めないが、**名前は collections のキーに書いてある**ので、そこは読める。
    const { scan, files } = scanOf(
      wireApp(document(), { source: "app.yaml", baseUrl: "/api" }),
    );
    const report = filledReport(
      refs(),
      scan,
      files.length,
      looseTodos(files, scan.sites),
    );
    const repository = report.items.find((one) => one.name === "orderRepository");
    expect(repository?.state).toBe("filled");
  });

  it("実際に通信する所が TODO なら、登録の外の埋め忘れとして数える", () => {
    const { scan, files } = scanOf(
      wireApp(document(), { source: "app.yaml", baseUrl: "/api" }),
    );
    const loose = looseTodos(files, scan.sites);
    const report = filledReport(refs(), scan, files.length, loose);

    // 登録は済んでいるのに、動かすと1件も取れない状態（ここを言わないと嘘になる）。
    expect(loose).toHaveLength(1);
    expect(loose[0].what).toContain("HTTP クライアントを繋ぐ");
    expect(hasUnfilled(report)).toBe(true);
    expect(renderFilled(report)).toContain("配線そのものに残っている TODO");
  });

  it("まだ繋いでいない Repository の仮実装は、二重に数えない", () => {
    // `_UnwiredRepository` のクラスの中にも目印が在るが、そこは登録1件ずつの方で
    // 数えている（同じ話を2回言わない）。
    const { scan, files } = scanOf(draft());
    expect(looseTodos(files, scan.sites)).toEqual([]);
    expect(
      inState(filledReport(refs(), scan, files.length), "pending").map(
        (one) => one.name,
      ),
    ).toContain("orderRepository");
  });

  it("名前付き引数の登録の終わりが、ファイル末尾まで伸びない", () => {
    // 伸びると、そのあとに書いてある TODO も「登録の中」に見えて数えられなくなる。
    const { scan, files } = scanOf(`
      HatakeScope(
        renderer: MaterialRenderer(
          fieldBuilders: {'colorPicker': (ctx) => ColorPicker()},
        ),
        child: const SizedBox(),
      );
      Future<void> later() => throw UnimplementedError('あとで書く');
    `);
    const site = scan.sites.find((one) => one.kind === "fieldTypes");
    expect(site).toBeDefined();
    expect(site!.endLine).toBeLessThan(files[0].source.split("\n").length - 1);
    expect(looseTodos(files, scan.sites)).toHaveLength(1);
  });
});

describe("wire --merge --todo（足した所を渡す）", () => {
  const HAND = `
    Widget build(BuildContext context) => HatakeScope(
      repositories: RepositoryRegistry({'orderRepository': OrderRepo()}),
      child: const HatakePageView(definition: definition),
    );
  `;

  it("足した所を、書くものと場所つきで渡す", () => {
    const result = mergeWiring(HAND, document());
    const todo = wireTodo(result, "lib/wiring.dart");

    expect(todo.added).toBeGreaterThan(0);
    const one = todo.items.find((item) => item.name === "approveOrders");
    expect(one).toBeDefined();
    expect(one?.field).toBe("actions");
    // 書くものの言葉は、出したコードの中の言葉と同じ1か所から出す。
    expect(one?.todo).toBe("何をするか");
    expect(result.code).toContain(`approveOrders: ${one?.todo}`);
    expect(one?.line).toBeGreaterThan(0);

    const out = renderWireTodo(todo);
    expect(out).toContain("場所はもう探さなくていい");
    expect(out).toContain("UnimplementedError で落ちます");
    expect(out).toContain("hatake refs --filled");
  });

  it("書き出していないときは行番号を付けない（在りもしない行を指さない）", () => {
    const todo = wireTodo(mergeWiring(HAND, document()));
    expect(todo.items.every((one) => one.line === undefined)).toBe(true);
    expect(renderWireTodo(todo)).toContain("足したコードは書き出していません");
  });

  it("足すものが無ければ、そう言う", () => {
    const filled = wireApp(document(), { source: "app.yaml" });
    const todo = wireTodo(mergeWiring(filled, document()), "lib/wiring.dart");
    expect(todo.added).toBe(0);
    expect(renderWireTodo(todo)).toContain("足すものはありませんでした");
    // 足したものが無いことと、TODO が残っていないことは別（そちらは refs --filled）。
    expect(renderWireTodo(todo)).toContain("hatake refs --filled");
  });
});

describe("登録の外で名前が使われているか", () => {
  it("コードから直接呼んでいる登録は、消す候補にしない", () => {
    const source = `
      final scope = HatakeScope(
        actions: ActionRegistry({
          'approveOrders': (ctx) async => api.approve(ctx.records),
          'nightlyClose': (ctx) async => api.close(),
        }),
        child: const SizedBox(),
      );
      Future<void> batch() => runners['nightlyClose']!(context);
    `;
    const { scan, files } = scanOf(source);
    const uses = usesInCode(["approveOrders", "nightlyClose"], files, scan.sites);

    // 登録の中に書いてあるぶんは数えない（数えると全部「使われている」になる）。
    expect(uses.approveOrders).toBeUndefined();
    expect(uses.nightlyClose).toHaveLength(1);
    expect(uses.nightlyClose[0]).toMatch(/lib\/wiring\.dart:\d+/);
  });

  it("コメントの中は数えない（消し忘れの言い訳にならない）", () => {
    const source = `
      final scope = HatakeScope(
        actions: ActionRegistry({'oldPlugin': (ctx) async => api.old()}),
        child: const SizedBox(),
      );
      // 'oldPlugin' は前のバッチで使っていた
    `;
    const { scan, files } = scanOf(source);
    expect(usesInCode(["oldPlugin"], files, scan.sites).oldPlugin).toBeUndefined();
  });
});
