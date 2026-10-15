import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { channel } from "node:diagnostics_channel";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { Worker } from "node:worker_threads";
import { path7za } from "7zip-bin";
import { ResourceBusyError, WorkBudget } from "../../lib/work-budget.js";
import { listRootImageEntries, openArchiveEntryBody, readArchiveEntryBuffer } from "../archive.js";
import { archiveBudget, collectBounded } from "./archive-limits.js";
import { detectRarVersion, readCbrStream } from "./cbr-reader.js";
import { RAR_CHUNK_BYTES, RAR_WORKER_CHANNEL } from "./rar-protocol.js";
import { createStoredRarArchive, createStoredRar5Archive } from "./rar-test-fixture.js";
import { run7zaStream } from "./sevenzip-reader.js";

type ObservedWorker = { worker: Worker; control: Int32Array; exit: Promise<number> };
class CountingBudget extends WorkBudget {
  acquisitions = 0;
  releases = 0;
  override async acquire(signal?: AbortSignal): Promise<() => void> {
    const release = await super.acquire(signal);
    this.acquisitions += 1;
    return () => { this.releases += 1; release(); };
  }
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "等待归档状态超时");
    await delay(2);
  }
};

const withWorkers = async (run: (records: ObservedWorker[], directory: string) => Promise<void>): Promise<void> => {
  await fs.mkdir("tmp", { recursive: true });
  const directory = await fs.mkdtemp(path.resolve("tmp/rar-safety-"));
  const records: ObservedWorker[] = [];
  const events = channel(RAR_WORKER_CHANNEL);
  const observe = (message: unknown) => {
    const { worker, control } = message as Omit<ObservedWorker, "exit">;
    records.push({ worker, control, exit: new Promise((resolve) => worker.once("exit", resolve)) });
  };
  events.subscribe(observe);
  try { await run(records, directory); }
  finally {
    for (const { worker } of records) if (worker.threadId !== -1) await worker.terminate();
    await Promise.all(records.map((record) => record.exit));
    events.unsubscribe(observe);
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const assertReleased = async (records: ObservedWorker[], budget: CountingBudget, count = 1): Promise<void> => {
  await Promise.all(records.map((record) => record.exit));
  assert.equal(records.length, count);
  assert.ok(records.every((record) => record.worker.threadId === -1));
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
  assert.equal(budget.releases, count);
};

const writeArchive = async (directory: string, bytes = 8 * 1024 * 1024, version = 4): Promise<string> => {
  const archive = path.join(directory, `book-${version}.cbr`);
  const png = await fs.readFile("apps/server/src/services/archive/fixtures/pixel.png");
  const content = Buffer.concat([png, Buffer.alloc(bytes, 0x5a)]);
  await fs.writeFile(archive, (version === 4 ? createStoredRarArchive : createStoredRar5Archive)([{ entryPath: "page.png", content }]));
  return archive;
};

test("RAR4/RAR5 魔数、截断签名、非 RAR CBR 分流与 .rar 扩展名", async () => withWorkers(async (records, directory) => {
  for (const version of [4, 5]) {
    const archive = path.join(directory, `book-${version}.rar`);
    await fs.copyFile(`apps/server/src/services/archive/fixtures/pixel-rar${version}.cbr`, archive);
    assert.equal(await detectRarVersion(archive), version);
    assert.equal((await readArchiveEntryBuffer(archive, "pixel.png")).length, 90);
  }
  for (const signature of ["526172211a07", "526172211a0701", "526172211a070200"]) {
    const archive = path.join(directory, "bad.cbr");
    await fs.writeFile(archive, Buffer.from(signature, "hex"));
    await assert.rejects(listRootImageEntries(archive), /签名损坏/);
  }
  await fs.writeFile(path.join(directory, "page.png"), Buffer.from("not-rar"));
  const disguised = path.join(directory, "zip.cbr");
  assert.equal(spawnSync(path7za, ["a", "-tzip", disguised, "page.png"], { cwd: directory }).status, 0);
  assert.equal(await detectRarVersion(disguised), null);
  assert.equal((await readArchiveEntryBuffer(disguised, "page.png")).toString(), "not-rar");
  assert.equal(records.length, 2);
}));

test("RAR 魔数读取尚未完成也可超时，但文件实际关闭后才释放预算", async (context) => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory, 1024);
  const originalOpen = fs.open;
  let unblock: () => void = () => {};
  const pending = new Promise<void>((resolve) => { unblock = resolve; });
  context.mock.method(fs, "open", async (...parameters: Parameters<typeof fs.open>) => {
    await pending;
    return originalOpen(...parameters);
  });
  try {
    await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget, timeoutMs: 30 }), { code: "ARCHIVE_TIMEOUT" });
    assert.equal(records.length, 0);
    assert.equal(budget.releases, 0);
    assert.equal(budget.usage.active, 1);
  } finally { unblock(); context.mock.restoreAll(); }
  await waitFor(() => budget.usage.active === 0);
  assert.equal(budget.releases, 1);
  assert.equal((await readArchiveEntryBuffer(archive, "page.png", { budget })).length, 1114);
  assert.equal(budget.releases, 2);
}));

