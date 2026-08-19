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
// 権限も重ねる。**ページに `roles` は無い**（書けるのはメニュー項目とボタン）ので、「この画面は
// 誰に見えるか」は入口から辿るしかない＝[appAccess] が数える。1枚ずつ読んでも出ないのが
// **誰も開けない画面**（入口の権限が食い違っている）と**誰でも開けて消す/持ち出すができる画面**
// なので、そこは色を変える。`role` を渡すと**その役割で通れる道**だけの図になる。
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
import {
  type AppAccess,
  appAccess,
  type Audience,
  canOpen,
  describeAudience,
} from "./appAccess.js";
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

/** 遷移1つ（どのボタンで、どこへ、誰が押せるか）。 */
interface Move {
  from: string;
  to: string;
  label: string;
  /** そのボタンを押せる役割（空＝誰でも）。 */
  roles: string[];
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
      moves.push({
        from,
        to,
        label: str(action.label) ?? str(action.id) ?? "遷移",
        roles: list(action.roles).filter((one): one is string => typeof one === "string"),
      });
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
  lines?: string[],
): DiagramBox => ({
  id: page.id,
  label: clip(page.title, roomForBoxes(PER_ROW), 15),
  note: page.id,
  tone,
  ...(lines === undefined ? {} : { lines }),
});

/** 箱の中に入れる「誰が開けるか」の1行と、箱の色。 */
function accessOf(
  id: string,
  access: AppAccess,
  role: string | undefined,
  fallback: DiagramBox["tone"],
): { line: string; tone: DiagramBox["tone"] } {
  const audience: Audience = access.audience.get(id) ?? { everyone: true, roles: [] };
  const danger = access.openDanger.get(id) ?? [];
  // 印（`・` `○` `×`）は描く側が付けるので、ここで数えるのは**本文だけ**。印と空白のぶん
  // （全角1つ＋半角1つ）を引いておく。役割名の長さは案件が決めるので、機械が作る図で
  // 溢れて落ちるのは道具側の責任。
  const room = roomForBoxes(PER_ROW) - 24;
  const short = (text: string): string => clip(text, room, 13);

  if (role !== undefined) {
    // 役割を1つ選んだときは「その役割で通れるか」だけを言う（他の役割の話は邪魔になる）。
    return canOpen(audience, role)
      ? { line: `+ ${short(`${role} で開ける`)}`, tone: fallback }
      : { line: `! ${short(`${role} では開けない`)}`, tone: "outside" };
  }
  if (!audience.everyone && audience.roles.length === 0) {
    // 1枚ずつ読んでも出ない所。入口の権限が食い違っていると、定義は通るのに誰も開けない。
    return { line: "! 誰も開けない", tone: "outside" };
  }
  if (audience.everyone && danger.length > 0) {
    return {
      line: `! ${short(`誰でも開ける（${danger.join(" / ")}）`)}`,
      tone: "warn",
    };
  }
  return { line: short(describeAudience(audience)), tone: fallback };
}

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

/** 図の作り方の指定。 */
export interface AppDiagramOptions {
  /**
   * 役割を1つ渡すと「**その役割で通れる道**」の図になる（開けない画面は点線、通れない扉は
   * 薄い線）。渡さないときは、画面ごとに「誰が開けるか」を重ねる。
   */
  role?: string;
}

/**
 * `app:` の図を作る。
 *
 * [app] は解析済みのアプリ（画面名と種別のため）、[raw] は素の document（遷移とボタンの
 * `roles` のため）。
 */
