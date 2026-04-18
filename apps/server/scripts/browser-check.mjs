import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:3210";
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDir = path.resolve("./.logs/browser-check");

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true });

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      username: "admin",
      password: "admin"
    })
  });
  if (!loginResponse.ok) {
    throw new Error(`登录失败：${loginResponse.status}`);
  }

  const authCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
  if (!authCookie) {
    throw new Error("登录后未拿到认证 cookie");
  }

  const requestHeaders = {
    cookie: authCookie
  };

  const rootsResponse = await fetch(`${baseUrl}/api/v1/library-roots`, {
    headers: requestHeaders
  });
  const rootsPayload = await rootsResponse.json();
  const roots = rootsPayload.data;
  const zipAlbumsResponse = await fetch(`${baseUrl}/api/v1/albums?page=1&pageSize=20&sourceType=zip&sortBy=assetCount&sortOrder=desc`, {
    headers: requestHeaders
  });
  const zipAlbumsPayload = await zipAlbumsResponse.json();
  const firstAlbum = zipAlbumsPayload.data.items[0];
  if (!firstAlbum) {
    throw new Error("没有可用于验收的 ZIP 图集");
  }

  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "authenticated");
  });
  await page.context().addCookies([
    {
      name: "moment_pic_auth",
      value: authCookie.split("=")[1] ?? "",
      url: baseUrl
    }
  ]);

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector('text=瞬间图库');
  await page.screenshot({ path: path.join(outputDir, "home-paged.png"), fullPage: true });

  await page.fill('input[placeholder="搜索相册名称"]', '桜桃喵');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "home-search.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.locator('select').nth(0).selectOption('zip');
  await page.locator('select').nth(1).selectOption('assetCount');
  await page.locator('select').nth(2).selectOption('96');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "home-filtered.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html#/albums/${firstAlbum.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outputDir, "album.png"), fullPage: true });
  const albumPageText = await page.getByText(/共\s+\d+\s+项\s+\/\s+\d+\s+页/).textContent();
  const hasSecondAssetPage = /\/\s*[2-9]\d*\s*页/.test(albumPageText ?? "");
  if (hasSecondAssetPage) {
    await page.getByTitle('下一页').click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outputDir, "album-page-2.png"), fullPage: true });
  }

  await page.locator('main h3').first().click();
  await page.waitForTimeout(1200);
  await page.locator('.polaroid').first().click();
  await page.waitForSelector('.viewer-counter');
  const initialCounterText = await page.locator('.viewer-counter').textContent();
  let delayNextImage = false;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const isImageRequest = request.resourceType() === 'image';

    if (delayNextImage && isImageRequest) {
      await page.waitForTimeout(1200);
      delayNextImage = false;
    }

    await route.continue();
  });

  await page.waitForTimeout(800);
  delayNextImage = true;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const switchedCounterText = await page.locator('.viewer-counter').textContent();
  const viewerStateAfterSwitch = await page.locator('[data-viewer-state]').getAttribute('data-viewer-state');
  const imageOpacityAfterSwitch = await page.locator('.viewer-image').evaluate((node) => getComputedStyle(node).opacity);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-viewer-state]');
    return node?.getAttribute('data-viewer-state') === 'ready';
  }, null, { timeout: 6000 });
  const viewerStateAfterLoad = await page.locator('[data-viewer-state]').getAttribute('data-viewer-state');
  const dimensionText = await page.locator('.viewer-image').getAttribute('alt');
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
    initialCounterText,
    switchedCounterText,
    viewerStateAfterSwitch,
    imageOpacityAfterSwitch,
    viewerStateAfterLoad,
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
