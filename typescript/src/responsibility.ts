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

/** 指示文の1行と、当たった担当。 */
export interface SortedLine {
  /** 指示文の行（印を落としたもの）。 */
  text: string;
  /** 当たった担当（外から内の順）。 */
  areas: Area[];
}

export interface SortedInstruction {
  lines: SortedLine[];
  /** 当てられなかった行（**黙って落とさない**ので、必ず持って返す）。 */
  unmatched: string[];
  /** 枠組みの外が当たった行の数。 */
  outside: number;
}

/** 行の頭の印（箇条書き・番号・見出し）と、前後の空白を落とす。 */
const plainLine = (line: string): string =>
  line
    .replace(/^\s*(?:[-*+\u30fb]|#{1,6}|\d+[.)])\s*/, "")
    .replace(/^\s*\[[ x]\]\s*/i, "")
    .trim();

/**
 * 指示文を**行ごとに**仕分ける（`where --from`）。
 *
 * 1問1答だと、長い依頼文では引き忘れる（そして書ける方に倒す）。「この依頼のうち3件は
 * 枠組みの外です」と**先に**言えるのが値打ち。
 *
 * 当て方は[filterAreas]と同じ**言葉の一致だけ**＝これは下書きで、決めるのは人。だから
 * 当てられなかった行は捨てずに [unmatched] に入れる（黙って落とすと、仕分けたつもりで
 * 抜ける）。囲み（```）の中は見ない＝定義の断片が入っていると語がいくらでも当たる。
 */
export function sortInstruction(
  catalog: ResponsibilityCatalog,
  source: string,
): SortedInstruction {
  const lines: SortedLine[] = [];
  const unmatched: string[] = [];
  let inFence = false;

  for (const raw of source.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const text = plainLine(raw);
    // 1文字の行（区切りや記号だけ）は問いにならない。
    if (text.length < 2) continue;
    const areas = filterAreas(catalog, text);
    if (areas.length === 0) {
      unmatched.push(text);
      continue;
    }
    lines.push({ text, areas });
  }
  return {
    lines,
    unmatched,
    outside: lines.filter((one) => one.areas[0]?.where === "outside").length,
  };
}

/**
 * 人が読む形。**枠組みの外を先に言う**（あとに回すと読まれない）。
 *
 * [limit] は1行あたりに出す担当の数。全部出すと壁になるので、残りは数で言う
 * （黙って切らない）。
 */
export function sortedLines(
  sorted: SortedInstruction,
  limit = 2,
): string[] {
  const out: string[] = [];
  out.push(
    `仕分けた行は ${sorted.lines.length} 件` +
      `${sorted.outside === 0 ? "" : `。**うち ${sorted.outside} 件は枠組みの外**`}` +
      `${sorted.unmatched.length === 0 ? "" : `（当てられなかった行が ${sorted.unmatched.length} 件）`}。`,
  );
  const order = [...sorted.lines].sort(
    (a, b) =>
      (a.areas[0]?.where === "outside" ? 0 : 1) -
      (b.areas[0]?.where === "outside" ? 0 : 1),
  );
  for (const line of order) {
    out.push("");
    out.push(`・${line.text}`);
    for (const area of line.areas.slice(0, limit)) {
      out.push(`    [${WHERE_WORDS[area.where]}] ${area.title}`);
      if (area.where === "outside" || area.where === "server") {
        out.push(`      ${area.how}`);
      } else if (area.keys.length > 0) {
        out.push(`      書くキー: ${area.keys.join(" / ")}`);
      }
    }
    if (line.areas.length > limit) {
      out.push(`    （ほかに ${line.areas.length - limit} 件当たっています）`);
    }
  }
  if (sorted.unmatched.length > 0) {
    out.push("");
    out.push("当てられなかった行（**表に無いだけかもしれない**ので、人が見ること）:");
    for (const one of sorted.unmatched) out.push(`  ・${one}`);
  }
  out.push("");
  out.push(SORT_NOTE);
  out.push(RESPONSIBILITY_NOTE);
  return out;
}

/** 仕分けは下書きだと毎回言う（当て方は言葉の一致だけなので）。 */
export const SORT_NOTE =
  "※ 仕分けは**下書き**です（当てているのは言葉の一致だけ）。決めるのは人で、" +
  "外と出た行は**その場で書き始めずに**依頼した人に返してください。";

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
