// 例のカタログ（spec/examples/index.json）。
//
// 「やりたいこと → 近い例」を引くための索引。AI は仕様から組み立てるより近い例を
// 直すほうが速くて確実なので、ファイル名の羅列ではなく用途で引ける形にしておく。

/** 例1つ。 */
export interface ExampleEntry {
  /** spec/examples/ 内のファイル名。 */
  file: string;
  /** ページ種別（`app` は複数ページを束ねた定義）。 */
  kind: string;
  /** 定義に書かれている画面名。 */
  title: string;
  /** この例で解ける「やりたいこと」。 */
  task: string;
  /** この例が実際に使っている DSL のキー。 */
  keys: string[];
  /** 探すための言葉（機能名・別名・日本語の業務用語）。 */
  keywords: string[];
}

export interface ExampleCatalog {
  examples: ExampleEntry[];
}

/**
 * query で絞る。ファイル名・種別・画面名・やりたいこと・キー・キーワードの
 * どこかに含まれていれば当たり（大文字小文字は無視）。空 query は全件。
 * 丸ごとで当たらず、言葉が2つ以上なら、言葉ごとに数えていちばん多く当たった例。
 */
export function filterExamples(
  catalog: ExampleCatalog,
  query?: string,
): ExampleEntry[] {
  const needle = query?.trim().toLowerCase();
  if (needle === undefined || needle === "") return catalog.examples;
  const haystack = (e: ExampleEntry): string =>
    [e.file, e.kind, e.title, e.task, ...e.keys, ...e.keywords].join("\n").toLowerCase();
  const whole = catalog.examples.filter((e) => haystack(e).includes(needle));
  if (whole.length > 0) return whole;

  // 丸ごとで当たらなければ、言葉に分けて**いちばん多く当たった例**を返す（同点は全部、
  // カタログの順で）。AI は「マスタ 検索 削除確認」のように言葉を並べて引くので、丸ごと
  // だけで探すと0件になっていた（0.9.28 の初見試験で6回中4回・のべ5回）。
  const terms = [...new Set(needle.split(/[\s　、,，]+/).filter((one) => one !== ""))];
  if (terms.length < 2) return [];
  const scored = catalog.examples.map((e) => {
    const text = haystack(e);
    return { e, score: terms.filter((term) => text.includes(term)).length };
  });
  const best = Math.max(...scored.map((one) => one.score));
  return best === 0 ? [] : scored.filter((one) => one.score === best).map((one) => one.e);
}
