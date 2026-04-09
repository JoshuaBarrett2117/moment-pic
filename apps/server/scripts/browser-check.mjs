import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:3210";
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDir = path.resolve("./.logs/browser-check");

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true });

  const rootsResponse = await fetch(`${baseUrl}/api/v1/library-roots`);
  const rootsPayload = await rootsResponse.json();
  const roots = rootsPayload.data;
  const zipAlbumsResponse = await fetch(`${baseUrl}/api/v1/albums?page=1&pageSize=20&sourceType=zip&sortBy=assetCount&sortOrder=desc`);
  const zipAlbumsPayload = await zipAlbumsResponse.json();
  const firstAlbum = zipAlbumsPayload.data.items[0];
  if (!firstAlbum) {
    throw new Error("没有可用于验收的 ZIP 图集");
  }

  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector('.root-chip');
  await page.screenshot({ path: path.join(outputDir, "home-paged.png"), fullPage: true });

  await page.fill('input[name="keyword"]', '桜桃喵');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "home-search.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.selectOption('select[name="sourceType"]', 'zip');
  await page.selectOption('select[name="sortBy"]', 'assetCount');
  await page.selectOption('select[name="sortOrder"]', 'desc');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "home-filtered.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html#/albums/${firstAlbum.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "album.png"), fullPage: true });
  const albumPageText = await page.locator('.pagination-meta').last().textContent();
  const hasSecondAssetPage = /第 1 \/ [2-9]\d* 页/.test(albumPageText ?? "");
  if (hasSecondAssetPage) {
    await page.click('[data-album-page-action="next"]');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, "album-page-2.png"), fullPage: true });
  }

  await page.goto(`${baseUrl}/index.html#/albums/${firstAlbum.id}/view/0`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const progressVisibleInitially = await page.locator('[data-viewer-progress]').evaluate((node) => node.classList.contains('visible'));
  await page.waitForTimeout(2400);
  const progressHiddenAfterIdle = await page.locator('[data-viewer-progress]').evaluate((node) => !node.classList.contains('visible'));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const progressVisibleAfterSwitch = await page.locator('[data-viewer-progress]').evaluate((node) => node.classList.contains('visible'));
  const dimensionText = await page.locator('.viewer-title .muted').textContent();
  const fullscreenActive = await page.evaluate(() => Boolean(document.fullscreenElement));
  await page.screenshot({ path: path.join(outputDir, "viewer.png"), fullPage: true });
  await page.keyboard.press('r');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "viewer-rotated.png"), fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const fullscreenAfterEscape = await page.evaluate(() => Boolean(document.fullscreenElement));

  await browser.close();

  console.log(JSON.stringify({
    roots: roots.map((root) => root.name),
    albumName: firstAlbum.name,
    albumPageText,
    hasSecondAssetPage,
    progressVisibleInitially,
    progressHiddenAfterIdle,
    progressVisibleAfterSwitch,
    dimensionText,
    fullscreenActive,
    fullscreenAfterEscape,
    screenshots: [
      path.join(outputDir, "home-paged.png"),
      path.join(outputDir, "home-search.png"),
      path.join(outputDir, "home-filtered.png"),
      path.join(outputDir, "album.png"),
      path.join(outputDir, "album-page-2.png"),
      path.join(outputDir, "viewer.png"),
      path.join(outputDir, "viewer-rotated.png")
    ]
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
