// 役割を**全部**突く。
//
// 1つの役割で叩く道具（[attack]）は在るが、権限の棚卸しは役割が増えるたびに全部やり直す
// 作業で、人は続けられない。しかも**1つ足したときに他が緩んでいないか**は、並べないと
// 読めない（役割ごとに別々のログを見比べることになる）。
//
// 嘘をつかないための決めごと:
//   ・**資格は役割ごとに要る。** 1つの資格で全部の役割を判定すると、返ってきた 200 が
//     「その役割でも見えてしまう」なのか「いま使った資格なら正しい」なのか区別できない
//     ＝穴が在ることにも無いことにもできる。なので `accounts` を渡してもらう。
//   ・**資格の無い役割は叩かない。** 飛ばしたことを理由つきで残す（黙って飛ばすと、
//     並べた表が「全部 ok」に見える）。
//   ・**誰でもない人は必ず入れる。** 権限の穴でいちばん多いのは「ログインしていない人に
//     見えている」なので、資格を送らない1本を毎回足す。
//   ・**誰でもない人の「開けるのに拒否された」は食い違いではない。** 定義は「ログインが
//     要るか」を書けない（`roles` は**ログインした人の中での**出し分け）。ふつうの業務
//     システムは全部の画面にログインが要るので、そこを食い違いと数えると誰でもない人の
//     行が毎回「逆」で埋まり、表が読めなくなる。**穴だけ**を見る。
//   ・判定と言い方は [attack] のものをそのまま使う（同じ結果を2つの言葉で言わない）。

import {
  type AttackReport,
  type AttackVerdict,
  attack,
  hasHole,
} from "./attack.js";
import { bearer, type HttpSend } from "./httpProbe.js";
import type { RestTargets } from "./restTarget.js";

/** 役割1つの資格。 */
export interface AttackAccount {
  /** `Authorization: Bearer <token>` として送る。 */
  token?: string;
  /** そのまま送るヘッダ（`token` と併用してよい）。 */
  headers?: Record<string, string>;
}

/** 役割 → 資格。 */
export type AttackAccounts = Record<string, AttackAccount>;

/** 誰でもない人（資格を送らない1本）。役割名としては空文字を使う。 */
export const ANONYMOUS = "";

/** 誰でもない人の表示名。 */
export const ANONYMOUS_LABEL = "誰でもない人";

/** 1本ぶんの結果。 */
export interface SweepRun {
  /** 役割名（誰でもない人は空文字）。 */
  role: string;
  /** 報告に出す名前。 */
  label: string;
  /** 資格を送らずに叩いた。 */
  anonymous: boolean;
  report: AttackReport;
}

/** 叩かなかった役割（黙って飛ばさない）。 */
export interface SweepSkip {
  role: string;
  reason: string;
}

