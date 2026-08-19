// `app:` の定義から「画面とメニューと遷移」の図を作る。
//
// 画面が増えると遷移が追えなくなる。`explain` は1枚ずつ言葉にするが、**どこから開けるか**は
// 全体を見ないと分からない。そこだけ図にする。
//
// 並べ方は**段**（メニューから開ける画面が1段目、そこから `navigate` で開く画面が2段目…）。
// 段に分けると**どこからも開けない画面**が自然に落ちてくる＝図にする一番の値打ちはそこ。
//
// 段のあいだは**1本ずつ線を引く**（どの画面からどの画面へ）。まとめて1本の矢印にすると
// 「AとBのどちらから開くのか」が読めない。線を引けるのは隣り合う行のあいだだけなので、
// 段の中の並びは**次の段へ進む画面を後ろに**置く。それでも引けない遷移（同じ段の中・戻り・
// 行が離れている）は**文で全部挙げる**＝図に出ていない遷移を黙って落とさない（線が無い＝
// 遷移が無い、と読まれるのが一番まずい）。
//
// 1枚の画面の中身は図にしない（`explain` のほうが読める）。図は「画面が増えたときの遷移」の
// ためのもの。

import {
  type Diagram,
  type DiagramBox,
  type DiagramLink,
  type DiagramRow,
  em,
  packNote,
  roomForBoxes,
} from "./diagram.js";
import { type AppDefinition, menuIsGroup, type MenuItem } from "./definition.js";
import { SHORT_KINDS } from "./explainBrief.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 1行に並べる箱の数。3つなら画面名（全角16文字ぶん）が入る。 */
const PER_ROW = 3;

/** 遷移1つ（どのボタンで、どこへ）。 */
interface Move {
  from: string;
  to: string;
  label: string;
}

/**
 * 素の `app:` から遷移を拾う。
 *
 * 解析後のモデルは `action.page` を持たない（TypeScript 版はバックエンド用なので）ので、
 * ここは素の定義を見る。[explainPage] が遷移先を素から補っているのと同じ理由。
 */
function movesOf(raw: Dict): Move[] {
  const moves: Move[] = [];
  const app = isDict(raw.app) ? raw.app : {};
  for (const page of list(app.pages).filter(isDict)) {
    const from = str(page.id);
    if (from === undefined) continue;
    for (const action of list(page.actions).filter(isDict)) {
      const to = str(action.page);
      if (str(action.type) !== "navigate" || to === undefined) continue;
      moves.push({ from, to, label: str(action.label) ?? str(action.id) ?? "遷移" });
    }
  }
  return moves;
}

/** メニューから開けるページ id（道の順）。 */
function menuTargets(items: MenuItem[]): string[] {
  const found: string[] = [];
  const walk = (nodes: MenuItem[]): void => {
    for (const node of nodes) {
      if (menuIsGroup(node)) walk(node.children);
      else if (node.page !== undefined) found.push(node.page);
    }
  };
  walk(items);
  return [...new Set(found)];
}

/** 全角16文字ぶんに収める（入らない画面名は落として `…` を付ける）。 */
function clip(text: string, room: number, size: number): string {
  if (em(text) * size <= room) return text;
  let out = "";
  for (const character of text) {
    if (em(`${out}${character}…`) * size > room) break;
    out += character;
  }
  return `${out}…`;
}

const box = (
  page: { id: string; title: string; type: string },
  tone: DiagramBox["tone"],
): DiagramBox => ({
  id: page.id,
  label: clip(page.title, roomForBoxes(PER_ROW), 15),
  note: page.id,
  tone,
});

/** 箱を3つずつの行に割る（多い段は複数行になる。幅は行によらず同じ）。 */
function boxRows(boxes: DiagramBox[]): { kind: "boxes"; items: DiagramBox[]; slots: number }[] {
  const rows: { kind: "boxes"; items: DiagramBox[]; slots: number }[] = [];
  for (let at = 0; at < boxes.length; at += PER_ROW) {
    rows.push({ kind: "boxes", items: boxes.slice(at, at + PER_ROW), slots: PER_ROW });
  }
  return rows;
}

/**
 * 段の中の並び。
 *
 * 線を引けるのは隣り合う行のあいだだけなので、**次の段へ進む画面を後ろへ**（後ろ＝下の段に
 * 近い行）、**前の段の最後の行から来た画面を前へ**置く。段が1行に収まるなら何も変わらない。
 */
function order(level: string[], sources: Set<string>, reached: Set<string>): string[] {
  return [...level].sort((a, b) => {
    const source = Number(sources.has(a)) - Number(sources.has(b));
    if (source !== 0) return source;
    return Number(reached.has(b)) - Number(reached.has(a));
  });
}

/**
 * `app:` の図を作る。
 *
 * [app] は解析済みのアプリ（画面名と種別のため）、[raw] は素の document（遷移のため）。
 */
