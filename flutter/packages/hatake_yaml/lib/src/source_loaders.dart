import 'dart:convert';

import 'package:hatake_core/hatake_core.dart';
import 'package:yaml/yaml.dart';

import 'app_parser.dart';
import 'definition_parser.dart';
import 'normalize.dart';
import 'parse_exception.dart';
import 'strict_keys.dart';
import 'unknown_key.dart';

/// Parses a YAML app document into an [AppDefinition].
///
/// With [strict] the document must not contain a single unknown key (see
/// [findUnknownKeys]); a typo becomes an [UnknownKeysException] instead of
/// silently doing nothing.
AppDefinition parseAppYaml(String source, {bool strict = false}) =>
    _app(_decodeYaml(source), strict);

/// Parses a JSON app document into an [AppDefinition].
AppDefinition parseAppJson(String source, {bool strict = false}) =>
    _app(_decodeJson(source), strict);

/// Parses a YAML definition document into a [PageDefinition].
PageDefinition parsePageYaml(String source, {bool strict = false}) =>
    _page(_decodeYaml(source), strict);

/// Parses a JSON definition document into a [PageDefinition].
PageDefinition parsePageJson(String source, {bool strict = false}) =>
    _page(_decodeJson(source), strict);

/// Parse first (a missing `type` or `id` is the more fundamental problem), then
/// report unknown keys.
PageDefinition _page(Map<String, Object?> root, bool strict) {
  final page = parsePageMap(root);
  if (strict) _checkKeys(root);
  return page;
}

AppDefinition _app(Map<String, Object?> root, bool strict) {
  final app = parseAppMap(root);
  if (strict) _checkKeys(root);
  return app;
}

void _checkKeys(Map<String, Object?> root) {
  final unknown = findUnknownKeys(root);
  if (unknown.isNotEmpty) throw UnknownKeysException(unknown);
}

Map<String, Object?> _decodeYaml(String source) {
  final Object? decoded;
  try {
    decoded = loadYaml(source);
  } on YamlException catch (e) {
    throw DefinitionParseException('Invalid YAML: ${e.message}');
  }
  return _asRoot(normalizeNode(decoded), 'YAML');
}

Map<String, Object?> _decodeJson(String source) {
  final Object? decoded;
  try {
    decoded = jsonDecode(source);
  } on FormatException catch (e) {
    throw DefinitionParseException('Invalid JSON: ${e.message}');
  }
  return _asRoot(normalizeNode(decoded), 'JSON');
}

Map<String, Object?> _asRoot(Object? normalized, String format) {
  if (normalized is! Map<String, Object?>) {
    throw DefinitionParseException('Top-level $format must be a mapping/object');
  }
  return normalized;
}
