import { describe, expect, it } from "vitest";
import {
  RecordKey,
  recordKeyFromParams,
  recordKeyId,
  recordKeyOf,
  recordKeyParams,
} from "../src/recordKey.js";

/**
 * Dart 側の `flutter/packages/hatake_core/test/record_key_test.dart` と**同じ並び**。
 *
 * 複合キーは 0.9.7 で Dart にだけ入っていて、TypeScript には無かった（サーバ側だけを
 * 見ていたので要らなかった）。Web の Renderer を足す段で足りないと分かったので写した。
 * 同じ試験を並べてあるのは、**片方だけ直したときに気づける**ようにするため。
 */
describe("鍵を作る", () => {
  it("単一なら素の値（いままでと同じ＝Repository を直さなくてよい）", () => {
    expect(recordKeyOf(["id"], { id: 7, name: "あ" })).toBe(7);
  });

  it("複合なら RecordKey（書いた順のまま）", () => {
    const key = recordKeyOf(["orderNo", "lineNo"], { lineNo: 2, orderNo: "SO-1" });
    expect(key).toBeInstanceOf(RecordKey);
    expect((key as RecordKey).fields).toEqual(["orderNo", "lineNo"]);
    expect((key as RecordKey).values).toEqual(["SO-1", 2]);
  });

  it("1つでも欠けていたら undefined（その行は指せない）", () => {
    expect(recordKeyOf(["orderNo", "lineNo"], { orderNo: "SO-1" })).toBeUndefined();
  });

  it("項目が無ければ undefined", () => {
    expect(recordKeyOf([], { id: 1 })).toBeUndefined();
  });
});

describe("値で比べる", () => {
  it("同じ中身なら等しい（素の地図はここで別物になる）", () => {
    const one = new RecordKey({ orderNo: "SO-1", lineNo: 2 });
    const two = new RecordKey({ orderNo: "SO-1", lineNo: 2 });
    expect(one.equals(two)).toBe(true);
    // **集まりに入れて数え違えない**のが、この型が在る理由。
    expect(new Set([recordKeyId(one), recordKeyId(two)]).size).toBe(1);
  });

  it("並びが違えば別の鍵（URL の道が変わるので等しいと言ってはいけない）", () => {
    const one = new RecordKey({ orderNo: "SO-1", lineNo: 2 });
    const two = new RecordKey({ lineNo: 2, orderNo: "SO-1" });
    expect(one.equals(two)).toBe(false);
  });

  it("値が違えば別の鍵", () => {
    const one = new RecordKey({ orderNo: "SO-1", lineNo: 2 });
    const two = new RecordKey({ orderNo: "SO-1", lineNo: 3 });
    expect(one.equals(two)).toBe(false);
  });
});

describe("画面の引数にほどく／組み立てる", () => {
  it("単一は項目名そのままで渡る", () => {
    expect(recordKeyParams(["id"], 7)).toEqual({ id: 7 });
  });

  it("複合は項目ごとに1つずつ渡る", () => {
    const key = new RecordKey({ orderNo: "SO-1", lineNo: 2 });
    expect(recordKeyParams(["orderNo", "lineNo"], key)).toEqual({ orderNo: "SO-1", lineNo: 2 });
  });

  it("ほどいて組み立て直すと元に戻る", () => {
    const fields = ["orderNo", "lineNo"];
    const key = new RecordKey({ orderNo: "SO-1", lineNo: 2 });
    const back = recordKeyFromParams(fields, recordKeyParams(fields, key));
    expect((back as RecordKey).equals(key)).toBe(true);
  });

  it("単一は `id` でも受ける（`key` を省いた画面の既定なので壊さない）", () => {
    expect(recordKeyFromParams(["customerCode"], { id: "C-1" })).toBe("C-1");
  });

  it("複合は1つでも足りなければ undefined（取りに行かない）", () => {
    expect(recordKeyFromParams(["orderNo", "lineNo"], { orderNo: "SO-1" })).toBeUndefined();
  });
});
