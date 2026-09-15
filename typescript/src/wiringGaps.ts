// 繋がっていない所を1枚で出す（`hatake gaps`）。
//
// 押す前に言えることは増えた（`validate --registry` の `unknown-plugin`、Renderer が
// 灰色にして理由を出す所）。けれど言われるのは**その画面を開いたとき**か、**その1件
// ごと**で、「全部で何か所残っているか」はアプリを巡らないと分からない。配線の抜けは
// 「あと3か所」と分かっていれば終わるのに、分からないと終わらない。
//
// 数えるものは既に在る＝**定義が外に要求しているもの**（[collectRefs]）と**登録済みの
// 一覧**（`--registry` / 動いているアプリの申告）の差。だからここは1枚にまとめるだけで、
// 新しい判断はしない。
//
// 決めごと:
//   ・**判定は持たない。** 登録済みかは [isRegistered] の1か所（警告と同じ物差し）。
//     種類の呼び方は [REF_KINDS]、埋めないと何が起きるかは [WARNING_RULES]。
//   ・**押す所ごとに1行。** 警告は同じ名前を1件にまとめる（直す所は登録の側なので）が、
//     この紙は「どのボタンが空振りするか」を見る紙なので、参照している所を全部出す。
//   ・**道の文字を読み解かない。** どの画面・どの所かは参照が構造で持っている
//     （`DefinitionRef.page` / `.spot`）。
//   ・**渡されていない種類は「見ていない」**＝手で書いた一覧では「登録していない」と
//     「書き忘れた」の区別が付かない。動いているアプリの申告のときだけ、**申告できる
//     種類**（[RUNTIME_KINDS]）について「1つも登録していない」と言える。

import {
  collectRefs,
  type DefinitionRef,
  type DefinitionRegistry,
  isRegistered,
  type RefKind,
  RefKinds,
} from "./refs.js";
import { RUNTIME_KINDS } from "./registryFromApp.js";
import { REF_KINDS } from "./warnings.js";
import { WARNING_RULES } from "./warningRules.js";

type Dict = Record<string, unknown>;

/** 画面の外（役割の語彙のように、画面に紐づかない所）。 */
export const OUTSIDE_PAGE = "（画面の外）";

/** 繋がっていない所1か所。 */
export interface GapRow {
  kind: RefKind;
  /** 定義が要求している名前。 */
  name: string;
  /** どの画面か（画面に紐づかないものは undefined）。 */
  page?: string;
  /** その所の名前（ボタンの id・項目名）。 */
  spot?: string;
  /** 道（人が開く所）。 */
  path: string;
}

/** 種類1つぶん。 */
export interface GapGroup {
  kind: RefKind;
  /** 種類の呼び方（`プラグイン`）。 */
  what: string;
  /** 同じことを言う警告の規則名（`hatake rules` で引ける）。 */
  rule: string;
  /** 埋めないと何が起きるか（規則の表から）。 */
  happens: string;
  /** 足りない登録の名前（重複なし・名前順）。 */
  names: string[];
  rows: GapRow[];
}

/** 見なかった種類と、その理由。 */
export interface GapSkip {
  kind: RefKind;
  what: string;
  why: string;
}

export interface GapsReport {
  groups: GapGroup[];
  /** 繋がっていない所の数（行数＝押すと空振りする所の数）。 */
  spots: number;
  /** 足りない登録の数（直す側の数）。 */
  names: number;
  /** 画面ごとの残り（多い順・同数なら画面 id 順）。 */
  byPage: { page: string; spots: number }[];
  notChecked: GapSkip[];
  /** 一覧が動いているアプリの申告だったか。 */
  fromApp: boolean;
  /** 読んだ定義の数（1枚だけ渡して読み違えるのを防ぐため必ず出す）。 */
  scanned: number;
}

/**
 * 定義と登録済みの一覧の差を1枚にする。
 *
 * [registry] は `--registry` / 定義の隣の一覧 / 申告（`--from-app`）のどれでもよい。
 * [fromApp] が true のときだけ、**申告に出ていない種類**を「1つも登録していない」と
 * 読む（申告は空の種類を書かないので）。
 */
