// 「この定義に出てくる役割は何と何で、どこに書いてあるか」の言い方。
//
// 数えるのは [roleInventory]。ここは並べ方と文だけ。
//
// なぜ一覧が要るか: 役割名は**定義の中だけの取り決め**（アプリ側の判定と綴りが合っている
// かは、この道具では見られない）。散らばって書かれるので、`manager` と `mgr` が混ざって
// いても画面は出るし、警告も1件ずつしか言えない。**並べて数えると1か所しか出てこない
// 役割が下に落ちる**ので、綴り違いはそこで見つかる。
//
// 「誰がその画面を開けるか」は別の話（[explainAccess]）。あちらは入口を辿った結果で、
// こちらは**書いてある場所**。混ぜると、書いていない画面が「役割が無い」と読めてしまう。

import { type RoleUse } from "./roles.js";

/** 節の見出し。 */
export const ROLES_TITLE = "出てくる役割";

/** 見出しに使う名前（app ならアプリ名、単票なら 画面名（id））。 */
export function roleTitleOf(document: Record<string, unknown>): string {
  const isMap = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const owner = (
    isMap(document.app) ? document.app : isMap(document.page) ? document.page : {}
  ) as { title?: unknown; id?: unknown };
  const title = typeof owner.title === "string" ? owner.title : "定義";
  return typeof owner.id === "string" ? `${title}（${owner.id}）` : title;
}


/** 場所1つの言い方（`ボタン「一括承認」（受注照会）`）。 */
function spotLine(use: RoleUse, index: number): string {
  const spot = use.spots[index];
  const name = spot.label === undefined ? "" : `「${spot.label}」`;
  const page = spot.page === undefined ? "" : `（${spot.page}）`;
  const others =
    spot.roles.length > 1
      ? ` ＋ ${spot.roles.filter((one) => one !== use.role).join(" / ")}`
      : "";
  return `  ・${spot.node}${name}${page}${others} … ${spot.where}`;
}

/**
 * 人が読む形。
 *
 * 1件も無いときも**そう言う**（「役割で絞っている所は1つもありません」）。空を黙って
 * 出さないのは、`--roles` を付けたのに何も出ないと「道具が動いていない」に見えるため。
 */
export function renderRoles(inventory: RoleUse[], title: string): string {
  const out = [`${title} — ${ROLES_TITLE} ${inventory.length}`];
  if (inventory.length === 0) {
    out.push("");
    out.push(
      "役割で絞っている所は1つもありません（メニュー・ボタン・列・項目のどれにも `roles` が" +
        "書かれていない＝**全部の人に全部見えます**）。",
    );
    out.push("");
    out.push(NOTE);
    return out.join("\n");
  }
  for (const use of inventory) {
    out.push("");
    out.push(`${use.role} … ${use.spots.length} か所`);
    use.spots.forEach((_, index) => out.push(spotLine(use, index)));
  }
  out.push("");
  if (inventory.some((use) => use.spots.length === 1)) {
    out.push(
      "※ 1か所しか出てこない役割は**綴り違いの疑い**があります（並びは出てくる回数の多い順）。",
    );
  }
  out.push(NOTE);
  return out.join("\n");
}

/** 役割名の出どころを、毎回書く（読む人が「権限がかかっている」と読まないように）。 */
const NOTE =
  "※ ここに出るのは**定義に書いてある役割名**だけです。アプリ側の権限判定と綴りが" +
  "合っているか・その役割が実在するかは、この道具では見られません。" +
  "誰がどの画面を開けるかは hatake explain の「開ける人」を見てください。";
