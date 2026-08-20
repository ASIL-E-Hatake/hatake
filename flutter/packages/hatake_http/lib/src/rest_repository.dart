import 'dart:convert';

import 'package:hatake_core/hatake_core.dart';

import 'http_failure.dart';
import 'http_send.dart';

/// A [Repository] that talks to the REST API a definition already describes.
///
/// `hatake openapi` turns a page into an OpenAPI document; this speaks exactly
/// that document, so the API contract and the client are the same statement made
/// twice instead of two guesses:
///
/// ```
/// GET    <collection>?page=&pageSize=&sortField=&sortAscending=&<filters…>  → {items, totalCount}
/// POST   <collection>                                                       → the created record
/// GET    <collection>/{key}                                                 → the record (404 → null)
/// PUT    <collection>/{key}                                                  → the updated record
/// DELETE <collection>/{key}                                                  → 204
/// ```
///
/// It **does not send** the request itself (see [HttpSend]) and it does not
/// interpret failures beyond typing them (see [RepositoryHttpException]) — an app
/// decides what a 401 means for its user.
///
/// A backend that answers a different shape is not a reason to bend this: write
/// a `Repository` by hand. It is a five-method interface, and the framework never
/// knew about HTTP in the first place.
class RestRepository implements Repository {
  /// The collection URL, e.g. `https://api.example.com/api/customers` or a
  /// relative `/api/customers` when the app is served from the same origin.
  final Uri collection;

  /// Sends the requests this repository builds.
  final HttpSend send;

  /// Extra headers per request (auth token, tenant, trace id).
  final HttpHeaders? headers;

