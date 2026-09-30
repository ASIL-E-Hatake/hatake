import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FALLBACK_ICON, iconPath, MENU_ICONS } from "../src/icons.js";

/**
 * **メニューの絵の名前が、Flutter 版と同じ集合か。**
 *
 * 定義の `icon:` は Renderer をまたいで同じ意味でないといけない。片方だけに名前を
 * 足すと、同じ定義で Flutter では絵が出てブラウザではフォルダ（か、その逆）になる。
 * だから Dart のソース（`_iconFor` の `case`）を読んで突き合わせる。
 */
const DART = "../../flutter/packages/hatake_material/lib/src/renderer/app_menu.dart";

const dartNames = (): string[] => {
  const src = readFileSync(DART, "utf8");
  const body = src.slice(src.indexOf("IconData _iconFor("));
  const end = body.indexOf("default:");
  return [...body.slice(0, end).matchAll(/case '([^']+)':/g)].map((one) => one[1]).sort();
};

describe("メニューの絵", () => {
  it("引ける名前が Flutter 版と同じ", () => {
    const names = dartNames();
    // 読めていること自体も見る（読む所がずれたら黙って空で一致する）。
    expect(names.length).toBeGreaterThan(10);
    expect(Object.keys(MENU_ICONS).sort()).toEqual(names);
  });

  it("知らない名前も、書いていない項目もフォルダ（Flutter と同じ落とし所）", () => {
    expect(iconPath("touch_app")).toBe(FALLBACK_ICON);
    expect(iconPath(undefined)).toBe(FALLBACK_ICON);
    expect(iconPath("dashboard")).toBe(MENU_ICONS.dashboard);
  });

  it("アプリが渡した絵が先", () => {
    expect(iconPath("touch_app", { touch_app: "M0 0h1v1H0z" })).toBe("M0 0h1v1H0z");
  });
});
