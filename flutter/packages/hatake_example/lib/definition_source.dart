/// Slices the raw app YAML so the demo can show "this screen came from this
/// definition". Demo-only helper — not part of the framework.
///
/// Returns the `pages:` entry whose `id:` is [pageId], de-indented so it reads
/// as a standalone page definition (i.e. what you would write under `page:`),
/// or null when the id isn't found.
String? extractPageYaml(String source, String pageId) {
  final lines = source.split('\n');

  // Only look inside `app: pages:` — the `menu:` list also uses `- ` entries.
  final pagesAt = lines.indexWhere((l) => RegExp(r'^\s{2}pages:\s*$').hasMatch(l));
  if (pagesAt < 0) return null;

  final starts = <int>[];
  var stop = lines.length;
  for (var i = pagesAt + 1; i < lines.length; i++) {
    final line = lines[i];
    if (line.trim().isEmpty) continue;
    final indent = line.length - line.trimLeft().length;
    if (indent <= 2) {
      stop = i; // dedented back out of the pages: block
      break;
    }
    if (indent == 4 && line.trimLeft().startsWith('- ')) starts.add(i);
  }

  for (var e = 0; e < starts.length; e++) {
    final from = starts[e];
    final to = e + 1 < starts.length ? starts[e + 1] : stop;
    final block = lines.sublist(from, to);
    if (block.any((l) => l.trim() == 'id: $pageId')) {
      return _dedent(block);
    }
  }
  return null;
}

/// Drops the list indentation (`    - ` / 6 spaces) so the block starts at
/// column 0 and stays copy-pasteable.
String _dedent(List<String> block) {
  return block
      .map((l) => l.length >= 6 ? l.substring(6) : l.trimLeft())
      .join('\n')
      .trimRight();
}
