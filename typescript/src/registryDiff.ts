// 画面（アプリ）とサーバが**足したもの**を突き合わせる。
//
// DSL の約束は「同じ定義なら同じ答え」。組み込みの検証・計算が3版で同じ答えを出すことは
// 収束テスト（`spec/conformance/`）で縛ってあるが、**利用者が足したもの**についてはその
// 約束を確かめる道が無かった。片側にしか無ければ答えは違う:
//
//   ・画面には `consumptionTax` の計算が在るがサーバに無い → 送った合計をサーバが作り直せない
//   ・サーバには `creditLimit` の検証が在るが画面に無い   → 画面では通るのに保存で弾かれる
//
// 突き合わせるのは**答えを決める種類だけ**（[ANSWER_KINDS]）。Repository も
// プラグイン（押したときの処理）も項目の型も、片側にしか無くて当然なので言わない
// ＝当然のものを食い違いとして並べると、報告そのものが読まれなくなる。
//
// 読む一覧は `registrySnapshot`（Dart）/ `RegistrySnapshot`（Java）が書いたもの。
// どちらも「**アプリが足したもの全部**」を出すので、種類が無いのは「足していない」と
// 読む。手で書いた一覧を渡すと、この道具は嘘をつく。

import { RefKinds, type RefKind } from "./refs.js";

/**
 * **答えを決める**種類。ここが片側にしか無ければ、同じ定義でも答えが変わる。
 *
 * 見せ方（`formatters`）を入れていないのは、桁区切りが違っても**保存される値**は
 * 変わらないから（紙とブラウザで違うのは普通のこと）。
 */
export const ANSWER_KINDS: RefKind[] = [
  RefKinds.validators,
  RefKinds.converters,
  RefKinds.computedOps,
  RefKinds.aggregates,
];

/**
 * 片側にしか無くて当然な種類の、その理由。
 *
 * **[ANSWER_KINDS] に無い種類は、ここに理由が要る**（`registryDiff.test.ts` が見る）。
 * 黙って見ないことにすると、種類が増えたときに「見ていない」ことに誰も気づかない。
 */
export const SKIP_REASONS: Partial<Record<RefKind, string>> = {
  repositories: "データの出どころは画面とサーバで別物（サーバは DB を持つ）",
  plugins: "押したときの処理は画面の側にしかない",
  sinks: "書き出す口は画面の側にしかない",
  formatters: "見せ方が違っても、保存される値は変わらない",
  fieldTypes: "項目の見た目は画面の側にしかない",
  columnTypes: "列の見た目は画面の側にしかない",
  actionTypes: "ボタンの種別は画面の側にしかない",
  dashboardItemTypes: "カードの見た目は画面の側にしかない",
  chartKinds: "図の種別は画面の側にしかない",
  pages: "画面の一覧は定義が持っている（登録ではない）",
  roles: "役割は認証の側から来る（アプリが配る語彙とサーバの権限は別勘定）",
};

/** 片側にしか無い登録1件。 */
export interface RegistryGap {
  kind: RefKind;
  name: string;
  /** どちらに無いか。 */
  missingFrom: "app" | "server";
}

/** 見なかった種類（片側にしか無くて当然のもの）。 */
export interface SkippedKind {
  kind: string;
  why: string;
}

export interface RegistryComparison {
  gaps: RegistryGap[];
  skipped: SkippedKind[];
  /** 突き合わせるものが無かった（どちらも独自の登録を申告していない）。 */
  nothingToCompare: boolean;
}

/** 一覧（`hatake-registry.json` と同じ形）。`$comment` は読まない。 */
export type RegistryDocument = Record<string, unknown>;

function namesOf(document: RegistryDocument, kind: string): string[] {
  const value = document[kind];
  if (!Array.isArray(value)) return [];
  return value.filter((one): one is string => typeof one === "string");
}

/**
 * 2つの一覧を突き合わせる。答えを決める種類だけを見て、片側にしか無い名前を返す。
 *
 * 並びは**種類 → 名前**の順に固定（毎晩回して差分を読むので、順番が揺れると読めない）。
 */
export function compareRegistries(
  app: RegistryDocument,
  server: RegistryDocument,
): RegistryComparison {
  const gaps: RegistryGap[] = [];
  let compared = 0;
  for (const kind of [...ANSWER_KINDS].sort()) {
    const inApp = new Set(namesOf(app, kind));
    const inServer = new Set(namesOf(server, kind));
    compared += inApp.size + inServer.size;
    for (const name of [...inApp].sort()) {
      if (!inServer.has(name)) gaps.push({ kind, name, missingFrom: "server" });
    }
    for (const name of [...inServer].sort()) {
      if (!inApp.has(name)) gaps.push({ kind, name, missingFrom: "app" });
    }
  }

  // 「見なかった」に並べるのは、**どちらかの一覧に実際に出ている**種類だけ
  // （出ていない種類まで並べると、毎回同じ11行を読まされる）。
  const skipped: SkippedKind[] = [];
  for (const kind of Object.keys(SKIP_REASONS).sort()) {
    const seen =
      namesOf(app, kind).length > 0 || namesOf(server, kind).length > 0;
    if (seen) skipped.push({ kind, why: SKIP_REASONS[kind as RefKind] ?? "" });
  }

  return { gaps, skipped, nothingToCompare: compared === 0 };
}

/** 人が読む形（`--json` でないとき）。 */
export function comparisonLines(result: RegistryComparison): string[] {
  const lines: string[] = [];
  if (result.nothingToCompare) {
    lines.push(
      "どちらの一覧にも独自の登録がありません（突き合わせるものがありません）。",
    );
    return lines;
  }
  if (result.gaps.length === 0) {
    lines.push("答えを決める登録は、画面とサーバで同じです。");
  } else {
    lines.push(`片側にしか無い登録が ${result.gaps.length} 件あります:`);
    for (const gap of result.gaps) {
      const where = gap.missingFrom === "server" ? "サーバに無い" : "画面に無い";
      lines.push(`  ・${gap.kind} の ${gap.name} … ${where}`);
    }
    lines.push(
      "同じ定義でも答えが変わります（画面では通るのに保存で弾かれる、その逆も）。",
    );
  }
  if (result.skipped.length > 0) {
    lines.push("");
    lines.push("見なかった種類（片側にしか無くて当然のもの）:");
    for (const one of result.skipped) {
      lines.push(`  ・${one.kind} … ${one.why}`);
    }
  }
  return lines;
}
