import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  collectRefs,
  filledReport,
  inState,
  mergeWiring,
  renderWireTodo,
  scanRegistrations,
  wireTodo,
} from "../src/internal.js";

/**
 * 埋める仕事を渡す形（`wire --merge --todo`）。
 *
 * ここでいちばんまずいのは**数と一覧が違う**こと ── `refs --filled` が「3件残っている」と
 * 言っているのに、渡される一覧には1件しか入っていない、という形。そうなると埋める人は
 * 数のほうを信用しなくなる。だから「同じ配線を、数える側と渡す側の両方に通して、
 * 突き合わせる」を機械で見る。
 */
const APP = parse(`app:
  id: sales
  title: 受注
  pages:
    - type: crud
      id: orders
      title: 受注
      repository: orderRepository
      key: orderNo
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: amount, label: 金額, type: number }
      actions:
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
        - { id: reject, type: plugin, plugin: rejectOrders, label: 却下 }
        - { id: archive, type: plugin, plugin: archiveOrders, label: 書庫へ }
`) as Record<string, unknown>;

/**
 * 3つの状態が同時に在る配線。
 *   ・approveOrders … 前から TODO のまま（動かすと落ちる）
 *   ・archiveOrders … 目印は無いが**本体が空**（落ちないので気づけない）
 *   ・rejectOrders  … まだ登録が無い＝`--merge` がこの回に足す
 */
const WIRING = [
  "class SalesApp extends StatelessWidget {",
  "  @override",
  "  Widget build(BuildContext context) {",
  "    return HatakeScope(",
  "      repositories: const RepositoryRegistry({",
  "        'orderRepository': OrderRepository(),",
  "      }),",
  "      actions: ActionRegistry({",
  "        'approveOrders': (ctx) async => throw UnimplementedError('TODO'),",
  "        'archiveOrders': (ctx) async {},",
  "      }),",
  "      renderer: const MaterialRenderer(),",
  "      child: HatakeApp(app: definition),",
  "    );",
  "  }",
  "}",
  "",
].join("\n");

const merged = () => mergeWiring(WIRING, APP, {});

describe("埋める仕事を渡す（足した所だけではない）", () => {
  it("足した所・前から TODO・中身が空を、1つの一覧で渡す", () => {
    const todo = wireTodo(merged(), "wiring.dart");
    expect(todo.added).toBe(1);
    expect(todo.unfilled).toBe(3);
    expect(
      todo.items.map((one) => [one.name, one.state]),
    ).toEqual([
      ["rejectOrders", "added"],
      ["approveOrders", "pending"],
      ["archiveOrders", "hollow"],
    ]);
    // 書くものの言葉は、出したコードと同じ1か所から（`actions` は「何をするか」）。
    expect(todo.items.every((one) => one.todo === "何をするか")).toBe(true);
    // 行番号は3件とも付く（渡された相手はそこを開くだけでいい）。
    expect(todo.items.every((one) => (one.line ?? 0) > 0)).toBe(true);
  });

  it("**渡す一覧は、数える側（refs --filled）と同じもの**", () => {
    const result = merged();
    const todo = wireTodo(result, "wiring.dart");
    const scan = scanRegistrations([{ path: "wiring.dart", source: result.code }]);
    const report = filledReport(collectRefs(APP), scan, 1);
    const counted = [
      ...inState(report, "pending"),
      ...inState(report, "hollow"),
      ...inState(report, "missing"),
    ]
      .map((one) => one.name)
      .sort();
    expect(todo.items.map((one) => one.name).sort()).toEqual(counted);
    expect(todo.unfilled).toBe(counted.length);
  });

  it("中身が空の所は**落ちない**と書く（足した所と同じ扱いにしない）", () => {
    const text = renderWireTodo(wireTodo(merged(), "wiring.dart"));
    expect(text).toContain("埋める仕事は 3 件です");
    expect(text).toContain("いま足した 1・TODO のまま 1・中身が空 1");
    expect(text).toContain("[中身が無い]");
    expect(text).toContain("落ちないので気づけません");
    expect(text).toContain("UnimplementedError で落ちます");
    expect(text).toContain("ほかの所は触らないこと");
  });

  it("足すものが無くても、残っている仕事は渡す（前は何も言わなかった）", () => {
    // 既に3つとも登録してある配線（うち2つは埋まっていない）。
    const full = WIRING.replace(
      "        'archiveOrders': (ctx) async {},",
      "        'archiveOrders': (ctx) async {},\n" +
        "        'rejectOrders': (ctx) async => api.reject(ctx.records),",
    );
    const todo = wireTodo(mergeWiring(full, APP, {}), "wiring.dart");
    expect(todo.added).toBe(0);
    expect(todo.unfilled).toBe(2);
    const text = renderWireTodo(todo);
    expect(text).toContain("足すものはありませんでした");
    expect(text).toContain("埋める仕事は 2 件です");
  });

  it("埋め終わっていれば、そう言う（無い仕事を渡さない）", () => {
    const done = WIRING.replace(
      "        'approveOrders': (ctx) async => throw UnimplementedError('TODO'),\n" +
        "        'archiveOrders': (ctx) async {},",
      "        'approveOrders': (ctx) async => api.approve(ctx.records),\n" +
        "        'archiveOrders': (ctx) async => api.archive(ctx.records),\n" +
        "        'rejectOrders': (ctx) async => api.reject(ctx.records),",
    );
    const todo = wireTodo(mergeWiring(done, APP, {}), "wiring.dart");
    expect(todo.unfilled).toBe(0);
    expect(renderWireTodo(todo)).toContain("埋める仕事はありません");
  });

  it("書き出していなければ行番号を付けない（在りもしないファイルを指さない）", () => {
    const todo = wireTodo(merged());
    expect(todo.file).toBeUndefined();
    expect(todo.items.every((one) => one.line === undefined)).toBe(true);
    expect(renderWireTodo(todo)).toContain("足したコードは書き出していません");
  });
});