test("RAR 正常结束必须等真实 worker exit 才结束流且恰好释放一次", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory, 1024);
  const stream = await readCbrStream(archive, "page.png", { budget });
  assert.equal(budget.usage.active, 1);
  const content = await collectBounded(stream);
  assert.equal(content.length, 1114);
  assert.equal(records[0].worker.threadId, -1);
  await assertReleased(records, budget);
}));

for (const version of [4, 5]) {
  test(`RAR${version} CRC 损坏与缺失条目不重试，终止并释放`, async () => withWorkers(async (records, directory) => {
    const budget = new CountingBudget(1, 0);
    const archive = await writeArchive(directory, 1024, version);
    const bytes = await fs.readFile(archive);
    const dataOffset = bytes.indexOf(Buffer.from("89504e470d0a1a0a", "hex"));
    assert.ok(dataOffset > 0);
    bytes[dataOffset + 40] ^= 0xff;
    await fs.writeFile(archive, bytes);
    await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget }), /damaged|损坏|BAD_DATA/);
    await assertReleased(records, budget);
    const good = await writeArchive(directory, 1024, version);
    await assert.rejects(readArchiveEntryBuffer(good, "absent.png", { budget }), /not found/);
    await assertReleased(records, budget, 2);
  }));
}

test("RAR 列表计数包含非图片，列表字节上限和解压真实字节上限均回收 worker", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = path.join(directory, "entries.rar");
  await fs.writeFile(archive, createStoredRarArchive([
    { entryPath: "hidden.txt", content: Buffer.alloc(0) },
    { entryPath: "page.png", content: Buffer.alloc(4096) }
  ]));
  await assert.rejects(listRootImageEntries(archive, { budget, maxEntries: 1 }), { code: "ARCHIVE_ENTRY_LIMIT" });
  await assertReleased(records, budget);
  await assert.rejects(listRootImageEntries(archive, { budget, maxBytes: 300 }), { code: "ARCHIVE_BYTE_LIMIT" });
  await assertReleased(records, budget, 2);
  await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget, maxBytes: 4095 }), { code: "ARCHIVE_BYTE_LIMIT" });
  await assertReleased(records, budget, 3);
  await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget, maxEntries: 1 }), { code: "ARCHIVE_ENTRY_LIMIT" });
  await assertReleased(records, budget, 4);
}));

test("solid RAR 前置隐藏条目也实际解码并计入字节预算，不仅限制目标图片", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = path.join(directory, "solid.rar");
  const png = await fs.readFile("apps/server/src/services/archive/fixtures/pixel.png");
  await fs.writeFile(archive, createStoredRarArchive([
    { entryPath: "hidden.bin", content: Buffer.alloc(1024 * 1024, 65) },
    { entryPath: "page.png", content: png }
  ], { solid: true }));
  assert.deepEqual(await readArchiveEntryBuffer(archive, "page.png", { budget, maxBytes: 1024 * 1024 + png.length }), png);
  await assertReleased(records, budget);
  await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget, maxBytes: 1024 * 1024 + png.length - 1 }), { code: "ARCHIVE_BYTE_LIMIT" });
  assert.ok(Atomics.load(records[1].control, 1) >= 1024 * 1024 + png.length);
  await assertReleased(records, budget, 2);
}));

