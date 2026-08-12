// 未知キーの検出（strict パース）。
//
// 既定のパーサは知らないキーを黙って捨てる。それは人間には「書いたのに効かない」、
// AI には「間違いに気づけない」という形で刺さるので、**書いたキーが本当に効くのか**
// を機械で言えるようにする。
//
// 厳しさは [JSON Schema](../../../../../spec/hatake-page.schema.json) と完全に同じ:
// `additionalProperties: false` のノードだけを閉じ、`config` / `validators` /
// `computed` / `visibleWhen` のような**自由な入れ物の中は見ない**。
// この対応は `strict_keys_schema_test.dart` が機械的に確認している。

import 'unknown_key.dart';

/// 閉じたノードごとの既知キー。名前は JSON Schema の `$defs` と揃えている
/// （`<親>.<キー>` はスキーマ側で入れ子に直接書かれているもの）。
///
/// 公開しているのは2つの理由から: スキーマとのズレを検査するテストが読むため、
/// そして「このノードに何が書けるか」を引く道具（リファレンス生成）に使うため。
const Map<String, Set<String>> strictKeyTable = {
  '': {'dsl_version', 'page', 'app'},
  'app': {'id', 'title', 'home', 'theme', 'menu', 'pages'},
  'theme': {
    'primaryColor',
    'secondaryColor',
    'brightness',
    'density',
    'fontFamily',
    'radius',
    'config',
  },
  'menuItem': {'id', 'label', 'group', 'icon', 'page', 'items', 'roles'},
  'crudPage': {
    'type', 'id', 'title', 'repository', 'key', 'search', 'table', 'form',
    'actions',
  },
  'masterPage': {
    'type', 'id', 'title', 'repository', 'key', 'search', 'table', 'form',
    'actions',
  },
  'searchPage': {
    'type', 'id', 'title', 'repository', 'key', 'search', 'table', 'actions',
  },
  'detailPage': {'type', 'id', 'title', 'repository', 'key', 'form', 'actions'},
  'formPage': {'type', 'id', 'title', 'repository', 'key', 'form', 'actions'},
  'wizardPage': {
    'type', 'id', 'title', 'repository', 'key', 'steps', 'actions',
  },
  'wizardStep': {'id', 'title', 'description', 'layout', 'fields'},
  'dashboardPage': {
    'type', 'id', 'title', 'repository', 'layout', 'search', 'items', 'actions',
  },
  'dashboardItem': {
    'id', 'title', 'type', 'repository', 'span', 'filters', 'limit', 'sort',
    'value', 'format', 'config', 'columns', 'chart', 'action', 'roles',
  },
  'dashboardItem.sort': {'field', 'ascending'},
  'dashboardValue': {'aggregate', 'field'},
  'chart': {'kind', 'labelField', 'valueField', 'aggregate'},
  'reportPage': {
    'type', 'id', 'title', 'repository', 'search', 'table', 'report', 'actions',
  },
  'report': {'paper', 'rowsPerPage', 'limit', 'sort', 'groupBy', 'totals'},
  'report.sort': {'field', 'ascending'},
  'paper': {'size', 'orientation'},
  'reportGroup': {'field', 'label', 'pageBreak'},
  'reportTotal': {'field', 'aggregate'},
  'search': {'layout', 'filters'},
  'filter': {
    'field', 'label', 'type', 'operator', 'options', 'optionsFrom',
    'optionsSource', 'config',
  },
  'table': {'columns', 'pagination', 'rowActions'},
  'column': {
    'field', 'label', 'type', 'width', 'sortable', 'format', 'config', 'roles',
  },
  'pagination': {'pageSize', 'enabled'},
  'form': {'sections'},
  'section': {'title', 'layout', 'fields', 'visibleWhen'},
  'field': {
    'field', 'label', 'type', 'required', 'requiredWhen', 'readOnly',
    'readOnlyWhen', 'defaultValue', 'validators', 'options', 'optionsFrom',
    'optionsSource', 'format', 'normalize', 'config', 'visibleWhen',
    'enabledWhen', 'computed', 'roles', 'columns', 'fields', 'source',
  },
  'optionsSource': {'repository', 'value', 'label', 'parentKey', 'limit'},
  'subTableSource': {'repository', 'parentKey', 'key', 'pageSize'},
  'action': {
    'id', 'type', 'label', 'plugin', 'page', 'params', 'confirm', 'onSuccess',
    'config', 'roles',
  },
  'confirm': {'title', 'message', 'okLabel', 'cancelLabel', 'danger'},
  'actionSuccess': {'message', 'page', 'params'},
  'option': {'value', 'label', 'when'},
  'layout': {'columns'},
};

