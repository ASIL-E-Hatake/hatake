// 叩いた結果（`probe` / `attack` の `--json`）を、**前回と比べられる形**に開く。
//
// なぜ要るか: 毎晩回すと出力は毎晩ほぼ同じで、人は同じ表を読み続けられない。読まれない
// 出力は無いのと同じなので、**変わった所だけ**を出せる形にする。
//
// 嘘をつかないための決めごと:
//   ・**鍵に数を入れない。** `what` は人が読む文で、中に数が入る（「50 件を頼んで
//     61 件返っています」）。文で照合すると、同じ食い違いが数が変わっただけで
//     「新しく出た」に見える＝毎晩「新しい」と言い続ける表になる。
//   ・**鍵に基点と問い合わせ文字列を入れない。** 環境（`--base`）と定義（`pageSize`）で
//     変わるので、そこを鍵にすると引っ越しただけで全部が新しくなる。
//   ・**叩いた相手を覚える。** 資格が切れて役割を1つ叩けなくなると、その役割の穴は
//     報告から消える＝**直ったように見える**。これがこの道具で一番まずい嘘なので、
//     「叩いた相手」を snapshot に持って、消えた穴を「直った」と言わせない。
//   ・**定義から出しているものは比べない。** 押せないボタンの一覧（`unattacked`）や
//     「書き込む口だから叩いていない」は、サーバの返事ではなく定義の話。定義の差分は
//     `hatake diff` の仕事なので、ここでは混ぜない。

import type { AttackReport, AttackResult } from "./attack.js";
import type { AttackSweep } from "./attackSweep.js";
import type { ProbeReport } from "./probe.js";

/** どの道具の結果か。前回と今回で違えば比べない（比べても意味が無い）。 */
export type RunKind = "probe" | "attack" | "attack-sweep";

/** 前回と比べる1件。 */
export interface RunItem {
  /** 同じものかを決める鍵（数・基点・問い合わせ文字列を含めない）。 */
  id: string;
  /** 叩いた相手のくくり（役割、または画面）。叩けたかを見るのに使う。 */
  scope: string;
  /** 人が読む見出し（どこの話か）。 */
  where: string;
  /** いまの状態。ここが変われば「変わった」。 */
  state: string;
  /** 人が読む1行（数が入ってよい＝鍵には使わない）。 */
  what: string;
  /** 在ると終了コードが 1 になるもの（穴・食い違い）。 */
  bad: boolean;
}

/** 叩かなかった相手と理由。 */
export interface RunGap {
  scope: string;
  reason: string;
}

export interface RunSnapshot {
  kind: RunKind;
  items: RunItem[];
  /** 実際に叩いた相手。ここに無い相手の結果は「無い」ではなく「分からない」。 */
  covered: string[];
  /** 叩かなかった相手（黙って落とさない）。 */
  uncovered: RunGap[];
}

const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 要求から鍵に使う分だけを取る（`GET http://host/api/orders?page=0` → `GET /api/orders`）。
 *
 * 基点は環境で変わり、問い合わせ文字列は定義で変わる。どちらも「同じ食い違いか」とは
 * 関係が無いので落とす。
 */
export function requestKey(request: string): string {
  const [method, url = ""] = request.split(" ");
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, "").split("?")[0];
  return `${method} ${path || url}`;
}

/**
 * 判定を状態の言葉にする。
 *
 * `blocked` は**画面から見えるかどうかで意味が違う**（見える口が 200 なら「開けて
 * データも来た」、見えない口が 403 なら「遮断されている」）。同じ言葉にすると、
 * 権限を締めて admin が仕事できなくなった晩に「遮断されている」と出て、良くなったのか
 * 悪くなったのか読めない。
 */
function stateOf(one: AttackResult): string {
  switch (one.verdict) {
    case "hole":
      return "穴";
    case "locked":
      return "開けるのに拒否された";
    case "blocked":
      return one.visible ? "開けてデータも来た" : "遮断されている";
    default:
      return "判断できない";
  }
}

/**
 * 1回叩いた結果1件。役割ごとに前置きを付ける（役割が違えば別のもの）。
 *
 * `scope` は**役割と画面の組**。役割ごとではなく組にしているのは、1つの画面だけが
 * 叩けなかったとき（そこだけ繋がらない）に、その画面の穴を「直った」と言わないため。
 */
function fromAttackResult(role: string, label: string, one: AttackResult): RunItem {
  return {
    id: `${role}|${one.page}|${requestKey(one.request)}`,
    scope: `${label}: ${one.page}`,
    where: `${label}: ${one.page}`,
    state: stateOf(one),
    what: one.what,
    // 誰でもない人の「開けるのに拒否された」は食い違いではない（定義は「ログインが
    // 要るか」を書けない）。判定は [sweepHasHole] と同じ線で引く。
    bad: one.verdict === "hole" || one.verdict === "locked",
  };
}

