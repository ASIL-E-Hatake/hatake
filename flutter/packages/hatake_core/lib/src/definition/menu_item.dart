import 'package:equatable/equatable.dart';

/// A node in an app's navigation menu (see `AppDefinition`).
///
/// Either a **leaf** (opens [page]) or a **group** (has [children]). One type
/// keeps the model small; [isGroup] distinguishes them.
class MenuItem extends Equatable {
  /// Route key for a leaf (defaults to [page] when omitted). Null for groups.
  final String? id;

  /// Display label. For a group this is the group heading.
  final String label;

  /// Optional icon name; the renderer maps it to an actual icon.
  final String? icon;

  /// Page id this leaf opens. Null for groups.
  final String? page;

  /// Child items when this is a group.
  final List<MenuItem> children;

  /// Roles allowed to see this item (see `isAllowed`). Empty = everyone.
  final List<String> roles;

  const MenuItem({
    this.id,
    required this.label,
    this.icon,
    this.page,
    this.children = const [],
    this.roles = const [],
  });

  /// True when this node groups [children] rather than opening a [page].
  bool get isGroup => children.isNotEmpty;

  @override
  List<Object?> get props => [id, label, icon, page, children, roles];
}