export interface AttackSweep {
  runs: SweepRun[];
  skipped: SweepSkip[];
  /** 叩いた画面（表の行。並びは定義の順）。 */
  pages: string[];
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ACCOUNT_KEYS = new Set(["token", "headers"]);

/**
 * 資格の一覧を読む（`{ "hr": { "token": "…" } }`、または `{ "accounts": { … } }`）。
 *
 * 知らないキーはエラーにする（設定が黙って効かないと、叩いたつもりで資格なしになる
 * ＝「穴だらけ」という嘘の報告になる）。
 */
export function parseAttackAccounts(value: unknown): AttackAccounts {
  const bad = (message: string): never => {
    throw new Error(`役割ごとの資格が読めません: ${message}`);
  };
  if (!isDict(value)) {
    return bad('上は map（{ "hr": { "token": "…" } }）で書いてください。');
  }
  const raw = isDict(value.accounts) ? value.accounts : value;
  const accounts: AttackAccounts = {};
  for (const [role, given] of Object.entries(raw)) {
    if (role === "$comment" || role === "accounts") continue;
    if (role === ANONYMOUS) {
      bad(
        `役割名が空です（${ANONYMOUS_LABEL}は資格を送らないので、書く必要がありません）。`,
      );
    }
    if (!isDict(given)) {
      bad(`"${role}" は { "token": "…" } か { "headers": { … } } で書いてください。`);
    }
    const account = given as Record<string, unknown>;
    for (const key of Object.keys(account)) {
      if (!ACCOUNT_KEYS.has(key)) {
        bad(`"${role}" に知らないキー "${key}"（書けるのは token / headers）。`);
      }
    }
    if (account.token !== undefined && typeof account.token !== "string") {
      bad(`"${role}".token は文字で書いてください。`);
    }
    if (account.headers !== undefined && !isDict(account.headers)) {
      bad(`"${role}".headers は map で書いてください。`);
    }
    const headers: Record<string, string> = {};
    for (const [name, one] of Object.entries(
      isDict(account.headers) ? account.headers : {},
    )) {
      if (typeof one !== "string") bad(`"${role}".headers.${name} は文字で書いてください。`);
      headers[name.toLowerCase()] = one as string;
    }
    accounts[role] = {
      ...(typeof account.token === "string" ? { token: account.token } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
    if (accounts[role].token === undefined && accounts[role].headers === undefined) {
      bad(`"${role}" に token も headers もありません（何で叩くのかが決まりません）。`);
    }
  }
  return accounts;
}

/** その役割で送るヘッダ。 */
const headersFor = (account: AttackAccount): Record<string, string> => ({
  ...(account.token === undefined ? {} : bearer(account.token)),
  ...account.headers,
});

/**
 * 突く役割を決める（定義に出てくる役割＋資格を書いてある役割）。
 *
 * 定義に出てこない役割も走らせる＝権限の穴を突く相手は、たいてい**定義に書かれていない
 * 役割**（`roles:` に書くのは絞る側の名前だけなので、平社員の名前はどこにも出てこない）。
 */
export function rolesToSweep(
  targets: RestTargets,
  accounts: AttackAccounts,
): string[] {
  const found = new Set<string>([
    ...(targets.access?.roles ?? []),
    ...Object.keys(accounts),
  ]);
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * 定義に出てくる役割ぜんぶ＋誰でもない人で叩く。
 *
 * 資格の無い役割は叩かず、理由を残す。誰でもない人は資格を送らずに必ず1本。
 */
export async function attackAll(
  targets: RestTargets,
  accounts: AttackAccounts,
  send: HttpSend,
): Promise<AttackSweep> {
  const runs: SweepRun[] = [];
  const skipped: SweepSkip[] = [];

  for (const role of rolesToSweep(targets, accounts)) {
    const account = accounts[role];
    if (account === undefined) {
      skipped.push({
        role,
        reason:
          "資格が無いので叩いていません（accounts に token か headers を足してください）。" +
          "1つの資格で他の役割を判定すると、返ってきた 200 が穴なのか正しいのか区別できません。",
      });
      continue;
    }
    runs.push({
      role,
      label: role,
      anonymous: false,
      report: await attack(targets, role, send, headersFor(account)),
    });
  }

  // 誰でもない人（資格を送らない）。[attack] の目印のうち2つは、この1本には当てはまらない
  // ので下ろす:
  //   ・unknownRole … 「定義に出てこない役割名」＝綴り違いの疑いの話。誰でもない人は
  //     そもそも役割ではない
  //   ・unauthenticated … 「資格が通っていない疑い」＝ここでは**わざと**送っていない
  runs.push({
    role: ANONYMOUS,
    label: ANONYMOUS_LABEL,
    anonymous: true,
    report: {
      ...(await attack(targets, ANONYMOUS, send, {})),
      unknownRole: false,
      unauthenticated: false,
    },
  });

  return {
    runs,
    skipped,
    pages: targets.targets.map((one) => one.page),
  };
}

/**
 * 食い違いが1つでもあるか（終了コードに使う）。
 *
 * 誰でもない人は**穴だけ**を見る（「開けるのに拒否された」はログインが要るという話で、
 * 定義には書けないので食い違いではない）。
 */
export const sweepHasHole = (sweep: AttackSweep): boolean =>
  sweep.runs.some((run) =>
    run.anonymous
      ? run.report.results.some((one) => one.verdict === "hole")
      : hasHole(run.report),
  );

const SIGN: Record<AttackVerdict, string> = {
  hole: "穴",
  locked: "逆",
  blocked: "ok",
  unknown: "不明",
};

/**
 * その画面・その役割の判定（叩いていなければ `-`）。
 *
 * 誰でもない人が「開ける画面を拒否された」ときだけ「要ログイン」と言う（食い違いでは
 * ないが、`ok` と混ぜると「見えない口が拒否された」という別の意味に読める）。
 */
function cell(run: SweepRun, page: string): string {
  const found = run.report.results.find((one) => one.page === page);
  if (found === undefined) return "-";
  if (run.anonymous && found.verdict === "locked") return "要ログイン";
  return SIGN[found.verdict];
}

/** 画面名を揃えるための幅（ページ id は ASCII なので、文字数で足りる）。 */
const pad = (text: string, width: number): string =>
  text + " ".repeat(Math.max(0, width - text.length));

/**
 * 人が読む形。
 *
 * **表が本体**（1枚に並べないと「1つ足したときに他が緩んだ」が読めない）。そのあとに
 * 穴の内訳と、読むときの前提（資格・飛ばした役割）を置く。
 */
export function renderAttackSweep(sweep: AttackSweep): string {
  const out: string[] = [];
  const roles = sweep.runs.map((one) => one.label);
  out.push(
    `役割 ${sweep.runs.length - 1} ＋ ${ANONYMOUS_LABEL} で叩いた結果` +
      `（役割ごとの資格で叩いています）`,
  );
  out.push("");

  const width = Math.max(6, ...sweep.pages.map((one) => one.length));
  out.push(`  ${pad("画面", width)}  ${roles.join(" / ")}`);
  for (const page of sweep.pages) {
    const cells = sweep.runs.map((run) => `${run.label}=${cell(run, page)}`);
    out.push(`  ${pad(page, width)}  ${cells.join(" / ")}`);
  }
  out.push("");
  out.push("  穴 = 見えないのに開いている / 逆 = 開けるのに拒否された / ok = あるべき姿");
  if (sweep.runs.some((run) => run.anonymous)) {
    out.push(
      `  ${ANONYMOUS_LABEL}の「要ログイン」は食い違いではありません` +
        "（定義は「ログインが要るか」を書けないので、そこは判定しません）。",
    );
  }

  const holes = sweep.runs.flatMap((run) =>
    run.report.results
      .filter((one) => one.verdict === "hole")
      .map((one) => ({ run, page: one.page, status: one.status })),
  );
  const locked = sweep.runs.flatMap((run) =>
    run.anonymous
      ? [] // 誰でもない人の「拒否」はログインが要るという話（食い違いではない）
      : run.report.results
          .filter((one) => one.verdict === "locked")
          .map((one) => ({ run, page: one.page, status: one.status })),
  );
  out.push("");
  out.push(`穴 ${holes.length} 件・逆（開けるのに拒否）${locked.length} 件`);
  for (const one of holes) {
    out.push(
      `  [穴] ${one.page}: ${one.run.label} には見えないのに ${one.status} で返ってきました`,
    );
  }
  for (const one of locked) {
    out.push(
      `  [逆] ${one.page}: ${one.run.label} は開けるのに ${one.status} で拒否されました`,
    );
  }
  if (holes.length > 0) {
    out.push("");
    out.push(
      "穴は API 側で塞ぐものです（定義の roles は画面の出し分けだけで、" +
        "URL を直接叩く人には効きません）。",
    );
  }

  const unauthenticated = sweep.runs.filter((one) => one.report.unauthenticated);
  if (unauthenticated.length > 0) {
    out.push("");
    out.push(
      `※ ${unauthenticated.map((one) => one.label).join(" / ")} は、開ける画面まで全部` +
        "拒否されています。**その資格が通っていない**疑いが濃いので、この結果からは" +
        "「穴が無い」とは言えません（accounts の token を確かめてください）。",
    );
  }
  const unknown = sweep.runs.filter((one) => one.report.unknownRole);
  if (unknown.length > 0) {
    out.push("");
    out.push(
      `※ ${unknown.map((one) => one.label).join(" / ")} は定義に出てきません` +
        "（絞っている役割の名前だけが定義に出るので、これは普通のこと）。" +
        "**誰でも開ける画面だけが見える人**として読んでください。",
    );
  }
  if (sweep.skipped.length > 0) {
    out.push("");
    out.push("叩かなかった役割:");
    for (const one of sweep.skipped) out.push(`  ${one.role}: ${one.reason}`);
  }

  const unattacked = sweep.runs.flatMap((run) =>
    run.report.unattacked.map((one) => ({ label: run.label, ...one })),
  );
  if (unattacked.length > 0) {
    out.push("");
    out.push(
      `※ 書き込む口（POST / PUT / DELETE）は叩いていません（確かめた跡がデータに残るため）。` +
        `押せないはずのボタンは ${unattacked.length} 件あります＝ hatake attack --role <役割> で` +
        "1つずつ確かめてください。",
    );
  }
  return out.join("\n");
}
