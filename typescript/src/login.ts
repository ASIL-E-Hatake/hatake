// 資格の**取り方**を書いておく（`--login login.json`）。
//
// なぜ要るか: `probe` / `attack` はトークンを人から受け取る形だった（`--token` /
// `--headers`）。手で叩くぶんには足りるが、**CI に置くと期限で落ちる**＝置けない。
// 毎晩回すなら、道具が自分で取れないといけない。
//
// 嘘をつかないための決めごと:
//   ・**秘密はファイルに書かない。** 値は `${ENV}` で環境から取る。環境変数が無ければ
//     **落ちる**（空のまま送ると 401 が返り、「穴が無い」と読める結果になる）。
//   ・**生の値が書いてあったら言う。** ファイルはリポジトリに入る前提の形なので、
//     `password` に生の文字列が書いてあれば注意を出す（止めはしない＝捨ててよい環境で
//     試す使い方が在る）。
//   ・**取ったトークンは出さない。** 報告にも `--dry-run` にも出さない（CI のログは
//     残る）。`--dry-run` は「どこへ・何の形で送るか」だけを出し、値は `***` にする。
//   ・**役割ごとに取る。** `--all-roles` は1つの資格で全部の役割を判定することを断って
//     いる（200 が穴なのか正しいのか区別できない）。取り方も役割ごとに書かせる。

/** 送る先と、返りからトークンを拾う場所。 */
export interface LoginPlan {
  url: string;
  /** `POST` だけ（GET だと秘密が問い合わせ文字列に載り、ログに残る）。 */
  method: "POST";
  headers: Record<string, string>;
  /** 返ってきた JSON の中のトークンの場所（`data.accessToken` のような点つなぎ）。 */
  tokenAt: string;
  /** 役割を1つだけ叩くときの本文。 */
  body?: unknown;
  /** 役割ごとの本文（`--all-roles` はこちらが要る）。 */
  roles: Record<string, unknown>;
  /** 読めたが気になること（生の秘密が書いてある等）。止めはしない。 */
  cautions: string[];
}

const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const PLAN_KEYS = new Set([
  "$comment",
  "url",
  "method",
  "headers",
  "tokenAt",
  "body",
  "roles",
]);

/** 秘密が入っていそうな項目名（生の値が書いてあったら言う相手）。 */
const SECRET_KEY = /pass|secret|token|credential|pin|otp|key/i;

const ENV_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** 文字列の中の `${NAME}` を環境から埋める。無い変数は落とす。 */
function expand(
  text: string,
  env: Record<string, string | undefined>,
  where: string,
): { text: string; fromEnv: boolean } {
  let fromEnv = false;
  const filled = text.replace(ENV_REF, (_, name: string) => {
    fromEnv = true;
    const value = env[name];
    if (value === undefined || value === "") {
      throw new Error(
        `環境変数 ${name} が空です（${where}）。` +
          "空のまま送ると 401 が返り、「穴が無い」と読める結果になります。",
      );
    }
    return value;
  });
  return { text: filled, fromEnv };
}

/** 本文の中の文字列を全部 [expand] にかける（map と配列を辿る）。 */
function fill(
  value: unknown,
  env: Record<string, string | undefined>,
  where: string,
  cautions: string[],
  keyName = "",
): unknown {
  if (typeof value === "string") {
    const { text, fromEnv } = expand(value, env, where);
    if (!fromEnv && SECRET_KEY.test(keyName) && value !== "") {
      cautions.push(
        `${where} の ${keyName} に生の値が書かれています` +
          "（${環境変数} で渡せます。ファイルはリポジトリに入ります）。",
      );
    }
    return text;
  }
  if (Array.isArray(value)) {
    return value.map((one) => fill(one, env, where, cautions, keyName));
  }
  if (isDict(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, one] of Object.entries(value)) {
      out[key] = fill(one, env, where, cautions, key);
    }
    return out;
  }
  return value;
}

