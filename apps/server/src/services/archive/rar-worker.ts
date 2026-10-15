import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { createExtractorFromFile, Extractor, type FileHeader } from "node-unrar-js";
import { ArchiveSafetyError } from "./archive-limits.js";
import { normalizeArchiveEntryPath } from "../archive-utils.js";
import { RAR_CHUNK_BYTES, type RarWorkerMessage, type RarWorkerRequest } from "./rar-protocol.js";

type RarModule = { HEAPU8: Uint8Array; extractor: Extractor };
const request = workerData as RarWorkerRequest;
const control = new Int32Array(request.control);
const port = parentPort!;
const send = (message: RarWorkerMessage) => port.postMessage(message);

const emit = (data: Uint8Array): void => {
  for (let offset = 0; offset < data.byteLength; offset += RAR_CHUNK_BYTES) {
    while (Atomics.compareExchange(control, 0, 1, 0) !== 1) {
      Atomics.add(control, 3, 1);
      Atomics.wait(control, 0, 0);
    }
    const chunk = new Uint8Array(Math.min(RAR_CHUNK_BYTES, data.byteLength - offset));
    chunk.set(data.subarray(offset, offset + chunk.byteLength));
    Atomics.add(control, 2, chunk.byteLength);
    port.postMessage({ type: "chunk", data: chunk } satisfies RarWorkerMessage, [chunk.buffer]);
  }
};

class StreamingRarExtractor extends Extractor {
  declare protected unrar: RarModule;
  protected _filePath: string;
  private inputPosition = 0;
  private outputPosition = 0;
  private outputSize = 0;
  private outputBytes = 0;
  private selected = false;
  private entryCount = 0;
  private listingBytes = 0;

  constructor(module: RarModule, private readonly input: number, private readonly inputSize: number) {
    super(module);
    this._filePath = request.archivePath;
  }

  accountHeader(header: FileHeader): void {
    this.entryCount += 1;
    if (this.entryCount > request.maxEntries) throw new ArchiveSafetyError("ARCHIVE_ENTRY_LIMIT", "RAR 条目数超过上限");
    this.accountListing(JSON.stringify(header));
  }

  selectHeader(header: FileHeader, solidArchive: boolean): boolean {
    this.accountHeader(header);
    this.selected = normalizeArchiveEntryPath(header.name) === request.entryPath;
    const required = !header.flags.directory && (this.selected || solidArchive);
    if (required && header.flags.encrypted) throw new Error("不支持加密 RAR 条目");
    return required;
  }

  accountListing(text: string): void {
    this.listingBytes += Buffer.byteLength(text) + 1;
    if (this.listingBytes > request.maxListingBytes) throw new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "RAR 列表字节数超过上限");
  }

  protected open(filename: string): number {
    if (filename !== this._filePath) throw new Error("不支持 RAR 分卷或外部文件引用");
    this.inputPosition = 0;
    return 1;
  }

  protected create(_filename: string): number {
    this.outputPosition = 0;
    this.outputSize = 0;
    return 2;
  }

  protected read(descriptor: number, pointer: number, size: number): number {
    if (descriptor !== 1) throw new Error("禁止读取 RAR 输出或外部文件");
    const read = fs.readSync(this.input, this.unrar.HEAPU8, pointer, size, this.inputPosition);
    this.inputPosition += read;
    return read;
  }

  protected write(descriptor: number, pointer: number, size: number): boolean {
    if (descriptor !== 2) throw new Error("无效 RAR 输出句柄");
    this.outputBytes += size;
    Atomics.add(control, 1, size);
    if (this.outputBytes > request.maxBytes) throw new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "归档解压字节数超过上限");
    if (this.selected) emit(this.unrar.HEAPU8.subarray(pointer, pointer + size));
    this.outputPosition += size;
    this.outputSize = Math.max(this.outputPosition, this.outputSize);
    return true;
  }

  protected tell(descriptor: number): number {
    return descriptor === 1 ? this.inputPosition : this.outputPosition;
  }

  protected seek(descriptor: number, position: number, method: "SET" | "CUR" | "END"): boolean {
    const size = descriptor === 1 ? this.inputSize : this.outputSize;
    const next = position + (method === "SET" ? 0 : method === "END" ? size : this.tell(descriptor));
    if (!Number.isSafeInteger(next) || next < 0 || next > size) return false;
    if (descriptor === 1) this.inputPosition = next;
    else this.outputPosition = next;
    return true;
  }

  protected closeFile(_descriptor: number): void {}
}

const main = async (): Promise<void> => {
  let input: number | undefined;
  try {
    input = fs.openSync(request.archivePath, "r");
    const factory = await createExtractorFromFile({ filepath: request.archivePath });
    const module = (factory as unknown as { unrar: RarModule }).unrar;
    const extractor = new StreamingRarExtractor(module, input, fs.fstatSync(input).size);
    module.extractor = extractor;
    if (request.entryPath === undefined) {
      const listing = extractor.getFileList();
      extractor.accountListing(JSON.stringify(listing.arcHeader));
      for (const header of listing.fileHeaders) {
        extractor.accountHeader(header);
        emit(Buffer.from(JSON.stringify(header) + "\n"));
      }
    } else {
      let found = false;
      const extraction = extractor.extract({ files: (header): boolean =>
        extractor.selectHeader(header, extraction.arcHeader.flags.solid) });
      extractor.accountListing(JSON.stringify(extraction.arcHeader));
      for (const file of extraction.files) {
        if (normalizeArchiveEntryPath(file.fileHeader.name) === request.entryPath && !file.fileHeader.flags.directory) {
          found = true;
          break;
        }
      }
      if (!found) throw new Error("RAR entry not found");
    }
    send({ type: "done" });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "RAR 解码失败",
      code: error instanceof ArchiveSafetyError ? error.code : undefined });
  } finally {
    if (input !== undefined) fs.closeSync(input);
    port.close();
  }
};

void main();
