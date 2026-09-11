// 叩く道具（`probe` / `attack`）の入口。
//
// 本体（[cli]）から分けてあるのは、この2つだけが**通信する**から。資格の取り方
// （`--login`）・前回との比べ方（`--since`）・落とし方（`--fail-on`）は、通信しない
// コマンドには要らない話なので、まとめてこちらに置く。
//
// 判定はここに書かない（[probe] / [attack] / [runDiff] の仕事）。ここに在るのは
// 「どの旗をどう読むか」と「出す・保存する・終了コードを決める」だけ。

import { join } from "node:path";

import { type Args, collectionOverrides, str } from "./cliArgs.js";
import type { CliIo } from "./cliIo.js";
import { findSpecDir, PROBE_KINDS_FILE } from "./specDir.js";
import { bearer, type HttpSend, readHeaders } from "./httpProbe.js";
import {
  type RestTargets,
  restTargets,
  restTargetsForPage,
} from "./restTarget.js";
import { hasProbeError, probe, probeRequests, renderProbe } from "./probe.js";
import { attack, attackRequests, hasHole, renderAttack } from "./attack.js";
import {
  ANONYMOUS,
  ANONYMOUS_LABEL,
  attackAll,
  parseAttackAccounts,
  renderAttackSweep,
  rolesToSweep,
  sweepHasHole,
} from "./attackSweep.js";
import { diffRuns, hasNewTrouble, renderRunDiff } from "./runDiff.js";
import { readRun } from "./runSnapshot.js";
import { bodyFor, type LoginPlan, masked, parseLogin } from "./login.js";
import {
  parseProbeHelp,
  probeHelpFor,
  probeHelpLines,
} from "./probeHelp.js";
import {
  getToken,
  loginAccounts,
  loginRequest,
  type LoginSend,
} from "./loginRun.js";

/**
 * spec/ の1ファイルを読む（見つからなければ理由を出して null）。
 *
 * 読むのは [CliIo] 経由＝試験から記憶の中のファイルを渡せるようにするため。
 */
function readSpecFile(
  flags: Args["flags"],
  io: CliIo,
  name: string,
): unknown | null {
  const dir = findSpecDir(str(flags, "spec"));
  if (dir === null) {
    io.err(`spec/${name} が見つかりません（--spec <dir> で場所を渡せます）。`);
    return null;
  }
  return JSON.parse(io.readFile(join(dir, name)));
}

/** 叩く道具に共通の引数（基点・資格・集合の名前）。 */
function probeSetup(
  files: string[],
  flags: Args["flags"],
  io: CliIo,
): { targets: RestTargets; headers: Record<string, string> } {
  const file = files[0];
  if (file === undefined) throw new Error("定義ファイルを1つ渡してください。");
  const baseUrl = str(flags, "base");
  if (baseUrl === undefined) {
    throw new Error(
      "--base を渡してください（例: --base http://localhost:8080/api）。" +
        "定義は URL を知りません（知ってはいけない）ので、基点は人が渡します。",
    );
  }
  const source = io.readFile(file);
  const options = {
    baseUrl,
    collections: collectionOverrides(str(flags, "collection")),
  };
  const page = str(flags, "page");
  const targets =
    page === undefined
      ? restTargets(source, options)
      : restTargetsForPage(source, page, options);
  const token = str(flags, "token");
  const headersFile = str(flags, "headers");
  // 旗の読み違いは**叩く前に**言う（送ってから「その旗は読めません」では、
  // サーバに1往復させた上に結果も出ない）。
  failOnNew(flags);
  return {
    targets,
    headers: {
      ...(token === undefined ? {} : bearer(token)),
      ...(headersFile === undefined ? {} : readHeaders(io.readFile(headersFile))),
    },
  };
}

/**
 * `login.json` を読む。気になる所（生の秘密が書いてある等）は言うが止めない。
 *
 * `--token` / `--headers` と一緒には使えない。どちらが勝つかを覚えなければいけない
 * 道具は、CI に置いたときに「渡したつもりの資格で叩いていない」を生む。
 */
function readLoginPlan(flags: Args["flags"], io: CliIo): LoginPlan | undefined {
  const path = str(flags, "login");
  if (path === undefined) return undefined;
  if (str(flags, "token") !== undefined || str(flags, "headers") !== undefined) {
    throw new Error(
      "--login と --token / --headers は一緒に使えません（資格の出どころを1つにしてください）。",
    );
  }
  const plan = parseLogin(io.readFile(path), io.env ?? {});
  for (const one of plan.cautions) io.err(`注意: ${one}`);
  return plan;
}

