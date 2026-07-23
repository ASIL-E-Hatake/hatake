/// hatake_yaml — converts YAML / JSON definition documents into hatake_core
/// [PageDefinition]s.
///
/// YAML and JSON are normalized to the same map shape and pass through the same
/// [parsePageMap], guaranteeing both formats converge on an identical
/// definition.
library;

export 'src/definition_parser.dart' show parsePageMap;
export 'src/parse_exception.dart';
export 'src/source_loaders.dart';
