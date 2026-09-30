import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptRecordIn, canOpenPageIn, canRunActionIn, visibleRecordIn } from "../src/index.js";

/**
 * サーバが画面と同じ判断をする口の共有フィクスチャを、Java 版（`ServerAccess`）と
 * 同じ契約で回す。画面が隠しても API は直接叩けるので、**守る側が同じ答え**を出すことが
 * この口の値打ち（0.9.21 まで見本の3本ともここを手で書いて、定義と食い違っていた）。
 */
type Dict = Record<string, unknown>;
const fixture = JSON.parse(
  readFileSync("../spec/conformance/server_access.json", "utf8"),
) as {
  document: Dict;
  canOpen: { name: string; pageId: string; roles: string[]; expected: boolean }[];
  canRun: { name: string; pageId: string; actionId: string; roles: string[]; expected: boolean }[];
  visible: { name: string; pageId: string; roles: string[]; record: Dict; expected: Dict }[];
  accept: {
    name: string;
    pageId: string;
    roles: string[];
    body: Dict;
    expected: { accepted: Dict; dropped: string[] };
  }[];
};

describe("conformance: server access", () => {
  for (const one of fixture.canOpen) {
    it(`開ける: ${one.name}`, () => {
      expect(canOpenPageIn(fixture.document, one.pageId, one.roles)).toBe(one.expected);
    });
  }
  for (const one of fixture.canRun) {
    it(`押せる: ${one.name}`, () => {
      expect(canRunActionIn(fixture.document, one.pageId, one.actionId, one.roles)).toBe(one.expected);
    });
  }
  for (const one of fixture.visible) {
    it(`見せる: ${one.name}`, () => {
      expect(visibleRecordIn(fixture.document, one.pageId, one.record, one.roles)).toEqual(one.expected);
    });
  }
  for (const one of fixture.accept) {
    it(`受け取る: ${one.name}`, () => {
      const got = acceptRecordIn(fixture.document, one.pageId, one.body, one.roles);
      expect(got.accepted).toEqual(one.expected.accepted);
      expect(got.dropped).toEqual(one.expected.dropped);
    });
  }

  it("フィクスチャの定義そのものが strict で読める（読めない定義で決めごとを縛らない）", async () => {
    const { parseAppJson } = await import("../src/internal.js");
    expect(() => parseAppJson(JSON.stringify(fixture.document), { strict: true })).not.toThrow();
  });

  it("元のレコードは変えない", () => {
    const record = { employeeNo: "1", salary: 1 };
    visibleRecordIn(fixture.document, "employee_master", record, ["viewer"]);
    expect(record).toEqual({ employeeNo: "1", salary: 1 });
  });
});
