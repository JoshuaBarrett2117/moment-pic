import fs from "node:fs/promises";
import { readArchiveEntryHead, detectArchiveType } from "../archive.js";
import { normalizeMetadataDimensions } from "../thumbnail-options.js";

export const IMAGE_HEADER_MAX_BYTES = 128 * 1024;
export type ImageDimensions = { width: number; height: number };
export type HeaderSource = { sourceType: "folder" | "zip"; sourcePath: string; zipEntryPath: string | null };

const readOrientation = (data: Buffer): number | undefined => {
  const tiff = data.subarray(data.subarray(0, 6).equals(Buffer.from("Exif\0\0")) ? 6 : 0);
  if (tiff.length < 8) return;
  const endian = tiff.toString("ascii", 0, 2);
  if (endian !== "II" && endian !== "MM") return;
  const u16 = (offset: number) => endian === "II" ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = (offset: number) => endian === "II" ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  if (u16(2) !== 42) return;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const offset = ifd + 2 + i * 12;
    if (offset + 12 > tiff.length) return;
    if (u16(offset) === 0x112 && u16(offset + 2) === 3 && u32(offset + 4) === 1) return u16(offset + 8);
  }
};

/** 不解码像素；头部缺失、格式损坏或尺寸无效时返回 null。 */
export const parseImageHeader = (input: Buffer): ImageDimensions | null => {
  const data = input.subarray(0, IMAGE_HEADER_MAX_BYTES);
  let width: number | undefined;
  let height: number | undefined;
  let orientation: number | undefined;
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.toString("ascii", 12, 16) === "IHDR" && data.readUInt32BE(8) === 13) {
    width = data.readUInt32BE(16); height = data.readUInt32BE(20);
    for (let offset = 8; offset + 12 <= data.length;) {
      const size = data.readUInt32BE(offset);
      if (offset + 12 + size > data.length) break;
      if (data.toString("ascii", offset + 4, offset + 8) === "eXIf") orientation = readOrientation(data.subarray(offset + 8, offset + 8 + size));
      offset += 12 + size;
    }
  } else if (data.length >= 10 && /^GIF8[79]a$/.test(data.toString("ascii", 0, 6))) {
    width = data.readUInt16LE(6); height = data.readUInt16LE(8);
  } else if (data.length >= 26 && data.toString("ascii", 0, 2) === "BM") {
    const dib = data.readUInt32LE(14);
    if (dib === 12) { width = data.readUInt16LE(18); height = data.readUInt16LE(20); }
    else if (dib >= 40) { width = data.readInt32LE(18); height = Math.abs(data.readInt32LE(22)); }
  } else if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    for (let offset = 12; offset + 8 <= data.length;) {
      const size = data.readUInt32LE(offset + 4);
      const start = offset + 8;
      const kind = data.toString("ascii", offset, offset + 4);
      if (kind === "VP8X" && size >= 10 && start + 10 <= data.length) {
        width = data.readUIntLE(start + 4, 3) + 1; height = data.readUIntLE(start + 7, 3) + 1;
      } else if (!width && kind === "VP8 " && size >= 10 && start + 10 <= data.length && data.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) {
        width = data.readUInt16LE(start + 6) & 0x3fff; height = data.readUInt16LE(start + 8) & 0x3fff;
      } else if (!width && kind === "VP8L" && size >= 5 && start + 5 <= data.length && data[start] === 0x2f) {
        const packed = data.readUInt32LE(start + 1);
        width = (packed & 0x3fff) + 1; height = ((packed >>> 14) & 0x3fff) + 1;
      } else if (kind === "EXIF" && start + size <= data.length) orientation = readOrientation(data.subarray(start, start + size));
      offset = start + size + (size % 2);
    }
  } else if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 0xff) return null;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) break;
      const size = data.readUInt16BE(offset);
      if (size < 2) return null;
      if (offset + size > data.length) break;
      if (marker === 0xe1) orientation = readOrientation(data.subarray(offset + 2, offset + size)) ?? orientation;
      if ([0xc0, 0xc1, 0xc2, 0xc9, 0xca].includes(marker) && size >= 8) {
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5);
      }
      offset += size;
    }
  }
  const dimensions = normalizeMetadataDimensions({ width, height, orientation });
  return dimensions.width && dimensions.height ? { width: dimensions.width, height: dimensions.height } : null;
};

export const supportsHeaderProbe = (source: HeaderSource): boolean => source.sourceType === "folder" || detectArchiveType(source.sourcePath) === "zip";

export const probeImageHeader = async (source: HeaderSource, signal?: AbortSignal): Promise<ImageDimensions | null> => {
  signal?.throwIfAborted();
  if (!supportsHeaderProbe(source)) return null;
  if (source.sourceType === "zip") {
    if (!source.zipEntryPath) return null;
    return parseImageHeader(await readArchiveEntryHead(source.sourcePath, source.zipEntryPath, { maxBytes: IMAGE_HEADER_MAX_BYTES, signal, timeoutMs: 3000 }));
  }
  const file = await fs.open(source.sourcePath, "r");
  try {
    signal?.throwIfAborted();
    const header = Buffer.alloc(IMAGE_HEADER_MAX_BYTES);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    signal?.throwIfAborted();
    return parseImageHeader(header.subarray(0, bytesRead));
  } finally { await file.close(); }
};
