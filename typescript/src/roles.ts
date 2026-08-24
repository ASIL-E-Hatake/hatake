// 「この定義に出てくる役割は何と何か」を数える。
//
// `roles` はメニュー・ボタン・列・項目・絞り込み・カードに書ける。つまり役割名は**定義の
// あちこちに散る**ので、1つの節点を見ても一覧にはならない。綴り違い（`manager` と `mgr`）は
// 1件ずつなら警告で言えるが（`maxrows-unknown-role`）、**人が棚卸しする口が無かった**。
//
// ここは数えるだけ。言い方は [renderRoles]、誰がどの画面を開けるかは [appAccess]（別の話
// ＝「書いてある場所」と「辿った結果」を混ぜない）。
//
// 見るのは素の document を丸ごと歩く形。書ける場所を手で並べると、DSL が増えたときに
// ここだけ古くなる（**書いてある `roles` は全部拾う**のが正しい）。ただし `config` の中は
// 見ない＝プラグインの設定は中身が自由なので、そこの `roles` は DSL の役割ではない。

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 役割が書いてある場所1つ。 */
export interface RoleSpot {
  /** 何に書いてあるか（メニュー / ボタン / 列 / 項目 / 絞り込み / カード）。 */
  node: string;
  /** 場所（警告と同じ道の書き方）。 */
  where: string;
  /** その物の名前（メニュー項目やボタンのラベル）。 */
  label?: string;
  /** どの画面の話か（app のとき）。 */
  page?: string;
  /** そこに書いてある役割（1か所に複数書ける）。 */
  roles: string[];
}

/** 役割1つと、それが出てくる場所。 */
export interface RoleUse {
  role: string;
  spots: RoleSpot[];
}

/** 道の書き方は警告・助言と同じ（`app.pages[0].actions[1].roles`）。 */
const show = (path: (string | number)[]): string =>
  path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${step}`))
    .join("")
    .replace(/^\./, "");

/**
 * その場所を人の言葉で（道の最後の配列名から決める）。
 *
 * `roles` を書ける場所はスキーマで5つ（menuItem / column / field / action /
 * dashboardItem）。ここに無い名前が来たら、その名前をそのまま出す＝DSL が増えたときに
 * 「知らない場所」を黙って別の言葉にしない。
 */
const NODE_WORDS: Record<string, string> = {
  menu: "メニュー",
  actions: "ボタン",
  columns: "列",
  fields: "項目",
};

/**
 * その節点が「何であるか」を、道から言う。
 *
 * `items` はメニューのグループの中身と、ダッシュボードのカードの両方で使う。同じ名前で
 * 別のものなので、道に `menu` が居るかで言い分ける。
 */
function nodeWord(path: (string | number)[]): string {
  for (let at = path.length - 1; at >= 0; at--) {
    const step = path[at];
    if (typeof step !== "string") continue;
    if (step === "items") return path.includes("menu") ? "メニュー" : "カード";
    return NODE_WORDS[step] ?? step;
  }
  return "画面";
}

/** 役割が書いてある場所を全部拾う（書いてある順）。 */
export function roleSpots(document: Dict): RoleSpot[] {
  const found: RoleSpot[] = [];

  const walk = (value: unknown, path: (string | number)[], page?: string): void => {
    if (Array.isArray(value)) {
      value.forEach((one, index) => walk(one, [...path, index], page));
      return;
    }
    if (!isDict(value)) return;
    // 画面に入ったら、そこから下はその画面の話。**道で見る**（`page` か `app.pages[i]`）
    // ＝形で見ると、`type` と `id` を持つボタンまで画面に見える。
    const isPage =
      (path.length === 1 && path[0] === "page") ||
      (path.length === 3 && path[0] === "app" && path[1] === "pages");
    const here = isPage ? (str(value.id) ?? page) : page;

    const roles = list(value.roles).filter(
      (one): one is string => typeof one === "string",
    );
    if (roles.length > 0) {
      // メニューのグループは `group` に名前が入る（`label` ではない）。
      const label =
        str(value.label) ??
        str(value.group) ??
        str(value.title) ??
        str(value.id) ??
        str(value.field);
      found.push({
        node: nodeWord(path),
        where: show([...path, "roles"]),
        ...(label === undefined ? {} : { label }),
        ...(here === undefined ? {} : { page: here }),
        roles,
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "roles") continue;
      // プラグインの設定は中身が自由＝そこの roles は DSL の役割ではない。
      if (key === "config") continue;
      walk(child, [...path, key], here);
    }
  };

  walk(document, []);
  return found;
}

/** 定義に出てくる役割名（重複なし・アルファベット順）。 */
export const roleNames = (document: Dict): string[] =>
  [...new Set(roleSpots(document).flatMap((spot) => spot.roles))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

/**
 * 役割の棚卸し。**出てくる回数の多い順**に並べる。
 *
 * この並びにすると、1か所しか出てこない役割（綴り違いの疑い）が下に落ちてくる。
 * 同じ回数なら名前の順（並びが実行ごとに変わらないように）。
 */
export function roleInventory(document: Dict): RoleUse[] {
  const spots = roleSpots(document);
  const by = new Map<string, RoleSpot[]>();
  for (const spot of spots) {
    for (const role of spot.roles) {
      const into = by.get(role) ?? [];
      into.push(spot);
      by.set(role, into);
    }
  }
  return [...by.entries()]
    .map(([role, found]) => ({ role, spots: found }))
    .sort((a, b) =>
      b.spots.length - a.spots.length ||
      (a.role < b.role ? -1 : a.role > b.role ? 1 : 0),
    );
}
