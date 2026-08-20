import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'hatake_router.dart';

/// A route as a URL: `/<pageId>` plus the route params as the query string.
///
/// Deliberately flat — one segment, because a route *is* one page id (nesting
/// would invent a hierarchy the definition does not have). Params ride in the
/// query so the path stays readable and a missing param cannot shift the page id.
///
/// ```
/// AppRoute('order_detail', params: {'orderNo': 'SO-1001'})
///   ↔ /order_detail?orderNo=SO-1001
/// ```
Uri routeToUri(AppRoute route) {
  final params = <String, String>{
    for (final entry in route.params.entries)
      if (entry.value != null) entry.key: '${entry.value}',
  };
  return Uri(
    path: '/${route.pageId}',
    queryParameters: params.isEmpty ? null : params,
  );
}

/// The route [uri] points at, or null when it points at no page of this app.
///
/// [knows] answers whether a page id exists; without it any single segment is
/// accepted. Null is the honest answer for `/`, for a deeper path and for an
/// unknown id — the caller decides what to open instead (usually home), because
/// only the caller knows what home is.
///
/// **Params come back as strings.** A URL has no types, and guessing would
/// corrupt the values that matter most (`0012` is a customer code, not 12). A
/// repository that receives its keys from a URL gets strings anyway.
AppRoute? routeFromUri(Uri uri, {bool Function(String pageId)? knows}) {
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (segments.length != 1) return null;
  final pageId = segments.single;
  if (knows != null && !knows(pageId)) return null;
  return AppRoute(pageId, params: {...uri.queryParameters});
}

/// Where the URL of the running app is read and written.
///
/// The framework owns *what* the URL says (see [routeToUri]); the browser's
/// address bar is platform I/O, so it sits behind this seam — which is also how
/// the sync gets tested without a browser.
abstract interface class RouteUrl {
  /// The URL the app was opened with, or null when there was none.
  Uri? get initial;

  /// Shows [uri]. [replace] rewrites the current history entry instead of adding
  /// one (used to spell out the URL of the first screen: `/` → `/dashboard`).
  void write(Uri uri, {bool replace = false});
}

/// The real address bar, via the engine.
///
/// **Writes only on the web.** Elsewhere there is no address bar, and telling the
/// engine about routes it never asked for would change how the platform's own
/// back gesture behaves. Reading works everywhere, so a mobile deep link opens
/// the right screen.
class SystemRouteUrl implements RouteUrl {
  const SystemRouteUrl();

  @override
  Uri? get initial {
    final name = WidgetsBinding.instance.platformDispatcher.defaultRouteName;
    return name.isEmpty ? null : Uri.tryParse(name);
  }

  @override
  void write(Uri uri, {bool replace = false}) {
    if (!kIsWeb) return;
    SystemNavigator.routeInformationUpdated(uri: uri, replace: replace);
  }
}
