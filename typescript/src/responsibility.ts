// 担当の割り振り（`spec/responsibility.json`）。
//
// 枠組みが**持たないもの**は決めてある（業務ロジック・ワークフロー・DB・ORM・認証・
// 認可・バックエンド API）。けれどその一覧は散文にしか無かったので、機械が引けなかった。
// 引けないと何が起きるかというと、「締め処理も作って」と頼まれた AI が**枠組みの外だと
// 言えないまま Dart や TS を書き始める**。定義を書かせるための枠組みなのに、いちばん
// 大事な所で外れる。
//
// だから「これはどこの担当か」を4つの区分で引ける表にした。
//
//   definition … 定義で書ける（書き方を引く先まで返す）
//   plugin     … アプリ側に登録して足す（口は枠組みが持っている）
//   server     … サーバの担当（形は定義から出せる）
//   outside    … **枠組みの外**（人が決める・別のシステム。コードを書き始めない）
//
// 決めごと:
//
// * **判断表であって実装ではない。** ここにワークフローの定義や業務規則を書けるように
//   したら、それは枠組みが業務を持つことになる（CLAUDE.md の Scope を破る）
// * **散文と食い違えないようにする。** `notProvided` は CLAUDE.md の Scope の写しで、
//   そこに書いてある字が CLAUDE.md から消えたら試験が落ちる
// * **`outside` にはキーを書かせない。** 定義で書けるなら外ではないので、キーが1つでも
//   あれば区分が間違っている

import type { Lang } from "./explainPhrases.js";

/** 担当の区分。**閉じた集合**（増やすと「どちらとも言える」が生える）。 */
export const WHERE_KINDS = ["definition", "plugin", "server", "outside"] as const;

export type Where = (typeof WHERE_KINDS)[number];

/** 区分を人の言葉で（報告と MCP の答えで同じ字を使う）。 */
export const WHERE_WORDS: Record<Where, string> = {
  definition: "定義で書ける",
  plugin: "アプリ側に登録して足す",
  server: "サーバの担当",
  outside: "枠組みの外（hatake は持たない）",
};

/** 担当1件。 */
export interface Area {
  id: string;
  where: Where;
  /** やりたいこと（業務の言葉で）。 */
  title: string;
  /** どうするか。`outside` なら「代わりに画面でできること」まで書く。 */
  how: string;
  /** なぜそうなのか（`outside` と、間違えやすい区分にだけ）。 */
  why?: string;
  /** 定義に書くキー（`outside` は空）。 */
  keys: string[];
  /** 次に叩く道具（1行。`hatake …` の形）。 */
  tool?: string;
  /** 探すための言葉（日本語と英語）。 */
  words: string[];
}