/**
 * `login.json` を読む。
 *
 * 知らないキーはエラーにする（設定が黙って効かないと、資格を取ったつもりで
 * 取れていない＝「穴だらけ」という嘘の報告になる）。
 */
export function parseLogin(
  json: string,
  env: Record<string, string | undefined> = {},
): LoginPlan {
  const bad = (why: string): never => {
    throw new Error(`--login の JSON が読めません: ${why}`);
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return bad(String(error));
  }
  if (!isDict(parsed)) return bad("上は map で書いてください。");
  for (const key of Object.keys(parsed)) {
    if (!PLAN_KEYS.has(key)) {
      return bad(`知らないキー "${key}"（書けるのは ${[...PLAN_KEYS].join(" / ")}）。`);
    }
  }
  const url = parsed.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return bad('url を "http://…" の形で書いてください。');
  }
  const method = parsed.method ?? "POST";
  if (method !== "POST") {
    return bad(
      `method は POST だけです（${String(method)} は送れません）。` +
        "GET だと利用者名と合言葉が問い合わせ文字列に載り、サーバのログに残ります。",
    );
  }
  const tokenAt = parsed.tokenAt;
  if (typeof tokenAt !== "string" || tokenAt === "") {
    return bad('tokenAt に返りの中のトークンの場所を書いてください（例 "accessToken"）。');
  }
  const cautions: string[] = [];
  const headers: Record<string, string> = {};
  if (parsed.headers !== undefined) {
    if (!isDict(parsed.headers)) return bad("headers は map で書いてください。");
    for (const [key, value] of Object.entries(parsed.headers)) {
      if (typeof value !== "string") return bad(`headers の "${key}" が文字列ではありません。`);
      headers[key] = expand(value, env, `headers.${key}`).text;
    }
  }
  const roles: Record<string, unknown> = {};
  if (parsed.roles !== undefined) {
    if (!isDict(parsed.roles)) {
      return bad('roles は { "hr": { … } } の形で書いてください。');
    }
    for (const [role, body] of Object.entries(parsed.roles)) {
      if (role === "") return bad("役割名が空です。");
      roles[role] = fill(body, env, `roles.${role}`, cautions);
    }
  }
  const body =
    parsed.body === undefined ? undefined : fill(parsed.body, env, "body", cautions);
  if (body === undefined && Object.keys(roles).length === 0) {
    return bad("body か roles のどちらかが要ります（何を送るか書いてください）。");
  }
  return { url, method: "POST", headers, tokenAt, body, roles, cautions };
}

/** その役割で送る本文（役割ごとの指定が無ければ共通の body）。 */
export const bodyFor = (plan: LoginPlan, role: string): unknown =>
  role in plan.roles ? plan.roles[role] : plan.body;

/** 値を全部 `***` にした写し（`--dry-run` に出すのはこれ）。 */
export function masked(value: unknown): unknown {
  if (typeof value === "string") return "***";
  if (Array.isArray(value)) return value.map(masked);
  if (isDict(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, one] of Object.entries(value)) out[key] = masked(one);
    return out;
  }
  return value;
}

/**
 * 返ってきた JSON からトークンを拾う。
 *
 * 見つからないときは**何が返ってきたか（キーの名前だけ）**を言う。値を出すと、トークン
 * そのものがログに残る。
 */
export function tokenFrom(
  answer: unknown,
  tokenAt: string,
): { token: string } | { error: string } {
  const shape = isDict(answer)
    ? `{${Object.keys(answer).join(", ")}}`
    : "（map ではありません）";
  const missing = {
    error: `${tokenAt} が返りの中にありません（返ってきたのは ${shape}）`,
  };
  let here: unknown = answer;
  for (const step of tokenAt.split(".")) {
    if (!isDict(here)) return missing;
    here = here[step];
  }
  if (typeof here === "string" && here !== "") return { token: here };
  return missing;
}
