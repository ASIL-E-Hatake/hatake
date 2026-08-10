// 定義を変えたときの影響範囲。`DtoSpec` の差分を取り、**後方互換を壊したか**を言う。
//
// 「この項目を必須にした」「この列を消した」が API の形にどう出るかは、定義を読んでも
// すぐには分からない。壊すこと自体は普通にあるので止めはしないが、**気づかずに壊す**
// のは避けたい。だから機械で言う。
//
// 互換性は向きで決まる:
//   ・request（クライアント → サーバ）… サーバが要求を増やす／厳しくすると壊れる
//   ・response（サーバ → クライアント）… 返すものを減らす／型を変えると壊れる
// この非対称が全部で、あとはその当てはめ。

import type { DtoMember, DtoShape, DtoSpec } from "./dto.js";

/** 変更1つ。 */
export interface DtoChange {
  /** 規則名（安定した識別子）。 */
  kind: string;
  /** どの形か（`request` / `row` / `listResponse` / `queryParams` …）。 */
  shape: string;
  /** どのメンバーか（形そのものの増減なら未設定）。 */
  member?: string;
  from?: string;
  to?: string;
  /** 後方互換を壊すか。 */
  breaking: boolean;
  message: string;
}

export interface DtoDiff {
  page: string;
  /** 壊す変更が1つも無いか。 */
  compatible: boolean;
  changes: DtoChange[];
}

/** 制約の名前 → 「厳しくなった」の判定。 */
const TIGHTENS: Record<string, (from: unknown, to: unknown) => boolean> = {
  maxLength: (from, to) => num(to) < num(from),
  minLength: (from, to) => num(to) > num(from),
  maximum: (from, to) => num(to) < num(from),
  minimum: (from, to) => num(to) > num(from),
};

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number.POSITIVE_INFINITY;

/** 返す形（消したり型を変えたら読み手が壊れる）。 */
const RESPONSE_ROLES = new Set(["row", "listResponse", "child"]);

/**
 * 2つの定義から導いた `DtoSpec` を比べる。
 *
 * 並びは「形ごと → メンバーごと」で、同じ入力なら常に同じ順になる。
 */
export function diffDto(before: DtoSpec, after: DtoSpec): DtoDiff {
  const changes: DtoChange[] = [];

  if (before.page !== after.page) {
    changes.push({
      kind: "page-renamed",
      shape: "-",
      from: before.page,
      to: after.page,
      breaking: true,
      message:
        `ページ id が "${before.page}" から "${after.page}" に変わりました。` +
        "id で引いている所（menu / navigate / 生成した型の名前）が全部ズレます。",
    });
  }

  const beforeShapes = new Map(before.shapes.map((s) => [s.name, s]));
  const afterShapes = new Map(after.shapes.map((s) => [s.name, s]));

  for (const shape of before.shapes) {
    const next = afterShapes.get(shape.name);
    if (next === undefined) {
      changes.push({
        kind: "shape-removed",
        shape: shape.name,
        breaking: true,
        message:
          `${describeRole(shape.role)}（${shape.name}）が無くなりました。` +
          "この形を使っている呼び出しは通らなくなります。",
      });
      continue;
    }
    changes.push(...diffShape(shape, next));
  }

  for (const shape of after.shapes) {
    if (beforeShapes.has(shape.name)) continue;
    changes.push({
      kind: "shape-added",
      shape: shape.name,
      breaking: false,
      message: `${describeRole(shape.role)}（${shape.name}）が増えました。`,
    });
  }

  return {
    page: after.page,
    compatible: !changes.some((c) => c.breaking),
    changes,
  };
}

function describeRole(role: string): string {
  switch (role) {
    case "request":
      return "受け取る形";
    case "row":
      return "1行の形";
    case "listResponse":
      return "一覧の応答";
    case "queryParams":
      return "検索パラメータ";
    case "pathParams":
      return "パスパラメータ";
    case "child":
      return "明細行の形";
    default:
      return role;
  }
}

