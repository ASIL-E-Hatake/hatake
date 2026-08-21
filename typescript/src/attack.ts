// 「画面から見えない口」を、その役割で実際に叩いてみる。
//
// `roles` は**画面の出し分けだけ**（本当の遮断は API の仕事）と仕様書に何度書いても、
// 遮断を忘れたまま出る。書いてあることは読まれないが、**機械が試せば忘れられない**。
//
// 決めごと4つ。
//
// 1. **読むだけ。** 見えないはずの口に GET を投げて、拒否されるかを見る。書き込む口
//    （POST / PUT / DELETE）は叩かない＝押せないはずのボタンは**一覧にして人に渡す**
//    （叩いて確かめたら、確かめた跡がデータに残る）。
// 2. **反対向きも見る。** 開ける画面が拒否されたら、それも食い違い（画面は出るのに
//    データが来ない＝その役割の人は何もできない）。片方だけ見ると「全部遮断されて
//    いる＝安全」と読めてしまう。
// 3. **資格が通っていないなら、そう言う。** 開ける画面まで全部拒否されたなら、それは
//    「よく遮断されている」ではなく「そもそも誰でもない人として叩いている」。ここを
//    間違えると**一番まずい嘘**（穴が無いという報告）になる。
// 4. **定義に出てこない役割でも進める。** 権限の穴を突く相手は、たいてい**定義に
//    書かれていない役割**（`roles:` に書くのは絞る側の名前だけなので、平社員の名前は
//    どこにも出てこない）。綴り違いは「誰でも開ける画面だけが見える」扱いになって
//    **穴が多めに出る**＝調べれば気づく側に転ぶので、落とさずに断り書きを添える。

import { canOpen } from "./appAccess.js";
import { acceptJson, type HttpSend } from "./httpProbe.js";
import type { RestTarget, RestTargets, SkippedPage, WriteAction } from "./restTarget.js";

/**
 * 1回叩いた結果。
 *
 * `hole` = 見えないのに開いている（穴）。`locked` = 開けるのに拒否された。
 * `blocked` = 見えない口が拒否された（あるべき姿）。`unknown` = 判断できない。
 */
export type AttackVerdict = "hole" | "locked" | "blocked" | "unknown";

export interface AttackResult {
  page: string;
  request: string;
  status: number;
  verdict: AttackVerdict;
  /** 画面から見えるか（`roles` を辿った結果）。 */
  visible: boolean;
  /** 人が読む一言。 */
  what: string;
}

export interface AttackReport {
  role: string;
  results: AttackResult[];
  /** 叩かなかったもの（書き込む口・repository の無い画面）。 */
  skipped: SkippedPage[];
  /** その役割では押せないボタン。叩いていないので、人が確かめる一覧。 */
  unattacked: Array<{ page: string; action: WriteAction }>;
  /**
   * 渡された役割が定義に出てこない（綴り違いかもしれない）。結果は「誰でも開ける
   * 画面だけが見える人」として読むことになるので、報告に断り書きを出す。
   */
  unknownRole: boolean;
  /**
   * 資格が通っていない疑い。開ける画面が1枚以上あって、その**全部**が拒否された
   * ときに立つ。立ったら結果は読めない（拒否が遮断なのか未認証なのか区別できない）。
   */
  unauthenticated: boolean;
}

export const hasHole = (report: AttackReport): boolean =>
  report.unauthenticated ||
  report.results.some(
    (one) => one.verdict === "hole" || one.verdict === "locked",
  );

const refused = (status: number): boolean => status === 401 || status === 403;

/** その役割で押せるか（空の `roles` は誰でも）。 */
const allowed = (roles: string[], role: string): boolean =>
  roles.length === 0 || roles.includes(role);

function verdictOf(visible: boolean, status: number): AttackResult["verdict"] {
  if (refused(status)) return visible ? "locked" : "blocked";
  if (status >= 200 && status < 300) return visible ? "blocked" : "hole";
  // 404 は「その口が無い」。集合の名前が違うだけかもしれないので、遮断とは言わない。
  return "unknown";
}

function sentence(visible: boolean, verdict: AttackVerdict, status: number): string {
  switch (verdict) {
    case "hole":
      return `画面からは見えないのに、${status} で返ってきました（API が遮断していません）`;
    case "locked":
      return `この役割で開ける画面ですが、${status} で拒否されました（画面は出てもデータが来ません）`;
    case "blocked":
      return visible
        ? `開けて、データも来ました（${status}）`
        : `見えない口は拒否されました（${status}）`;
    default:
      return `${status} が返りました（遮断かどうかは判断できません。集合の名前が違う可能性）`;
  }
}

/**
 * その役割で、定義が要求している一覧の口を全部叩く。
 *
 * [targets.access] が要る（誰が開けるかは app を読まないと出ない）。
 */
