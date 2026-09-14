// 用語の揺れ（`hatake project --drift <定義...>`）。
//
// 案件の途中から前書きを入れるとき、辞書を手で書くのは無理（画面が 30 枚あると読み
// 切れない）。けれど**揺れているかどうか**は機械が数えられる ── 同じ項目名に3種類の
// ラベルが付いていれば、それは誰かが決めていない証拠だ。
//
// 決めごと:
//
// * **辞書を作らない。** 出すのは「揺れている」という事実だけで、どちらの言葉が正しい
//   かは言わない（業務の言葉なので人が決める）。前書きを定義から起こしてはいけないのは
//   [parseProject] と同じ理由＝起こせば必ず一致して、読む値打ちが無くなる
// * **もう決めてあるものは出さない。** 辞書に載っている語・項目名は、決着済み
// * **1件ごとに定義の道を持つ。** その道を辿ると本当にその字に行き当たる（試験が見る）
// * **書き込まない。** 出すだけ（人が読んで、決めて、前書きに書く）

import {
  pageActions,
  rawFormFields,
  searchFilters,
  tableColumns,
} from "./pageParts.js";
import { type ProjectDocument } from "./project.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const dicts = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);

const pathText = (parts: (string | number)[]): string =>
  parts.reduce<string>(
    (text, one) =>
      typeof one === "number" ? `${text}[${one}]` : text === "" ? one : `${text}.${one}`,
    "",
  );

/** 定義に書いてある「項目名 ↔ 画面に出す言葉」の対1つ。 */
export interface NamedSpot {
  field: string;
  label: string;
  /** どの画面か。 */
  page?: string;
  /** 定義の道（ラベルが書いてある所）。 */
  path: string;
}

/** 揺れの向き。**閉じた集合**（言い方を [DRIFT_WORDS] が持つ）。 */
export const DRIFT_KINDS = ["labels", "fields"] as const;

export type DriftKind = (typeof DRIFT_KINDS)[number];

export const DRIFT_WORDS: Record<DriftKind, string> = {
  labels: "同じ項目名に、違う言葉が付いています",
  fields: "同じ言葉が、違う項目名に付いています",
};

/** 揺れ1件。 */
export interface Drift {
  kind: DriftKind;
  /** 揺れている側の字（`labels` なら項目名、`fields` なら言葉）。 */
  name: string;
  /** 見つかった呼び方（2つ以上）。 */
  spots: NamedSpot[];
}

/** 定義に書いてある対を全部集める（助言と同じ walk）。 */
export function namedSpots(documents: Dict[]): NamedSpot[] {
  const found: NamedSpot[] = [];
  // 道は**定義の頭から**書く（画面からの相対だと、貼られた人が辿れない＝場所が嘘を
  // つく。試験がその道を辿って確かめている）。
  const pages: { page: Dict; at: string }[] = [];
  for (const document of documents) {
    const app = isDict(document.app) ? document.app : undefined;
    if (app !== undefined) {
      dicts(app.pages).forEach((page, index) =>
        pages.push({ page, at: `app.pages[${index}]` }),
      );
    }
    if (isDict(document.page)) pages.push({ page: document.page, at: "page" });
  }
  for (const { page, at: pageAt } of pages) {
    const id = str(page.id);
    const push = (node: Dict, at: string): void => {
      const field = str(node.field);
      const label = str(node.label);
      if (field === undefined || label === undefined) return;
      found.push({
        field,
        label,
        ...(id === undefined ? {} : { page: id }),
        path: `${at}.label`,
      });
    };
    for (const part of [
      ...tableColumns(page),
      ...searchFilters(page),
      ...rawFormFields(page),
    ]) {
      const at = `${pageAt}.${pathText(part.path)}`;
      push(part.node, at);
      // 明細の中も同じように名前を持つ（そこで揺れることが多い）。
      if (str(part.node.type) !== "subTable") continue;
      dicts(part.node.columns).forEach((child, index) =>
        push(child, `${at}.columns[${index}]`),
      );
      dicts(part.node.fields).forEach((child, index) =>
        push(child, `${at}.fields[${index}]`),
      );
    }
    // ボタンは `field` を持たないので、この数え方には入らない（別の話）。
    pageActions(page);
  }
  return found;
}

/** 辞書で決着している字（語・項目名）。 */
const settled = (project: ProjectDocument): { terms: Set<string>; fields: Set<string> } => ({
  terms: new Set(project.glossary.map((entry) => entry.term)),
  fields: new Set(
    project.glossary
      .map((entry) => entry.field)
      .filter((one): one is string => one !== undefined),
  ),
});

