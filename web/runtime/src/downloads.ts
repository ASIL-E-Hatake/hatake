/**
 * 出来合いの出力先（0.9.25）。**ブラウザでファイルとして保存するだけ**の口。
 *
 * 枠組みは今までどおり、登録された口に渡すだけで自分では書かない。これは「アプリが
 * 登録すれば使える既製品」で、**登録しない限り効かない**（`exportSink: downloadCsv` と
 * 書くので、`hatake registry` の申告にも静的な走査にもそのまま出る）。
 *
 * 0.9.24 までは見本が自前で `Blob` と `<a download>` を書き、刷る口は `window` に紙を
 * 置くだけだった（PDF ができない）。社内配信や Electron の保存先は案件ごとに違うので、
 * そこへ送りたいアプリは今までどおり自分の口を登録する。
 */
import type { ReportDocument } from "@hatake-fw/api/internal";
import { documentPdf, isUtf8Charset } from "@hatake-fw/api/internal";

import type { ExportSink, PrintRequest, PrintSink } from "./sinks.js";

/**
 * CSV をそのまま保存する。
 *
 * **UTF-8 でない文字コード（`config.charset: cp932` など）は断る。** ブラウザが自分で
 * 書けるのは UTF-8 だけで、cp932 の表（約 132KB）は持ち込んでいない。黙って UTF-8 で
 * 出すと、Excel で開いた人が文字化けを見るまで誰も気づかない（見本が実際にそうだった）。
 * 断った文は押した人に出る（押したボタンの失敗として）。
 */
export const downloadCsv: ExportSink = (request) => {
  if (!isUtf8Charset(request.charset)) {
    throw new Error(
      `${request.charset} の CSV はブラウザの出来合いの出力先（downloadCsv）では作れません` +
        "（UTF-8 しか書けません）。charset を外して UTF-8 で出すか、変換する出力先を登録してください。",
    );
  }
  // BOM は定義が求めたときに既に入っている（ここで足すと二重になる）。
  saveFile(request.filename, request.mimeType, request.text);
};

/** 帳票を PDF にして保存する（紙の組み方は画面と同じ・書体は埋め込まないゴシック）。 */
export const downloadPdf: PrintSink = (request) => {
  saveFile(request.filename, "application/pdf", printPdf(request));
};

/**
 * 刷る頼みを PDF のバイト列にする（保存はしない）。
 *
 * 保存先が案件ごとに違うアプリ（社内へ送る・Electron で書く）は、これでバイト列だけ
 * 作って自分の口で送ればよい。行が無い紙（0枚）は投げる＝「刷った」ことにしない。
 */
export function printPdf(request: PrintRequest): Uint8Array {
  if (request.page === undefined) {
    throw new Error(
      "帳票の定義が届いていません（PDF に組めません）。帳票の画面の刷るボタンから呼んでください。",
    );
  }
  return documentPdf(request.page, request.document as ReportDocument, {
    formatters: request.formatters,
    roles: request.roles,
  });
}

/** ブラウザに保存させる（`<a download>`）。 */
function saveFile(filename: string, type: string, data: string | Uint8Array): void {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // すぐ消すと、ブラウザによっては保存が始まる前に URL が無くなる。
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
