import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { path7za } from '7zip-bin';

const repoRoot = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'moment-pic-load-'));
const libraryRoot = path.join(tempRoot, 'library');
const cacheDir = path.join(tempRoot, 'cache');
const sqlitePath = path.join(tempRoot, 'gallery.sqlite');
const port = 4317;
const baseUrl = `http://127.0.0.1:${port}`;
const sampleCount = Number(process.env.LOAD_SAMPLE_COUNT ?? 18);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 96);
const rounds = Number(process.env.LOAD_ROUNDS ?? 8);
const requestTimeoutMs = Number(process.env.LOAD_REQUEST_TIMEOUT_MS ?? 20000);
const adminPassword = 'load-test-password';
const metrics = [];
const statusCounts = new Map();
const errorSamples = [];
let cookie = '';
let server;
let serverListenPid = null;
let peakRss = 0;
let peakHeap = 0;
let peakServerWorkingSet = 0;

const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, ...options });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += Buffer.from(chunk).toString('utf8'); });
  child.stderr?.on('data', (chunk) => { stderr += Buffer.from(chunk).toString('utf8'); });
  child.once('error', reject);
  child.once('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr || stdout}`));
  });
});

const prepareFixture = async () => {
  await fs.mkdir(path.join(libraryRoot, 'large-folder'), { recursive: true });
  await fs.mkdir(path.join(libraryRoot, 'cbr-pages'), { recursive: true });
  const imageTasks = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const width = 4200 + (i % 3) * 800;
    const height = 3200 + (i % 4) * 500;
    const file = path.join(libraryRoot, 'large-folder', `large-${String(i + 1).padStart(2, '0')}.jpg`);
    imageTasks.push(
      sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: (40 + i * 17) % 255, g: (90 + i * 29) % 255, b: (130 + i * 37) % 255 }
        }
      }).jpeg({ quality: 88 }).toFile(file)
    );
  }
  await Promise.all(imageTasks);

  for (let i = 0; i < Math.max(6, Math.floor(sampleCount / 2)); i += 1) {
    const file = path.join(libraryRoot, 'cbr-pages', `page-${String(i + 1).padStart(2, '0')}.jpg`);
    await sharp({
      create: {
        width: 3600,
        height: 2600,
        channels: 3,
        background: { r: (80 + i * 21) % 255, g: (140 + i * 13) % 255, b: (40 + i * 31) % 255 }
      }
    }).jpeg({ quality: 86 }).toFile(file);
  }
  const archivePath = path.join(libraryRoot, 'large-archive.7z');
  await run(path7za, ['a', '-t7z', archivePath, 'cbr-pages'], { cwd: libraryRoot });
  await fs.rm(path.join(libraryRoot, 'cbr-pages'), { recursive: true, force: true });
};

const waitForHealth = async () => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('server health timeout');
};

const startServer = async () => {
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    ADMIN_PASSWORD: adminPassword,
    LIBRARY_ROOTS: libraryRoot,
    CACHE_DIR: cacheDir,
    SQLITE_PATH: sqlitePath,
    PUBLIC_DIR: path.join(repoRoot, 'apps', 'web', 'dist')
  };
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  server = spawn(process.execPath, [tsxCli, 'apps/server/src/index.ts'], {
    cwd: repoRoot,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => {
    const text = Buffer.from(chunk).toString('utf8');
    if (process.env.LOAD_VERBOSE_SERVER === '1') process.stdout.write(text);
  });
  server.stderr.on('data', (chunk) => {
    const text = Buffer.from(chunk).toString('utf8');
    if (process.env.LOAD_VERBOSE_SERVER === '1') process.stderr.write(text);
  });
  server.once('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${now()}] server exited with code ${code}`);
    }
  });
  await waitForHealth();
  serverListenPid = await resolveListeningPid();
};

const runPowershell = async (command) => {
  const result = await run('powershell.exe', ['-NoProfile', '-Command', command]);
  return result.stdout.trim();
};

const resolveListeningPid = async () => {
  try {
    const output = await runPowershell(`(Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess)`);
    const parsed = Number(output);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const login = async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: adminPassword })
  });
  if (!response.ok) throw new Error(`login failed: ${response.status} ${await response.text()}`);
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
};

const apiGetJson = async (url) => {
  const response = await fetch(`${baseUrl}${url}`, { headers: { cookie } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} -> ${response.status}: ${text}`);
  return JSON.parse(text);
};

const apiPostJson = async (url, body) => {
  const response = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} -> ${response.status}: ${text}`);
  return JSON.parse(text);
};

const prepareCatalog = async () => {
  const root = await apiPostJson('/api/v1/library-roots', {
    path: libraryRoot,
    name: 'load-test-library'
  });
  const scan = await apiPostJson('/api/v1/scan', {
    libraryRootId: root.data.id
  });
  const taskId = scan.data.taskId;
  const deadline = Date.now() + 90000;

  while (Date.now() < deadline) {
    const task = await apiGetJson(`/api/v1/scan/${taskId}`);
    if (task.data.status === 'completed') {
      return task.data;
    }
    if (task.data.status === 'failed') {
      throw new Error(`scan failed: ${task.data.error}`);
    }
    await sleep(500);
  }

  throw new Error('scan timeout');
};

