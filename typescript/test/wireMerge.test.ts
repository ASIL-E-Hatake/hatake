import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { mergeWiring, renderWireMerge, wireApp } from "../src/index.js";

/// 既にある配線に、足りない登録だけを足す（`hatake wire --merge`）。
///
/// ここで守るのは4つ。**手で書いた中身を1バイトも変えない**（変えるなら誰も使わない）・
/// **足すものが無ければ何も変わらない**・**要らなくなった登録は消さない**（言うだけ）・
/// **読めない形なら何もしない**（壊れた Dart を書き出すほうが、何もしないより悪い）。
const doc = (yaml: string) => parseYaml(yaml) as Record<string, unknown>;

/** 受注照会1枚（プラグイン1つ・CSV 出力あり）。 */
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
        columns: [{ field: orderNo, label: 受注番号 }]
      actions:
        - { id: csv, type: export, label: CSV出力 }
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
`;

/** 画面を1枚増やした（顧客マスタ＝Repository が1つ増え、独自の見せ方も増える）。 */
const GROWN = `
app:
  id: sales
  title: 販売管理
  menu:
    - { id: orders, label: 受注, page: order_search }
    - { id: customers, label: 顧客, page: customer_master }
  pages:
    - type: search
      id: order_search
      title: 受注照会
      repository: orderRepository
      key: orderNo
      table:
        columns: [{ field: orderNo, label: 受注番号, format: orderNoFormat }]
      actions:
        - { id: csv, type: export, label: CSV出力 }
        - { id: approve, type: plugin, plugin: approveOrders, label: 承認 }
        - { id: reject, type: plugin, plugin: rejectOrders, label: 却下 }
    - type: master
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      key: id
      table:
        columns: [{ field: id, label: ID }]
      form:
        sections: [{ fields: [{ field: id, label: ID }] }]
