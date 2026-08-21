// 返ってきた JSON を、定義が宣言している形と突き合わせる（[probe] の判定だけ）。
//
// 叩く所（[probe]）と分けてあるのは、**判定は通信を伴わない**から。ここが素の関数
// なら、実装がよくやる返し方（数を文字で返す・空の項目を省く）を試験で並べられる。

import type { DtoShape } from "./dto.js";

/** 見つけたものの重さ。`error` があれば終了コードは 1。 */
export type ProbeLevel = "error" | "caution";

/** 食い違い1件。どこを叩いたかは [probe] が足す。 */
export interface ProbeFinding {
  page: string;
  level: ProbeLevel;
  /** 叩いた要求（`GET http://…`）。 */
  request: string;
  /** 何が食い違っているか（画面から見て何が起きるか、まで書く）。 */
  what: string;
  /** どうするか。直す先がサーバなのか定義なのかを言う。 */
  fix?: string;
}

/** 場所（ページ・要求）が付く前の1件。 */
export type ProbeIssue = Omit<ProbeFinding, "page" | "request">;

/** JSON の値の種類を、宣言（DtoMember.type）と同じ語彙で言う。 */
export function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "object":
      return "object";
    default:
      return typeof value;
  }
}

/** 型が食い違ったときに、画面で何が起きるか。 */
function typeHarm(declared: string, actual: string): string | undefined {
  if (declared === actual) return undefined;
  // 数を文字で返すのが一番多い（BigDecimal を文字列で出す実装）。画面では静かに壊れる。
  if (declared === "number" && actual === "string") {
    return "桁区切り・小計・合計が効きません（数として扱われないので集計から漏れます）";
  }
  if (declared === "boolean") {
    return "チェックが入りません（真偽として読めません）";
  }
  if (declared === "string" && (actual === "number" || actual === "boolean")) {
    return "見せ方（日付・郵便番号などの整形）が効かないことがあります";
  }
  if (declared === "array" || declared === "object") {
    return "その項目は描けません";
  }
  return "画面の見せ方が定義どおりになりません";
}

/** 型の食い違い1件。値が入っている行で見る（null は型を語らない）。 */
function compareType(
  member: { name: string; type: string },
  value: unknown,
  where: string,
): ProbeIssue | undefined {
  const actual = kindOf(value);
  const harm = typeHarm(member.type, actual);
  if (harm === undefined) return undefined;
  return {
    level: member.type === "string" ? "caution" : "error",
    what:
      `${where}の ${member.name} は ${member.type} の約束ですが ` +
      `${actual} で返っています`,
    fix: `${harm} サーバ側の型を直すか、定義の型を実物に合わせてください。`,
  };
}

/**
 * 一覧の行（複数）を、宣言した列と突き合わせる。
 *
 * **返ってきた行を全部見る**。値が空の項目を JSON から省く実装は普通にあるので、
 * 「1行目に無い」では事故と言えない（言えるのは「どの行にも無い」）。
 */
export function compareRows(
  shape: DtoShape,
  rows: Array<Record<string, unknown>>,
): ProbeIssue[] {
  const found: ProbeIssue[] = [];
  for (const member of shape.members) {
    const present = rows.filter((row) => member.name in row);
    if (present.length === 0) {
      found.push({
        level: "error",
        what: `一覧のどの行にも ${member.name}（${member.label || member.name}）がありません`,
        fix:
          "サーバがその列を返すようにするか、定義から外してください" +
          "（画面には空欄の列が出ます）。",
      });
      continue;
    }
    const valued = present.find((row) => row[member.name] !== null);
    if (valued === undefined) continue;
    const one = compareType(member, valued[member.name], "一覧の行");
    if (one !== undefined) found.push(one);
  }
  return found;
}

/**
 * 1件のレコードを、宣言した形と突き合わせる。
 *
 * `where` は「1件取得」のような、人が場所を分かる言い方。
 */
export function compareRecord(
  shape: DtoShape,
  record: Record<string, unknown>,
  where: string,
): ProbeIssue[] {
  const found: ProbeIssue[] = [];
  for (const member of shape.members) {
    if (!(member.name in record)) {
      // 宣言していて返って来ない＝画面は空欄になる。任意なら業務の話なので軽く言う。
      found.push({
        level: member.optional ? "caution" : "error",
        what: `${where}に ${member.name}（${member.label || member.name}）がありません`,
        fix:
          "サーバがその項目を返すようにするか、定義から外してください" +
          "（画面には空欄が出ます）。",
      });
      continue;
    }
    const value = record[member.name];
    // null は「空欄」。業務では普通にあるので言わない（言うと報告が読まれなくなる）。
    if (value === null) continue;
    const one = compareType(member, value, where);
    if (one !== undefined) found.push(one);
  }
  return found;
}
