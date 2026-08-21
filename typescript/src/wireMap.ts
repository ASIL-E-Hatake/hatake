/**
 * `'name': value,` の並び（空なら `{}`）。
 *
 * 80桁を超えるものは値を次の行に落とす。生成物も**人が読んでレビューする**ので、
 * 折り返しは機械の側で面倒を見る（`dart format` を掛けさせない）。
 */
export function mapLiteral(
  entries: [string, string][],
  indent: string,
): string {
  if (entries.length === 0) return "{}";
  const body = entries
    .map(([key, value]) => {
      const oneLine = `${indent}  '${key}': ${value},`;
      if (oneLine.length <= 80) return oneLine;
      const wrapped = value.replace(" => ", ` =>\n${indent}      `);
      return `${indent}  '${key}': ${wrapped},`;
    })
    .join("\n");
  return `{\n${body}\n${indent}}`;
}
