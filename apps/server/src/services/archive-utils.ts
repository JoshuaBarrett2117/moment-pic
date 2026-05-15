import { normalizeExtension, toPosixPath } from "../lib/paths.js";

export const SUPPORTED_ARCHIVE_EXTENSIONS = new Set(["zip", "cbz", "cbr", "rar", "7z"]);

export type ArchiveType = "zip" | "cbr" | "7z";

export const detectArchiveType = (filePath: string): ArchiveType | null => {
  const ext = normalizeExtension(filePath).toLowerCase();
  if (ext === "zip" || ext === "cbz") return "zip";
  if (ext === "cbr" || ext === "rar") return "cbr";
  if (ext === "7z") return "7z";
  return null;
};

export const normalizeArchiveEntryPath = (entryPath: string): string =>
  toPosixPath(entryPath).replace(/\\/g, "/");

export const PSD_MAGIC = Buffer.from([0x38, 0x42, 0x50, 0x53]);

const JPEG_EOI = Buffer.from([0xff, 0xd9]);

export const extractJpegFromPsd = (buffer: Buffer): Buffer => {
  if (buffer.length < 10) {
    return buffer;
  }

  if (buffer.subarray(0, 4).equals(PSD_MAGIC)) {
    const jpeg = findEmbeddedJpegInPsd(buffer);
    if (jpeg) {
      return jpeg;
    }
  }

  return buffer;
};

export const findEmbeddedJpegInPsd = (buffer: Buffer): Buffer | null => {
  const jpegMarkers = [
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from([0xff, 0xd8, 0xff, 0xee]),
    Buffer.from([0xff, 0xd8, 0xff, 0xdb])
  ];

  for (const marker of jpegMarkers) {
    const startIdx = buffer.indexOf(marker);
    if (startIdx !== -1) {
      const endIdx = buffer.lastIndexOf(JPEG_EOI);
      if (endIdx > startIdx) {
        const extracted = buffer.subarray(startIdx, endIdx + 2);
        if (extracted.length > 100) {
          return extracted;
        }
      }
    }
  }

  const simpleStart = Buffer.from([0xff, 0xd8]);
  const startIdx = buffer.indexOf(simpleStart);
  if (startIdx !== -1 && startIdx < buffer.length - 10) {
    const endIdx = buffer.lastIndexOf(JPEG_EOI);
    if (endIdx > startIdx) {
      const extracted = buffer.subarray(startIdx, endIdx + 2);
      if (extracted.length > 100 && extracted.length < buffer.length) {
        return extracted;
      }
    }
  }

  return null;
};
