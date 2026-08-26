// 引数の形（解析した結果と、そこから値を1つ取る口）。
//
// 解析そのものは [cli] に置いてある（旗の一覧と使い方の説明が同じ所に在ってほしい）。
// ここに在るのは**受け取る側が要る分だけ**＝叩く道具の入口（[cliProbe]）と本体が、
// 同じ形を2つ書かないようにするため。

/** 解析した引数。 */
export interface Args {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** 旗の値を1つ取る（値を取らない旗として渡されていれば undefined）。 */
export const str = (flags: Args["flags"], key: string): string | undefined =>
  typeof flags[key] === "string" ? (flags[key] as string) : undefined;

/** `--collection a=x,b=y` を読む（当たらない推測を上書きするための口）。 */
export function collectionOverrides(value: string | undefined): Record<string, string> {
  if (value === undefined) return {};
  const found: Record<string, string> = {};
  for (const pair of value.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(
        `--collection は "orderRepository=sales-orders" の形で書いてください（"${pair}"）。`,
      );
    }
    found[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return found;
}