/** 同じ鍵で束ねて、2つ以上の呼び方が在るものだけ返す。 */
function groupsOf(
  spots: NamedSpot[],
  keyOf: (spot: NamedSpot) => string,
  otherOf: (spot: NamedSpot) => string,
  skip: Set<string>,
): { name: string; spots: NamedSpot[] }[] {
  const groups = new Map<string, NamedSpot[]>();
  for (const spot of spots) {
    const key = keyOf(spot);
    if (skip.has(key)) continue;
    const found = groups.get(key);
    if (found === undefined) groups.set(key, [spot]);
    else found.push(spot);
  }
  const found: { name: string; spots: NamedSpot[] }[] = [];
  for (const [name, mine] of groups) {
    const kinds = new Set(mine.map(otherOf));
    if (kinds.size < 2) continue;
    found.push({ name, spots: mine });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 揺れを数える。**辞書で決着している字は見ない**（もう決めてあるので）。
 */
export function findDrift(
  project: ProjectDocument,
  documents: Dict[],
): Drift[] {
  const spots = namedSpots(documents);
  const known = settled(project);
  return [
    ...groupsOf(
      spots,
      (spot) => spot.field,
      (spot) => spot.label,
      known.fields,
    ).map((one): Drift => ({ kind: "labels", ...one })),
    ...groupsOf(
      spots,
      (spot) => spot.label,
      (spot) => spot.field,
      known.terms,
    ).map((one): Drift => ({ kind: "fields", ...one })),
  ];
}

/** 呼び方ごとに束ねる（並びは多い順＝どれが主流かが読める）。 */
const byOther = (one: Drift): [string, NamedSpot[]][] => {
  const groups = new Map<string, NamedSpot[]>();
  for (const spot of one.spots) {
    const other = one.kind === "labels" ? spot.label : spot.field;
    const found = groups.get(other);
    if (found === undefined) groups.set(other, [spot]);
    else found.push(spot);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
};

/** 人が読む形。 */
export function driftLines(found: Drift[], read: number): string[] {
  if (found.length === 0) {
    return [
      `用語の揺れは見つかりませんでした（項目とラベルの対を ${read} 件読みました）。`,
      "",
      DRIFT_NOTE,
    ];
  }
  const out: string[] = [
    `用語が揺れている所が ${found.length} 件あります（対を ${read} 件読みました）。`,
  ];
  for (const kind of DRIFT_KINDS) {
    const mine = found.filter((one) => one.kind === kind);
    if (mine.length === 0) continue;
    out.push("");
    out.push(`${DRIFT_WORDS[kind]}:`);
    for (const one of mine) {
      out.push("");
      out.push(`  "${one.name}"`);
      // **同じ呼び方は1行にまとめる**（全部並べると、何種類あるのかが読めなくなる）。
      // 場所は最初に見つかった所だけ。何か所あるかは言う（1か所だと思って直すと残る）。
      for (const [other, spots] of byOther(one)) {
        const first = spots[0];
        out.push(
          `    ・${other}（${spots.length}か所。最初: ` +
            `${first.page === undefined ? "" : `${first.page}: `}${first.path}）`,
        );
      }
    }
  }
  out.push("");
  out.push(DRIFT_NOTE);
  return out;
}

/** 決めるのは人。道具は数えるだけ。 */
export const DRIFT_NOTE =
  "※ **どちらの言葉が正しいかは言いません**（業務の言葉なので、決めるのは人です）。" +
  "決めたら、前書きの `glossary` に1件書いてください（`term` と `field`、呼ばない字は " +
  "`avoid`）＝次からその字は揺れとして出ず、`hatake advise --project` が定義と" +
  "突き合わせます。**この道具は前書きを書き換えません**（前書きを定義から起こすと、" +
  "必ず一致して読む値打ちが無くなるので）。";

/**
 * 揺れを**辞書の下書き**にする（`--drift --draft`）。
 *
 * 揺れが見えても、そこから辞書に写すのは手作業。写す形までは機械が作れる ── ただし
 * **言葉は選ばない**。`term` にはいちばん多い呼び方を**仮に**置き、そう書く
 * （多いだけで、正しいという意味ではない）。決めるのは人。
 *
 * 「同じ言葉が違う項目名に付いている」側は**下書きにしない**。辞書は「1つの言葉 →
 * 1つの項目名」を書く紙なので、そちらは項目名を揃える話＝注記だけ出す。
 *
 * 出すのは**貼れる形**（前書きとして読める YAML）。書き込みはしない。
 */
export function driftDraft(found: Drift[]): string {
  const out: string[] = [
    "# `hatake project --drift --draft` が出した**下書き**です。",
    "# term は**いちばん多い呼び方を仮に置いた**だけで、正しいという意味ではありません。",
    "# 業務の言葉を決めてから、前書きの glossary に貼ってください（この道具は書き込みません）。",
  ];
  const labels = found.filter((one) => one.kind === "labels");
  // 貼るものが無いときに `glossary:` だけ書かない（**中身の無いキーは読めない**＝
  // 貼った人の所で前書きが落ちる）。
  if (labels.length === 0) {
    out.push("# 同じ項目名に違う言葉が付いている所はありませんでした（貼るものはありません）。");
  } else {
    out.push("glossary:");
  }
  for (const one of labels) {
    const ranked = byOther(one);
    const [term, spots] = ranked[0];
    const rest = ranked.slice(1);
    out.push(
      `  # "${one.name}" は ${ranked.length} 通りに呼ばれています` +
        `（${ranked.map(([word, at]) => `${word} ${at.length}か所`).join(" / ")}）。`,
    );
    out.push(`  - term: ${term}   # 仮。${spots.length}か所でいちばん多い呼び方`);
    out.push(`    field: ${one.name}`);
    out.push(`    avoid: [${rest.map(([word]) => word).join(", ")}]`);
  }
  const fields = found.filter((one) => one.kind === "fields");
  if (fields.length > 0) {
    out.push("");
    out.push("# 下の分は**辞書では直りません**（同じ言葉が違う項目名に付いている）。");
    out.push("# 辞書は「1つの言葉 → 1つの項目名」を書く紙なので、項目名を揃える話です。");
    for (const one of fields) {
      out.push(
        `#   "${one.name}" … ${byOther(one)
          .map(([name, at]) => `${name}（${at.length}か所）`)
          .join(" / ")}`,
      );
    }
  }
  return out.join("\n");
}

/** 前回と比べた揺れ。 */
export interface DriftDiff {
  /** 増えた揺れ（新しい画面を足した回に出る）。 */
  added: Drift[];
  /** 消えた揺れ（**直したとは限らない**＝画面を消しただけかもしれない）。 */
  gone: { kind: DriftKind; name: string }[];
  /** 前も今も在る揺れの数。 */
  same: number;
}

/** 前回の `--drift --json` として読めるか。 */
export function parseDriftReport(value: unknown): Drift[] {
  const list =
    typeof value === "object" && value !== null && Array.isArray((value as { drift?: unknown }).drift)
      ? ((value as { drift: unknown[] }).drift)
      : null;
  const ok =
    list !== null &&
    list.every(
      (one) =>
        typeof one === "object" &&
        one !== null &&
        typeof (one as Drift).name === "string" &&
        DRIFT_KINDS.includes((one as Drift).kind),
    );
  if (!ok) {
    // 黙って空と比べると「全部増えた」と出る（前回が読めなかっただけなのに）。
    throw new Error(
      "前回の揺れとして読めません（`hatake project --drift --json` の出力を渡してください）。",
    );
  }
  return list as Drift[];
}

const keyOf = (one: { kind: DriftKind; name: string }): string => `${one.kind}\u0000${one.name}`;

/** 前回と比べる。 */
export function compareDrift(before: Drift[], after: Drift[]): DriftDiff {
  const had = new Set(before.map(keyOf));
  const has = new Set(after.map(keyOf));
  return {
    added: after.filter((one) => !had.has(keyOf(one))),
    gone: before
      .filter((one) => !has.has(keyOf(one)))
      .map((one) => ({ kind: one.kind, name: one.name })),
    same: after.filter((one) => had.has(keyOf(one))).length,
  };
}

/** 人が読む形。 */
export function driftDiffLines(diff: DriftDiff): string[] {
  const out: string[] = ["前回からの移り変わり:"];
  if (diff.added.length === 0) {
    out.push("  ・増えた揺れはありません。");
  } else {
    out.push("");
    out.push(`増えた揺れ（${diff.added.length}件）:`);
    for (const one of diff.added) {
      out.push(`  ・[${one.kind}] "${one.name}"`);
    }
  }
  if (diff.gone.length > 0) {
    out.push("");
    out.push(`消えた揺れ（${diff.gone.length}件）:`);
    for (const one of diff.gone) out.push(`  ・[${one.kind}] "${one.name}"`);
  }
  out.push("");
  out.push(`前も今も在る揺れ: ${diff.same}件`);
  out.push("");
  out.push(DRIFT_DIFF_NOTE);
  return out;
}

/** 消えた＝直した、ではない。 */
export const DRIFT_DIFF_NOTE =
  "※ **消えた揺れは「直した」とは限りません**（その画面を消しただけかもしれません）。" +
  "増えた揺れは**新しい画面を足した回**に出ます ── そこで決めるのが、いちばん軽いです。";
