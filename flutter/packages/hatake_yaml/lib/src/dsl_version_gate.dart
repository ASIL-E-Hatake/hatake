// `dsl_version` を受け取る（**読めない版は落とす**）。
//
// 判定は [checkDslVersion]（hatake_core・3版で同じ）。ここが持つのは「落とし方」だけ。
// 新しい minor は落とさずに読む＝言うのは検証の側（`dsl-version-newer`）で、解析は
// 黙って通す。

import 'package:hatake_core/hatake_core.dart';

import 'parse_exception.dart';

/// 書いてあった字（無ければ `null`）を受け取り、読める版だけを返す。
String acceptDslVersion(String? raw) {
  final verdict = checkDslVersion(raw);
  if (verdict.fatal) {
    throw DefinitionParseException(dslVersionMessage(verdict), path: 'dsl_version');
  }
  return verdict.version;
}
