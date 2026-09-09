// 役割ごとの見え方を**1枚に並べる**。
//
// 切り替えて見せられるようになった（デモの札）が、**まとめて見比べる**には手で切り替える
// しかなかった。人事異動のたびに聞かれるのは「この役割で何ができるか」で、答えるには
// 役割を横に並べた表が一番早い。
//
// 決めごと:
//
// * **誰でもない人（未ログイン）を必ず1列入れる**。役割を持つ人だけ並べると、ログイン
//   していない人に何が見えているかを誰も見ないままになる
// * 並べるのは**役割で絞られている物だけ**。絞っていない物は全員に見えるので、並べると
//   表が定義の大きさになって読まれなくなる
// * ○×は**定義に書いてあることだけ**。実際に守れているかは別（`hatake attack`）

import {
  NOBODY,
  roleSights,
  sees,
  type RoleSight,
  type SightItem,
} from "./roleSight.js";

/** 表の1行（画面の中の1つと、役割ごとの○×）。 */
export interface MatrixRow {
  page: string;
  node: string;
  label: string;
  /** 役割ごとに見えるか（並びは [MatrixTable.roles] と同じ）。 */
  seen: boolean[];
}

export interface MatrixTable {
  /** 列の役割（最後が [NOBODY]）。 */
  roles: string[];
  /** 画面を開けるか（app のときだけ。行の `node` は `画面`）。 */
  opens: MatrixRow[];
  /** 画面の中の物（列・ボタン・項目…）。 */
  items: MatrixRow[];
}

const key = (one: SightItem): string => `${one.node} ${one.label}`;

/**
 * 役割ごとの表を作る。
 *
 * 同じ物が複数の画面に在っても**画面ごとに1行**（同じラベルの列が別の画面で別の役割に
 * 絞られていることがあるので、まとめると嘘になる）。
 */
export function roleMatrix(document: Record<string, unknown>): MatrixTable {
  const sights = roleSights(document);
  const roles = sights.map((one) => one.role);
  const first = sights[0];
  if (first === undefined) return { roles, opens: [], items: [] };

  const opens: MatrixRow[] = [];
  for (const [index, page] of first.pages.entries()) {
    // 入口が定義に無い（単票の定義）なら、開ける・開けないは言えない。
    if (page.entryUnknown) continue;
    opens.push({
      page: page.page,
      node: "画面",
      label: page.title,
      seen: sights.map((one) => one.pages[index].canOpen),
    });
  }

  const items: MatrixRow[] = [];
  const hasOpenRow = new Set(opens.map((row) => row.page));
  for (const page of first.pages) {
    const seenKeys = new Set<string>();
    for (const item of page.gated) {
      // メニューの入口は「画面」の行と同じことを言う（入口の権限＝開ける権限）。
      // 両方出すと表が伸びるだけなので、画面の行が在るときは落とす。
      if (item.node === "メニュー" && hasOpenRow.has(page.page)) continue;
      if (seenKeys.has(key(item))) continue;
      seenKeys.add(key(item));
      items.push({
        page: page.page,
        node: item.node,
        label: item.label,
        seen: roles.map((role) => sees(item, role)),
      });
    }
  }
  return { roles, opens, items };
}

/** 役割の見出し（誰でもない人は言葉で書く＝空の列見出しを作らない）。 */
export const roleHeading = (role: string): string =>
  role === NOBODY ? "誰でもない人" : role;

/**
 * 幅を数えて揃える（ずれると表として読めない）。
 *
 * 半角と数えるのは **ASCII と半角カナだけ**。`\u00d7`（×）のように ASCII の近くに
 * 居る記号も、日本語の端末では2幅で出る（曖昧幅）ので全角側に入れる。1幅で数えると
 * `\u25cb`（○）の列と1文字ずれる。
 */
function width(text: string): number {
  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const narrow =
      (code >= 0x20 && code <= 0x7e) || (code >= 0xff61 && code <= 0xff9f);
    total += narrow ? 1 : 2;
  }
  return total;
}

const pad = (text: string, to: number): string =>
  text + " ".repeat(Math.max(0, to - width(text)));

const center = (text: string, to: number): string => {
  const left = Math.max(0, Math.floor((to - width(text)) / 2));
  return " ".repeat(left) + pad(text, to - left);
};

/**
 * 人が読む形。
 *
 * 1件も無いときも**そう言う**（役割で絞っている所が無い定義は、表が空になる）。
 */
export function renderMatrix(table: MatrixTable, title: string): string {
  const heads = table.roles.map(roleHeading);
  const rows = [...table.opens, ...table.items];
  if (rows.length === 0) {
    return [
      `${title} — 役割ごとの見え方`,
      "",
      "役割で絞っている所が1つもありません（**全部の人に全部見えます**）。",
    ].join("\n");
  }

  const nameOf = (row: MatrixRow): string =>
    `${row.node}「${row.label}」${row.node === "画面" ? "" : `（${row.page}）`}`;
  const nameWidth = Math.max(
    ...rows.map((row) => width(nameOf(row))),
    width("見えるもの"),
  );
  const colWidths = heads.map((head) => Math.max(width(head), 3));

  const out = [`${title} — 役割ごとの見え方`, ""];
  out.push(
    [pad("見えるもの", nameWidth), ...heads.map((h, i) => center(h, colWidths[i]))]
      .join("  ")
      .trimEnd(),
  );
  out.push(
    [
      "-".repeat(nameWidth),
      ...colWidths.map((one) => "-".repeat(one)),
    ].join("  "),
  );
  for (const row of rows) {
    out.push(
      [
        pad(nameOf(row), nameWidth),
        ...row.seen.map((yes, i) => center(yes ? "○" : "×", colWidths[i])),
      ]
        .join("  ")
        .trimEnd(),
    );
  }

  out.push("");
  if (table.opens.length > 0) {
    out.push(
      "※ 「画面」の行は**入口を辿った結果**です（ページ自身に `roles` は書けないので、" +
        "メニューやボタンの権限から決まります）。",
    );
  }
  out.push(
    "※ 並べているのは**役割で絞られている物だけ**です（絞っていない物は全員に見えます）。",
  );
  out.push(
    "※ ○×は**定義に書いてあること**だけ。API を直接叩けばデータは取れるので、" +
      "実際の制御はバックエンドで守ります（`hatake attack` で試せます）。",
  );
  return out.join("\n");
}

/** 役割ごとの「見えている数 / 絞られている数」（棚卸しの1行に使う）。 */
export function sightSummary(sight: RoleSight): { seen: number; hidden: number } {
  let seen = 0;
  let hidden = 0;
  for (const page of sight.pages) {
    for (const item of page.gated) {
      if (sees(item, sight.role)) seen += 1;
      else hidden += 1;
    }
  }
  return { seen, hidden };
}
