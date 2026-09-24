// `app.vocabularies` と `optionsOf` の食い違いを見る。
//
// 3つとも「定義は通るのに、画面に出る字が思っていたものと違う」種類です。
// 語彙を1か所にまとめると**指し間違いが新しい事故の種**になるので、指した先が
// 無い・二重に書いた・名前が重なった、の3つをここで拾います。

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 見つけた1件。`warnings.ts` がこれを警告に変える。 */
export interface VocabularyProblem {
  rule: "unknown-vocabulary" | "vocabulary-shadowed" | "duplicate-vocabulary";
  path: string;
  name: string;
  /** 近そうな名前（綴り違いのとき）。 */
  near?: string;
  /** その語彙に在る名前ぜんぶ（`unknown-vocabulary` のとき）。 */
  known?: string[];
}

/** 定義ぜんたいを歩いて、語彙まわりの食い違いを集める。 */
export function findVocabularyProblems(document: Dict): VocabularyProblem[] {
  const app = isDict(document.app) ? document.app : document;
  const raw = Array.isArray(app.vocabularies) ? app.vocabularies : [];

  const found: VocabularyProblem[] = [];
  const declared = new Set<string>();
  raw.forEach((one, index) => {
    if (!isDict(one)) return;
    const name = typeof one.name === "string" ? one.name : undefined;
    if (name === undefined) return;
    if (declared.has(name)) {
      found.push({
        rule: "duplicate-vocabulary",
        path: `app.vocabularies[${index}].name`,
        name,
      });
      return;
    }
    declared.add(name);
  });

  walk(document, "", declared, found);
  return found;
}

function walk(
  node: unknown,
  path: string,
  declared: Set<string>,
  found: VocabularyProblem[],
): void {
  if (Array.isArray(node)) {
    node.forEach((one, i) => walk(one, `${path}[${i}]`, declared, found));
    return;
  }
  if (!isDict(node)) return;

  const name = typeof node.optionsOf === "string" ? node.optionsOf : undefined;
  if (name !== undefined) {
    if (!declared.has(name)) {
      const near = nearest(name, declared);
      found.push({
        rule: "unknown-vocabulary",
        path: `${path}.optionsOf`,
        name,
        ...(near === undefined ? {} : { near }),
        known: [...declared],
      });
    } else if (Array.isArray(node.options)) {
      // 両方書いてある＝`optionsOf` は一度も効かない（その場の並びが勝つ）。
      found.push({
        rule: "vocabulary-shadowed",
        path: `${path}.optionsOf`,
        name,
      });
    }
  }

  for (const [key, value] of Object.entries(node)) {
    // 語彙そのものの中は見ない（`options` は在って当たり前）。
    if (path === "" && key === "vocabularies") continue;
    walk(value, path === "" ? key : `${path}.${key}`, declared, found);
  }
}

/**
 * いちばん近い名前（編集距離が短いほう）。遠ければ黙る。
 *
 * 「もしかして」を出すのは**1文字か2文字の違い**まで。それ以上離れたものを
 * 出すと、関係の無い名前を勧めて余計に迷わせる。
 */
function nearest(name: string, declared: Set<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const one of declared) {
    const distance = editDistance(name, one);
    if (distance < bestDistance) {
      best = one;
      bestDistance = distance;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[cols - 1];
}