/** `--dry-run` に出す「資格を取る要求」（値は出さない＝ログに残るので）。 */
function loginDryRun(
  plan: LoginPlan | undefined,
  role: string,
): { method: string; url: string; headers: unknown; body: unknown } | undefined {
  if (plan === undefined) return undefined;
  const request = loginRequest(plan, role);
  return {
    method: request.method,
    url: request.url,
    headers: masked(plan.headers),
    body: masked(bodyFor(plan, role) ?? {}),
  };
}

/** `--dry-run` の文字の形（1行）。 */
const loginDryLine = (one: {
  method: string;
  url: string;
  body: unknown;
}): string[] => [
  "資格を取る要求（--dry-run なので送っていません。値は出しません）:",
  `  ${one.method} ${one.url} ${JSON.stringify(one.body)}`,
];

/** `--login` で資格を1つ取る（渡されていなければ何もしない）。 */
async function loginHeaders(
  plan: LoginPlan | undefined,
  role: string,
  loginSend: LoginSend,
): Promise<Record<string, string>> {
  if (plan === undefined) return {};
  if (bodyFor(plan, role) === undefined) {
    throw new Error(
      `login.json に ${role === "" ? "body" : `roles.${role}`} がありません（何を送るか書いてください）。`,
    );
  }
  const got = await getToken(plan, role, loginSend);
  if ("error" in got) throw new Error(got.error);
  return bearer(got.token);
}

/** `--fail-on` を読む（`new` は前回が無いと決められない）。 */
function failOnNew(flags: Args["flags"]): boolean {
  const given = str(flags, "fail-on");
  if (given === undefined || given === "any") return false;
  if (given !== "new") {
    throw new Error(`--fail-on は any か new です（"${given}" は読めません）。`);
  }
  if (str(flags, "since") === undefined) {
    throw new Error(
      "--fail-on new には --since 前回.json が要ります（新しいかどうかは、前回が無いと分かりません）。",
    );
  }
  return true;
}

/**
 * 叩いた結果の出し方と終了コード。probe / attack / 役割ぜんぶで同じ。
 *
 * ・`--save` が書くのは **`--json` と同じもの**（次の晩に前回として読み直せる形で
 *   ないと、比べられない）
 * ・`--since` を付けると出力は**違いだけ**になる＝叩いた結果そのものは出ないので、
 *   残す口（`--save`）を別に用意している
 * ・既定の終了コードは**いまの状態**で決める（前から在る穴も穴）。`--fail-on new` に
 *   すると新しい分だけで決める＝毎晩回して**変わった晩だけ**鳴らす使い方
 */
function finishRun<T>(
  result: T,
  bad: boolean,
  render: (one: T) => string,
  flags: Args["flags"],
  io: CliIo,
): number {
  const failNew = failOnNew(flags);
  const asJson = JSON.stringify(result, null, 2);
  const save = str(flags, "save");
  // 末尾の改行まで含めて `--json` の出力と同じにする（保存と出力が1バイト違うと、
  // 「保存したものを読み直している」ことを機械で確かめられない）。
  if (save !== undefined) io.writeFile(save, `${asJson}
`);
  const since = str(flags, "since");
  if (since === undefined) {
    io.out(flags.json === true ? asJson : render(result));
    return bad ? 1 : 0;
  }
  const diff = diffRuns(
    readRun(JSON.parse(io.readFile(since))),
    readRun(JSON.parse(asJson)),
  );
  io.out(flags.json === true ? JSON.stringify(diff, null, 2) : renderRunDiff(diff));
  return (failNew ? hasNewTrouble(diff) : bad) ? 1 : 0;
}

/**
 * 食い違いの印から直し方を引く（`--kinds`）。**通信しない**ので定義も要らない。
 *
 * 印は `probe --json` の鍵なので、引く口が無いと「`type-mismatch` と言われたが、で、
 * どっちを直すのか」がコードを読まないと分からない。
 */
function probeKindsCommand(
  positional: string[],
  flags: Args["flags"],
  io: CliIo,
): number {
  const raw = readSpecFile(flags, io, PROBE_KINDS_FILE);
  if (raw === null) return 1;
  const table = probeHelpFor(parseProbeHelp(raw), positional[0]);
  if (table.length === 0) {
    io.err(
      `"${positional[0]}" という印はありません` +
        "（印を省くと全部出ます。印は probe --json の kind に出るものです）。",
    );
    return 1;
  }
  if (flags.json === true) {
    io.out(JSON.stringify(table, null, 2));
    return 0;
  }
  for (const line of probeHelpLines(table)) io.out(line);
  return 0;
}

