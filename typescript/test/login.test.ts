import { describe, expect, it } from "vitest";
import {
  bodyFor,
  getToken,
  loginAccounts,
  type LoginRequest,
  loginRequest,
  masked,
  parseLogin,
  tokenFrom,
} from "../src/index.js";

/// 資格の取り方を道具に持たせる（`probe` / `attack` の `--login`）。
///
/// ここで守るのは4つ。**秘密をファイルに書かせない**（値は環境から）・**空のまま
/// 送らない**（401 が返って「穴が無い」と読める結果になる）・**取ったトークンを出さない**
/// （CI のログは残る）・**役割ごとに取る**（1つの資格で全部の役割を判定すると、200 が
/// 穴なのか正しいのか区別できない）。
const FILE = JSON.stringify({
  $comment: "資格の取り方",
  url: "http://localhost:8080/auth/login",
  tokenAt: "data.accessToken",
  roles: {
    admin: { userId: "admin-probe", password: "${ADMIN_PASSWORD}" },
    staff: { userId: "staff-probe", password: "${STAFF_PASSWORD}" },
  },
});

const ENV = { ADMIN_PASSWORD: "a-pass", STAFF_PASSWORD: "s-pass" };

/** 返す本文を決める偽の資格の口。送られた要求も覚える。 */
function auth(answer: (request: LoginRequest) => { status?: number; body: string }) {
  const sent: LoginRequest[] = [];
  const send = async (request: LoginRequest) => {
    sent.push(request);
    const one = answer(request);
    return { status: one.status ?? 200, body: one.body };
  };
  return { send, sent };
}

describe("login.json を読む", () => {
  it("値は環境から埋める（ファイルには書かない）", () => {
    const plan = parseLogin(FILE, ENV);
    expect(bodyFor(plan, "admin")).toEqual({
      userId: "admin-probe",
      password: "a-pass",
    });
    expect(plan.cautions).toEqual([]);
  });

  it("環境変数が無ければ落ちる（空のまま送らない）", () => {
    expect(() => parseLogin(FILE, { ADMIN_PASSWORD: "a" })).toThrow(
      /STAFF_PASSWORD が空です/,
    );
    expect(() => parseLogin(FILE, {})).toThrow(/「穴が無い」と読める/);
  });

  it("生の合言葉が書いてあれば言う（止めはしない）", () => {
    const plan = parseLogin(
      JSON.stringify({
        url: "http://x/auth",
        tokenAt: "token",
        body: { userId: "probe", password: "hunter2" },
      }),
      {},
    );
    expect(plan.cautions).toHaveLength(1);
    expect(plan.cautions[0]).toContain("password に生の値");
    // 読めてはいる（捨ててよい環境で試す使い方が在る）。
    expect(bodyFor(plan, "")).toEqual({ userId: "probe", password: "hunter2" });
  });

  it("GET は断る（秘密が問い合わせ文字列に載る）", () => {
    expect(() =>
      parseLogin(
        JSON.stringify({ url: "http://x/auth", method: "GET", tokenAt: "t", body: {} }),
        {},
      ),
    ).toThrow(/サーバのログに残ります/);
  });

  it("知らないキーは断る（黙って効かないと、取ったつもりで取れていない）", () => {
    expect(() =>
      parseLogin(
        JSON.stringify({ url: "http://x/auth", tokenAt: "t", body: {}, retries: 3 }),
        {},
      ),
    ).toThrow(/知らないキー "retries"/);
  });

  it("何を送るかが無ければ断る", () => {
    expect(() =>
      parseLogin(JSON.stringify({ url: "http://x/auth", tokenAt: "t" }), {}),
    ).toThrow(/body か roles/);
  });

  it("送るのは POST の JSON（--dry-run に出すのも同じ組み立て）", () => {
    const request = loginRequest(parseLogin(FILE, ENV), "staff");
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://localhost:8080/auth/login");
    expect(request.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(request.body)).toEqual({
      userId: "staff-probe",
      password: "s-pass",
    });
  });

  it("値を出さない写しが作れる（--dry-run に出すのはこれ）", () => {
    const shown = JSON.stringify(masked(bodyFor(parseLogin(FILE, ENV), "admin")));
    expect(shown).not.toContain("a-pass");
    expect(shown).not.toContain("admin-probe");
    expect(JSON.parse(shown)).toEqual({ userId: "***", password: "***" });
  });
});

describe("返りからトークンを拾う", () => {
  it("点つなぎで辿る", () => {
    expect(tokenFrom({ data: { accessToken: "jwt-1" } }, "data.accessToken")).toEqual({
      token: "jwt-1",
    });
  });

  it("見つからないときは、返ってきたキーの名前だけ言う（値は出さない）", () => {
    const got = tokenFrom({ token: "jwt-2", expiresIn: 3600 }, "data.accessToken");
    expect("error" in got && got.error).toContain("{token, expiresIn}");
    expect(JSON.stringify(got)).not.toContain("jwt-2");
  });
});

describe("役割ごとに資格を取る", () => {
  it("役割ごとに1往復。取れたものは Bearer で渡す", async () => {
    const plan = parseLogin(FILE, ENV);
    const { send, sent } = auth((request) => ({
      body: JSON.stringify({
        data: { accessToken: `jwt-${JSON.parse(request.body).userId}` },
      }),
    }));
    const got = await loginAccounts(plan, ["admin", "staff"], send);

    expect(sent).toHaveLength(2);
    expect(got.accounts).toEqual({
      admin: { token: "jwt-admin-probe" },
      staff: { token: "jwt-staff-probe" },
    });
    expect(got.troubles).toEqual({});
  });

  it("取れなかった役割は理由を残す（他の役割は続ける）", async () => {
    const plan = parseLogin(FILE, ENV);
    const { send } = auth((request) =>
      JSON.parse(request.body).userId === "staff-probe"
        ? { status: 401, body: "" }
        : { body: JSON.stringify({ data: { accessToken: "jwt" } }) },
    );
    const got = await loginAccounts(plan, ["admin", "staff"], send);

    expect(Object.keys(got.accounts)).toEqual(["admin"]);
    expect(got.troubles.staff).toContain("401");
  });

  it("JSON が返らない口も、理由にして返す（落ちない）", async () => {
    const plan = parseLogin(FILE, ENV);
    const { send } = auth(() => ({ body: "<html>login</html>" }));
    const got = await getToken(plan, "admin", send);
    expect("error" in got && got.error).toContain("JSON を返していません");
  });

  it("繋がらないときも理由にする（1つの役割で全部止めない）", async () => {
    const plan = parseLogin(FILE, ENV);
    const send = async () => {
      throw new Error("ECONNREFUSED");
    };
    const got = await loginAccounts(plan, ["admin"], send);
    expect(got.accounts).toEqual({});
    expect(got.troubles.admin).toContain("ECONNREFUSED");
  });
});