test("RAR 慢消费者的背压抵达真实 WASM write，恢复读取不丢字节", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory);
  const stream = await readCbrStream(archive, "page.png", { budget });
  stream.read(0);
  await waitFor(() => stream.readableLength > 0 && Atomics.load(records[0].control, 3) > 0);
  await delay(50);
  const decoded = Atomics.load(records[0].control, 1);
  const posted = Atomics.load(records[0].control, 2);
  assert.ok(decoded > 0 && decoded < 8 * 1024 * 1024);
  assert.ok(posted <= 2 * RAR_CHUNK_BYTES);
  assert.ok(stream.readableLength <= RAR_CHUNK_BYTES);
  await delay(80);
  assert.equal(Atomics.load(records[0].control, 1), decoded);
  assert.equal(Atomics.load(records[0].control, 2), posted);
  assert.equal(budget.usage.active, 1);
  let length = 0;
  for await (const chunk of stream) length += chunk.length;
  assert.equal(length, 8 * 1024 * 1024 + 90);
  await assertReleased(records, budget);
}));

test("公共图片流客户端 destroy 穿透到暂停中的 WASM，并确认 worker 已死亡", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory);
  const body = await openArchiveEntryBody(archive, "page.png", { budget });
  assert.ok(!Buffer.isBuffer(body));
  await waitFor(() => Atomics.load(records[0].control, 3) > 0);
  body.destroy();
  await assertReleased(records, budget);
}));

test("AbortSignal 终止暂停中的 RAR5 WASM，不等待生产者响应消息", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory, 8 * 1024 * 1024, 5);
  const controller = new AbortController();
  const stream = await readCbrStream(archive, "page.png", { budget, signal: controller.signal });
  stream.read(0);
  await waitFor(() => stream.readableLength > 0);
  const reading = collectBounded(stream);
  controller.abort(new Error("client disconnected"));
  await assert.rejects(reading, /client disconnected/);
  await assertReleased(records, budget);
}));

test("WASM 正在同步解码隐藏条目时 AbortSignal 仍立即终止 worker", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = path.join(directory, "busy.rar");
  const size = 64 * 1024 * 1024;
  await fs.writeFile(archive, createStoredRarArchive([
    { entryPath: "hidden.bin", content: Buffer.alloc(size, 65) },
    { entryPath: "page.png", content: Buffer.alloc(1024) }
  ], { solid: true }));
  const controller = new AbortController();
  const stream = await readCbrStream(archive, "page.png", { budget, signal: controller.signal });
  await waitFor(() => Atomics.load(records[0].control, 1) > 0);
  assert.ok(Atomics.load(records[0].control, 1) < size);
  assert.equal(Atomics.load(records[0].control, 2), 0);
  const reading = collectBounded(stream);
  const start = Date.now();
  controller.abort(new Error("cancel synchronous decode"));
  await assert.rejects(reading, /cancel synchronous decode/);
  await assertReleased(records, budget);
  assert.ok(Date.now() - start < 2000);
  assert.ok(Atomics.load(records[0].control, 1) < size);
}));

test("RAR 墙钟超时包含暂停阶段，超时后实际杀死 worker", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory);
  const stream = await readCbrStream(archive, "page.png", { budget, timeoutMs: 1000 });
  stream.read(0);
  await waitFor(() => stream.readableLength > 0);
  const failure = new Promise<Error>((resolve) => stream.once("error", resolve));
  assert.equal((await failure as Error & { code: string }).code, "ARCHIVE_TIMEOUT");
  await assertReleased(records, budget);
}));

