// 「この画面は誰が開けるか」を、アプリ全体から数える。
//
// **ページに `roles` は無い。** 権限が書けるのはメニュー項目とボタン（と列・項目・カード）で、
// 画面そのものには書けない。つまり「この画面は誰に見えるか」は**入口から辿って**しか出せない:
// メニューの項目が admin だけなら、その先の画面も admin だけ。その画面のボタンが誰でも押せる
// 形で書いてあっても、**そこへ来られるのが admin だけ**なら、開けるのは admin だけ。
//
// 1枚ずつ読んでも出ない値がここに2つある:
//   ・**誰も開けない画面** … 入口の権限が食い違っている（staff の画面に admin 限定のボタンで
//     だけ繋がっている、など）。定義としては通るし、画面を見ても気づけない
//   ・**誰でも開けて、消す/持ち出すができる画面** … 1枚だけ見ると「roles が無いボタン」に
//     見えるが、まずいのは**そこへ誰でも来られる**ときだけ
//
// 数え方は素直な繰り返し（不動点）。役割の集合は増える方向にしか動かないので、変わらなく
// なったら終わり。遷移に輪があっても止まる。
//
// 見るのは**素の document**（解析後のモデルは `action.page` を持たないので遷移が辿れない）。
// メニューも素のまま読む＝この1枚で完結するので、図（[appDiagram]）と警告（[findWarnings]）が
// 同じ答えを出す。

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const strings = (v: unknown): string[] =>
  list(v).filter((one): one is string => typeof one === "string");

/**
 * 誰が開けるか。
 *
 * `everyone` と「役割の一覧」を別に持つ。`roles: []` は DSL では「誰でも」の意味だが、
 * ここでは**絞った結果として誰も残らなかった**（＝誰も開けない）を言い分ける必要がある。
 * 同じ空配列に2つの意味を持たせると、そこが読めなくなる。
 */
export interface Audience {
  /** true = 権限で絞っていない（誰でも開ける）。 */
  everyone: boolean;
  /** `everyone` が false のとき、開けられる役割（空 = 誰も開けない）。 */
  roles: string[];
}

const EVERYONE: Audience = { everyone: true, roles: [] };
const NOBODY: Audience = { everyone: false, roles: [] };

