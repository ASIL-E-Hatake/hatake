// 食い違いの印（`ProbeKind`）から直し方を引く（`spec/probe-kinds.json`）。
//
// `probe` は食い違いを見つけたときに、その1件ぶんの直し方（`fix`）を添える。けれど
// **印そのものの意味**は在り処が無かった＝`type-mismatch` と言われて「で、どっちを
// 直すのか」は、コードを読まないと分からない。警告 → 直し方（`pitfalls`）は繋がって
// いるのに、食い違い → 直し方が繋がっていない。
//
// 決めごと:
//
// * **1件の具体はここに書かない。** 何件返ったか・どの項目かは `probe` の `what` /
//   `fix` の担当（同じことを2か所に持たない）。ここは印ごとの一般の話
// * **サーバ側と定義側を必ず分けて書く。** どちらを直すかは業務の判断なので、道具が
//   片方に決めてはいけない（実物に寄せるべき項目もある）
// * **印を足したら表にも足す**（[parseProbeHelp] が両方向で確かめる＝片方だけ増やせない）

import { PROBE_KINDS, type ProbeKind } from "./probeShape.js";

/** 印1つぶんの直し方。 */
export interface ProbeHelp {
  id: ProbeKind;
  /** 何が起きているか（画面から見て何が困るか、まで）。 */
  what: string;
  /** サーバを直すなら。 */
  server: string;
  /** 定義を直すなら（「定義の話ではない」もはっきり書く）。 */
  definition: string;
  /** 次に叩く道具（1行。`hatake …` の形）。 */
  tool?: string;
}

const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bad = (message: string): never => {
  throw new Error(`食い違いの表が読めません: ${message}`);
};

const text = (value: unknown, at: string): string =>
  typeof value === "string" && value !== "" ? value : bad(`${at} が要ります。`);

/**
 * 表を読む。**印の集合と両方向で突き合わせる**（片方だけ増やせない）。
 */
export function parseProbeHelp(value: unknown): ProbeHelp[] {
  if (!isDict(value)) bad("map として読めません。");
  const raw = (value as { kinds?: unknown }).kinds;
  if (!Array.isArray(raw)) bad("kinds がありません。");

  const known = new Set<string>(PROBE_KINDS);
  const found: ProbeHelp[] = [];
  const seen = new Set<string>();
  for (const [index, one] of (raw as unknown[]).entries()) {
    if (!isDict(one)) bad(`kinds[${index}] が map ではありません。`);
    const node = one as Record<string, unknown>;
    const id = text(node.id, `kinds[${index}].id`);
    if (!known.has(id)) {
      bad(`"${id}" という印はありません（印は ${PROBE_KINDS.length} 個です）。`);
    }
    if (seen.has(id)) bad(`印 "${id}" が2回出てきます。`);
    seen.add(id);
    for (const key of Object.keys(node)) {
      if (!["id", "what", "server", "definition", "tool"].includes(key)) {
        bad(`kinds[${index}]: 知らないキー "${key}"。`);
      }
    }
    found.push({
      id: id as ProbeKind,
      what: text(node.what, `${id}.what`),
      server: text(node.server, `${id}.server`),
      definition: text(node.definition, `${id}.definition`),
      ...(node.tool === undefined ? {} : { tool: text(node.tool, `${id}.tool`) }),
    });
  }
  const missing = PROBE_KINDS.filter((kind) => !seen.has(kind));
  if (missing.length > 0) {
    bad(
      `表に無い印があります: ${missing.join(" / ")}` +
        "（印を足したら、直し方も足してください）。",
    );
  }
  return found;
}

/** 印で絞る（省略すると全部。並びは表のまま＝叩く順に並べてある）。 */
export const probeHelpFor = (table: ProbeHelp[], id?: string): ProbeHelp[] =>
  id === undefined || id === "" ? table : table.filter((one) => one.id === id);

/** 人が読む形。 */
export function probeHelpLines(table: ProbeHelp[]): string[] {
  const out: string[] = [
    table.length === PROBE_KINDS.length
      ? `食い違いの印は ${table.length} 個。`
      : `食い違いの印 ${table.length} 件。`,
  ];
  for (const one of table) {
    out.push("");
    out.push(`[${one.id}] ${one.what}`);
    out.push(`  サーバを直すなら: ${one.server}`);
    out.push(`  定義を直すなら: ${one.definition}`);
    if (one.tool !== undefined) out.push(`  次に見る: ${one.tool}`);
  }
  out.push("");
  out.push(PROBE_HELP_NOTE);
  return out;
}

/** どちらを直すかは道具が決めない、を毎回言う。 */
export const PROBE_HELP_NOTE =
  "※ **サーバを直すのか定義を直すのかは業務の判断**です（実物に寄せるべき項目もあります）。" +
  "この表は印ごとの一般の話で、1件ごとの具体（何件返った・どの項目か）は probe の報告に出ます。";
