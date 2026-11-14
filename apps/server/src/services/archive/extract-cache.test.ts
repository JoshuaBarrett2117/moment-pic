import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import zlib from "node:zlib";
import { path7za } from "7zip-bin";
import sharp from "sharp";
import { ArchiveExtractCache, createDefaultExtractorResolver, parse7zPlan, type ArchiveExtractor, type ExtractPlanEntry } from "./extract-cache.js";
import { createStoredRar5Archive, createStoredRarArchive } from "./rar-test-fixture.js";

const tempDir = (prefix: string) => fs.mkdtemp(path.join(os.tmpdir(), prefix));

/** 统计默认后端被调用整包解压的次数。 */
const countingResolver = () => {
  const counter = { streams: 0 };
  const base = createDefaultExtractorResolver();
  const resolve = async (archivePath: string): Promise<ArchiveExtractor | null> => {
    const extractor = await base(archivePath);
    if (!extractor) return null;
    return { plan: extractor.plan, stream: (file, maxBytes, signal) => { counter.streams++; return extractor.stream(file, maxBytes, signal); } };
  };
  return { counter, resolve };
};

const fakeExtractor = (plan: ExtractPlanEntry[], data: Buffer, options: { delayMs?: number } = {}) => {
  const counter = { streams: 0 };
  const resolve = async (): Promise<ArchiveExtractor> => ({
    plan: async () => plan,
    stream: async () => {
      counter.streams++;
      if (options.delayMs) await delay(options.delayMs);
      return Readable.from([data]);
    }
  });
  return { counter, resolve };
};

const entry = (entryPath: string, content: Buffer): ExtractPlanEntry => ({ entryPath, size: content.length, crc: zlib.crc32(content) });