export interface ResponsibilityCatalog {
  /** CLAUDE.md の Scope「Framework が提供しないもの」の写し。 */
  notProvided: { id: string; claudeMd: string }[];
  areas: Area[];
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const bad = (message: string): never => {
  throw new Error(`担当の表が読めません: ${message}`);
};

/**
 * 表を読む。**黙って通さない**（表そのものが嘘をつくと、引いた側は気づけない）。
 */
export function parseResponsibility(value: unknown): ResponsibilityCatalog {
  if (!isDict(value)) bad("map として読めません。");
  const node = value as Record<string, unknown>;
  const areas = Array.isArray(node.areas) ? node.areas : bad("areas がありません。");
  const notProvided = Array.isArray(node.notProvided)
    ? node.notProvided
    : bad("notProvided がありません（CLAUDE.md の Scope の写し）。");

  const seen = new Set<string>();
  const parsed: Area[] = (areas as unknown[]).map((one, index) => {
    if (!isDict(one)) return bad(`areas[${index}] が map ではありません。`);
    const area = one as Record<string, unknown>;
    const id = typeof area.id === "string" ? area.id : bad(`areas[${index}] に id がありません。`);
    if (seen.has(id)) bad(`id "${id}" が2回出てきます。`);
    seen.add(id);
    const where = area.where;
    if (typeof where !== "string" || !WHERE_KINDS.includes(where as Where)) {
      bad(`${id}: where は ${WHERE_KINDS.join(" / ")} のどれかです。`);
    }
    const keys = Array.isArray(area.keys) ? (area.keys as string[]) : bad(`${id}: keys がありません。`);
    const words = Array.isArray(area.words) ? (area.words as string[]) : bad(`${id}: words がありません。`);
    if (words.length === 0) bad(`${id}: words が空です（引けない項目は無いのと同じ）。`);
    // 定義で書けるなら、書くキーがあるはず。外ならキーは在り得ない。
    if (where === "definition" && keys.length === 0) {
      bad(`${id}: where が definition なのに keys が空です。`);
    }
    if (where === "outside" && keys.length > 0) {
      bad(
        `${id}: where が outside なのに keys が書いてあります` +
          `（${keys.join(" / ")}）。定義で書けるなら外ではありません。`,
      );
    }
    return {
      id,
      where: where as Where,
      title: typeof area.title === "string" ? area.title : bad(`${id}: title がありません。`),
      how: typeof area.how === "string" ? area.how : bad(`${id}: how がありません。`),
      ...(typeof area.why === "string" ? { why: area.why } : {}),
      keys,
      ...(typeof area.tool === "string" ? { tool: area.tool } : {}),
      words,
    };
  });

  const outside = new Set(parsed.filter((one) => one.where === "outside").map((one) => one.id));
  const missing = (notProvided as { id?: unknown }[])
    .map((one) => (isDict(one) && typeof one.id === "string" ? one.id : ""))
    .filter((id) => !outside.has(id));
  if (missing.length > 0) {
    bad(
      `notProvided に書いてあるのに、outside の項目がありません: ${missing.join(" / ")}` +
        "（持たないと決めたものは、必ず引ける形で置く）。",
    );
  }
  return {
    notProvided: notProvided as { id: string; claudeMd: string }[],
    areas: parsed,
  };
}

/**
 * 探す。当たりは**両方向**で見る（大小は無視）。
 *
 *   ・表の側（id・題・言葉・キー・本文）に、引いた言葉が含まれている（「締め」）
 *   ・**引いた言葉の中に、表の言葉が含まれている**（「締め処理」に「締め」）
 *
 * 後者が無いと、人が実際に打つ言葉（「締め処理も作って」）で引けない＝**外だと言えない**。
 * 道具の例に「締め処理」を置いてあるのは、ここが片方向だと試験で落ちるようにするため。
 *
 * 並べ方は**外から内**（outside → server → plugin → definition）。「枠組みの外です」が
 * いちばん大事な答えなので、下に置くと読まれない。
 */
export function filterAreas(
  catalog: ResponsibilityCatalog,
  query?: string,
  where?: Where,
): Area[] {
  const wanted = query?.trim().toLowerCase();
  const order: Record<Where, number> = {
    outside: 0,
    server: 1,
    plugin: 2,
    definition: 3,
  };
  return catalog.areas
    .filter((area) => where === undefined || area.where === where)
    .filter((area) => {
      if (wanted === undefined || wanted === "") return true;
      const haystack = [
        area.id,
        area.title,
        area.how,
        area.why ?? "",
        ...area.keys,
        ...area.words,
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(wanted)) return true;
      return area.words.some((word) => wanted.includes(word.toLowerCase()));
    })
    .sort((a, b) => order[a.where] - order[b.where]);
}

/** 引いた側が読み間違えないように、毎回添える1行。 */
export const RESPONSIBILITY_NOTE =
  "※ ここは**担当の表**です（何ができるかの一覧ではありません）。" +
  "「枠組みの外」と出たものは hatake では書けません＝画面には**結果だけ**を出し、" +
  "判断はサーバか別のシステムに置いてください（勝手に Dart / TypeScript を書き始めない）。";

/** 人が読む形。 */
export function responsibilityLines(
  areas: Area[],
  options: { query?: string; lang?: Lang } = {},
): string[] {
  const out: string[] = [];
  const outside = areas.filter((one) => one.where === "outside").length;
  out.push(
    options.query === undefined || options.query === ""
      ? `担当の表は ${areas.length} 件。`
      : `"${options.query}" に当てはまるのは ${areas.length} 件` +
        `${outside === 0 ? "" : `（うち ${outside} 件は**枠組みの外**）`}。`,
  );
  for (const area of areas) {
    out.push("");
    out.push(`[${WHERE_WORDS[area.where]}] ${area.title}`);
    out.push(`  どうする: ${area.how}`);
    if (area.why !== undefined) out.push(`  なぜ: ${area.why}`);
    if (area.keys.length > 0) out.push(`  書くキー: ${area.keys.join(" / ")}`);
    if (area.tool !== undefined) out.push(`  次に見る: ${area.tool}`);
  }
  out.push("");
  out.push(RESPONSIBILITY_NOTE);
  return out;
}
