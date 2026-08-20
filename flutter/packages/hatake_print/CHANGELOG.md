# Changelog

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
