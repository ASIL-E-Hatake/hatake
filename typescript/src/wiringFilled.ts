// 定義が要求している登録が、実装で**本当に埋まったか**を数える（`refs --filled`）。
//
// なぜ要るか: 足す所までは機械にやらせられるようになった（`wire --merge`）。だが足した
// 直後は全部 TODO で、**埋め忘れは動かして初めて分かる**（押した人の所で
// UnimplementedError が出る）。定義の側には「何が要るか」が、実装の側には「何が在るか」と
// 「中身が埋まっているか」が在るので、突き合わせれば出荷前に数えられる。
//
// 嘘をつかないための決めごと:
//   ・**読めなかった登録が在るなら「言えない」と言う。** 変数から組み立てている登録が
//     1つでも在れば、その種類は「登録が無い」と言えない（登録してあるのに未登録と
//     言うのが、この仕組みで一番まずい嘘＝仕組みごと信用されなくなる）。
//   ・**「埋まっている」は「目印が残っていない」という意味しかない。** 中身が業務として
//     正しいかは見ていない。数え方をそう名乗る。
//   ・**組み込みは数えない。** 定義が使っているだけで登録は要らないので、混ぜると
//     「20 件のうち 18 件埋まっている」のような、読む意味の無い数になる。

import {
  type DefinitionRef,
  type RefKind,
  refsNeedingRegistration,
} from "./refs.js";
import type { RegistryScan } from "./registryScan.js";
import type { LooseTodo } from "./registryUse.js";

/** 1件の状態。 */
export type FilledState =
  /** 登録が在って、目印も残っていない。 */
  | "filled"
  /** 登録は在るが、中身が TODO のまま（動かすと落ちる）。 */
  | "pending"
  /** 登録が無い（`wire --merge` で足せる）。 */
  | "missing"
  /** 読めなかった登録が在るので、在るとも無いとも言えない。 */
  | "unknown";

/** 定義が要求している登録1件。 */
export interface FilledItem {
  kind: RefKind;
  name: string;
  state: FilledState;
  /** 登録の場所（`filled` / `pending` のとき）。 */
  where?: string;
}

export interface FilledReport {
  items: FilledItem[];
  /** 読めなかった登録（在れば、その種類は `unknown` になる）。 */
  unreadable: RegistryScan["unreadable"];
  /**
   * 登録の外に残っている TODO（配線そのものの埋め忘れ）。
   *
   * REST で組んだ配線は Repository の登録は済んでいるのに、**実際に通信する所**が
   * TODO のまま残る。登録1件ずつを数えるだけでは「全部埋まっている」と出て、動かすと
   * 1件も取れない。
   */
  loose: LooseTodo[];
  /** 走査したファイルの数（「1枚だけ渡して読み違える」を防ぐために必ず出す）。 */
  scanned: number;
}

const STATE_ORDER: FilledState[] = ["pending", "missing", "unknown", "filled"];

/**
 * 定義の要求と実装の走査を突き合わせる。
 *
 * [refs] は定義から集めたもの（複数の定義をまとめて渡してよい）。
 */
export function filledReport(
  refs: DefinitionRef[],
  scan: RegistryScan,
  scanned: number,
  loose: LooseTodo[] = [],
): FilledReport {
  const needed = refsNeedingRegistration(refs);
  // 読めなかった種類は「無い」と言えない（別の場所で登録しているかもしれない）。
  const blind = new Set(scan.unreadable.map((one) => one.kind));
  const where = new Map<string, string>();
  const pending = new Set<string>();
  for (const site of scan.sites) {
    for (const name of site.names) {
      const key = `${site.kind}/${name}`;
      if (!where.has(key)) where.set(key, `${site.file}:${site.line}`);
    }
    for (const name of site.pending) pending.add(`${site.kind}/${name}`);
  }

  const items: FilledItem[] = [];
  for (const [kind, names] of Object.entries(needed)) {
    for (const name of names ?? []) {
      const key = `${kind}/${name}`;
      const at = where.get(key);
      const state: FilledState =
        at === undefined
          ? blind.has(kind as RefKind)
            ? "unknown"
            : "missing"
          : pending.has(key)
            ? "pending"
            : "filled";
      items.push({
        kind: kind as RefKind,
        name,
        state,
        ...(at === undefined ? {} : { where: at }),
      });
    }
  }
  // 読む人が先に見たいものから（埋め忘れ → 足りない → 言えない → 済み）。
  items.sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name),
  );
  return { items, unreadable: scan.unreadable, loose, scanned };
}

/** その状態のものだけ。 */
export const inState = (report: FilledReport, state: FilledState): FilledItem[] =>
  report.items.filter((one) => one.state === state);

/**
 * 落とすかどうか（`--pending-as-error`）。
 *
 * TODO のまま・登録が無い、で落とす。**「言えない」では落とさない**（読めない登録は
 * 道具の限界で、書いた人の落ち度ではない）。
 */
export const hasUnfilled = (report: FilledReport): boolean =>
  report.items.some((one) => one.state === "pending" || one.state === "missing") ||
  report.loose.length > 0;

const STATE_LABEL: Record<FilledState, string> = {
  pending: "TODO のまま",
  missing: "登録が無い",
  unknown: "言えない",
  filled: "埋まっている",
};

const STATE_WHY: Record<FilledState, string> = {
  pending: "動かすと UnimplementedError で落ちます（hatake wire が足した所のまま）",
  missing: "実装に見つかりません（hatake wire --merge で足せます）",
  unknown: "読めなかった登録が在るので、在るとも無いとも言えません",
  filled: "",
};

/** 人が読む形。**数が先**（一覧は読まれないが、数は読まれる）。 */
export function renderFilled(report: FilledReport): string {
  const out: string[] = [];
  const count = (state: FilledState): number => inState(report, state).length;
  out.push(
    `定義が要求している登録: ${report.items.length} 件` +
      `（実装 ${report.scanned} ファイルと突き合わせました）`,
  );
  for (const state of STATE_ORDER) {
    if (state === "unknown" && count(state) === 0) continue;
    out.push(`  ${STATE_LABEL[state]}   ${count(state)}`);
  }
  for (const state of ["pending", "missing", "unknown"] as FilledState[]) {
    const found = inState(report, state);
    if (found.length === 0) continue;
    out.push("");
    out.push(`${STATE_LABEL[state]}（${STATE_WHY[state]}）:`);
    for (const one of found) {
      out.push(
        `  ${one.kind}/${one.name}${one.where === undefined ? "" : `   ${one.where}`}`,
      );
    }
  }
  if (report.loose.length > 0) {
    out.push("");
    out.push(
      "配線そのものに残っている TODO（登録の外。ここが埋まらないと、登録が済んでいても" +
        "動きません）:",
    );
    for (const one of report.loose) {
      out.push(`  ${one.file}:${one.line}   ${one.what}`);
    }
  }
  if (report.unreadable.length > 0) {
    out.push("");
    out.push(`読めなかった登録が ${report.unreadable.length} 件あります:`);
    for (const one of report.unreadable) {
      out.push(`  ${one.file}:${one.line} (${one.kind}) ${one.reason}`);
    }
  }
  out.push("");
  out.push(
    "※ 「埋まっている」は**目印（UnimplementedError）が残っていない**という意味です。" +
      "中身が業務として正しいかは見ていません。",
  );
  return out.join("\n");
}
