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
 */
export function filterExamples(
  catalog: ExampleCatalog,
  query?: string,
): ExampleEntry[] {
  const needle = query?.trim().toLowerCase();
  if (needle === undefined || needle === "") return catalog.examples;
  return catalog.examples.filter((e) =>
    [e.file, e.kind, e.title, e.task, ...e.keys, ...e.keywords]
      .join("\n")
      .toLowerCase()
      .includes(needle),
  );
}
