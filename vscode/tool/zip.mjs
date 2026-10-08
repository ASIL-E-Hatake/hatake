// .vsix（zip）を依存なしで読む。目次（central directory）と、1件の中身（stored / deflate）だけ。

import { inflateRawSync } from "node:zlib";

/** zip の目次: 名前 → { 圧縮のしかた・中身の位置・大きさ }。 */
export function readZipIndex(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("zip の終わりの印が見つかりません。");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error("zip の目次が壊れています。");
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    entries.set(name, { method, compressed, local });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** 1件の中身（stored か deflate だけ）。 */
export function readZipEntry(buffer, entry) {
  const nameLength = buffer.readUInt16LE(entry.local + 26);
  const extraLength = buffer.readUInt16LE(entry.local + 28);
  const start = entry.local + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressed);
  return entry.method === 0 ? raw : inflateRawSync(raw);
}