`;

/**
 * 下書きを出して、人が中身を埋めた状態を作る。
 *
 * 埋め方は実物に寄せる（`mapLiteral` が 80 桁で折り返すので、中身は次の行に来る）。
 * 書き出す所には**文字列の中の波括弧**を残す＝閉じ括弧を数え間違える形をわざと含める。
 */
function handFilled(yaml = APP, options = {}): string {
  return wireApp(doc(yaml), options)
    .replace(
      "throw UnimplementedError('approveOrders: 何をするか')",
      "api.approve(ctx.records)",
    )
    .replace(
      "throw UnimplementedError('${request.filename} を書き出す')",
      "download(request, '${request.filename}')",
    );
}

describe("hatake wire --merge", () => {
  it("足すものが無ければ1バイトも変えない", () => {
    const before = handFilled();
    const result = mergeWiring(before, doc(APP));

    expect(result.code).toBe(before);
    expect(result.added).toEqual({});
    expect(result.created).toEqual([]);
    expect(renderWireMerge(result)).toContain("1バイトも変えていません");
  });

  it("増えた登録だけを足して、手で埋めた中身は残す", () => {
    const before = handFilled();
    const result = mergeWiring(before, doc(GROWN));

    // 手で書いた中身がそのまま在る（これが崩れるなら道具として使えない）。
    expect(result.code).toContain("api.approve(ctx.records)");
    expect(result.code).toContain("download(request, '${request.filename}')");
    // 増えた分だけが足されている。
    expect(result.added.actions).toEqual(["rejectOrders"]);
    expect(result.added.repositories).toEqual(["customerRepository"]);
    expect(result.code).toContain("'rejectOrders': (ctx) async =>");
    expect(result.code).toContain("'customerRepository': _UnwiredRepository(");
    // 既にある登録は増えない（重複を書かない）。
    expect(result.code.match(/'approveOrders':/g)).toHaveLength(1);
  });

  it("行数は「足した分だけ」増える（並べ替えも整形もしない）", () => {
    const before = handFilled();
    const after = mergeWiring(before, doc(GROWN)).code;
    const removed = before
      .split("\n")
      .filter((line) => !after.split("\n").includes(line));

    // 消える行は**1行だけ**＝`renderer: const MaterialRenderer(),`（引数を足すので
    // const を外して開く）。ほかは1行も消えない＝足すだけ。
    expect(removed.filter((line) => line.trim() !== "")).toEqual([
      "        renderer: const MaterialRenderer(),",
    ]);
  });

  it("開く必要が無ければ renderer も触らない", () => {
    // 見せ方の登録が要らない定義なら、const のままにする（差分を作らない）。
    const before = handFilled();
    const grownWithoutFormat = GROWN.replace(", format: orderNoFormat", "");
    const result = mergeWiring(before, doc(grownWithoutFormat));

    expect(result.code).toContain("renderer: const MaterialRenderer(),");
    expect(result.added.actions).toEqual(["rejectOrders"]);
  });

  it("引数そのものが無ければ丸ごと作る（child: の前に入れる）", () => {
    // 独自の見せ方（formatters）は元の配線に無い＝renderer を開いて足す。
    const before = handFilled();
    expect(before).toContain("renderer: const MaterialRenderer(),");
    const result = mergeWiring(before, doc(GROWN));

    expect(result.created).toContain("formatters");
    expect(result.code).toContain("renderer: MaterialRenderer(");
    expect(result.code).toContain("formatters: FormatterRegistry({");
    expect(result.code).toContain("'orderNoFormat':");
    // const を外さないと解析が通らない（MaterialRenderer に引数が付くので）。
    expect(result.code).not.toContain("const MaterialRenderer(),");
  });

  it("REST で組んである配線には集合の名前を足す", () => {
    const before = handFilled(APP, { baseUrl: "/api" });
    const result = mergeWiring(before, doc(GROWN));

    expect(result.added.collections).toEqual(["customerRepository"]);
    expect(result.code).toContain("'customerRepository': 'customers',");
    // 自分で書く形の stub は混ぜない（REST で組んである配線なので）。
    expect(result.code).not.toContain("_UnwiredRepository('customerRepository')");
  });

  it("集合の名前は上書きできる", () => {
    const before = handFilled(APP, { baseUrl: "/api" });
    const result = mergeWiring(before, doc(GROWN), {
      collections: { customerRepository: "clients" },
    });

    expect(result.code).toContain("'customerRepository': 'clients',");
  });

  it("要らなくなった登録は消さずに言う", () => {
    // 逆向き：大きい定義で作った配線に、小さい定義を渡す。
    const before = handFilled(GROWN);
    const result = mergeWiring(before, doc(APP));

    expect(result.code).toBe(before); // 消していない
    expect(result.leftover.actions).toEqual(["rejectOrders"]);
    expect(result.leftover.repositories).toEqual(["customerRepository"]);
    const report = renderWireMerge(result);
    expect(report).toContain("**消していません**");
    expect(report).toContain("refs --unused");
  });

  it("出す口が無ければ足す（在れば触らない）", () => {
    // CSV を書き出す口を消した配線（登録し忘れの再現）。
    const before = handFilled().replace(
      /\n *\/\/ CSV は[\s\S]*?download\(request[^\n]*\n/,
      "\n",
    );
    const result = mergeWiring(before, doc(APP));

    expect(result.created).toContain("exportSink");
    expect(result.code).toContain("exportSink: (request) async =>");
    // 既に在るときは足さない（2つ書くと Dart が通らない）。
    expect(mergeWiring(result.code, doc(APP)).created).toEqual([]);
  });

  it("Renderer を手で書いてあるなら触らず、そう言う", () => {
    const before = handFilled().replace(
      "renderer: const MaterialRenderer(),",
      "renderer: const MyRenderer(),",
    );
    const result = mergeWiring(before, doc(GROWN));

    expect(result.code).toContain("renderer: const MyRenderer(),");
    expect(result.created).not.toContain("formatters");
    expect(result.untouched.join("")).toContain("手で書いてあるので触っていません");
    // ほかの登録は足す（Renderer が読めないからといって全部やめない）。
    expect(result.added.actions).toEqual(["rejectOrders"]);
  });

  it("配線ではないものを渡されたら、何もせず理由を言う", () => {
    expect(() => mergeWiring("void main() {}\n", doc(APP))).toThrow("HatakeScope(");
    expect(() =>
      mergeWiring("HatakeScope(\n  renderer: x,\n)\n", doc(APP)),
    ).toThrow("child:");
  });

  it("Dart の文字列に入った波括弧で閉じ位置を間違えない", () => {
    // `'${request.filename} を書き出す'` の } を数えると、閉じ位置がずれる。
    const before = handFilled();
    expect(before).toContain("${request.filename}");
    const result = mergeWiring(before, doc(GROWN));

    // 足した行が map の中に入っている（外に出ていない）。
    const lines = result.code.split("\n");
    const at = lines.findIndex((line) => line.includes("'rejectOrders':"));
    expect(lines[at].startsWith("          ")).toBe(true);
    expect(lines.slice(0, at).some((line) => line.includes("actions: ActionRegistry("))).toBe(
      true,
    );
  });
});
