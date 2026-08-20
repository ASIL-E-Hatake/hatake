/// hatake_http — 定義が宣言している REST API と話す Repository（opt-in アダプタ）。
///
/// `hatake openapi` が定義から吐く API 仕様と**同じ形**で通信する。つまり
/// 「サーバの仕様」と「クライアントの実装」が2つの推測ではなく、1つの宣言の
/// 言い直しになる。
///
/// ```dart
/// repositories: restRepositories(
///   baseUrl: '/api',
///   send: send,                       // 送るのはアプリ（下記）
///   collections: {'orderRepository': 'orders'},
/// )
/// ```
///
/// **通信そのものは持たない。** [HttpSend] という関数1つを受け取るだけなので、
/// このパッケージの依存は `hatake_core` だけ（`package:http` でも dio でも
/// 社内のインターセプタでも差せる。web でも動く）。
library;

export 'src/http_failure.dart';
export 'src/http_send.dart';
export 'src/rest_repository.dart';