export function appDiagram(app: AppDefinition, raw: Dict): Diagram {
  const pages = new Map(app.pages.map((page) => [page.id, page]));
  // 行き先の無い遷移は警告の担当（図では触らない）。
  const moves = movesOf(raw).filter(
    (move) => pages.has(move.from) && pages.has(move.to),
  );
  const fromMenu = menuTargets(app.menu).filter((id) => pages.has(id));

  // 段に分ける。メニューから開ける画面が1段目、そこから遷移で開く画面が2段目…。
  const levels: string[][] = [];
  const seen = new Set<string>();
  let current = fromMenu.length > 0 ? fromMenu : [...pages.keys()].slice(0, 1);
  while (current.length > 0) {
    levels.push(current);
    for (const id of current) seen.add(id);
    const next: string[] = [];
    for (const move of moves) {
      if (!current.includes(move.from)) continue;
      if (seen.has(move.to) || next.includes(move.to)) continue;
      next.push(move.to);
    }
    current = next;
  }

  const rows: DiagramRow[] = [];
  rows.push({
    kind: "note",
    text: `メニューから開ける画面 ${fromMenu.length} 枚 / 全部で ${app.pages.length} 枚`,
  });
  // 種別の内訳。画面が増えると1行に入らないので、入る幅で行に割る。
  for (const line of packNote("内訳: ", kindCounts(app))) {
    rows.push({ kind: "note", text: line });
  }

  // 段を行に割りながら、隣り合う行のあいだに線を引く。
  const drawn = new Set<Move>();
  let lastRow: string[] = [];
  levels.forEach((level, depth) => {
    const next = levels[depth + 1] ?? [];
    const sources = new Set(
      moves
        .filter((move) => level.includes(move.from) && next.includes(move.to))
        .map((move) => move.from),
    );
    const reached = new Set(
      moves.filter((move) => lastRow.includes(move.from)).map((move) => move.to),
    );
    const ordered = order(level, sources, reached);
    const levelRows = boxRows(
      ordered.map((id) => box(pages.get(id)!, depth === 0 ? "input" : "core")),
    );

    if (depth > 0) {
      const firstRow = levelRows[0].items.map((one) => one.id!);
      const links: DiagramLink[] = [];
      for (const move of moves) {
        if (!lastRow.includes(move.from) || !firstRow.includes(move.to)) continue;
        if (drawn.has(move)) continue;
        drawn.add(move);
        links.push({ from: move.from, to: move.to, label: move.label });
      }
      // 引ける線が1本も無いなら帯は置かない（空の帯は「遷移が無い」に見える）。
      if (links.length > 0) rows.push({ kind: "links", items: links });
    }
    rows.push(...levelRows);
    lastRow = levelRows[levelRows.length - 1].items.map((one) => one.id!);
  });

  // 線にできなかった遷移。図から消すと「遷移が無い」と読まれるので、文で全部挙げる。
  const missed = moves.filter((move) => !drawn.has(move));
  if (missed.length > 0) {
    rows.push({
      kind: "note",
      text: "線にできなかった遷移（同じ段の中・戻り・行が離れているもの）:",
    });
    const label = (move: Move): string =>
      `${title(pages, move.from)} → ${title(pages, move.to)}（${move.label}）`;
    for (const line of packNote("  ", missed.map(label))) {
      rows.push({ kind: "note", text: line });
    }
  }

  // どこからも開けない画面。図にする一番の値打ちはここ（一覧では気づけない）。
  const orphans = app.pages.filter((page) => !seen.has(page.id));
  if (orphans.length > 0) {
    rows.push({
      kind: "note",
      text: "どこからも開けない画面（メニューにも遷移先にも無い）:",
    });
    rows.push(...boxRows(orphans.map((page) => box(page, "outside"))));
  }
  rows.push({
    kind: "note",
    text:
      orphans.length === 0
        ? "すべての画面がメニューか遷移からたどれる。"
        : `上の ${orphans.length} 枚は、メニューに足すか遷移で繋がないと開けない。`,
  });

  return {
    title: `${app.title}（${app.id}）の画面と遷移`,
    subtitle:
      "段は「メニューから開ける画面 → そこから遷移で開く画面」。線は遷移の向き（札はボタン名）。",
    rows,
  };
}

/** 画面名（無ければ id）。線にできなかった遷移を文で言うときに使う。 */
const title = (
  pages: Map<string, { title: string }>,
  id: string,
): string => pages.get(id)?.title ?? id;

/**
 * 種別の内訳（「マスタ保守: 2」の並び）。
 *
 * 使うのは**短い見出し語**（要約と同じ語彙）。説明の長い言い方（「マスタをメンテナンスする
 * 画面（検索・一覧・登録・修正・削除）」）は図に入らない。
 */
function kindCounts(app: AppDefinition): string[] {
  const counts = new Map<string, number>();
  for (const page of app.pages) {
    counts.set(page.type, (counts.get(page.type) ?? 0) + 1);
  }
  return [...counts].map(
    ([kind, count]) => `${SHORT_KINDS[kind] ?? kind}: ${count}`,
  );
}
