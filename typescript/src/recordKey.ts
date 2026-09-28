// **1件を指す値**が2つ以上の項目で決まるときの、その組（0.9.7 の複合キー）。
//
// Dart 側（`hatake_core` の `record_key.dart`）には 0.9.7 から在ったが、TypeScript には
// 無かった。サーバ側だけを見ていたので要らなかったためで、**Web の Renderer を足す段で
// 足りないことが分かった**（画面は「選んだ行の集まり」を鍵で持ち回る）。
//
// 明細（受注番号＋行番号）や履歴（社員番号＋適用日）のように、1つの列では1件に
// ならない表は業務では普通に出てくる。

/** 枠組みから見た1件。 */
type Row = Readonly<Record<string, unknown>>;

/**
 * 複合の鍵。**値で比べられること**がこの型の要点。
 *
 * 鍵は画面の中で「選んだ行の集まり」として持ち回るので、素の地図を使うと
 * **同じ行を2回選べてしまい、一括処理が数え違える**。JavaScript の `Set` も
 * 中身ではなく同一性で見るので、比べられる**文字列の見分け**（[[id]]）を持つ。
 *
 * 項目の並びは**定義に書いた順**を保つ。URL の道に並べる順がこれで決まるので、
 * 並びが変わると別の1件を指す。
 */
export class RecordKey {
  /** 項目名 → 値（定義に書いた順）。 */
  readonly parts: ReadonlyMap<string, unknown>;

  constructor(parts: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>) {
    this.parts = parts instanceof Map ? new Map(parts) : new Map(Object.entries(parts));
  }

  /** 定義に書いた順の値だけ（URL の道に並べる順）。 */
  get values(): unknown[] {
    return [...this.parts.values()];
  }

  /** 定義に書いた順の項目名だけ。 */
  get fields(): string[] {
    return [...this.parts.keys()];
  }

  /**
   * 集まりに入れるための見分け。**並びまで含める**（同じ値でも順番が違えば
   * URL の道が変わるので、等しいと言ってはいけない）。
   */
  get id(): string {
    return JSON.stringify([...this.parts.entries()]);
  }

  /** 人に見せる字（記録や覚え書き用）。**URL には使わない**。 */
  toString(): string {
    return [...this.parts.entries()].map(([key, value]) => `${key}=${value}`).join(", ");
  }

  equals(other: unknown): boolean {
    return other instanceof RecordKey && other.id === this.id;
  }
}

/** 集まりに入れられる形にする（素の値はそのまま、複合は見分けの字）。 */
export const recordKeyId = (key: unknown): string =>
  key instanceof RecordKey ? key.id : JSON.stringify(key);

/**
 * 行から**1件を指す値**を作る。
 *
 *   ・`key: orderNo`            → `'SO-1'`（**素の値**。いままでと同じ）
 *   ・`key: [orderNo, lineNo]`  → [[RecordKey]]
 *
 * 単一のときに素の値のままなのは、**すでに動いている Repository を1行も直さずに
 * 済ませる**ため。複合キーを使うと決めた人だけが新しい型を見る。
 *
 * 値が1つでも欠けていれば **undefined**（その行は指せない）。欠けたまま組み立てると、
 * 別の行に当たる鍵を作ってしまう。
 */
export function recordKeyOf(keyFields: readonly string[], row: Row): unknown {
  if (keyFields.length === 0) return undefined;
  if (keyFields.length === 1) return row[keyFields[0]];
  const parts = new Map<string, unknown>();
  for (const field of keyFields) {
    const value = row[field];
    if (value === undefined || value === null) return undefined;
    parts.set(field, value);
  }
  return new RecordKey(parts);
}

/**
 * 鍵を**画面の引数**にほどく。
 *
 * 単一なら `{<項目名>: 値}`、複合なら項目ごとに1つずつ。行き先の画面は 0.9.3 から
 * 自分の `key` の名前で受け取るので、名前をそのまま渡せば届く。
 */
export function recordKeyParams(
  keyFields: readonly string[],
  key: unknown,
): Record<string, unknown> {
  if (keyFields.length === 0 || key === undefined || key === null) return {};
  if (key instanceof RecordKey) return Object.fromEntries(key.parts);
  return { [keyFields[0]]: key };
}

/**
 * 画面の引数から鍵を組み立てる（[[recordKeyParams]] の逆）。
 *
 * 1つでも足りなければ undefined＝**取りに行かない**。足りないまま取りに行くと、
 * 別の1件が開く。
 */
export function recordKeyFromParams(
  keyFields: readonly string[],
  params: Readonly<Record<string, unknown>>,
): unknown {
  if (keyFields.length === 0) return undefined;
  if (keyFields.length === 1) {
    // `id` は `key` を書かなかった画面の既定なので、昔の書き方も受ける。
    return params[keyFields[0]] ?? params["id"];
  }
  const parts = new Map<string, unknown>();
  for (const field of keyFields) {
    const value = params[field];
    if (value === undefined || value === null) return undefined;
    parts.set(field, value);
  }
  return new RecordKey(parts);
}