  RestRepository({
    required Object collection,
    required this.send,
    this.headers,
  }) : collection = collection is Uri ? collection : Uri.parse('$collection');

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    final url = collection.replace(
      queryParameters: {
        ...collection.queryParameters,
        ..._filterParams(query.filters),
        // The RepositoryQuery contract, spelled the way OpenAPI declares it.
        'page': '${query.page}',
        'pageSize': '${query.pageSize}',
        if (query.sortField != null) ...{
          'sortField': query.sortField!,
          'sortAscending': '${query.sortAscending}',
        },
      },
    );
    final response = await _send('GET', url);
    final json = _decode(response, 'GET $url');
    if (json is! Map) {
      throw RepositoryShapeException(
        'GET $url',
        '{items, totalCount}',
        _shapeOf(json),
      );
    }
    final items = json['items'];
    final total = json['totalCount'];
    if (items is! List || total is! num) {
      throw RepositoryShapeException(
        'GET $url',
        '{items: [], totalCount: 0}',
        '{${json.keys.join(', ')}}',
      );
    }
    return PageResult(
      items: [for (final item in items) _record(item, 'GET $url')],
      totalCount: total.toInt(),
    );
  }

  @override
  Future<DataRecord?> findByKey(Object key) async {
    final url = _item(key);
    final response = await _send('GET', url);
    // Not found is an answer, not a failure: the contract says findByKey may
    // return null, and a deleted record is the normal way to get here.
    if (response.status == 404) return null;
    return _record(_decode(response, 'GET $url'), 'GET $url');
  }

  @override
  Future<DataRecord> create(DataRecord data) async {
    final response = await _send('POST', collection, body: data);
    return _record(_decode(response, 'POST $collection'), 'POST $collection');
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final url = _item(key);
    final response = await _send('PUT', url, body: data);
    return _record(_decode(response, 'PUT $url'), 'PUT $url');
  }

  @override
  Future<void> delete(Object key) async {
    final url = _item(key);
    final response = await _send('DELETE', url);
    _raiseFor(response, 'DELETE $url');
  }

  /// `<collection>/<key>`, with the key escaped — a customer code may hold a
  /// slash or a space, and pasting it raw would silently address another route.
  Uri _item(Object key) {
    final encoded = Uri.encodeComponent('$key');
    return collection.replace(
      path: '${collection.path}/$encoded'.replaceAll('//', '/'),
    );
  }

  /// Filters as the query string. A null or empty value is left out entirely
  /// (`?status=` would ask for records whose status is the empty string), and a
  /// list becomes repeated keys — the form OpenAPI declares for an array param.
  Map<String, Object> _filterParams(Map<String, Object?> filters) {
    final params = <String, Object>{};
    for (final entry in filters.entries) {
      final value = entry.value;
      if (value == null) continue;
      if (value is Iterable) {
        final parts = [
          for (final item in value)
            if (item != null && '$item'.isNotEmpty) '$item',
        ];
        if (parts.isEmpty) continue;
        params[entry.key] = parts;
      } else {
        if ('$value'.isEmpty) continue;
        params[entry.key] = '$value';
      }
    }
    return params;
  }

  Future<HttpResponse> _send(String method, Uri url, {DataRecord? body}) async {
    final extra = headers == null ? const <String, String>{} : await headers!();
    return send(HttpRequest(
      method: method,
      url: url,
      headers: {
        'accept': 'application/json',
        if (body != null) 'content-type': 'application/json; charset=utf-8',
        ...extra,
      },
      body: body == null ? null : jsonEncode(body),
    ));
  }

  /// Turns a non-2xx answer into the exception that fits it.
  void _raiseFor(HttpResponse response, String request) {
    if (response.status >= 200 && response.status < 300) return;
    if (response.status == 401 || response.status == 403) {
      throw RepositoryUnauthorizedException(
        response.status,
        request,
        response.body,
      );
    }
    if (response.status == 400) {
      throw RepositoryValidationException(
        response.status,
        request,
        _fieldErrors(response.body),
        response.body,
      );
    }
    throw RepositoryHttpException(response.status, request, response.body);
  }

  /// `{valid, errors: [{field, message}]}` → field → message.
  ///
  /// Empty when the body is something else: a 400 without the payload is still a
  /// 400, and inventing field names would put messages on the wrong inputs.
  Map<String, String> _fieldErrors(String body) {
    try {
      final json = jsonDecode(body);
      if (json is! Map) return const {};
      final errors = json['errors'];
      if (errors is! List) return const {};
      return {
        for (final error in errors)
          if (error is Map && error['field'] is String)
            '${error['field']}': '${error['message'] ?? ''}',
      };
    } on FormatException {
      return const {};
    }
  }

  Object? _decode(HttpResponse response, String request) {
    _raiseFor(response, request);
    if (response.body.trim().isEmpty) return null;
    try {
      return jsonDecode(response.body);
    } on FormatException catch (error) {
      throw RepositoryShapeException(request, 'JSON', '$error');
    }
  }

  DataRecord _record(Object? json, String request) {
    if (json is Map) return {for (final e in json.entries) '${e.key}': e.value};
    throw RepositoryShapeException(request, '1件のレコード（object）', _shapeOf(json));
  }

  String _shapeOf(Object? json) => switch (json) {
        null => 'null',
        List() => '配列',
        Map() => 'object',
        _ => '$json',
      };
}

/// One [RestRepository] per repository name a definition asks for.
///
/// `collections` maps the definition's `repository:` key to its collection path,
/// because that mapping is the API's business, not the definition's — the same
/// screen may point at `/api/v2/customers` in one deployment and `/customers` in
/// another.
///
/// Returns a plain map so this package stays **Flutter-free** (a nightly batch
/// uses the same repositories); wrap it where the app builds its scope:
///
/// ```dart
/// repositories: RepositoryRegistry(restRepositories(
///   baseUrl: '/api',
///   send: send,
///   headers: () async => {'authorization': 'Bearer ${await session.token()}'},
///   collections: {
///     'customerRepository': 'customers',
///     'orderRepository': 'orders',
///   },
/// ))
/// ```
Map<String, Repository> restRepositories({
  required String baseUrl,
  required HttpSend send,
  required Map<String, String> collections,
  HttpHeaders? headers,
}) {
  final base = baseUrl.endsWith('/')
      ? baseUrl.substring(0, baseUrl.length - 1)
      : baseUrl;
  return {
    for (final entry in collections.entries)
      entry.key: RestRepository(
        collection: '$base/${entry.value}',
        send: send,
        headers: headers,
      ),
  };
}
