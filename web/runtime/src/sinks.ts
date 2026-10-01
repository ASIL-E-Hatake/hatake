import type { FormatterRegistry } from "@hatake-fw/api";
import type { ReportPageDefinition } from "@hatake-fw/api/internal";

/**
 * 枠組みが作った「持ち出すもの」と「刷るもの」を、外に渡す口。
 *
 * **枠組みは中身を作るだけで、ファイルを書かない・落とさない・共有しない。**
 * それは動く場所（ブラウザ・Electron・社内の配信）の話なので、アプリが受け取る。
 * ブラウザでそのまま保存するだけなら、出来合いの口（`downloadCsv` / `downloadPdf`）を
 * **アプリが登録すれば**足りる（登録しない限り、枠組みは何も書かない）。
 *
 * 登録しないまま `export` のボタンを押したときに**黙って何も起きない**のではなく、
 * 「出す口が登録されていない」と言うのが大事な所（この枠組みが潰してきた事故）。
 */

/** 枠組みが作って、人に渡したいファイル。 */
export interface ExportRequest {
  /** 付けたいファイル名（拡張子まで。例 `受注一覧.csv`）。 */
  readonly filename: string;
  /** [[text]] の MIME 型。UTF-8 でないときは charset も付く。 */
  readonly mimeType: string;
  /**
   * 中身そのもの。定義が求めていて**かつ** UTF-8 のときは BOM が付いた状態で来るので、
   * そのまま UTF-8 で書けば足りる。
   */
  readonly text: string;
  /**
   * 定義が求めた文字コード（`config.charset`、既定は `utf-8`）。
   *
   * **枠組みは変換しない。** 字を作って「受け取る側が何を欲しがっているか」を言うだけで、
   * バイトにするのはこの口の仕事。
   */
  readonly charset: string;
  /** どのボタンから出たか（`config` を読みたい口のため）。 */
  readonly actionId: string;
}

/**
 * [[ExportRequest]] を受け取って人に届ける — ブラウザの保存、共有、社内への送信。
 *
 * ブラウザで普通にやるなら `Blob` と `<a download>` で足りる（出来合いが `downloadCsv`）。
 * **既定にしない**のは、社内配信や Electron の保存先が案件ごとに違うため。
 */
export type ExportSink = (request: ExportRequest) => Promise<void> | void;

/**
 * 枠組みが組み立てた「刷るもの」。
 *
 * 紙に組む材料（帳票の定義・刷る人の役割・見せ方・`config`）も一緒に来る（0.9.25）。
 * 0.9.24 までは組んだ中身（`document`）だけで、PDF にするのに要る定義が届かなかった
 * （Flutter の `PrintRequest` は材料ごと渡していた）。
 */
export interface PrintRequest {
  /** 付けたいファイル名。 */
  readonly filename: string;
  /** 紙の中身（帳票の組版結果＝`ReportDocument`。画面に出ているのと同じ紙）。 */
  readonly document: unknown;
  /** どのボタンから出たか。 */
  readonly actionId: string;
  /** 帳票の定義（紙に組むのに要る）。帳票の画面からなら必ず在る。 */
  readonly page?: ReportPageDefinition;
  /** 刷る人の役割（**見えない列は刷らない**）。 */
  readonly roles: readonly string[];
  /** 画面と同じ見せ方（金額・日付）。 */
  readonly formatters: FormatterRegistry;
  /** ボタンの `config`（`filename` 以外は枠組みは読まない＝刷る口に任せる）。 */
  readonly config: Readonly<Record<string, unknown>>;
}

/** [[PrintRequest]] を受け取って刷る／PDF にする口。 */
export type PrintSink = (request: PrintRequest) => Promise<void> | void;
