/// hatake_encoding — 文字コード変換の opt-in アダプタ。
///
/// Framework は CSV などの**文字列を作るところまで**で、ファイルを書くのは出力先
/// （`HatakeScope(exportSink:)`）の責務。文字コード変換も同じ理由でこちら側にある。
/// 使わない人が Shift_JIS の変換表を抱えないよう、別パッケージにしてある。
///
/// ```dart
/// final encodings = EncodingRegistry();
///
/// HatakeScope(
///   exportSink: (request) async {
///     // 定義の `config.charset` が request.charset に入っている（既定は utf-8）。
///     final bytes = encodings.encode(request.charset, request.text);
///     await save(request.filename, bytes);
///   },
///   ...
/// );
/// ```
library;

export 'src/encoding_registry.dart';
export 'src/japanese_codec.dart';