/**
 * 資格の取り方だけを試す（`--login … --check`）。**業務の口は叩かない**。
 *
 * 資格が取れないと、叩けなかった役割が「その役割は叩いていません」として結果に混ざる
 * ＝**資格の話とサーバの話が同じ報告に出る**。CI に置く前と、落ちた晩の切り分けのために
 * 分けて試せる口を用意する。取れたトークンは出さない（CI のログは残る）。
 */
async function loginCheck(
  plan: LoginPlan,
  flags: Args["flags"],
  io: CliIo,
  loginSend: LoginSend,
): Promise<number> {
  const roles = Object.keys(plan.roles);
  // 役割ごとの本文が無ければ、役割なしの1件（`body`）を試す。
  const targets = roles.length > 0 ? roles : [""];
  const results: { role: string; ok: boolean; why?: string }[] = [];
  for (const role of targets) {
    if (bodyFor(plan, role) === undefined) {
      results.push({
        role,
        ok: false,
        why: `login.json に ${role === "" ? "body" : `roles.${role}`} がありません`,
      });
      continue;
    }
    const got = await getToken(plan, role, loginSend);
    results.push(
      "error" in got ? { role, ok: false, why: got.error } : { role, ok: true },
    );
  }
  const bad = results.filter((one) => !one.ok);
  if (flags.json === true) {
    io.out(JSON.stringify({ checked: results.length, results }, null, 2));
  } else {
    io.out("資格の取り方を試しました（**業務の口は叩いていません**）:");
    for (const one of results) {
      io.out(
        `  ・${one.role === "" ? "（役割なし）" : one.role} … ` +
          `${one.ok ? "取れました" : `取れません（${one.why}）`}`,
      );
    }
    io.out("");
    io.out(
      "※ 取れたトークンは出しません（CI のログは残ります）。" +
        "ここが通らない役割は、叩いた結果でも「叩いていません」になります。",
    );
  }
  return bad.length > 0 ? 1 : 0;
}

/** 定義とサーバの食い違いを、実際に叩いて見る。 */
export async function probeCommand(
  files: string[],
  flags: Args["flags"],
  io: CliIo,
  send: HttpSend,
  loginSend: LoginSend,
): Promise<number> {
  // 印の表を引くだけ／資格だけ試す＝**定義を読まない**（読まないものを要求しない）。
  if (flags.kinds === true) return probeKindsCommand(files, flags, io);
  if (flags.check === true) {
    const only = readLoginPlan(flags, io);
    if (only === undefined) {
      io.err(
        "--check は --login login.json と一緒に使ってください" +
          "（試すのは資格の取り方です）。",
      );
      return 1;
    }
    return loginCheck(only, flags, io, loginSend);
  }
  const { targets, headers } = probeSetup(files, flags, io);
  const plan = readLoginPlan(flags, io);
  if (flags["dry-run"] === true) {
    const requests = probeRequests(targets);
    const login = loginDryRun(plan, "");
    io.out(
      flags.json === true
        ? JSON.stringify({ login, requests, skipped: targets.skipped }, null, 2)
        : [
            ...(login === undefined ? [] : [...loginDryLine(login), ""]),
            "叩く要求（--dry-run なので送っていません）:",
            ...requests.map((one) => `  ${one}`),
          ].join("\n"),
    );
    return 0;
  }
  const report = await probe(targets, send, {
    ...headers,
    ...(await loginHeaders(plan, "", loginSend)),
  });
  return finishRun(report, hasProbeError(report), renderProbe, flags, io);
}

/** 見えないはずの口を、その役割で叩いて見る。 */
export async function attackCommand(
  files: string[],
  flags: Args["flags"],
  io: CliIo,
  send: HttpSend,
  loginSend: LoginSend,
): Promise<number> {
  if (flags["all-roles"] === true) {
    return sweepCommand(files, flags, io, send, loginSend);
  }
  const role = str(flags, "role");
  if (role === undefined) {
    throw new Error(
      "--role を渡してください（誰として叩くかが要ります）。" +
        "役割ぜんぶを1枚にするなら --all-roles（資格は役割ごとに要ります）。",
    );
  }
  const { targets, headers } = probeSetup(files, flags, io);
  const plan = readLoginPlan(flags, io);
  if (flags["dry-run"] === true) {
    const requests = attackRequests(targets, role);
    const login = loginDryRun(plan, role);
    io.out(
      flags.json === true
        ? JSON.stringify({ role, login, requests }, null, 2)
        : [
            ...(login === undefined ? [] : [...loginDryLine(login), ""]),
            `役割 "${role}" で叩く要求（--dry-run なので送っていません）:`,
            ...requests.map((one) => `  ${one}`),
          ].join("\n"),
    );
    return 0;
  }
  const report = await attack(targets, role, send, {
    ...headers,
    ...(await loginHeaders(plan, role, loginSend)),
  });
  return finishRun(report, hasHole(report), renderAttack, flags, io);
}

