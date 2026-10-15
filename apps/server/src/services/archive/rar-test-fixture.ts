import { createCipheriv, createHash } from "node:crypto";
import { crc32 } from "node:zlib";

export const RAR_FIXTURE_PASSWORD = "rar-fixture-password";

const encryptStoredContent = (content: Buffer, salt: Buffer): Buffer => {
  const password = Buffer.from(RAR_FIXTURE_PASSWORD, "utf16le");
  const hash = createHash("sha1");
  const counter = Buffer.alloc(3);
  const vector = Buffer.alloc(16);
  for (let round = 0; round < 0x40000; round += 1) {
    counter.writeUIntLE(round, 0, 3);
    hash.update(password).update(salt).update(counter);
    if (round % 0x4000 === 0) vector[round / 0x4000] = hash.copy().digest()[19];
  }
  const key = hash.digest().subarray(0, 16).swap32();
  const cipher = createCipheriv("aes-128-cbc", key, vector);
  cipher.setAutoPadding(false);
  const padded = Buffer.alloc(Math.ceil(content.length / 16) * 16);
  content.copy(padded);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
};

const header = (type: number, flags: number, body: Buffer): Buffer => {
  const result = Buffer.alloc(7 + body.length);
  result[2] = type;
  result.writeUInt16LE(flags, 3);
  result.writeUInt16LE(result.length, 5);
  body.copy(result, 7);
  result.writeUInt16LE(crc32(result.subarray(2)) & 0xffff);
  return result;
};

export const createStoredRarArchive = (entries: Array<{ entryPath: string; content: Buffer; solid?: boolean; encrypted?: boolean }>, options: { solid?: boolean } = {}): Buffer => {
  const blocks = [Buffer.from("526172211a0700", "hex"), header(0x73, options.solid ? 8 : 0, Buffer.alloc(6))];
  for (const { entryPath, content, solid, encrypted } of entries) {
    const name = Buffer.from(entryPath);
    const salt = encrypted ? Buffer.from("0011223344556677", "hex") : Buffer.alloc(0);
    const packed = encrypted ? encryptStoredContent(content, salt) : content;
    const metadata = Buffer.alloc(25 + name.length + salt.length);
    metadata.writeUInt32LE(packed.length, 0);
    metadata.writeUInt32LE(content.length, 4);
    metadata[8] = 3;
    metadata.writeUInt32LE(crc32(content), 9);
    metadata[17] = encrypted ? 29 : 20;
    metadata[18] = 0x30;
    metadata.writeUInt16LE(name.length, 19);
    metadata.writeUInt32LE(0o100644, 21);
    name.copy(metadata, 25);
    salt.copy(metadata, 25 + name.length);
    blocks.push(header(0x74, 0x8000 | ((solid ?? (options.solid && blocks.length > 2)) ? 0x10 : 0) | (encrypted ? 0x404 : 0), metadata), packed);
  }
  blocks.push(header(0x7b, 0, Buffer.alloc(0)));
  return Buffer.concat(blocks);
};

const vint = (value: number): Buffer => {
  const bytes: number[] = [];
  do {
    const next = value % 128;
    value = Math.floor(value / 128);
    bytes.push(next | (value ? 128 : 0));
  } while (value);
  return Buffer.from(bytes);
};

const rar5Header = (body: Buffer): Buffer => {
  const data = Buffer.concat([vint(body.length), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32LE(crc32(data));
  return Buffer.concat([checksum, data]);
};

export const createStoredRar5Archive = (entries: Array<{ entryPath: string; content: Buffer }>): Buffer => {
  const blocks = [Buffer.from("526172211a070100", "hex"), rar5Header(Buffer.from([1, 0, 0]))];
  for (const { entryPath, content } of entries) {
    const name = Buffer.from(entryPath);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32LE(crc32(content));
    blocks.push(rar5Header(Buffer.concat([
      Buffer.from([2, 2]), vint(content.length), Buffer.from([4]), vint(content.length),
      vint(0o100644), checksum, Buffer.from([0, 1]), vint(name.length), name
    ])), content);
  }
  blocks.push(rar5Header(Buffer.from([5, 0, 0])));
  return Buffer.concat(blocks);
};