export function appDiagram(
  app: AppDefinition,
  raw: Dict,
  options: AppDiagramOptions = {},
): Diagram {
  const pages = new Map(app.pages.map((page) => [page.id, page]));
  // 行き先の無い遷移は警告の担当（図では触らない）。
  const moves = movesOf(raw).filter(
    (move) => pages.has(move.from) && pages.has(move.to),
  );
  const fromMenu = menuTargets(app.menu).filter((id) => pages.has(id));
  const access = appAccess(raw);
  const role = options.role;
  if (role !== undefined && !access.roles.includes(role)) {
    // 綴り違いを黙って通すと「全部開ける」に見える＝一番まずい読み違えになる。
    throw new Error(
      `役割 "${role}" はこの定義に出てきません` +
        `（出てくるのは ${access.roles.length === 0 ? "無し" : access.roles.join(" / ")}）。`,
    );
  }

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
      ordered.map((id) => {
        const shown = accessOf(id, access, role, depth === 0 ? "input" : "core");
        return box(pages.get(id)!, shown.tone, [shown.line]);
      }),
    );

    if (depth > 0) {
      const firstRow = levelRows[0].items.map((one) => one.id!);
      const links: DiagramLink[] = [];
      for (const move of moves) {
        if (!lastRow.includes(move.from) || !firstRow.includes(move.to)) continue;
        if (drawn.has(move)) continue;
        drawn.add(move);
        // 権限で絞ってあるボタンは札にもそう書く（扉の鍵は線の上に見えていないと分からない）。
        const locked = role !== undefined && move.roles.length > 0 && !move.roles.includes(role);
        links.push({
          from: move.from,
          to: move.to,
          label: clip(
            `${move.label}${move.roles.length === 0 ? "" : `（${move.roles.join(" / ")}）`}`,
            380,
            13,
          ),
          ...(locked ? { back: true } : {}),
        });
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
    rows.push(
      ...boxRows(
        orphans.map((page) => {
          const shown = accessOf(page.id, access, role, "outside");
          return box(page, "outside", [shown.line]);
        }),
      ),
    );
  }
  rows.push({
    kind: "note",
    text:
      orphans.length === 0
        ? "すべての画面がメニューか遷移からたどれる。"
        : `上の ${orphans.length} 枚は、メニューに足すか遷移で繋がないと開けない。`,
  });
  // 色の意味は、その色を使った図にだけ書く（使っていない凡例は読む邪魔になる）。
  for (const line of legend(app, access, role)) {
    rows.push({ kind: "note", text: line });
  }

  return {
    title: `${app.title}（${app.id}）の画面と遷移`,
    subtitle:
      role === undefined
        ? "段は「メニューから開ける画面 → そこから遷移で開く画面」。線は遷移の向き（札はボタン名）。箱の中は誰が開けるか。"
        : `段は「メニューから開ける画面 → そこから遷移で開く画面」。**${role} で通れる道**だけを見た図。`,
    rows,
  };
}

/**
 * 凡例（色の意味）。
 *
 * 権限は図の中で**色**にしているので、色の意味を書かないと読めない。ただし使っていない色の
 * 説明を並べると、それだけで数行取る＝出すのは**その図に本当に出ている色**だけ。
 */
function legend(
  app: AppDefinition,
  access: AppAccess,
  role: string | undefined,
): string[] {
  const ids = app.pages.map((page) => page.id);
  const lines: string[] = [];
  if (role !== undefined) {
    const shut = ids.filter((id) => {
      const audience = access.audience.get(id);
      return audience !== undefined && !canOpen(audience, role);
    });
    lines.push(
      shut.length === 0
        ? `**${role}** はすべての画面を開ける。`
        : `点線＝**${role} では開けない画面**（${shut.length} 枚）。薄い線＝その役割では通れない扉。`,
    );
    return lines;
  }
  const nobody = ids.filter((id) => {
    const audience = access.audience.get(id);
    return audience !== undefined && !audience.everyone && audience.roles.length === 0;
  });
  const dangerous = ids.filter((id) => {
    const audience = access.audience.get(id);
    return (
      audience?.everyone === true && (access.openDanger.get(id) ?? []).length > 0
    );
  });
  if (dangerous.length > 0) {
    lines.push(
      `赤枠＝**誰でも開けて、消す・持ち出すができる画面**（${dangerous.length} 枚）。` +
        "ボタンの `roles` か、入口の `roles` を決める。",
    );
  }
  if (nobody.length > 0) {
    lines.push(
      `点線＝**誰も開けない画面**（${nobody.length} 枚）。入口の権限が食い違っている` +
        "（画面を見ても気づけない類）。",
    );
  }
  if (access.roles.length > 0) {
    for (const line of packNote("出てくる役割: ", access.roles)) lines.push(line);
    lines.push("`--role <役割>` を付けると、その役割で通れる道だけの図になる。");
  }
  return lines;
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
