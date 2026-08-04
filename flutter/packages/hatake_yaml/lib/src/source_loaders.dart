import 'dart:convert';

import 'package:hatake_core/hatake_core.dart';
import 'package:yaml/yaml.dart';

import 'app_parser.dart';
import 'definition_parser.dart';
import 'normalize.dart';
import 'parse_exception.dart';

/// Parses a YAML app document into an [AppDefinition].
AppDefinition parseAppYaml(String source) =>
    parseAppMap(_decodeYaml(source));

/// Parses a JSON app document into an [AppDefinition].
AppDefinition parseAppJson(String source) =>
    parseAppMap(_decodeJson(source));

/// Parses a YAML definition document into a [PageDefinition].
PageDefinition parsePageYaml(String source) => parsePageMap(_decodeYaml(source));

/// Parses a JSON definition document into a [PageDefinition].
PageDefinition parsePageJson(String source) => parsePageMap(_decodeJson(source));

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
