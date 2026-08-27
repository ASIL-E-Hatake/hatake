// 計算の依存を絵にする（どの項目がどの項目から出るか）。
//
// なぜ要るか: 計算は**書いた順に1回**なので、「小計 → 消費税 → 合計」の順番が入れ替わって
// いると、消費税だけ 0 円の伝票が出る。順番が違うことは機械が言えるようになった
// （`computed-order`）が、**どこを動かせばいいか**は表を目で追うことになる。依存は定義から
// 読めるので、絵にするのは書くだけの仕事。
//
// 決めごと:
//   ・**縦積みの作図器（SVG）では描かない。** 依存は行を飛ぶ線が出る（合計は小計と
//     消費税の両方から来る）ので、[renderDiagram] の「隣の行だけ繋ぐ」では描けない。
//     貼れる形（Mermaid / DOT）で出す＝レイアウトは向こうに任せる。
//   ・**明細の行は別の段**として出す（`lines` の行の `amount` を畳んで小計になる、が
//     1本の線で読める）。行の中の計算（`amount = qty × price`）も同じ絵に入れる。
//   ・**順番が逆の線を赤で出す。** 図の目的は「どこを動かせばいいか」なので、動かす
//     ところが色で分かる形にする（警告と同じ判定＝2つの言い方をしない）。
//   ・独自の `op` は `fields` / `of` の意味を知らないので、**書いてあるものをそのまま**
//     依存として読む（組み込みだけを特別扱いすると、独自の op の図が空になる）。

import { rawFormFields } from "./pageParts.js";
import type { TextEdge, TextGraph, TextNode } from "./graphText.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

/** 1つの項目（親の段 or 明細の行の段）。 */
interface Slot {
  /** 図の中の名前（行の項目は `lines.amount`）。 */
  id: string;
  field: string;
  label: string;
  computed?: Dict;
  /** 明細（subTable）の項目名。親の段なら undefined。 */
  owner?: string;
  /** 書いた順（同じ段の中での位置）。計算は書いた順に1回。 */
  order: number;
}

/** 条件（`where`）が見ている行の項目を全部。 */
function conditionFields(condition: unknown, found: string[] = []): string[] {
  if (!isDict(condition)) return found;
  const name = str(condition.field);
  if (name !== undefined) found.push(name);
  for (const key of ["all", "any"]) {
    dicts(condition[key]).forEach((one) => conditionFields(one, found));
  }
  if (isDict(condition.not)) conditionFields(condition.not, found);
  return found;
}

/** 画面の中の項目を、親の段と明細の行の段に分けて並べる。 */
function slotsOf(page: Dict): Slot[] {
  const found: Slot[] = [];
  rawFormFields(page).forEach(({ node }, order) => {
    const field = str(node.field);
    if (field === undefined) return;
    found.push({
      id: field,
      field,
      label: str(node.label) ?? field,
      ...(isDict(node.computed) ? { computed: node.computed } : {}),
      order,
    });
    // 明細（subTable）の行の項目。行の中にも計算が書ける（金額 = 数量 × 単価）。
    dicts(node.fields).forEach((row, rowOrder) => {
      const name = str(row.field);
      if (name === undefined) return;
      found.push({
        id: `${field}.${name}`,
        field: name,
        label: str(row.label) ?? name,
        ...(isDict(row.computed) ? { computed: row.computed } : {}),
        owner: field,
        order: rowOrder,
      });
    });
  });
  return found;
}

/** その段の中の項目（同じ `owner` のもの）。 */
const sameLevel = (slots: Slot[], slot: Slot): Slot[] =>
  slots.filter((one) => one.owner === slot.owner);

export interface ComputedGraphOptions {
  /** 画面の名前（図の見出しに出す）。 */
  title?: string;
}

/**
 * 1画面ぶんの依存の図。
 *
 * 計算が1つも無ければ**空の図**を返す（呼ぶ側が「描くものが無い」と言えるように、
 * ここでは投げない）。
 */
export function computedGraph(
  page: Dict,
  options: ComputedGraphOptions = {},
): TextGraph {
  const slots = slotsOf(page);
  const byId = new Map(slots.map((one) => [one.id, one]));
  const nodes = new Map<string, TextNode>();
  const edges: TextEdge[] = [];

  /** 図に出す（出てくるものだけ＝計算に関係ない項目は並べない）。 */
  const put = (slot: Slot, tone: TextNode["tone"]): void => {
    const seen = nodes.get(slot.id);
    // 一度 `warn` にした箱は下げない（同じ箱が複数の線に出てくる）。
    if (seen !== undefined && (seen.tone === "warn" || tone !== "warn")) return;
    nodes.set(slot.id, {
      id: slot.id,
      label: slot.label,
      tone,
      ...(slot.owner === undefined ? {} : { note: `明細 ${slot.owner} の行` }),
    });
  };

  for (const slot of slots) {
    const computed = slot.computed;
    if (computed === undefined) continue;
    const op = str(computed.op) ?? "計算";
    const level = sameLevel(slots, slot);
    const myOrder = level.findIndex((one) => one.id === slot.id);
    let late = false;

    /** 依存1本（`from` が図に無ければ、その項目も箱にする）。 */
    const depend = (
      from: Slot | undefined,
      fallback: string,
      extra: Partial<TextEdge> = {},
    ): void => {
      if (from === undefined) {
        // 綴り違い・別の場所に持っている値。**線は引く**（図から消すと、書いた
        // つもりの依存が見えなくなる）。そこは validate の担当。
        nodes.set(fallback, {
          id: fallback,
          label: fallback,
          tone: "outside",
          note: "この画面に無い項目",
        });
        edges.push({ from: fallback, to: slot.id, ...extra });
        return;
      }
      // 同じ段の**後ろに書いた計算項目**を使っている＝そこは空のまま計算される。
      const isLate =
        from.owner === slot.owner &&
        from.computed !== undefined &&
        level.findIndex((one) => one.id === from.id) > myOrder;
      if (isLate) late = true;
      put(from, from.computed === undefined ? "input" : "core");
      edges.push({
        from: from.id,
        to: slot.id,
        ...(isLate ? { warn: true, label: "順番が逆" } : {}),
        ...extra,
      });
    };

    // ① 同じレコードの項目を畳む。
    for (const raw of list(computed.fields)) {
      const name = str(raw);
      if (name === undefined) continue;
      const id = slot.owner === undefined ? name : `${slot.owner}.${name}`;
      depend(byId.get(id), name);
    }
    // ② 明細の行を畳む（縦計）。`of` が無いのは count（行そのものを数える）。
    const table = str(computed.field);
    if (table !== undefined) {
      const of = str(computed.of);
      if (of === undefined) {
        depend(byId.get(table), table, { label: op });
      } else {
        depend(byId.get(`${table}.${of}`), `${table}.${of}`, { label: op });
      }
      // 畳む前の絞り込みも、行の項目を読んでいる（細い線で出す）。
      for (const name of conditionFields(computed.where)) {
        depend(byId.get(`${table}.${name}`), `${table}.${name}`, {
          label: "絞り込み",
          back: true,
        });
      }
    }
    put(slot, late ? "warn" : "output");
  }

  return {
    title: options.title ?? "計算の依存",
    subtitle:
      nodes.size === 0
        ? "計算項目はありません"
        : "左から右へ「この項目はここから出る」。赤い線は順番が逆（空のまま計算される）",
    nodes: [...nodes.values()],
    edges,
  };
}

/** 順番が逆の線が1本でもあるか（`explain` や CI から見る）。 */
export const hasLateDependency = (graph: TextGraph): boolean =>
  graph.edges.some((one) => one.warn === true);
