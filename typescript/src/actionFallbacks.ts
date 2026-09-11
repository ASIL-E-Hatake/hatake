// 押した時の言い方（Flutter の最後の砦）と、押す前に言う側の**対応表**。
//
// Renderer には「押してから言う」道が6本ある（`page_actions.dart`）。どれも最後の砦で、
// **本当はその前に言えること**だ。押す前に言う側は道具の担当（`validate` の警告・strict・
// `--registry` の突き合わせ・Renderer の押せない判定）。
//
// この対応は今まで**注記**で守っていた（`actionNeeds.ts` の頭に「片方だけ直すな」）。
// 注記は破れる。片方だけ増やすと**押す前に言えるはずのことを押してから言う**画面ができる
// ので、対応を1枚にして機械で突き合わせる（`actionFallbacks.test.ts` が両方向で見る）。
//
// 決めごと:
//
// * **文は Dart に在る字そのまま**（部分一致で探す）。言い方を変えたら、ここも変わる
// * **押す前に言う側を必ず書く。** 「まだ無い」は書けない＝無いなら、それは作る仕事
// * この表は**判定に使わない**（道具の答えを変えない）。嘘を見つけるためだけに在る

/** 押す前に言うのは誰か。 */
export const SAID_BY = ["validate", "strict", "registry", "renderer"] as const;

export type SaidBy = (typeof SAID_BY)[number];

/** 最後の砦1本ぶん。 */
export interface ActionFallback {
  /** Dart の文（`page_actions.dart` に在る字。部分一致で探す）。 */
  message: string;
  /** 押す前に言う側の名前（警告の規則名など）。 */
  before: string;
  /** それを言うのは誰か。 */
  by: SaidBy;
  /** なぜ押す前に言えるのか（1行）。 */
  why: string;
}

/**
 * 6本ぜんぶ。**Dart に在る文はここに在り、ここに在る文は Dart に在る**（試験が両方向で
 * 確かめる）。
 */
export const ACTION_FALLBACKS: ActionFallback[] = [
  {
    message: "選んだ行に対しては",
    before: "selection-unsupported-type",
    by: "validate",
    why: "`scope: selection` に置ける型は `plugin` だけ＝定義を読んだだけで分かる。",
  },
  {
    message: "はこのページでは使えません",
    before: "create-action-unusable",
    by: "validate",
    why: "`type: create` が開くのは一覧からの新規入力＝置ける画面の種別は決まっている。",
  },
  {
    message: "のハンドラが未登録です",
    before: "unknown-plugin",
    by: "registry",
    why:
      "登録した名前と定義の `plugin:` の突き合わせ（`validate --registry`）で分かる。" +
      "画面でも**押す前に**灰色にして理由を出す（登録は実行時に引けるので）。",
  },
  {
    message: "はこのページでは出力できません",
    before: "export-without-rows",
    by: "validate",
    why: "CSV にするのは表の行＝表の無い画面に置けないことは定義から分かる。",
  },
  {
    message: "はこのページでは刷れません",
    before: "print-without-report",
    by: "validate",
    why: "`type: print` は帳票の画面だけ＝`report` の無い画面に置けないと定義から分かる。",
  },
  {
    message: "は未実装です",
    before: "unknown-action-type",
    by: "strict",
    why: "知らない `type` は strict が弾く＝ここに来るのは枠組みの取りこぼし。",
  },
];

/** Dart の文を探すときの目印（この形の文だけが「最後の砦」）。 */
export const FALLBACK_PATTERN = /アクション "\$\{action\.id\}" (?:は)?[^']*/g;
