import 'dart:convert';

import 'package:hatake_core/hatake_core.dart';
import 'package:yaml/yaml.dart';

import 'definition_parser.dart';
import 'normalize.dart';
import 'parse_exception.dart';

/// Parses a YAML definition document into a [PageDefinition].
PageDefinition parsePageYaml(String source) {
  final Object? decoded;
  try {
    decoded = loadYaml(source);
  } on YamlException catch (e) {
    throw DefinitionParseException('Invalid YAML: ${e.message}');
  }
  return _fromDecoded(normalizeNode(decoded), format: 'YAML');
}

/// Parses a JSON definition document into a [PageDefinition].
PageDefinition parsePageJson(String source) {
  final Object? decoded;
  try {
    decoded = jsonDecode(source);
  } on FormatException catch (e) {
    throw DefinitionParseException('Invalid JSON: ${e.message}');
  }
  return _fromDecoded(normalizeNode(decoded), format: 'JSON');
}

PageDefinition _fromDecoded(Object? normalized, {required String format}) {
  if (normalized is! Map<String, Object?>) {
    throw DefinitionParseException('Top-level $format must be a mapping/object');
  }
  return parsePageMap(normalized);
}