/// 子ノードへの道。値は行き先のノード名（`[]` 付きはそのノードの配列）。
/// ここに無いキーは葉、または**自由な入れ物**なので中を見ない。
const Map<String, Map<String, String>> _children = {
  '': {'app': 'app', 'page': 'page'},
  'app': {'theme': 'theme', 'menu': 'menuItem[]', 'pages': 'page[]'},
  'menuItem': {'items': 'menuItem[]'},
  'action': {'confirm': 'confirm', 'onSuccess': 'actionSuccess'},
  'crudPage': {
    'search': 'search', 'table': 'table', 'form': 'form', 'actions': 'action[]',
  },
  'masterPage': {
    'search': 'search', 'table': 'table', 'form': 'form', 'actions': 'action[]',
  },
  'searchPage': {'search': 'search', 'table': 'table', 'actions': 'action[]'},
  'detailPage': {'form': 'form', 'actions': 'action[]'},
  'formPage': {'form': 'form', 'actions': 'action[]'},
  'wizardPage': {'steps': 'wizardStep[]', 'actions': 'action[]'},
  'wizardStep': {'layout': 'layout', 'fields': 'field[]'},
  'dashboardPage': {
    'layout': 'layout',
    'search': 'search',
    'items': 'dashboardItem[]',
    'actions': 'action[]',
  },
  'dashboardItem': {
    'sort': 'dashboardItem.sort',
    'value': 'dashboardValue',
    'chart': 'chart',
    'columns': 'column[]',
  },
  'reportPage': {
    'search': 'search',
    'table': 'table',
    'report': 'report',
    'actions': 'action[]',
  },
  'report': {
    'paper': 'paper',
    'sort': 'report.sort',
    'groupBy': 'reportGroup[]',
    'totals': 'reportTotal[]',
  },
  'search': {'layout': 'layout', 'filters': 'filter[]'},
  'filter': {'options': 'option[]', 'optionsSource': 'optionsSource'},
  'table': {'columns': 'column[]', 'pagination': 'pagination'},
  'form': {'sections': 'section[]'},
  'section': {'layout': 'layout', 'fields': 'field[]'},
  'field': {
    'options': 'option[]',
    'optionsSource': 'optionsSource',
    'columns': 'column[]',
    'fields': 'field[]',
    'source': 'subTableSource',
  },
};

/// `page.type` → 閉じたページノード名。未知の種別は null（種別エラーの領分）。
const Map<String, String> _pageNodes = {
  'crud': 'crudPage',
  'master': 'masterPage',
  'search': 'searchPage',
  'detail': 'detailPage',
  'form': 'formPage',
  'wizard': 'wizardPage',
  'dashboard': 'dashboardPage',
  'report': 'reportPage',
};

/// [document]（YAML/JSON をデコードしたマップ）の中の未知キーを全部返す。
///
/// 1件目で止めない: AI も人も1往復で直したいので**まとめて**返す。
/// 並びは `(path, key)` の昇順（言語をまたいで同じ順序にするため）。
List<UnknownKey> findUnknownKeys(Map<String, Object?> document) {
  final found = <UnknownKey>[];
  _walk('', document, '', found);
  found.sort((a, b) {
    final byPath = a.path.compareTo(b.path);
    return byPath != 0 ? byPath : a.key.compareTo(b.key);
  });
  return found;
}

void _walk(
  String node,
  Object? value,
  String path,
  List<UnknownKey> found,
) {
  if (value is! Map) return;
  final map = value.cast<String, Object?>();
  final resolved = node == 'page' ? _pageNodes[map['type']] : node;
  if (resolved == null) return; // 未知のページ種別: パーサが型で弾く
  final known = strictKeyTable[resolved];
  if (known == null) return;

  for (final entry in map.entries) {
    if (!known.contains(entry.key)) {
      found.add(UnknownKey(
        path: path,
        key: entry.key,
        suggestion: closestKey(entry.key, known),
      ));
      continue;
    }
    final target = _children[resolved]?[entry.key];
    if (target == null) continue; // 葉、または自由な入れ物
    final childPath = path.isEmpty ? entry.key : '$path.${entry.key}';
    if (target.endsWith('[]')) {
      final childNode = target.substring(0, target.length - 2);
      final list = entry.value;
      if (list is List) {
        for (var i = 0; i < list.length; i++) {
          _walk(childNode, list[i], '$childPath[$i]', found);
        }
      }
    } else {
      _walk(target, entry.value, childPath, found);
    }
  }
}