/** 1役割ぶんの報告を開く。 */
function fromAttackReport(
  role: string,
  label: string,
  report: AttackReport,
  anonymous: boolean,
): RunItem[] {
  const items = report.results.map((one) => {
    const item = fromAttackResult(role, label, one);
    // 誰でもない人は穴だけを見る（「要ログイン」を食い違いに数えると、毎晩その行が
    // 埋まって表が読めなくなる）。
    return anonymous && one.verdict === "locked"
      ? { ...item, state: "要ログイン", bad: false }
      : item;
  });
  if (report.unauthenticated) {
    items.push({
      id: `${role}|*credential`,
      scope: label,
      where: label,
      state: "資格が通っていない疑い",
      what: "開ける画面が全部拒否されました（この役割の結果は読めません）",
      bad: true,
    });
  }
  if (report.unknownRole) {
    items.push({
      id: `${role}|*unknown-role`,
      scope: label,
      where: label,
      state: "定義に出てこない役割",
      what: "この役割名は定義に出てきません（綴り違いかもしれません）",
      bad: false,
    });
  }
  return items;
}

const PROBE_STATE: Record<string, string> = {
  error: "食い違い",
  caution: "要確認",
};

function fromProbe(report: ProbeReport): RunSnapshot {
  const pages = report.pages;
  const items = report.findings.map((one) => ({
    id: `${one.page}|${one.kind}|${one.at ?? ""}|${requestKey(one.request)}`,
    scope: one.page,
    where: one.page,
    state: PROBE_STATE[one.level] ?? one.level,
    what: one.what,
    bad: one.level === "error",
  }));
  return {
    kind: "probe",
    items,
    covered: pages,
    // 画面ごと叩かなかったものだけ（同じ画面の中の「1件取得は叩けない」は、データに
    // ついて回る話なので相手が減ったとは言わない）。
    uncovered: report.skipped
      .filter((one) => !pages.includes(one.page))
      .map((one) => ({ scope: one.page, reason: one.reason })),
  };
}

/** 1役割ぶんの「叩いた相手」。役割そのものと、答えが返ってきた画面。 */
const coveredBy = (label: string, report: AttackReport): string[] => [
  label,
  ...report.results.map((one) => `${label}: ${one.page}`),
];

/** その役割で叩けなかった画面（繋がらなかった・repository が無い）。 */
const uncoveredBy = (label: string, report: AttackReport): RunGap[] =>
  report.skipped.map((one) => ({
    scope: `${label}: ${one.page}`,
    reason: one.reason,
  }));

function fromSweep(sweep: AttackSweep): RunSnapshot {
  const items: RunItem[] = [];
  const covered: string[] = [];
  const uncovered: RunGap[] = sweep.skipped.map((one) => ({
    scope: one.role,
    reason: one.reason,
  }));
  for (const run of sweep.runs) {
    items.push(...fromAttackReport(run.role, run.label, run.report, run.anonymous));
    covered.push(...coveredBy(run.label, run.report));
    uncovered.push(...uncoveredBy(run.label, run.report));
  }
  return { kind: "attack-sweep", items, covered, uncovered };
}

function fromAttack(report: AttackReport): RunSnapshot {
  return {
    kind: "attack",
    items: fromAttackReport(report.role, report.role, report, false),
    covered: coveredBy(report.role, report),
    uncovered: uncoveredBy(report.role, report),
  };
}

/**
 * 保存された結果（`--json` / `--save` が書いたもの）を読む。
 *
 * 形が分からなければ**読めないと言う**。`--dry-run` の出力や、古い形の保存を黙って
 * 「食い違い 0 件」として読むと、比べた結果が「全部直りました」になる。
 */
export function readRun(value: unknown): RunSnapshot {
  const bad = (why: string): never => {
    throw new Error(`比べる相手として読めません: ${why}`);
  };
  if (!isDict(value)) return bad("JSON の map ではありません。");
  if (Array.isArray(value.runs) && Array.isArray(value.pages)) {
    return fromSweep(value as unknown as AttackSweep);
  }
  if (Array.isArray(value.results) && typeof value.role === "string") {
    return fromAttack(value as unknown as AttackReport);
  }
  if (Array.isArray(value.findings)) {
    if (!Array.isArray(value.pages)) {
      return bad(
        "叩いた画面（pages）が入っていません（古い形の保存です）。" +
          "--save で作り直してください。",
      );
    }
    return fromProbe(value as unknown as ProbeReport);
  }
  return bad(
    `{${Object.keys(value).join(", ")}} が来ました。` +
      "probe / attack の --json（--dry-run ではないもの）を渡してください。",
  );
}