function diffShape(before: DtoShape, after: DtoShape): DtoChange[] {
  const changes: DtoChange[] = [];
  const role = after.role;
  const isRequest = role === "request";
  const isResponse = RESPONSE_ROLES.has(role);
  const isQuery = role === "queryParams";
  const isPath = role === "pathParams";
  const beforeMembers = new Map(before.members.map((m) => [m.name, m]));

  const add = (change: Omit<DtoChange, "shape">) =>
    changes.push({ ...change, shape: after.name });

  for (const member of before.members) {
    const next = after.members.find((m) => m.name === member.name);
    if (next === undefined) {
      // 消えたときに何が起きるかは、形の向きで違う。
      add({
        kind: "member-removed",
        member: member.name,
        breaking: isResponse || isQuery || isPath,
        message: isResponse
          ? `${member.name} が返らなくなりました。読んでいる画面・呼び出しが壊れます。`
          : isQuery
            ? `検索パラメータ ${member.name} が無くなりました。` +
              "送っても無視されるので、絞り込みが黙って効かなくなります。"
            : isPath
              ? `パスパラメータ ${member.name} が無くなりました。URL の形が変わります。`
              : `${member.name} を受け取らなくなりました。` +
                "送っても無視されるだけですが、その値は保存されません。",
      });
      continue;
    }
    if (member.type !== next.type || member.itemType !== next.itemType) {
      add({
        kind: "type-changed",
        member: member.name,
        from: typeOf(member),
        to: typeOf(next),
        breaking: true,
        message:
          `${member.name} の型が ${typeOf(member)} から ${typeOf(next)} に変わりました。`,
      });
    }
    if (isRequest && member.optional && !next.optional) {
      add({
        kind: "required-added",
        member: member.name,
        breaking: true,
        message:
          `${member.name} が必須になりました。送っていない既存の呼び出しが弾かれます。`,
      });
    }
    if (isRequest && !member.optional && next.optional) {
      add({
        kind: "required-removed",
        member: member.name,
        breaking: false,
        message: `${member.name} が任意になりました。`,
      });
    }
    changes.push(
      ...diffConstraints(member, next, after.name, isRequest).map((c) => c),
    );
  }

  for (const member of after.members) {
    if (beforeMembers.has(member.name)) continue;
    add({
      kind: "member-added",
      member: member.name,
      // 受け取る形に必須で足すのは、既存のクライアントを弾くことになる。
      breaking: isRequest && !member.optional,
      message:
        isRequest && !member.optional
          ? `${member.name} が必須項目として増えました。` +
            "送っていない既存の呼び出しが弾かれます。"
          : `${member.name} が増えました。`,
    });
  }

  return changes;
}

const typeOf = (member: DtoMember): string =>
  member.itemType === undefined
    ? member.type
    : `${member.type}<${member.itemType}>`;

/** 制約は「受け取る形で厳しくなった」ときだけ壊す（返す形は読み手の判断）。 */
function diffConstraints(
  before: DtoMember,
  after: DtoMember,
  shape: string,
  isRequest: boolean,
): DtoChange[] {
  const changes: DtoChange[] = [];
  const names = new Set([
    ...Object.keys(before.constraints),
    ...Object.keys(after.constraints),
  ]);
  for (const name of [...names].sort()) {
    const from = before.constraints[name];
    const to = after.constraints[name];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;

    const tightened =
      to === undefined
        ? false
        : from === undefined
          ? true // 無かった制約が増えた＝厳しくなった
          : (TIGHTENS[name]?.(from, to) ?? true); // pattern / format は変わったら別物
    changes.push({
      kind: to === undefined ? "constraint-relaxed" : "constraint-changed",
      shape,
      member: before.name,
      from: from === undefined ? undefined : `${name}=${format(from)}`,
      to: to === undefined ? undefined : `${name}=${format(to)}`,
      breaking: isRequest && tightened,
      message:
        to === undefined
          ? `${before.name} の制約 ${name} が無くなりました。`
          : from === undefined
            ? `${before.name} に制約 ${name}=${format(to)} が増えました。` +
              (isRequest ? "今まで通っていた値が弾かれます。" : "")
            : `${before.name} の ${name} が ${format(from)} から ${format(to)} に変わりました。` +
              (isRequest && tightened ? "今まで通っていた値が弾かれます。" : ""),
    });
  }
  return changes;
}

const format = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);