test("RAR 排队取消、排队超时、队列耗尽均不启动 worker，也不偷放他人的许可", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 1);
  const archive = await writeArchive(directory, 1024);
  const release = await budget.acquire();
  const controller = new AbortController();
  const queued = readArchiveEntryBuffer(archive, "page.png", { budget, signal: controller.signal });
  await waitFor(() => budget.usage.queued === 1);
  await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget }), ResourceBusyError);
  controller.abort();
  await assert.rejects(queued, { name: "AbortError" });
  await assert.rejects(readArchiveEntryBuffer(archive, "page.png", { budget, timeoutMs: 30 }), { code: "ARCHIVE_TIMEOUT" });
  assert.equal(records.length, 0);
  assert.equal(budget.releases, 0);
  assert.deepEqual(budget.usage, { active: 1, queued: 0 });
  release();
  assert.equal((await readArchiveEntryBuffer(archive, "page.png", { budget })).length, 1114);
  assert.equal(budget.releases, 2);
}));

test("RAR 和真实 7z 提取共享注入预算，worker 退出后才交接许可", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 1);
  const archive = await writeArchive(directory);
  await fs.writeFile(path.join(directory, "text.txt"), "sevenzip-shared-budget");
  const sevenzip = path.join(directory, "book.7z");
  assert.equal(spawnSync(path7za, ["a", "-t7z", sevenzip, "text.txt"], { cwd: directory }).status, 0);
  const rar = await readCbrStream(archive, "page.png", { budget });
  rar.read(0);
  await waitFor(() => rar.readableLength > 0);
  const queued = run7zaStream(["e", "-so", sevenzip, "text.txt"], { budget });
  await waitFor(() => budget.usage.queued === 1);
  rar.destroy();
  const stream = await queued;
  assert.equal(records[0].worker.threadId, -1);
  assert.equal((await collectBounded(stream)).toString(), "sevenzip-shared-budget");
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
  assert.ok(budget.acquisitions >= 2);
  assert.equal(budget.releases, budget.acquisitions);
}));

test("默认全局归档预算也由 RAR 和 7z 共用，而非独立 worker 池", async () => withWorkers(async (_records, directory) => {
  const archive = await writeArchive(directory);
  const streams = await Promise.all(Array.from({ length: 4 }, () => readCbrStream(archive, "page.png")));
  try {
    const queued = run7zaStream(["i"]);
    await waitFor(() => archiveBudget.usage.queued === 1);
    assert.equal(archiveBudget.usage.active, 4);
    for (const stream of streams) stream.destroy();
    assert.ok((await collectBounded(await queued)).length > 0);
    await waitFor(() => archiveBudget.usage.active === 0);
  } finally { for (const stream of streams) stream.destroy(); }
}));

test("意外 worker 退出不能伪装成成功 EOF，失败后预算仍可恢复", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = await writeArchive(directory);
  const stream = await readCbrStream(archive, "page.png", { budget });
  stream.read(0);
  await waitFor(() => stream.readableLength > 0);
  const failure = new Promise<Error>((resolve) => stream.once("error", resolve));
  await records[0].worker.terminate();
  assert.equal((await failure as Error & { code: string }).code, "ARCHIVE_DECODE_ERROR");
  await assertReleased(records, budget);
  assert.equal((await readArchiveEntryBuffer(archive, "page.png", { budget })).length, 8 * 1024 * 1024 + 90);
  await assertReleased(records, budget, 2);
}));

test("RAR 条目路径绝不能落盘或覆盖输入文件", async () => withWorkers(async (records, directory) => {
  const budget = new CountingBudget(1, 0);
  const archive = path.join(directory, "paths.rar");
  const victim = path.join(directory, "victim.png");
  await fs.writeFile(victim, "unchanged");
  const names = ["../../escape.png", victim, "C:\\escape.png", "nested/../../escape.png"];
  for (const name of names) {
    const bytes = createStoredRarArchive([{ entryPath: name, content: Buffer.from("payload") }]);
    await fs.writeFile(archive, bytes);
    assert.equal((await readArchiveEntryBuffer(archive, name, { budget })).toString(), "payload");
    assert.deepEqual(await fs.readFile(archive), bytes);
    assert.equal(await fs.readFile(victim, "utf8"), "unchanged");
    assert.deepEqual((await fs.readdir(directory)).sort(), ["paths.rar", "victim.png"]);
  }
  await assertReleased(records, budget, 4);
}));
