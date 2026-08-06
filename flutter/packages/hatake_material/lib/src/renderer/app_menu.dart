part of '../material_renderer.dart';

/// The app navigation menu: renders the menu tree with **group headings** and
/// indented leaves, role-gated. Used both as the wide-layout sidebar and as the
/// Drawer contents.
class _AppMenu extends StatelessWidget {
  final List<MenuItem> menu;
  final Set<String> roles;
  final String? currentPageId;
  final ValueChanged<String> onSelect;

  const _AppMenu({
    required this.menu,
    required this.roles,
    required this.currentPageId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [for (final item in menu) ..._buildNode(context, item, 0)],
    );
  }

  List<Widget> _buildNode(BuildContext context, MenuItem item, int depth) {
    if (!isAllowed(item.roles, roles)) return const [];

    if (item.isGroup) {
      final children = [
        for (final child in item.children) ..._buildNode(context, child, depth + 1),
      ];
      // Hide a group whose children are all gated away.
      if (children.isEmpty) return const [];
      final theme = Theme.of(context);
      return [
        Padding(
          padding: EdgeInsets.only(left: 16 + depth * 12, top: 12, bottom: 4),
          child: Text(
            item.label,
            key: Key('hatake.menu.group.${item.label}'),
            style: theme.textTheme.labelMedium
                ?.copyWith(color: theme.colorScheme.outline),
          ),
        ),
        ...children,
      ];
    }

    final page = item.page;
    if (page == null) return const [];
    return [
      ListTile(
        key: Key('hatake.menu.${item.id ?? page}'),
        leading: Icon(_iconFor(item.icon)),
        title: Text(item.label),
        selected: page == currentPageId,
        dense: true,
        contentPadding: EdgeInsets.only(left: 16 + depth * 12, right: 8),
        onTap: () => onSelect(page),
      ),
    ];
  }
}

/// Flattens the menu tree to the leaves the current roles may see.
List<MenuItem> _visibleLeaves(List<MenuItem> menu, Set<String> roles) {
  final out = <MenuItem>[];
  for (final item in menu) {
    if (!isAllowed(item.roles, roles)) continue;
    if (item.isGroup) {
      out.addAll(_visibleLeaves(item.children, roles));
    } else if (item.page != null) {
      out.add(item);
    }
  }
  return out;
}

/// Maps a menu icon name to a Material icon (small built-in set; default box).
IconData _iconFor(String? name) {
  switch (name) {
    case 'people':
      return Icons.people;
    case 'settings':
      return Icons.settings;
    case 'dashboard':
      return Icons.dashboard;
    case 'list':
      return Icons.list;
    case 'inventory':
      return Icons.inventory_2;
    case 'insights':
      return Icons.insights;
    case 'bar_chart':
      return Icons.bar_chart;
    case 'table_rows':
      return Icons.table_rows;
    case 'edit_note':
      return Icons.edit_note;
    case 'home':
      return Icons.home;
    case 'search':
      return Icons.search;
    case 'receipt_long':
      return Icons.receipt_long;
    case 'description':
      return Icons.description;
    case 'person':
      return Icons.person;
    case 'business':
      return Icons.business;
    case 'calendar_month':
      return Icons.calendar_month;
    default:
      return Icons.folder_outlined;
  }
}
