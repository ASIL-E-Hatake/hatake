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
//   ・**目印を消しても数が良くならない。** 目印（`UnimplementedError`）を消して空実装
//     （`{}` / `=> null`）に置き換えると、数え方が「TODO のまま」から「埋まっている」に
//     変わる＝**数を良くするために中身を消せる**。だから空実装は `hollow`（中身が無い）
//     として**「埋まっている」に数えない**。ただし**間違いとは言わない**（何もしないのが
//     正しい登録もある）ので、欄を分けて理由を書く。
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
  /**
   * 登録は在り、目印も無いが、**本体が空**（何もしない）。
   *
   * 落ちないので気づけない＝押しても何も起きないボタンになる。**何もしないのが正しい
   * こともある**ので、`pending` とは別に数える。
   */
  | "hollow"
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

const STATE_ORDER: FilledState[] = [
  "pending",
  "hollow",
  "missing",
  "unknown",
  "filled",
];

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
  const hollow = new Set<string>();
  for (const site of scan.sites) {
    for (const name of site.names) {
      const key = `${site.kind}/${name}`;
      if (!where.has(key)) where.set(key, `${site.file}:${site.line}`);
    }
    for (const name of site.pending) pending.add(`${site.kind}/${name}`);
    for (const name of site.hollow) hollow.add(`${site.kind}/${name}`);
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
            : hollow.has(key)
              ? "hollow"
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
  report.items.some(
    (one) =>
      one.state === "pending" || one.state === "missing" || one.state === "hollow",
  ) || report.loose.length > 0;

/**
 * 状態の言葉（**ここが正**）。
 *
 * 配線を渡す側（`wire --merge --todo`）も同じ字を使う＝「数える所」と「渡す所」で
 * 違うことを言わない。
 */
export const STATE_LABEL: Record<FilledState, string> = {
  pending: "TODO のまま",
  hollow: "中身が無い",
  missing: "登録が無い",
  unknown: "言えない",
  filled: "埋まっている",
};

/** 埋めるまで何が起きるか（**ここが正**。[STATE_LABEL] と同じ理由）。 */
export const STATE_WHY: Record<FilledState, string> = {
  pending: "動かすと UnimplementedError で落ちます（hatake wire が足した所のまま）",
  hollow:
    "本体が空です＝**落ちないので気づけません**（押しても何も起きない）。" +
    "何もしないのが正しいなら、そう分かる中身を書いてください",
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
  for (const state of ["pending", "hollow", "missing", "unknown"] as FilledState[]) {
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
      "中身が業務として正しいかは見ていません。" +
      "**目印を消して空実装にしても数は良くなりません**（それは「中身が無い」に入ります）" +
      "＝ただし何もしないのが正しい登録もあるので、そこは間違いとは言いません。",
  );
  return out.join("\n");
}
