import 'package:equatable/equatable.dart';

import 'app_navigation.dart';
import 'menu_item.dart';
import 'page_definition.dart';
import 'theme_definition.dart';

/// An application: a set of [pages] composed by a navigation [menu].
///
/// The top-level definition above [PageDefinition]. Rendering (shell + routing)
/// is a Renderer concern; this model just describes the structure.
class AppDefinition extends Equatable {
  /// Stable app identifier.
  final String id;

  /// App title (shown in the shell).
  final String title;

  /// DSL version this definition targets.
  final String dslVersion;

  /// Initial route: the menu item [MenuItem.id] (or page id) to open first.
  /// Null = the first leaf in [menu].
  final String? home;

  /// How the app looks (brand colour, density…). Null = the renderer's default.
  final ThemeDefinition? theme;

  /// Navigation menu (tree of leaves and groups).
  final List<MenuItem> menu;

  /// Pages this app is composed of; referenced by id from [menu] and
  /// `navigate` actions.
  final List<PageDefinition> pages;

  /// 画面をどう開くか（[AppNavigation]）。既定は `single`＝1画面ずつ。
  ///
  /// 定義が言うのは**その業務システムの既定**で、アプリ側（`HatakeApp(navigation:)`）で
  /// 上書きできる（同じ定義を PC ではタブ、タブレットでは遷移で出す）。
  final String navigation;

  const AppDefinition({
    required this.id,
    required this.title,
    this.dslVersion = kDslVersion,
    this.home,
    this.theme,
    this.navigation = AppNavigation.single,
    this.menu = const [],
    this.pages = const [],
  });

  /// Looks up a page by its id, or null when absent.
  PageDefinition? pageById(String id) {
    for (final page in pages) {
      if (page.id == id) return page;
    }
    return null;
  }

  @override
  List<Object?> get props =>
      [id, title, dslVersion, home, theme, navigation, menu, pages];
}
