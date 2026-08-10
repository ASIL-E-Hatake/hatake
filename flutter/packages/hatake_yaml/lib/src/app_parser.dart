import 'package:hatake_core/hatake_core.dart';

import 'definition_parser.dart';
import 'map_readers.dart';
import 'parse_exception.dart';

/// Converts a normalized app document into an [AppDefinition].
///
/// The map may be the whole document (`{dsl_version, app: {...}}`) or the app
/// map directly. Pages are parsed by the shared [parsePageMap].
AppDefinition parseAppMap(Map<String, Object?> root) {
  final dslVersion = root.optString('dsl_version');
  final app = root.optMap('app') ?? root;
  final menu = app.optList('menu');
  final pages = app.optList('pages');
  return AppDefinition(
    id: app.reqString('id', at: 'app.id'),
    title: app.reqString('title', at: 'app.title'),
    dslVersion: dslVersion ?? kDslVersion,
    home: app.optString('home'),
    theme: _parseTheme(app.optMap('theme')),
    menu: [
      for (var i = 0; i < menu.length; i++)
        _parseMenu(_asMap(menu[i], 'app.menu[$i]')),
    ],
    pages: [
      for (var i = 0; i < pages.length; i++)
        parsePageMap(_asMap(pages[i], 'app.pages[$i]')),
    ],
  );
}

/// Reads `app.theme`. Colours and the two closed vocabularies are checked here:
/// a colour or a density that is silently ignored is the worst outcome, since
/// the definition looks right and the screen does not change.
ThemeDefinition? _parseTheme(Map<String, Object?>? m) {
  if (m == null) return null;
  return ThemeDefinition(
    primaryColor: _color(m, 'primaryColor'),
    secondaryColor: _color(m, 'secondaryColor'),
    brightness: _oneOf(m, 'brightness', Brightnesses.all, Brightnesses.light),
    density: _oneOf(m, 'density', Densities.all, Densities.standard),
    fontFamily: m.optString('fontFamily'),
    radius: m.optDouble('radius'),
    config: m.optMap('config') ?? const {},
  );
}

String? _color(Map<String, Object?> m, String key) {
  final value = m.optString(key);
  if (value == null) return null;
  if (argbOf(value) == null) {
    throw DefinitionParseException(
      'Expected a colour like #RRGGBB, got "$value"',
      path: 'app.theme.$key',
    );
  }
  return value;
}

String _oneOf(
  Map<String, Object?> m,
  String key,
  Set<String> allowed,
  String orElse,
) {
  final value = m.optString(key);
  if (value == null) return orElse;
  if (!allowed.contains(value)) {
    throw DefinitionParseException(
      'Expected one of ${allowed.join(" / ")}, got "$value"',
      path: 'app.theme.$key',
    );
  }
  return value;
}

MenuItem _parseMenu(Map<String, Object?> m) {
  final items = m.optList('items');
  // A node with `group`/`items` is a group; otherwise a leaf opening a page.
  if (items.isNotEmpty || m['group'] != null) {
    return MenuItem(
      label: m.optString('group') ?? m.optString('label') ?? '',
      roles: [for (final r in m.optList('roles')) r.toString()],
      children: [
        for (var i = 0; i < items.length; i++)
          _parseMenu(_asMap(items[i], 'menu.items[$i]')),
      ],
    );
  }
  return MenuItem(
    id: m.optString('id') ?? m.optString('page'),
    label: m.reqString('label', at: 'menu.label'),
    icon: m.optString('icon'),
    page: m.optString('page'),
    roles: [for (final r in m.optList('roles')) r.toString()],
  );
}

Map<String, Object?> _asMap(Object? node, String path) {
  if (node is Map<String, Object?>) return node;
  throw DefinitionParseException('Expected a mapping', path: path);
}
