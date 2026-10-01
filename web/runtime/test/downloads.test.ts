// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "../src/downloads.js";

/**
 * 出来合いの出力先が**本当に保存させる**こと（ブラウザの `<a download>`）。
 * 中身の作り方は `sinks.test.ts` が見ている。ここは「渡したものがそのまま落ちる」だけ。
 */
afterEach(() => vi.restoreAllMocks());

describe("downloadCsv", () => {
  it("名前と型を付けて、届いた字をそのまま保存させる（BOM を足さない）", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:hatake";
    });
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href });
    });

    await downloadCsv({
      filename: "受注一覧.csv",
      mimeType: "text/csv",
      text: "﻿受注番号\r\nSO-1\r\n",
      charset: "utf-8",
      actionId: "csv",
    });

    expect(clicked).toEqual([{ download: "受注一覧.csv", href: "blob:hatake" }]);
    expect(blobs[0].type).toBe("text/csv");
    expect(await blobs[0].text()).toBe("﻿受注番号\r\nSO-1\r\n");
  });
});
