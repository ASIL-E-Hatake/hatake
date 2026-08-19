// `app:` の定義から「画面とメニューと遷移」の図を作る。
//
// 画面が増えると遷移が追えなくなる。`explain` は1枚ずつ言葉にするが、**どこから開けるか**は
// 全体を見ないと分からない。そこだけ図にする。
//
// 並べ方は**段**（メニューから開ける画面が1段目、そこから `navigate` で開く画面が2段目…）。
// 縦積みしか描けない作図器で遷移を表すのに、これが素直な形になる。段に分けると
// **どこからも開けない画面**が自然に落ちてくる＝図にする一番の値打ちはそこ。
//
// 1枚の画面の中身は図にしない（`explain` のほうが読める）。図は「画面が増えたときの遷移」の
// ためのもの。

import {
  type Diagram,
  type DiagramBox,
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
  label: clip(page.title, roomForBoxes(PER_ROW), 15),
  note: page.id,
  tone,
});

/** 箱を3つずつの行に割る（多い段は複数行になる）。 */
function boxRows(boxes: DiagramBox[]): DiagramRow[] {
  const rows: DiagramRow[] = [];
  for (let at = 0; at < boxes.length; at += PER_ROW) {
    rows.push({ kind: "boxes", items: boxes.slice(at, at + PER_ROW) });
  }
  return rows;
}

/**
 * `app:` の図を作る。
 *
 * [app] は解析済みのアプリ（画面名と種別のため）、[raw] は素の document（遷移のため）。
 */
export function appDiagram(app: AppDefinition, raw: Dict): Diagram {
  const pages = new Map(app.pages.map((page) => [page.id, page]));
  const moves = movesOf(raw);
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
      if (!pages.has(move.to)) continue; // 行き先が無いのは警告の担当
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
  levels.forEach((level, depth) => {
    if (depth > 0) {
      // その段へ入る遷移のボタン名を札にする（同じ名前は1つに）。
      const labels = [
        ...new Set(
          moves
            .filter(
              (move) => level.includes(move.to) && levels[depth - 1].includes(move.from),
            )
            .map((move) => move.label),
        ),
      ];
      rows.push({
        kind: "arrow",
        label: clip(`遷移（${labels.join(" / ")}）`, 380, 13),
      });
    }
    rows.push(
      ...boxRows(
        level.map((id) => box(pages.get(id)!, depth === 0 ? "input" : "core")),
      ),
    );
  });

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
    subtitle: "段は「メニューから開ける画面 → そこから遷移で開く画面」。",
    rows,
  };
}

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