test("7z 固实包首次访问整包解压一次，并发请求合并，内容逐字节一致", async () => {
  const source = await tempDir("extract-7z-src-");
  const cacheDir = await tempDir("extract-7z-cache-");
  try {
    const pages: Record<string, Buffer> = {};
    for (let i = 0; i < 5; i++) {
      const name = `p${i}.png`;
      pages[name] = await sharp({ create: { width: 20 + i, height: 10, channels: 3, background: { r: i * 40, g: 0, b: 0 } } }).png().toBuffer();
      await fs.writeFile(path.join(source, name), pages[name]);
    }
    await fs.mkdir(path.join(source, "sub"));
    pages["sub/q.png"] = pages["p1.png"];
    await fs.writeFile(path.join(source, "sub", "q.png"), pages["sub/q.png"]);
    await fs.writeFile(path.join(source, "readme.txt"), "not an image");
    const archive = path.join(source, "book.7z");
    assert.equal(spawnSync(path7za, ["a", "-t7z", "-ms=on", archive, "p0.png", "p1.png", "p2.png", "p3.png", "p4.png", "sub", "readme.txt"], { cwd: source }).status, 0);

    const { counter, resolve } = countingResolver();
    const cache = new ArchiveExtractCache({ dir: cacheDir, maxBytes: 64 * 1024 * 1024 }, resolve);
    const names = Object.keys(pages);
    const files = await Promise.all(names.map((name) => cache.resolve(archive, name)));
    assert.equal(counter.streams, 1);
    for (const [index, name] of names.entries()) {
      assert.ok(files[index]!.startsWith(cacheDir + path.sep));
      assert.deepEqual(await fs.readFile(files[index]!), pages[name]);
    }
    assert.equal(await cache.resolve(archive, "readme.txt"), null, "非图片条目不落盘");
    assert.equal(await cache.resolve(archive, "missing.png"), null);
    assert.equal(counter.streams, 1);

    // 重启后从清单恢复，不再解压
    const restarted = new ArchiveExtractCache({ dir: cacheDir, maxBytes: 64 * 1024 * 1024 }, async () => { throw new Error("不应再解压"); });
    assert.deepEqual(await fs.readFile((await restarted.resolve(archive, "p3.png"))!), pages["p3.png"]);

    // 归档变化（mtime/size）后视为新版本
    await fs.appendFile(archive, Buffer.alloc(0));
    const later = new Date(Date.now() + 5000);
    await fs.utimes(archive, later, later);
    await cache.resolve(archive, "p0.png");
    assert.equal(counter.streams, 2);
  } finally {
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("RAR4（含 solid）与 RAR5 整包解压后按条目命中", async () => {
  const directory = await tempDir("extract-rar-");
  try {
    const a = Buffer.from("first page bytes");
    const b = Buffer.alloc(3000, 7);
    for (const [name, data] of [
      ["solid4.cbr", createStoredRarArchive([{ entryPath: "a.png", content: a }, { entryPath: "notes.txt", content: Buffer.from("x") }, { entryPath: "dir/b.jpg", content: b }], { solid: true })],
      ["plain5.cbr", createStoredRar5Archive([{ entryPath: "a.png", content: a }, { entryPath: "dir/b.jpg", content: b }])]
    ] as const) {
      const archive = path.join(directory, name);
      await fs.writeFile(archive, data);
      const { counter, resolve } = countingResolver();
      const cache = new ArchiveExtractCache({ dir: path.join(directory, `cache-${name}`), maxBytes: 16 * 1024 * 1024 }, resolve);
      assert.deepEqual(await fs.readFile((await cache.resolve(archive, "dir/b.jpg"))!), b, name);
      assert.deepEqual(await fs.readFile((await cache.resolve(archive, "a.png"))!), a, name);
      assert.equal(counter.streams, 1, name);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("总上限按 LRU 淘汰，单包超限与校验失败回退逐条读取且不留临时目录", async () => {
  const directory = await tempDir("extract-lru-");
  try {
    const cacheDir = path.join(directory, "cache");
    const data = Buffer.alloc(300, 1);
    const archives = await Promise.all(["a.7z", "b.7z", "c.7z"].map(async (name) => {
      const file = path.join(directory, name);
      await fs.writeFile(file, name);
      return file;
    }));
    const fake = fakeExtractor([entry("x.png", data)], data);
    // 总上限 1000、单包上限 500：最多容纳 3 个 300 字节的包中的 3 个，再加第 4 个时淘汰最久未用
    const cache = new ArchiveExtractCache({ dir: cacheDir, maxBytes: 1000, perArchiveMaxBytes: 500 }, fake.resolve);
    for (const archive of archives) assert.ok(await cache.resolve(archive, "x.png"));
    await cache.resolve(archives[0], "x.png"); // a 变为最近使用
    const fourth = path.join(directory, "d.7z");
    await fs.writeFile(fourth, "d");
    assert.ok(await cache.resolve(fourth, "x.png"));
    assert.equal(cache.size, 3);
    assert.ok(cache.usedBytes <= 1000);
    const streamsBefore = fake.counter.streams;
    assert.ok(await cache.resolve(archives[0], "x.png"), "最近使用的 a 保留");
    assert.equal(fake.counter.streams, streamsBefore);
    assert.ok(await cache.resolve(archives[1], "x.png"), "最久未用的 b 已被淘汰，重新解压");
    assert.equal(fake.counter.streams, streamsBefore + 1);

    // 单包超过上限：不解压
    const big = Buffer.alloc(600, 2);
    const oversized = fakeExtractor([entry("big.png", big)], big);
    const limited = new ArchiveExtractCache({ dir: path.join(directory, "cache2"), maxBytes: 1000, perArchiveMaxBytes: 500 }, oversized.resolve);
    assert.equal(await limited.resolve(archives[2], "big.png"), null);
    assert.equal(oversized.counter.streams, 0);

    // CRC 不符、输出长度与列表不符：整体作废
    for (const [plan, output] of [
      [[{ ...entry("y.png", data), crc: 1234 }], data],
      [[entry("y.png", data)], data.subarray(0, 100)],
      [[entry("y.png", data)], Buffer.concat([data, Buffer.from("extra")])]
    ] as Array<[ExtractPlanEntry[], Buffer]>) {
      const broken = fakeExtractor(plan, output);
      const brokenDir = await tempDir("extract-broken-");
      const brokenCache = new ArchiveExtractCache({ dir: brokenDir, maxBytes: 1000, perArchiveMaxBytes: 1000 }, broken.resolve);
      assert.equal(await brokenCache.resolve(archives[2], "y.png"), null);
      assert.deepEqual(await fs.readdir(brokenDir), []);
      // 失败负缓存：短时间内不重复尝试
      assert.equal(await brokenCache.resolve(archives[2], "y.png"), null);
      assert.equal(broken.counter.streams, 1);
      await fs.rm(brokenDir, { recursive: true, force: true });
    }

    // 关闭（上限 0）时不解压
    const disabled = new ArchiveExtractCache({ dir: path.join(directory, "cache3"), maxBytes: 0 }, fake.resolve);
    assert.equal(await disabled.resolve(archives[0], "x.png"), null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("条目路径只作查找键：../ 与绝对路径不会写到缓存目录之外", async () => {
  const directory = await tempDir("extract-traversal-");
  try {
    const archive = path.join(directory, "evil.7z");
    await fs.writeFile(archive, "evil");
    const first = Buffer.from("escape attempt");
    const second = Buffer.from("absolute attempt");
    const plan = [entry("../../escape.png", first), entry("/etc/absolute.png", second)];
    const cacheDir = path.join(directory, "cache");
    const cache = new ArchiveExtractCache({ dir: cacheDir, maxBytes: 1024 * 1024 }, fakeExtractor(plan, Buffer.concat([first, second])).resolve);
    const escaped = await cache.resolve(archive, "../../escape.png");
    const absolute = await cache.resolve(archive, "/etc/absolute.png");
    for (const file of [escaped!, absolute!]) {
      assert.equal(path.dirname(path.dirname(file)), cacheDir);
      assert.match(path.basename(file), /^\d{6}$/);
    }
    assert.deepEqual(await fs.readFile(escaped!), first);
    assert.deepEqual((await fs.readdir(directory)).sort(), ["cache", "evil.7z"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("等待超过请求时限时先回退，后台解压完成后命中缓存", async () => {
  const directory = await tempDir("extract-wait-");
  try {
    const archive = path.join(directory, "slow.7z");
    await fs.writeFile(archive, "slow");
    const data = Buffer.from("slow page");
    const slow = fakeExtractor([entry("s.png", data)], data, { delayMs: 150 });
    const cache = new ArchiveExtractCache({ dir: path.join(directory, "cache"), maxBytes: 1024 * 1024 }, slow.resolve);
    const startedAt = Date.now();
    assert.equal(await cache.resolve(archive, "s.png", { waitMs: 20 }), null);
    assert.ok(Date.now() - startedAt < 140);
    await cache.idle();
    assert.deepEqual(await fs.readFile((await cache.resolve(archive, "s.png", { waitMs: 20 }))!), data);
    assert.equal(slow.counter.streams, 1);

    const controller = new AbortController();
    controller.abort(new Error("client gone"));
    await assert.rejects(cache.resolve(archive, "s.png", { signal: controller.signal }), /client gone/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("7z 列表解析：跳过目录，加密条目拒绝整包缓存", () => {
  const listing = "Path = sub\nSize = 0\nAttributes = D_ drwxr-xr-x\nCRC = \n\nPath = sub/a.png\nSize = 4\nAttributes = A_\nCRC = 0000ABCD\n\nPath = empty.png\nSize = 0\nCRC = \n";
  assert.deepEqual(parse7zPlan(listing), [{ entryPath: "sub/a.png", size: 4, crc: 0xabcd }, { entryPath: "empty.png", size: 0, crc: null }]);
  assert.equal(parse7zPlan("Path = a.png\nSize = 4\nEncrypted = +\nCRC = 00000001\n"), null);
});

test("接入 archive.ts：开启缓存后 7z 读取走缓存文件，结果与逐条读取一致", async () => {
  process.env.ARCHIVE_EXTRACT_CACHE_MAX_BYTES = String(64 * 1024 * 1024);
  const { archiveExtractCache, openArchiveEntryBody, readArchiveEntryBuffer } = await import("../archive.js");
  const source = await tempDir("extract-wired-");
  try {
    const page = await sharp({ create: { width: 12, height: 9, channels: 3, background: "blue" } }).png().toBuffer();
    await fs.writeFile(path.join(source, "a.png"), page);
    await fs.writeFile(path.join(source, "b.png"), Buffer.concat([page, Buffer.from("tail")]));
    const archive = path.join(source, "wired.7z");
    assert.equal(spawnSync(path7za, ["a", "-t7z", "-ms=on", archive, "a.png", "b.png"], { cwd: source }).status, 0);
    assert.deepEqual(await readArchiveEntryBuffer(archive, "a.png"), page);
    assert.equal(archiveExtractCache.size, 1);
    const body = await openArchiveEntryBody(archive, "b.png");
    const chunks: Buffer[] = [];
    if (Buffer.isBuffer(body)) chunks.push(body); else for await (const chunk of body) chunks.push(chunk as Buffer);
    assert.deepEqual(Buffer.concat(chunks), Buffer.concat([page, Buffer.from("tail")]));
    await assert.rejects(readArchiveEntryBuffer(archive, "a.png", { maxBytes: 10 }), /超过上限/);
  } finally {
    await fs.rm(source, { recursive: true, force: true });
  }
});
