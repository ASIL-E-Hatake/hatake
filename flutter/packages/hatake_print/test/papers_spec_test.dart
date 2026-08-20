// 用紙の実寸が spec/papers.json と一致すること。
//
// 同じ数を3か所が持っている: [`spec/papers.json`]（正）・この版（刷る側）・TypeScript 版
// （`validate` が「紙に入らない」を言うため）。ズレると **刷る側は収まると思っているのに、
// 警告は収まらないと言う**（またはその逆）という、いちばん困る食い違いになる。
//
// だから転記した値を機械で突き合わせる。数を直すときは spec を直してから、ここが落ちる
// ことを確かめる。

import 'dart:convert';
import 'dart:io';

import 'package:hatake_print/hatake_print.dart';
import 'package:test/test.dart';

void main() {
  final spec =
      jsonDecode(File('../../../spec/papers.json').readAsStringSync())
          as Map<String, Object?>;
  final papers = spec['papers']! as Map<String, Object?>;

  test('単位はポイント', () {
    expect(spec['unit'], 'pt');
  });

  test('紙の名前が spec と同じ（増減もズレとして落ちる）', () {
    expect(
      PrintPapers.byName.keys.toList()..sort(),
      papers.keys.toList()..sort(),
    );
  });

  test('大きさが spec と1つも違わない', () {
    for (final entry in papers.entries) {
      final size = entry.value! as Map<String, Object?>;
      final paper = PrintPapers.byName[entry.key]!;
      expect(paper.width, size['width'], reason: '${entry.key} の幅');
      expect(paper.height, size['height'], reason: '${entry.key} の高さ');
    }
  });
}
