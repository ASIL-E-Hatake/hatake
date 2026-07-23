/// Recursively converts loosely-typed decoded nodes (YamlMap / YamlList from
/// package:yaml, or `Map<String, dynamic>` / `List` from dart:convert) into
/// plain `Map<String, Object?>` and `List<Object?>` structures.
///
/// After normalization the parser can rely on a single, predictable shape
/// regardless of whether the source was YAML or JSON — the convergence point
/// before [PageDefinition].
Object? normalizeNode(Object? node) {
  if (node is Map) {
    return <String, Object?>{
      for (final entry in node.entries)
        entry.key.toString(): normalizeNode(entry.value),
    };
  }
  if (node is List) {
    return <Object?>[for (final element in node) normalizeNode(element)];
  }
  return node;
}
