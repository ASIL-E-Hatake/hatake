import { describe, expect, it } from "vitest";
import { IntentParseError, parseIntent } from "../src/index.js";

/**
 * 意図の1枚（言ったこと）の読み方。
 *
 * ここで大事なのは**黙って通さない**こと。意図は「言った言ってない」を潰すための紙
 * なので、書き間違いを黙って捨てると「書いたのに突き合わせに入っていない要求」が
 * できる＝紙のほうが嘘になる。
 */
const source = `intent_version: "1.0"
page: order_search
asked:
  - id: R1
    text: 受注を受注番号で探せる
    covers: [filter:orderNo]
    by: 田中
    at: "2026-09-08"
  - id: R2
    text: 承認ボタンで、選んだ行をまとめて確定にする
    covers: [action:approve]
    source: ai-draft
decisions:
  - id: D1
    text: 出荷済の受注は直せない
    why: 倉庫の締めが先に走るため
    covers: [field:status]
undecided:
  - id: U1
    text: 却下の理由の選択肢は未定
acceptance:
  - validate --warn-as-error
`;

describe("意図の1枚を読む", () => {
  const intent = parseIntent(source);

  it("要求・決めごと・未決・終わりの判定を分けて持つ", () => {
    expect(intent.asked.map((one) => one.id)).toEqual(["R1", "R2"]);
    expect(intent.decisions.map((one) => one.id)).toEqual(["D1"]);
    expect(intent.undecided.map((one) => one.id)).toEqual(["U1"]);
    expect(intent.acceptance).toEqual(["validate --warn-as-error"]);
  });

  it("原文をそのまま持つ（要約しない）", () => {
    expect(intent.asked[0].text).toBe("受注を受注番号で探せる");
    expect(intent.asked[0].by).toBe("田中");
    expect(intent.asked[0].at).toBe("2026-09-08");
  });

  it("人が書いたものは確かめ済み、AI の下書きは未確認", () => {
    // 「AI がこう読んだ」を人が見ていない状態を、区別して持てないと意味がない。
    expect(intent.asked[0].source).toBe("human");
    expect(intent.asked[0].confirmed).toBe(true);
    expect(intent.asked[1].source).toBe("ai-draft");
    expect(intent.asked[1].confirmed).toBe(false);
  });

  it("決めごとは理由を持てる", () => {
    expect(intent.decisions[0].why).toBe("倉庫の締めが先に走るため");
  });
});

describe("黙って通さない", () => {
  it("知らないキーは弾く（近い名前を添える）", () => {
    expect(() => parseIntent("asked:\n  - id: R1\n    text: x\n    cover: []\n"))
      .toThrow(/covers/);
  });

  it("id の無い要求は弾く", () => {
    expect(() => parseIntent("asked:\n  - text: 受注を探せる\n")).toThrow(
      IntentParseError,
    );
  });

  it("text の無い要求は弾く（要求の中身が無い）", () => {
    expect(() => parseIntent("asked:\n  - id: R1\n")).toThrow(/text/);
  });

  it("id の重複は弾く（PR で指すものなので）", () => {
    expect(() =>
      parseIntent(
        "asked:\n  - id: R1\n    text: a\ndecisions:\n  - id: R1\n    text: b\n",
      ),
    ).toThrow(/R1/);
  });

  it("covers の種類は閉じた集合", () => {
    expect(() =>
      parseIntent("asked:\n  - id: R1\n    text: a\n    covers: [widget:foo]\n"),
    ).toThrow(/covers/);
  });

  it("種類の無い covers も弾く", () => {
    expect(() =>
      parseIntent("asked:\n  - id: R1\n    text: a\n    covers: [orderNo]\n"),
    ).toThrow(/covers/);
  });

  it("知らない版は読まない（新しい欄を無視した結果を「済」と言わない）", () => {
    expect(() => parseIntent('intent_version: "2.0"\n')).toThrow(/2\.0/);
  });

  it("source は human か ai-draft だけ", () => {
    expect(() =>
      parseIntent("asked:\n  - id: R1\n    text: a\n    source: bot\n"),
    ).toThrow(/human/);
  });
});
