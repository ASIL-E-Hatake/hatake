# Changelog

## 0.9.0

最初に配る版。**git の tag から入れる**（pub.dev にはまだ出していない）。
Flutter / TypeScript / Java の3版は**同じ番号**で出している。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.0.1

- Initial release.
- `layoutReport` … `ReportDocument` + `ReportPageDefinition` → `PrintLayout`
  (paper coordinates: top-left origin, points, y downward).
- `writePdf` … `PrintLayout` → PDF bytes. Uncompressed and deterministic: the
  same input yields the same bytes, so a report's layout can be pinned in CI.
- `reportPdf` … rows → PDF in one call (no UI needed).
- Non-embedded Adobe-Japan1 CID fonts (`PdfFont.gothic` / `mincho`) plus the
  Latin-only standard 14 (`PdfFont.helvetica`).
- `PrintStyle` for margins, page numbers, footers and total labels.
