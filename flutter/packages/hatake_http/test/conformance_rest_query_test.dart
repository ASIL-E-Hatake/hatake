import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_http/hatake_http.dart';
import 'package:test/test.dart';

/// The query string this client sends, pinned by the shared fixture.
///
/// The names live in two places by necessity — the OpenAPI a definition emits
/// (what the server implements) and this client (what actually goes on the wire).
/// A rename on one side does not fail: the server ignores a parameter it does not
/// know, so the screen appears with the wrong rows and no error anywhere. That is
/// what the fixture is for.
///
/// [`spec/conformance/rest_query.json`] is replayed here and read by the
/// TypeScript side (which checks the OpenAPI declares exactly `contract`).
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/rest_query.json').readAsStringSync(),
  ) as Map<String, Object?>;

  test('契約の名前（page / pageSize / sortField / sortAscending）', () async {
    var url = Uri();
    final repository = RestRepository(
      collection: '/api/customers',
      send: (request) async {
        url = request.url;
        return const HttpResponse(200, '{"items":[],"totalCount":0}');
      },
    );
    await repository.search(const RepositoryQuery(
      sortField: 'code',
      sortAscending: true,
    ));
    expect(
      url.queryParameters.keys.where((k) => k != 'filters').toSet(),
      (fixture['contract'] as List).cast<String>().toSet(),
    );
  });

  for (final raw in fixture['cases'] as List) {
    final testCase = raw as Map<String, Object?>;
    test(testCase['name'] as String, () async {
      final query = testCase['query'] as Map<String, Object?>;
      final filters = (query['filters'] as Map?)?.cast<String, Object?>();
      var url = Uri();
      final repository = RestRepository(
        collection: '/api/customers',
        send: (request) async {
          url = request.url;
          return const HttpResponse(200, '{"items":[],"totalCount":0}');
        },
      );
      await repository.search(RepositoryQuery(
        filters: filters ?? const {},
        page: (query['page'] as num?)?.toInt() ?? 0,
        pageSize: (query['pageSize'] as num?)?.toInt() ?? 50,
        sortField: query['sortField'] as String?,
        sortAscending: query['sortAscending'] as bool? ?? true,
      ));
      expect(url.query, testCase['expect']);
    });
  }
}
