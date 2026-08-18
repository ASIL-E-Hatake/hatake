// 「消しても大丈夫なものを消す」だけの機械。
//
// 使う先が2つある:
//   ・[minimizeSource] … **意味が変わらない**ものを消す（定義を短くする）
//   ・[reproOf]        … **診断が出続ける**限り消す（転んだ実例の最小形を作る）
// どちらも「1つ消して、条件を確かめて、駄目なら戻す」の繰り返しなので、消す場所の
// 並べ方と戻し方だけをここに置く。判定（何を守るか）は呼ぶ側が持つ。
//
// 消す順番が肝。**深いものから、配列は後ろから**並べる。そうすると、受け入れた削除が
// あとの候補のパスをずらさない（浅いものを先に消すと、その下の候補が全部迷子になる）。

/** 定義の中の場所。配列は数値（yaml の Document もこの形で受ける）。 */
export type Path = (string | number)[];

/** 消してみる場所1つ。 */
export interface Removal {
  path: Path;
  /** 人に見せる場所（`page.table.columns[1].sortable`）。 */
  where: string;
  /** キー名。配列の要素そのものを消すときは undefined。 */
  key?: string;
}

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const show = (path: Path): string =>
  path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${step}`))
    .join("")
    .replace(/^\./, "");

/** 道を文字列にする（`page.table.columns[0].label`）。警告と同じ書き方。 */
export const pathText = (path: Path): string => show(path);

/**
 * 文字列の道を配列に戻す（`app.pages[2].table.rowActions[1]`）。
 *
 * 警告や差分は道を文字列で持っているので、そこを起点に定義を書き換えるには
 * この逆変換が要る。[pathText] と対になっていること自体を試験で確かめている。
 */
export function parsePath(text: string): Path {
  const path: Path = [];
  for (const part of text.split(".")) {
    if (part === "") continue;
    const match = /^([^[\]]*)((\[\d+\])*)$/.exec(part);
    if (match === null) return path;
    if (match[1] !== "") path.push(match[1]);
    for (const index of match[2].match(/\d+/g) ?? []) {
      path.push(Number(index));
    }
  }
  return path;
}

/**
 * 消せる場所を全部並べる。**深いものから、配列は後ろから**。
 *
 * [pick] で候補を絞れる（最小化は「既定値と同じキー」だけを消したいので）。省略すると
 * キーと配列の要素の両方が候補になる。
 */
export function removals(
  document: unknown,
  pick?: (found: { node: unknown; path: Path; key?: string }) => boolean,
): Removal[] {
  const found: Removal[] = [];
  const want = (at: { node: unknown; path: Path; key?: string }): boolean =>
    pick === undefined || pick(at);

  const walk = (value: unknown, path: Path): void => {
    if (Array.isArray(value)) {
      // 後ろから。前を消すと後ろの番号がずれる。
      for (let i = value.length - 1; i >= 0; i--) {
        const at = [...path, i];
        walk(value[i], at);
        if (want({ node: value[i], path: at })) {
          found.push({ path: at, where: show(at) });
        }
      }
      return;
    }
    if (!isDict(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const at = [...path, key];
      walk(child, at);
      if (want({ node: child, path: at, key })) {
        found.push({ path: at, where: show(at), key });
      }
    }
  };
  walk(document, []);
  return found;
}

/** [path] を消した複製を返す（元は触らない）。無い場所なら null。 */
export function without<T>(document: T, path: Path): T | null {
  const copy = structuredClone(document);
  let holder: unknown = copy;
  for (const step of path.slice(0, -1)) {
    if (Array.isArray(holder) && typeof step === "number") holder = holder[step];
    else if (isDict(holder) && typeof step === "string") holder = holder[step];
    else return null;
  }
  const last = path[path.length - 1];
  if (Array.isArray(holder) && typeof last === "number") {
    if (last >= holder.length) return null;
    holder.splice(last, 1);
    return copy;
  }
  if (isDict(holder) && typeof last === "string") {
    if (!(last in holder)) return null;
    delete holder[last];
    return copy;
  }
  return null;
}

/**
 * [keep] が成り立つ限り消し続ける。返すのは削った定義と、削った場所。
 *
 * 消せなくなるまで何度も回す（1周目に消せなかったものが、隣が消えたあとに消せることが
 * ある）。[limit] は回す上限で、既定は3周（実際は2周で止まる）。
 */
export function shrink<T>(
  document: T,
  keep: (candidate: T) => boolean,
  options: {
    pick?: (found: { node: unknown; path: Path; key?: string }) => boolean;
    limit?: number;
  } = {},
): { document: T; removed: Removal[] } {
  let current = document;
  const removed: Removal[] = [];
  const limit = options.limit ?? 3;

  for (let round = 0; round < limit; round++) {
    let accepted = 0;
    for (const removal of removals(current, options.pick)) {
      const candidate = without(current, removal.path);
      if (candidate === null) continue; // 親ごと消えた場所（迷子）
      if (!keep(candidate)) continue;
      current = candidate;
      removed.push(removal);
      accepted++;
    }
    if (accepted === 0) break;
  }
  return { document: current, removed };
}