export function wiringGaps(
  documents: Dict[],
  registry: DefinitionRegistry,
  options: { fromApp?: boolean } = {},
): GapsReport {
  const fromApp = options.fromApp === true;
  const refs = documents.flatMap((one) => collectRefs(one));
  // 申告なら、申告できる種類は「出ていない＝空」と読める。
  const known: DefinitionRegistry = fromApp
    ? Object.fromEntries(
        RUNTIME_KINDS.map((kind) => [kind, registry[kind] ?? []]),
      )
    : {};
  const effective: DefinitionRegistry = { ...known, ...registry };

  const groups: GapGroup[] = [];
  const notChecked: GapSkip[] = [];
  for (const kind of Object.values(RefKinds)) {
    const mine = refs.filter((ref) => ref.kind === kind);
    if (mine.length === 0) continue;
    const words = REF_KINDS[kind];
    if (effective[kind] === undefined) {
      // 判断できない種類。**要求が在るときだけ**言う（在りもしない心配をさせない）。
      if (mine.every((ref) => ref.builtIn)) continue;
      notChecked.push({ kind, what: words.what, why: skipReason(kind, fromApp) });
      continue;
    }
    const rows = mine
      .filter((ref) => isRegistered(effective, kind, ref.name) === false)
      .map(rowOf);
    if (rows.length === 0) continue;
    groups.push({
      kind,
      what: words.what,
      rule: words.rule,
      happens: WARNING_RULES[words.rule].happens,
      names: [...new Set(rows.map((row) => row.name))].sort(),
      rows,
    });
  }

  const spots = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const names = groups.reduce((sum, group) => sum + group.names.length, 0);
  return {
    groups,
    spots,
    names,
    byPage: byPage(groups),
    notChecked,
    fromApp,
    scanned: documents.length,
  };
}

const rowOf = (ref: DefinitionRef): GapRow => ({
  kind: ref.kind,
  name: ref.name,
  ...(ref.page === undefined ? {} : { page: ref.page }),
  ...(ref.spot === undefined ? {} : { spot: ref.spot }),
  path: ref.path,
});

/** その種類を見なかった理由（言い方は1か所）。 */
function skipReason(kind: RefKind, fromApp: boolean): string {
  if (fromApp) {
    return (
      "動いているアプリは、この種類を申告できません" +
      "（画面の外で決まるもの）。`--registry` に書いた一覧なら見ます。"
    );
  }
  return (
    `渡された一覧に ${kind} のキーがありません＝**登録していないのか、一覧に` +
    "書き忘れたのかが区別できません**。動いているアプリの申告" +
    "（hatake registry --from-app）なら、そこまで言えます。"
  );
}

/** 画面ごとの残り（多い順）。 */
function byPage(groups: GapGroup[]): { page: string; spots: number }[] {
  const count = new Map<string, number>();
  for (const group of groups) {
    for (const row of group.rows) {
      const page = row.page ?? OUTSIDE_PAGE;
      count.set(page, (count.get(page) ?? 0) + 1);
    }
  }
  return [...count.entries()]
    .map(([page, spots]) => ({ page, spots }))
    .sort((a, b) => b.spots - a.spots || a.page.localeCompare(b.page));
}

/** 人が読む形。 */
export function gapsLines(report: GapsReport): string[] {
  const out: string[] = [];
  const paper = report.fromApp
    ? "動いているアプリの申告"
    : "渡された登録済みの一覧";
  if (report.spots === 0) {
    out.push(
      `繋がっていない所はありませんでした（定義 ${report.scanned} 枚を、${paper}と` +
        "突き合わせ）。",
    );
  } else {
    out.push(
      `繋がっていない所が ${report.spots} か所（足りない登録は ${report.names} 件）。` +
        `定義 ${report.scanned} 枚を、${paper}と突き合わせました。`,
    );
  }
  for (const group of report.groups) {
    out.push("");
    out.push(`${group.what}が ${group.names.length} 件 [${group.rule}]`);
    out.push(`  こうなる: ${group.happens}`);
    for (const row of group.rows) {
      const where = [row.page ?? OUTSIDE_PAGE, row.spot].filter(
        (one) => one !== undefined,
      );
      out.push(`  ${where.join(" / ")} … ${row.name}`);
      out.push(`    ${row.path}`);
    }
  }
  if (report.byPage.length > 1) {
    out.push("");
    out.push("画面ごとの残り:");
    for (const one of report.byPage) {
      out.push(`  ${one.page}: ${one.spots} か所`);
    }
  }
  if (report.notChecked.length > 0) {
    out.push("");
    out.push("見なかった種類:");
    for (const one of report.notChecked) {
      out.push(`  ${one.what}（${one.kind}）… ${one.why}`);
    }
  }
  if (report.spots > 0) {
    out.push("");
    out.push(
      "足す所の下書きは hatake wire --merge <既にある配線.dart> --todo で出せます" +
        "（中身は業務か環境なので機械には決められません）。",
    );
  }
  out.push("");
  out.push(GAPS_NOTE);
  return out;
}

/** この紙に言えないことを毎回書く。 */
export const GAPS_NOTE =
  "※ 見たのは**名前が登録されているか**までです。登録の中身が業務として正しいか・" +
  "TODO のまま残っているかは見ていません（そこは hatake refs --filled --source の担当）。" +
  "**出ていない種類について「登録していない」とは言いません**" +
  "（手で書いた一覧では書き忘れと区別できないので「見なかった種類」に並べます）。" +
  "申告の印（$source）が本当かも見ていません（書けば名乗れます）。";
