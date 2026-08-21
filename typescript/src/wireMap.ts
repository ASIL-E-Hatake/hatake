/**
 * `'name': value,` の1行。80桁を超えるものは値を次の行に落とす。
 *
 * 生成物も**人が読んでレビューする**ので、折り返しは機械の側で面倒を見る
 * （`dart format` を掛けさせない）。既にある配線に**足す**とき（`wire --merge`）も
 * ここを通す＝「出す道具と足す道具で行の形が違う」を作らない。
 */
export function mapEntry(key: string, value: string, indent: string): string {
  const oneLine = `${indent}'${key}': ${value},`;
  if (oneLine.length <= 80) return oneLine;
  const wrapped = value.replace(" => ", ` =>\n${indent}    `);
  return `${indent}'${key}': ${wrapped},`;
}

/** `'name': value,` の並び（空なら `{}`）。 */
export function mapLiteral(entries: [string, string][], indent: string): string {
  if (entries.length === 0) return "{}";
  const body = entries
    .map(([key, value]) => mapEntry(key, value, `${indent}  `))
    .join("\n");
  return `{\n${body}\n${indent}}`;
}
