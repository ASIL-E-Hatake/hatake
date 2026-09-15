// 書き方が違っても**同じ画面か**（`hatake same`）。
//
// AI に直させると差分は爆発する（キーの並びが変わる・既定値が明示される・囲みの書き方が
// 変わる）。けれど**意味は変わっていない**ことが多い。いまの律速は AI の速さではなく人の
// レビューなので、ここは AI を使うほど効く。
//
// 見るのは**解析後のモデル**。同じ物差しを2つ持たないため、モデルの作り方は
// [minimize] と同じ（あちらは「切っても意味が変わらない」をこれで確かめている）。
//
// 言えないことを決めてある:
//   ・**等価な条件の書き換えは見ない**（`all: [x]` と `x` はモデルが違うので「違う」と
//     言う）。条件の代数を入れると、道具が「同じ」と言った所を人が確かめられなくなる
//   ・プラグインの中身・Repository の実装・アプリ側の登録は見えない（定義の外）
//   ・**同じ＝正しい、ではない**。両方とも同じように間違っていることはある
//
// 「同じか」だけでは、レビューには使えない（違うなら**どこが**違うかが要る）。だから
// 違う所を道つきで出す。モデルを見ているので、道は**解析後の形**（書いた場所ではなく
// 意味の場所）。

import { parseAppMap, parseAppYaml } from "./appParse.js";
import { parsePageMap, parsePageYaml } from "./parse.js";
import { stableModel } from "./minimize.js";
import { parse as parseYamlText } from "yaml";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 違う所1つ。 */
export interface SameChange {
  /** 解析後のモデルの中の道（`form.sections[0].fields[2].label`）。 */
  path: string;
  /** 片方にだけ在るときは `undefined`。 */
  before?: string;
  after?: string;
}

export interface SameResult {
  /** 解析後のモデルが同じか。 */
  same: boolean;
  /** 違う所（同じなら空）。並びは道の順。 */
  changes: SameChange[];
  /** `app:` として比べたか（片方が単票なら比べられない）。 */
  kind: "app" | "page";
}

const isApp = (source: string): boolean => /^\s*app\s*:/m.test(source);

/** 解析後のモデル（strict で読む＝書き間違いのある定義は比べない）。 */
const modelOf = (source: string, app: boolean): unknown => {
  if (app) parseAppYaml(source, { strict: true });
  else parsePageYaml(source, { strict: true });
  const raw = parseYamlText(source) as Dict;
  return app ? parseAppMap(raw) : parsePageMap(raw);
};

/**
 * 2つの定義が同じ画面かを見る。
 *
 * 片方が `app:` で片方が単票なら投げる（比べる相手が違うので、「違う」ではなく
 * 「比べられない」と言うのが正しい）。
 */
export function sameSources(before: string, after: string): SameResult {
  const appBefore = isApp(before);
  if (appBefore !== isApp(after)) {
    throw new Error(
      "片方が `app:`、もう片方が単票（`page:`）です。" +
        "**比べる相手が違います**（同じか違うかではなく、比べられません）。",
    );
  }
  const a = modelOf(before, appBefore);
  const b = modelOf(after, appBefore);
  const changes: SameChange[] = [];
  walk(a, b, "", changes);
  return {
    // 道つきの差を出せないこともある（[walk] が見ない形）ので、同じかどうかは
    // **モデルの文字**で決める。差の一覧は説明で、判定ではない。
    same: stableModel(a) === stableModel(b),
    changes,
    kind: appBefore ? "app" : "page",
  };
}

const show = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "null");

/** モデルを2つ同時に歩いて、違う所を道つきで集める。 */
function walk(a: unknown, b: unknown, path: string, out: SameChange[]): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      walk(a[i], b[i], `${path}[${i}]`, out);
    }
    return;
  }
  if (isDict(a) && isDict(b)) {
    // 鍵の並びは見ない（並べ替えは意味を変えないので、そこを差として出すと嘘になる）。
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      walk(a[key], b[key], path === "" ? key : `${path}.${key}`, out);
    }
    return;
  }
  if (stableModel(a) === stableModel(b)) return;
  out.push({
    path: path === "" ? "(全体)" : path,
    ...(a === undefined ? {} : { before: show(a) }),
    ...(b === undefined ? {} : { after: show(b) }),
  });
}

/** 人が読む形。 */
export function sameLines(result: SameResult, names: [string, string]): string[] {
  if (result.same) {
    return [
      `同じ画面です（${names[0]} と ${names[1]} は、解析後のモデルが一致します）。`,
      "",
      SAME_NOTE,
    ];
  }
  const out = [`違う画面です（違う所 ${result.changes.length} 件）:`, ""];
  for (const one of result.changes) {
    const before = one.before ?? "（無い）";
    const after = one.after ?? "（無い）";
    out.push(`  ${one.path}`);
    out.push(`    ${names[0]}: ${before}`);
    out.push(`    ${names[1]}: ${after}`);
  }
  if (result.changes.length === 0) {
    out.push(
      "  道つきでは出せませんでした（モデルの形そのものが違います）。" +
        "hatake explain --diff で画面の言葉として読み比べてください。",
    );
  }
  out.push("");
  out.push(SAME_NOTE);
  return out;
}

/** この判定が何で、何でないかを毎回書く。 */
export const SAME_NOTE =
  "※ 見ているのは**解析後のモデル**です（キーの並び・既定値を明示したかどうか・" +
  "囲みの書き方は差になりません）。**等価な条件の書き換えは見ません**" +
  "（`all: [x]` と `x` はモデルが違うので「違う」と言います）。" +
  "プラグインの中身・Repository の実装・アプリ側の登録は見えません。" +
  "**同じ＝正しい、ではありません**（両方とも同じように間違っていることはあります）。";
