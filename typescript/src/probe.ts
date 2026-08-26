// 定義とサーバの食い違いを、**実際に叩いて**見る。
//
// いま機械が縛れているのは「クライアントが宣言どおり送る」ことだけ。`hatake openapi` は
// 定義から API の形を出すが、それは**こちら側の言い分**で、サーバがその形で返すかは
// 動かして初めて分かる。しかも食い違いは静かに出る: 知らない項目は無視され、来なかった
// 列は空欄になり、文字で来た金額は桁区切りが効かないまま合計から漏れる。**エラーは
// 出ない**。だから人は「なんとなく画面が変」で止まる。
//
// 決めごと3つ。
//
// 1. **読むだけ。** POST / PUT / DELETE は宣言できても叩かない（試すたびにデータが
//    増える・消える）。叩かなかったことは報告に書く（黙って飛ばすと「全部見た」に
//    見える）。
// 2. **無いのは事故、null は業務。** 項目が返って来ないのは画面が壊れるが、値が空
//    なのは普通のこと。ここを一緒にすると報告が読まれなくなる。**値が空の項目を
//    JSON から省く実装**（Jackson の NON_NULL など）が多いので、一覧は**返ってきた
//    行を全部**見て「どの行にも無い」ときだけ言う（1行目に無いだけで言うと、空欄の
//    ある画面で毎回鳴る）。
// 3. **宣言に無い項目が来ていても言わない。** 画面が見ないだけで害が無い。言うと
//    実物の API で報告が埋まる。

import { acceptJson, type HttpSend } from "./httpProbe.js";
import {
  compareRecord,
  compareRows,
  kindOf,
  type ProbeFinding,
  type ProbeKind,
  type ProbeLevel,
} from "./probeShape.js";
import type { RestTarget, RestTargets, SkippedPage } from "./restTarget.js";

export type { ProbeFinding, ProbeKind, ProbeLevel } from "./probeShape.js";

export interface ProbeReport {
  findings: ProbeFinding[];
  /** 叩いた要求（叩いた順）。 */
  requests: string[];
  /** 叩いた画面（`--since` で前回と比べるとき、相手が減ったかを見るのに使う）。 */
  pages: string[];
  /** 叩かなかったものと理由。 */
  skipped: SkippedPage[];
}

export const hasProbeError = (report: ProbeReport): boolean =>
  report.findings.some((one) => one.level === "error");