/**
 * 役割ぜんぶ＋誰でもない人で叩く（`--all-roles`）。
 *
 * `--token` / `--headers` は受け付けない＝1つの資格を全部の役割に使うと、返ってきた
 * 200 が「その役割でも見えてしまう」なのか「いま使った資格なら正しい」なのか区別が
 * つかない（穴が在ることにも無いことにもできてしまう）。
 */
async function sweepCommand(
  files: string[],
  flags: Args["flags"],
  io: CliIo,
  send: HttpSend,
  loginSend: LoginSend,
): Promise<number> {
  if (str(flags, "token") !== undefined || str(flags, "headers") !== undefined) {
    throw new Error(
      "--all-roles では資格を役割ごとに渡します（--accounts accounts.json / --login login.json）。" +
        "1つの資格で全部の役割を判定すると、200 が穴なのか正しいのか区別できません。",
    );
  }
  const accountsPath = str(flags, "accounts");
  const plan = readLoginPlan(flags, io);
  if (accountsPath !== undefined && plan !== undefined) {
    throw new Error(
      "--accounts と --login は一緒に使えません（資格の出どころを1つにしてください）。",
    );
  }
  if (accountsPath === undefined && plan === undefined) {
    throw new Error(
      '--accounts accounts.json を渡してください（{ "hr": { "token": "…" } } の形）。' +
        "資格の取り方を書いて毎回取らせるなら --login login.json。" +
        "資格の無い役割は叩かず、理由を残します。",
    );
  }
  // `--login` は役割ごとの本文が要る（`--all-roles` が1つの資格を断っているのと同じ
  // 理由＝誰として叩いたか分からない結果は読めない）。
  if (plan !== undefined && Object.keys(plan.roles).length === 0) {
    throw new Error(
      "--all-roles では login.json に roles が要ります（役割ごとに資格を取ります）。" +
        "1つの資格で全部の役割を判定すると、200 が穴なのか正しいのか区別できません。",
    );
  }
  const declared =
    plan === undefined
      ? parseAttackAccounts(JSON.parse(io.readFile(accountsPath!)))
      : Object.fromEntries(Object.keys(plan.roles).map((role) => [role, {}]));
  const { targets } = probeSetup(files, flags, io);
  if (flags["dry-run"] === true) {
    const roles = rolesToSweep(targets, declared);
    const shown = roles.map((role) => ({
      role,
      credential:
        declared[role] === undefined
          ? null
          : plan === undefined
            ? "accounts から"
            : "login から（毎回取ります）",
      login: loginDryRun(plan, role),
      requests: attackRequests(targets, role),
    }));
    shown.push({
      role: ANONYMOUS_LABEL,
      credential: null,
      login: undefined,
      requests: attackRequests(targets, ANONYMOUS),
    });
    io.out(
      flags.json === true
        ? JSON.stringify({ plan: shown }, null, 2)
        : [
            "叩く要求（--dry-run なので送っていません）:",
            ...shown.flatMap((one) => [
              `  ${one.role}${one.credential === null ? "（資格なし）" : `（${one.credential}）`}`,
              ...(one.login === undefined
                ? []
                : [`    ${one.login.method} ${one.login.url} ${JSON.stringify(one.login.body)}`]),
              ...one.requests.map((request) => `    ${request}`),
            ]),
          ].join("\n"),
    );
    return 0;
  }
  // `--login` のときは、ここで役割ごとに取る。取れなかった役割は**理由つきで**
  // 飛ばす（「資格が書かれていません」と言うと、書き忘れと期限切れが区別できない）。
  const got =
    plan === undefined
      ? { accounts: declared, troubles: {} }
      : await loginAccounts(plan, Object.keys(plan.roles), loginSend);
  const sweep = await attackAll(targets, got.accounts, send, got.troubles);
  return finishRun(sweep, sweepHasHole(sweep), renderAttackSweep, flags, io);
}
