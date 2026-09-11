import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTION_CASES,
  ACTION_FALLBACKS,
  SAID_BY,
} from "../src/index.js";

/**
 * 押した時の言い方（Flutter の最後の砦）と、押す前に言う側の突き合わせ。
 *
 * ここが効くのは**型で縛れない所**だから。Renderer の「このページでは使えません」は
 * 最後の砦で、本当はその前に言えること（`validate` の警告・strict・`--registry`）。
 * 片方だけ増やすと**押す前に言えるはずのことを押してから言う**画面ができるので、
 * 対応を両方向で確かめる。
 */
const RENDERER = "../flutter/packages/hatake_material/lib/src/renderer/page_actions.dart";

const source = (): string => readFileSync(RENDERER, "utf8");

/** Dart の中の「最後の砦」の文（`アクション "${action.id}" は…`）。 */
function fallbackTexts(dart: string): string[] {
  const found = [...dart.matchAll(/アクション "\$\{action\.id\}"([^']*)/g)].map(
    (one) => one[1].trim(),
  );
  expect(found.length, "最後の砦の文が読めていない（文の形が変わった？）").toBeGreaterThan(
    0,
  );
  return found;
}

describe("押した時の言い方と、押す前の表", () => {
  it("表に書いた文は、全部 Dart に在る（言い方を変えたら表も変わる）", () => {
    const dart = source();
    const missing = ACTION_FALLBACKS.filter(
      (one) => !dart.includes(one.message),
    ).map((one) => one.message);
    expect(missing).toEqual([]);
  });

  it("Dart に在る文は、全部表に在る（片方だけ増やせない）", () => {
    const texts = fallbackTexts(source());
    const orphans = texts.filter(
      (text) => !ACTION_FALLBACKS.some((one) => text.includes(one.message.replace(/^は/, ""))),
    );
    expect(
      orphans,
      "押してから言う道を足したら、押す前に言う側も決めてください",
    ).toEqual([]);
  });

  it("押す前に言う側は必ず書いてある（「まだ無い」は書けない）", () => {
    for (const one of ACTION_FALLBACKS) {
      expect(one.before.length, one.message).toBeGreaterThan(0);
      expect(SAID_BY).toContain(one.by);
      expect(one.why.length, one.message).toBeGreaterThan(0);
    }
  });

  it("押す前に言う規則は、本当に実装に在る", () => {
    // 規則名は文字なので、綴りを間違えても誰も気づけない。**実装の中に在ること**まで
    // 見る（警告は warnings.ts / actionNeeds.ts が持っている）。
    const code = [
      readFileSync("src/warnings.ts", "utf8"),
      readFileSync("src/actionNeeds.ts", "utf8"),
    ].join("\n");
    const missing = ACTION_FALLBACKS.filter(
      (one) => one.by !== "renderer" && !code.includes(`"${one.before}"`),
    ).map((one) => one.before);
    expect(missing).toEqual([]);
  });

  it("押す前の表（ACTION_CASES）と規則名が食い違っていない", () => {
    // ACTION_CASES が持っている規則名は、対応表の `before` にも出てくるものが多い。
    // 少なくとも**表に書いた規則名が ACTION_CASES の綴りと同じ**ことを見る
    // （同じ規則を2つの綴りで書くと、直し方の表から引けなくなる）。
    const rules = new Set(ACTION_CASES.map((one) => one.rule));
    const wrong = ACTION_FALLBACKS.filter(
      (one) =>
        one.by === "validate" &&
        [...rules].some(
          (rule) => rule.toLowerCase() === one.before.toLowerCase() && rule !== one.before,
        ),
    );
    expect(wrong).toEqual([]);
  });
});