const asDict = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** 送って、JSON にして返す。失敗は findings に変える（落とさない）。 */
async function get(
  send: HttpSend,
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; json?: unknown; body: string } | { error: string }> {
  try {
    const response = await send({
      method: "GET",
      url,
      headers: { ...acceptJson, ...headers },
    });
    if (response.body.trim() === "") {
      return { status: response.status, body: response.body };
    }
    try {
      return {
        status: response.status,
        json: JSON.parse(response.body),
        body: response.body,
      };
    } catch {
      return { status: response.status, body: response.body };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** 短く切った本文（報告に混ぜるとき。HTML が丸ごと入ると読めない）。 */
const head = (body: string): string => {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > 120 ? `${one.slice(0, 120)}…` : one;
};

/** 一覧（`GET <collection>?page=0&pageSize=…`）を見る。返すのは1行目（あれば）。 */
async function probeList(
  target: RestTarget,
  send: HttpSend,
  headers: Record<string, string>,
  findings: ProbeFinding[],
): Promise<Record<string, unknown> | undefined> {
  const request = `GET ${target.listUrl}`;
  const add = (
    kind: ProbeKind,
    level: ProbeLevel,
    what: string,
    fix?: string,
  ): void => {
    findings.push({ page: target.page, kind, level, request, what, fix });
  };
  const answer = await get(send, target.listUrl, headers);
  if ("error" in answer) {
    add("unreachable", "error", `叩けませんでした（${answer.error}）`, "基点（--base）とサーバが動いているかを確かめてください。");
    return undefined;
  }
  if (answer.status === 404) {
    add(
      "no-endpoint",
      "error",
      "その口がありません（404）",
      "集合の名前が違います。--collection で実物に合わせてください" +
        "（既定は repository 名の複数形を推測しています）。",
    );
    return undefined;
  }
  if (answer.status === 401 || answer.status === 403) {
    add(
      "refused",
      "error",
      `拒否されました（${answer.status}）`,
      "--token / --headers で、その画面を開ける人の資格を渡してください。",
    );
    return undefined;
  }
  if (answer.status < 200 || answer.status >= 300) {
    add("bad-status", "error", `${answer.status} が返りました（${head(answer.body)}）`);
    return undefined;
  }
  if (answer.json === undefined) {
    add(
      "not-json",
      "error",
      `JSON が返っていません（${head(answer.body)}）`,
      "一覧は {items, totalCount} の JSON を返す約束です。",
    );
    return undefined;
  }
  const body = asDict(answer.json);
  const items = body?.items;
  const total = body?.totalCount;
  if (body === undefined || !Array.isArray(items) || typeof total !== "number") {
    add(
      "list-shape",
      "error",
      `一覧の形が違います（返り: ${Array.isArray(answer.json) ? "配列" : `{${Object.keys(body ?? {}).join(", ")}}`}）`,
      "{items: [...], totalCount: 0} を返してください" +
        "（`hatake openapi` が宣言している形です。件数が無いとページ送りが作れません）。",
    );
    return undefined;
  }
  if (items.length > target.pageSize) {
    add(
      "page-size-ignored",
      "caution",
      `${target.pageSize} 件を頼んで ${items.length} 件返っています`,
      "pageSize が効いていません（ページ送りが動かず、行が増えるほど重くなります）。",
    );
  }
  if (total < items.length) {
    add(
      "total-too-small",
      "caution",
      `totalCount（${total}）が返ってきた行数（${items.length}）より少ないです`,
      "件数は絞り込み後の全件です（ページ送りの表示と次ページの有無が狂います）。",
    );
  }
  if (items.length === 0) {
    add(
      "no-rows",
      "caution",
      "0 件でした（返ってくる項目を確かめられません）",
      "1件でもデータを入れてから叩いてください（形の食い違いは行が無いと出ません）。",
    );
    return undefined;
  }
  const rows = items.map(asDict).filter(
    (row): row is Record<string, unknown> => row !== undefined,
  );
  const first = rows[0];
  if (first === undefined) {
    add("row-not-object", "error", `一覧の行が object ではありません（${kindOf(items[0])}）`);
    return undefined;
  }
  if (rows.length < items.length) {
    add(
      "rows-not-object",
      "error",
      `一覧に object でない行が ${items.length - rows.length} 件あります`,
    );
  }
  if (target.row !== undefined) {
    for (const one of compareRows(target.row, rows)) {
      findings.push({ page: target.page, request, ...one });
    }
  }
  // 一覧に出さない列でも、鍵は返って来ないと**行を特定できない**（開く・消すが動かない）。
  if (
    target.keyField !== undefined &&
    !rows.some((row) => target.keyField! in row)
  ) {
    add(
      "no-key",
      "error",
      `行に鍵（${target.keyField}）がありません`,
      "行を特定できないので、開く・直す・消すが動きません（列に出さなくても返してください）。",
    );
  }
  return first;
}

/** 1件取得（`GET <collection>/<key>`）を見る。 */
async function probeItem(
  target: RestTarget,
  key: string,
  send: HttpSend,
  headers: Record<string, string>,
  findings: ProbeFinding[],
): Promise<void> {
  const url = `${target.collection}/${encodeURIComponent(key)}`;
  const request = `GET ${url}`;
  const add = (
    kind: ProbeKind,
    level: ProbeLevel,
    what: string,
    fix?: string,
  ): void => {
    findings.push({ page: target.page, kind, level, request, what, fix });
  };
  const answer = await get(send, url, headers);
  if ("error" in answer) {
    add("unreachable", "error", `叩けませんでした（${answer.error}）`);
    return;
  }
  if (answer.status === 404) {
    add(
      "item-missing",
      "error",
      `一覧に在る行（${key}）が1件取得で見つかりません`,
      "鍵の綴りか経路が違います（詳細も編集も開けません）。",
    );
    return;
  }
  if (answer.status < 200 || answer.status >= 300) {
    add("bad-status", "error", `${answer.status} が返りました（${head(answer.body)}）`);
    return;
  }
  const record = asDict(answer.json);
  if (record === undefined) {
    add(
      "item-not-object",
      "error",
      `1件のレコード（object）ではありません（${kindOf(answer.json)}）`,
      "1件取得は object を返す約束です（配列で包まないでください）。",
    );
    return;
  }
  if (target.record !== undefined) {
    for (const one of compareRecord(target.record, record, "1件取得")) {
      findings.push({ page: target.page, request, ...one });
    }
  }
}

/** 叩く前に「何を叩くか」を出す（`--dry-run`）。送らないので CI に置ける。 */
export function probeRequests(targets: RestTargets): string[] {
  const found: string[] = [];
  for (const target of targets.targets) {
    found.push(`GET ${target.listUrl}`);
    if (target.record !== undefined && target.keyField !== undefined) {
      found.push(`GET ${target.collection}/{${target.keyField}}`);
    }
  }
  return found;
}

/**
 * 定義が要求している口を叩いて、返りを宣言と突き合わせる。
 *
 * 画面ごとに「一覧 → その1行目で1件取得」の2回まで。1件取得は**1件を指せる画面
 * だけ**（フォームを持たない一覧は `findByKey` を呼ばないので、叩くと在りもしない
 * 食い違いを報告する）。
 */
export async function probe(
  targets: RestTargets,
  send: HttpSend,
  headers: Record<string, string> = {},
): Promise<ProbeReport> {
  const findings: ProbeFinding[] = [];
  const requests: string[] = [];
  const skipped: SkippedPage[] = [...targets.skipped];
  for (const target of targets.targets) {
    requests.push(`GET ${target.listUrl}`);
    const first = await probeList(target, send, headers, findings);
    if (target.record === undefined || target.keyField === undefined) {
      skipped.push({
        page: target.page,
        reason: "1件を指す画面ではない（1件取得は叩かない）",
      });
      continue;
    }
    if (first === undefined) continue;
    const key = first[target.keyField];
    if (key === null || key === undefined || `${key}` === "") {
      skipped.push({
        page: target.page,
        reason: `1行目に鍵（${target.keyField}）の値が無いので、1件取得は叩けない`,
      });
      continue;
    }
    requests.push(`GET ${target.collection}/${encodeURIComponent(`${key}`)}`);
    await probeItem(target, `${key}`, send, headers, findings);
  }
  return {
    findings,
    requests,
    pages: targets.targets.map((one) => one.page),
    skipped,
  };
}

const SIGN: Record<ProbeLevel, string> = { error: "食い違い", caution: "要確認" };

/** 人が読む形。 */
export function renderProbe(report: ProbeReport): string {
  const lines: string[] = [];
  const byPage = new Map<string, ProbeFinding[]>();
  for (const one of report.findings) {
    byPage.set(one.page, [...(byPage.get(one.page) ?? []), one]);
  }
  for (const [page, found] of byPage) {
    lines.push(`■ ${page}`);
    for (const one of found) {
      lines.push(`  ${SIGN[one.level]} ${one.what}`);
      lines.push(`    ${one.request}`);
      if (one.fix !== undefined) lines.push(`    → ${one.fix}`);
    }
    lines.push("");
  }
  const errors = report.findings.filter((one) => one.level === "error").length;
  const cautions = report.findings.length - errors;
  lines.push(
    `叩いた要求 ${report.requests.length} 件・食い違い ${errors} 件・要確認 ${cautions} 件`,
  );
  if (report.skipped.length > 0) {
    lines.push("");
    lines.push("叩かなかったもの:");
    for (const one of report.skipped) {
      lines.push(`  ${one.page}: ${one.reason}`);
    }
  }
  lines.push("");
  lines.push(
    "書き込み（POST / PUT / DELETE）は叩いていません" +
      "（試すたびにデータが増える・消えるので、道具の仕事ではありません）。",
  );
  return lines.join("\n");
}