const collectAssetIds = async () => {
  const albums = await apiGetJson('/api/v1/albums?pageSize=100&sortBy=name&sortOrder=asc');
  const ids = [];
  for (const album of albums.data.items) {
    const assets = await apiGetJson(`/api/v1/albums/${album.id}/assets?pageSize=300`);
    for (const asset of assets.data.items) ids.push(asset.id);
  }
  if (ids.length === 0) throw new Error('no assets discovered for load test');
  return ids;
};

const sampleMemory = () => {
  try {
    const usage = process.memoryUsage();
    const rss = usage.rss;
    const heap = usage.heapUsed;
    peakRss = Math.max(peakRss, rss);
    peakHeap = Math.max(peakHeap, heap);
    metrics.push({ at: Date.now(), clientRss: rss, clientHeap: heap, serverWorkingSet: peakServerWorkingSet });
  } catch {}
};

const sampleServerMemory = async () => {
  if (!serverListenPid) {
    return;
  }

  try {
    const output = await runPowershell(`(Get-Process -Id ${serverListenPid}).WorkingSet64`);
    const workingSet = Number(output);
    if (Number.isFinite(workingSet)) {
      peakServerWorkingSet = Math.max(peakServerWorkingSet, workingSet);
    }
  } catch {}
};

const requestOne = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${url}`, { headers: { cookie, accept: 'image/webp,image/*,*/*' }, signal: controller.signal });
    const arrayBuffer = await response.arrayBuffer();
    const statusKey = String(response.status);
    statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);
    if (response.status >= 500 || Buffer.from(arrayBuffer).includes(Buffer.from('Not enough memory'))) {
      errorSamples.push({ url, status: response.status, body: Buffer.from(arrayBuffer).subarray(0, 200).toString('utf8') });
    }
    return { ok: response.status < 500, status: response.status, bytes: arrayBuffer.byteLength, ms: performance.now() - started };
  } catch (error) {
    statusCounts.set('ERR', (statusCounts.get('ERR') ?? 0) + 1);
    errorSamples.push({ url, status: 'ERR', body: error instanceof Error ? error.message : String(error) });
    return { ok: false, status: 'ERR', bytes: 0, ms: performance.now() - started };
  } finally {
    clearTimeout(timeout);
  }
};

const runLoad = async (assetIds) => {
  const urls = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const id of assetIds) {
      urls.push(`/api/v1/assets/${id}/thumbnail?w=320&h=320&format=webp&round=${round}`);
      urls.push(`/api/v1/assets/${id}/preview?preset=balanced&format=webp&round=${round}`);
      if (round % 3 === 0) urls.push(`/api/v1/assets/${id}/original?round=${round}`);
    }
  }

  let index = 0;
  const latencies = [];
  let totalBytes = 0;
  const started = performance.now();
  const sampler = setInterval(sampleMemory, 250);
  const serverSampler = setInterval(() => {
    void sampleServerMemory();
  }, 500);
  const worker = async () => {
    while (index < urls.length) {
      const current = index;
      index += 1;
      const result = await requestOne(urls[current]);
      latencies.push(result.ms);
      totalBytes += result.bytes;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  clearInterval(sampler);
  clearInterval(serverSampler);
  sampleMemory();
  await sampleServerMemory();
  latencies.sort((a, b) => a - b);
  const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
  return {
    requests: urls.length,
    concurrency,
    rounds,
    assetCount: assetIds.length,
    durationMs: Math.round(performance.now() - started),
    totalBytes,
    p50Ms: Math.round(percentile(0.5)),
    p95Ms: Math.round(percentile(0.95)),
    p99Ms: Math.round(percentile(0.99))
  };
};

try {
  console.log(`[${now()}] tempRoot=${tempRoot}`);
  await prepareFixture();
  console.log(`[${now()}] fixture prepared: sampleCount=${sampleCount}`);
  await startServer();
  console.log(`[${now()}] server ready pid=${server.pid}`);
  await login();
  const scanResult = await prepareCatalog();
  console.log(`[${now()}] scan completed: assetsDiscovered=${scanResult.assetsDiscovered}`);
  const assetIds = await collectAssetIds();
  console.log(`[${now()}] assets=${assetIds.length}, concurrency=${concurrency}, rounds=${rounds}`);
  const summary = await runLoad(assetIds);
  console.log(JSON.stringify({
    summary,
    statusCounts: Object.fromEntries(statusCounts.entries()),
    peakClientRssMiB: mib(peakRss),
    peakClientHeapMiB: mib(peakHeap),
    peakServerWorkingSetMiB: mib(peakServerWorkingSet),
    errorSamples: errorSamples.slice(0, 10),
    tempRoot
  }, null, 2));
  if (errorSamples.some((item) => String(item.body).includes('Not enough memory') || Number(item.status) >= 500 || item.status === 'ERR')) {
    process.exitCode = 2;
  }
} finally {
  if (server && !server.killed) {
    server.kill();
    await sleep(1000);
  }
  if (serverListenPid) {
    try {
      await runPowershell(`Stop-Process -Id ${serverListenPid} -Force -ErrorAction SilentlyContinue`);
    } catch {}
  }
}