const sorted = (roles: Iterable<string>): string[] =>
  [...new Set(roles)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** 門を通す（`gate` は空なら誰でも通れる門）。通れるのは、来られる人のうち門を通れる人。 */
function through(gate: string[], audience: Audience): Audience {
  if (gate.length === 0) return audience;
  if (audience.everyone) return { everyone: false, roles: sorted(gate) };
  return {
    everyone: false,
    roles: sorted(audience.roles.filter((role) => gate.includes(role))),
  };
}

/** 入口が2つあれば、どちらから来てもよい。 */
function either(a: Audience, b: Audience): Audience {
  if (a.everyone || b.everyone) return EVERYONE;
  return { everyone: false, roles: sorted([...a.roles, ...b.roles]) };
}

const same = (a: Audience, b: Audience): boolean =>
  a.everyone === b.everyone && a.roles.join(" ") === b.roles.join(" ");

/**
 * その画面への入口1つ。
 *
 * 「誰も開けない」と言うときに**どこを直すか**を言うために持つ（入口が分からないと、
 * 権限が食い違っていることだけ言われても直せない）。
 */
export interface AccessEntry {
  /** メニューなら `menu`、遷移ならその元のページ id。 */
  from: string;
  /** 入口の名前（メニュー項目のラベル / ボタンのラベル）。 */
  label: string;
  /** その入口を使える役割（空＝誰でも）。 */
  roles: string[];
}

/** メニューの入口（役割は親のグループと掛け合わせる）。 */
function menuEntries(app: Dict): { page: string; entry: AccessEntry }[] {
  const found: { page: string; entry: AccessEntry }[] = [];
  const walk = (items: unknown[], gate: string[]): void => {
    for (const item of items.filter(isDict)) {
      const own = strings(item.roles);
      // グループの `roles` は**中身にも掛かる**（見えないグループの中の画面は開けない）。
      // 掛け算は「両方を満たす人」＝役割の共通部分。
      const here =
        gate.length === 0
          ? own
          : own.length === 0
            ? gate
            : gate.filter((role) => own.includes(role));
      const children = list(item.items);
      if (children.length > 0) {
        walk(children, here);
        continue;
      }
      const page = str(item.page);
      if (page === undefined) continue;
      found.push({
        page,
        entry: {
          from: "menu",
          label: str(item.label) ?? str(item.group) ?? str(item.id) ?? "メニュー",
          roles: here,
        },
      });
    }
  };
  walk(list(app.menu), []);
  return found;
}

/** 遷移の入口（`navigate` のボタン）。権限はボタンの `roles`。 */
function doorEntries(app: Dict): { page: string; entry: AccessEntry }[] {
  const found: { page: string; entry: AccessEntry }[] = [];
  for (const page of list(app.pages).filter(isDict)) {
    const from = str(page.id);
    if (from === undefined) continue;
    for (const action of list(page.actions).filter(isDict)) {
      const to = str(action.page);
      if (str(action.type) !== "navigate" || to === undefined) continue;
      found.push({
        page: to,
        entry: {
          from,
          label: str(action.label) ?? str(action.id) ?? "遷移",
          roles: strings(action.roles),
        },
      });
    }
  }
  return found;
}

/** 危ない操作（消す・持ち出す・紙に出す）を、権限で絞らずに置いているボタンのラベル。 */
function openDangerOf(page: Dict): string[] {
  const found: string[] = [];
  for (const action of list(page.actions).filter(isDict)) {
    const type = str(action.type) ?? "";
    if (type !== "delete" && type !== "export" && type !== "print") continue;
    if (strings(action.roles).length > 0) continue;
    found.push(str(action.label) ?? str(action.id) ?? type);
  }
  return found;
}

/** 権限を重ねた結果。 */
export interface AppAccess {
  /** ページ id → 誰が開けるか。 */
  audience: Map<string, Audience>;
  /** ページ id → その画面への入口（無い＝メニューにも遷移先にも書かれていない）。 */
  entries: Map<string, AccessEntry[]>;
  /** ページ id → 権限で絞っていない危ないボタンのラベル。 */
  openDanger: Map<string, string[]>;
  /** 定義に出てくる役割名の全部（綴り確認に使う）。 */
  roles: string[];
}

/**
 * 誰がどの画面を開けるかを数える。[raw] は素の document（`app:` を持つもの）。
 *
 * `app:` でなければ空（単票の定義には入口の話が無い）。
 */
export function appAccess(raw: Dict): AppAccess {
  const app = isDict(raw.app) ? raw.app : undefined;
  if (app === undefined) {
    return {
      audience: new Map(),
      entries: new Map(),
      openDanger: new Map(),
      roles: [],
    };
  }
  const pages = new Map(
    list(app.pages)
      .filter(isDict)
      .flatMap((page) => {
        const id = str(page.id);
        return id === undefined ? [] : [[id, page] as const];
      }),
  );
  const ways = [...menuEntries(app), ...doorEntries(app)].filter(
    (one) => pages.has(one.page) && (one.entry.from === "menu" || pages.has(one.entry.from)),
  );

  const entries = new Map<string, AccessEntry[]>();
  for (const one of ways) {
    entries.set(one.page, [...(entries.get(one.page) ?? []), one.entry]);
  }

  // 入口から始めて、変わらなくなるまで広げる。
  const audience = new Map<string, Audience>();
  for (const id of pages.keys()) audience.set(id, NOBODY);
  // メニューがまったく無い app は、`home`（無ければ先頭のページ）から始まる＝そこは
  // 誰でも開ける。図（[appDiagram]）も同じ読み方をするので、答えを揃えておく。
  // これは**書かれた入口ではない**ので entries には入れない（直す所が無い）。
  if (!ways.some((one) => one.entry.from === "menu")) {
    const home = str(app.home);
    const first =
      home !== undefined && pages.has(home) ? home : [...pages.keys()][0];
    if (first !== undefined) audience.set(first, EVERYONE);
  }
  // 最大でもページ数だけ回せば行き渡る（1回で少なくとも1枚は確定する）。
  for (let round = 0; round <= pages.size; round++) {
    let moved = false;
    for (const { page, entry } of ways) {
      const before = audience.get(page) ?? NOBODY;
      const source =
        entry.from === "menu" ? EVERYONE : (audience.get(entry.from) ?? NOBODY);
      const after = either(before, through(entry.roles, source));
      if (!same(before, after)) {
        audience.set(page, after);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const openDanger = new Map<string, string[]>();
  for (const [id, page] of pages) {
    const found = openDangerOf(page);
    if (found.length > 0) openDanger.set(id, found);
  }

  return { audience, entries, openDanger, roles: allRoles(raw) };
}

/**
 * 定義に出てくる役割名の全部。
 *
 * `--role` の綴り違いを黙って通さないために要る（知らない役割を渡すと「全部開ける」に見えて
 * しまい、一番まずい読み違えになる）。列・項目・カードの `roles` も入れる＝入口には効かないが
 * **その案件の役割の一覧**なので、綴りの確認には使える。
 */
function allRoles(raw: Dict): string[] {
  const found: string[] = [];
  const dig = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const one of value) dig(one);
      return;
    }
    if (!isDict(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "roles") found.push(...strings(child));
      else dig(child);
    }
  };
  dig(raw);
  return sorted(found);
}

/** その役割で開けるか。 */
export const canOpen = (audience: Audience, role: string): boolean =>
  audience.everyone || audience.roles.includes(role);

/** 誰も開けないか（入口が書いてあるのに、通れる人が居ない）。 */
export const nobodyCanOpen = (audience: Audience): boolean =>
  !audience.everyone && audience.roles.length === 0;

/** 人が読む言い方（図の箱に入れる短い形）。 */
export function describeAudience(audience: Audience): string {
  if (audience.everyone) return "誰でも開ける";
  if (audience.roles.length === 0) return "誰も開けない";
  return `${audience.roles.join(" / ")} だけ`;
}