export async function attack(
  targets: RestTargets,
  role: string,
  send: HttpSend,
  headers: Record<string, string> = {},
): Promise<AttackReport> {
  const access = targets.access;
  if (access === undefined) {
    throw new Error(
      "権限の確認は app の定義（app:）に対して行います" +
        "（1枚の定義には入口が書かれていないので、誰が開けるかが出ません）。",
    );
  }

  const results: AttackResult[] = [];
  const skipped: SkippedPage[] = [...targets.skipped];
  const unattacked: AttackReport["unattacked"] = [];

  for (const target of targets.targets) {
    const audience = access.audience.get(target.page);
    const visible = audience !== undefined && canOpen(audience, role);
    const request = `GET ${target.listUrl}`;
    let status: number;
    try {
      const response = await send({
        method: "GET",
        url: target.listUrl,
        headers: { ...acceptJson, ...headers },
      });
      status = response.status;
    } catch (error) {
      skipped.push({
        page: target.page,
        reason: `叩けなかった（${error instanceof Error ? error.message : String(error)}）`,
      });
      continue;
    }
    const verdict = verdictOf(visible, status);
    results.push({
      page: target.page,
      request,
      status,
      verdict,
      visible,
      what: sentence(visible, verdict, status),
    });
    unattacked.push(...writesToCheck(target, role));
  }

  const openable = results.filter((one) => one.visible);
  return {
    role,
    results,
    skipped,
    unattacked,
    unknownRole: !access.roles.includes(role),
    unauthenticated:
      openable.length > 0 && openable.every((one) => refused(one.status)),
  };
}

/** その役割では押せないボタン（叩かないので、人が確かめる一覧に回す）。 */
function writesToCheck(
  target: RestTarget,
  role: string,
): Array<{ page: string; action: WriteAction }> {
  return target.writes
    .filter((action) => !allowed(action.roles, role))
    .map((action) => ({ page: target.page, action }));
}

/** 叩く前に「何を叩くか」を出す（`--dry-run`）。 */
export function attackRequests(targets: RestTargets, role: string): string[] {
  const access = targets.access;
  return targets.targets.map((target) => {
    const audience = access?.audience.get(target.page);
    const visible = audience !== undefined && canOpen(audience, role);
    return `GET ${target.listUrl}  （${visible ? "開ける画面：データが来るはず" : "見えない画面：拒否されるはず"}）`;
  });
}

const SIGN: Record<AttackVerdict, string> = {
  hole: "穴",
  locked: "逆",
  blocked: "ok",
  unknown: "不明",
};

/** 人が読む形。 */
export function renderAttack(report: AttackReport): string {
  const lines: string[] = [`役割 "${report.role}" で叩いた結果`, ""];
  for (const one of report.results) {
    lines.push(`  [${SIGN[one.verdict]}] ${one.page}: ${one.what}`);
    lines.push(`       ${one.request}`);
  }
  const holes = report.results.filter((one) => one.verdict === "hole");
  const locked = report.results.filter((one) => one.verdict === "locked");
  lines.push("");
  lines.push(
    `叩いた ${report.results.length} 件・穴 ${holes.length} 件・逆（見えるのに拒否）${locked.length} 件`,
  );
  if (report.unknownRole) {
    lines.push("");
    lines.push(
      `※ 役割 "${report.role}" は定義に出てきません（絞っている役割の名前だけが定義に` +
        "出るので、これは普通のこと）。**誰でも開ける画面だけが見える人**として読んで" +
        "ください。綴り違いなら、穴が多めに出ます。",
    );
  }
  if (report.unauthenticated) {
    lines.push("");
    lines.push(
      "※ 開ける画面まで全部拒否されています。**資格が通っていない**疑いが濃いので、" +
        "この結果からは「穴が無い」とは言えません（--token / --headers を確かめてください）。",
    );
  }
  if (holes.length > 0) {
    lines.push("");
    lines.push(
      "穴は API 側で塞ぐものです（定義の roles は画面の出し分けだけで、" +
        "URL を直接叩く人には効きません）。",
    );
  }
  if (report.unattacked.length > 0) {
    lines.push("");
    lines.push("叩いていない口（この役割では押せないボタン。人が確かめること）:");
    for (const { page, action } of report.unattacked) {
      lines.push(
        `  ${page}: ${action.label} → ${action.method} ${action.url}` +
          `（押せるのは ${action.roles.join(" / ") || "誰でも"}）`,
      );
    }
    lines.push(
      "  ※ 書き込む口は叩きません（確かめた跡がデータに残るため）。",
    );
  }
  if (report.skipped.length > 0) {
    lines.push("");
    lines.push("叩かなかった画面:");
    for (const one of report.skipped) lines.push(`  ${one.page}: ${one.reason}`);
  }
  return lines.join("\n");
}
