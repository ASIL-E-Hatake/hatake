// `check` の紙（AI が MCP で見ているのと同じ答え）を、問題の一覧の行に直す。
//
// VS Code に依らない純関数（試験から直に呼ぶ）。重さは欄で決める:
//   事実（書いたのに効かない）   → 警告
//   好み（書いていないと不便かも） → 情報（文の頭に「好み:」）
//   人が決めること                → 情報（ヒントだと問題の一覧に載らない。文の頭の「人が決めること:」で見分ける）
// 場所は、紙に書いてある道（`page.actions[0].type`）を YAML から引いて当てる。道の先が
// まだ無い（書いていないから言われている）ときは、在る所まで遡って当てる。

import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node, type Pair } from "yaml";

export type Severity = "fact" | "preference" | "question";

export interface PlacedProblem {
  severity: Severity;
  rule: string;
  message: string;
  /** 0 始まりの行と桁。 */
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** `page.actions[0].type` → ["page", "actions", 0, "type"]。 */
export function pathSegments(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const part of path.split(".")) {
    const match = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (match === null) {
      out.push(part);
      continue;
    }
    if (match[1] !== "") out.push(match[1]);
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) out.push(Number(index[1]));
  }
  return out;
}

/** 道に当たる文字の範囲（キーがあればキー、無ければ値）。先が無ければ在る所まで遡る。 */
export function rangeOf(source: string, path: string): [number, number] {
  const document = parseDocument(source, { keepSourceTokens: false });
  let node: unknown = document.contents;
  let found: [number, number] = [0, 0];
  for (const segment of pathSegments(path)) {
    if (typeof segment === "number" && isSeq(node)) {
      const item = node.items[segment] as Node | undefined;
      const range = item?.range;
      if (range == null) break;
      found = [range[0], range[1]];
      node = item;
    } else if (typeof segment === "string" && isMap(node)) {
      const pair = node.items.find((one) => isScalar(one.key) && one.key.value === segment) as Pair | undefined;
      const range = (pair?.key as Node | undefined)?.range;
      if (pair === undefined || range == null) break;
      found = [range[0], range[1]];
      node = pair.value;
    } else {
      break;
    }
  }
  return found;
}

interface Sheet {
  facts?: { warnings?: { rule: string; path?: string; message: string; fix?: string }[] };
  preferences?: { advice?: { rule: string; where?: string; says: string; add?: string }[] };
  questions?: { list?: { kind: { id: string; ask: string }; facts?: { path?: string; where?: string }[] }[] };
}

/** check の紙（JSON）を、場所つきの問題の一覧にする。 */
export function placeProblems(source: string, sheet: Sheet): PlacedProblem[] {
  const lines = new LineCounter();
  parseDocument(source, { lineCounter: lines });
  const at = (offset: number) => {
    const { line, col } = lines.linePos(offset);
    return { line: line - 1, character: col - 1 };
  };
  const place = (severity: Severity, rule: string, message: string, path: string | undefined): PlacedProblem => {
    const [from, to] = path === undefined ? [0, 0] : rangeOf(source, path);
    return { severity, rule, message, start: at(from), end: at(Math.max(to, from)) };
  };
  const out: PlacedProblem[] = [];
  for (const one of sheet.facts?.warnings ?? []) {
    out.push(place("fact", one.rule, one.fix === undefined ? one.message : `${one.message}\n直し方: ${one.fix}`, one.path));
  }
  for (const one of sheet.preferences?.advice ?? []) {
    out.push(place("preference", one.rule, `好み: ${one.says}${one.add === undefined ? "" : `\n足すなら: ${one.add}`}`, one.where));
  }
  for (const one of sheet.questions?.list ?? []) {
    const fact = one.facts?.find((f) => f.path !== undefined);
    out.push(place("question", one.kind.id, `人が決めること: ${one.kind.ask}`, fact?.path));
  }
  return out;
}
