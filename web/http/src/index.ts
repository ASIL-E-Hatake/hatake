// @hatake-fw/http — 定義が書いている REST をそのまま叩く Repository。
//
// **枠組みは HTTP を知らない**（`@hatake-fw/runtime` は `Repository` の5つの
// メソッドしか見ない）。知らないことと、繋ぎ方を配らないことは別なので、
// いちばん多い形（`hatake openapi` が出す OpenAPI のとおりの REST）はここが持つ。
//
// 違う形を返すサーバのためにこれを曲げない。**Repository を手で書けばよい。**
//
// Dart 側の `hatake_http` と同じ契約・同じ失敗の分け方。

export {
  fetchSend,
  RestRepository,
  restRepositories,
  type HttpHeaders,
  type HttpRequest,
  type HttpResponse,
  type HttpSend,
} from "./restRepository.js";
export {
  RepositoryHttpError,
  RepositoryShapeError,
  RepositoryUnauthorizedError,
  RepositoryValidationError,
} from "./failure.js";
