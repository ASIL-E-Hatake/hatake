/// hatake_yaml — converts YAML / JSON definition documents into hatake_core
/// [PageDefinition]s.
///
/// YAML and JSON are normalized to the same map shape and pass through the same
/// [parsePageMap], guaranteeing both formats converge on an identical
/// definition.
library;

export 'src/app_parser.dart' show parseAppMap;
export 'src/definition_parser.dart' show parsePageMap;
export 'src/parse_exception.dart';
export 'src/screen_index_source.dart' show IndexInput, buildScreenIndex;
export 'src/source_loaders.dart';
export 'src/strict_keys.dart' show findUnknownKeys, strictKeyTable;
export 'src/unknown_key.dart' show UnknownKey, UnknownKeysException;
