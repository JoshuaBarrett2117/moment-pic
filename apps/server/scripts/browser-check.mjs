import { chromium, devices } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.MOMENT_PIC_BASE_URL ?? "http://127.0.0.1:3210";
const edgePath = process.env.MOMENT_PIC_BROWSER_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDir = path.resolve(process.env.MOMENT_PIC_BROWSER_CHECK_OUTPUT_DIR ?? "./.logs/browser-check");
const sampleLibraryPath = path.resolve(process.env.MOMENT_PIC_SAMPLE_LIBRARY_PATH ?? "./apps/server/samples/library");
const sampleLibraryName = process.env.MOMENT_PIC_SAMPLE_LIBRARY_NAME ?? "samples-library";
const defaultUsername = process.env.MOMENT_PIC_ADMIN_USERNAME ?? "admin";
const defaultPassword = process.env.MOMENT_PIC_ADMIN_PASSWORD ?? "admin";

const expectOk = async (response, label) => {
  if (response.ok) {
    return;
  }

  const text = await response.text();
  throw new Error(`${label}失败：${response.status} ${text}`);
};

const requestJson = async (url, init, label) => {
  const response = await fetch(url, init);
  await expectOk(response, label);
  const payload = await response.json();
  if (payload?.code !== 0) {
    throw new Error(`${label}失败：${payload?.message ?? "unknown error"}`);
  }
  return payload.data;
};

const loginByApi = async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      username: defaultUsername,
      password: defaultPassword
    })
  });
  await expectOk(response, "API 登录");
  const payload = await response.json();
  if (payload?.code !== 0) {
    throw new Error(`API 登录失败：${payload?.message ?? "unknown error"}`);
  }

  const authCookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!authCookie) {
    throw new Error("登录后未拿到认证 cookie");
  }

  return authCookie;
};

const createAuthHeaders = (authCookie) => ({
  cookie: authCookie
});

const waitForScanTask = async (authHeaders, taskId) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    const task = await requestJson(`${baseUrl}/api/v1/scan/${taskId}`, { headers: authHeaders }, "查询扫描任务");
    if (task.status === "completed") {
      return task;
    }
    if (task.status === "failed") {
      throw new Error(`扫描任务失败：${task.error ?? "unknown error"}`);
    }
    await delay(1000);
  }

  throw new Error(`扫描任务超时：${taskId}`);
};

const ensureSampleLibraryAndZipAlbum = async (authHeaders) => {
  const roots = await requestJson(`${baseUrl}/api/v1/library-roots`, { headers: authHeaders }, "读取库目录");
  let sampleRoot = roots.find((item) => item.path === sampleLibraryPath) ?? null;

  if (!sampleRoot) {
    sampleRoot = await requestJson(
      `${baseUrl}/api/v1/library-roots`,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          path: sampleLibraryPath,
          name: sampleLibraryName
        })
      },
      "添加样本库目录"
    );
  }

  const loadZipAlbums = async () => requestJson(
    `${baseUrl}/api/v1/albums?page=1&pageSize=20&sourceType=zip&sortBy=assetCount&sortOrder=desc`,
    { headers: authHeaders },
    "读取 ZIP 图集"
  );

  let zipAlbums = await loadZipAlbums();
  if (!zipAlbums.items[0]) {
    const scanTask = await requestJson(
      `${baseUrl}/api/v1/scan`,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          libraryRootId: sampleRoot.id
        })
      },
      "启动样本库扫描"
    );
    await waitForScanTask(authHeaders, scanTask.taskId);
    zipAlbums = await loadZipAlbums();
  }

  const firstAlbum = zipAlbums.items[0];
  if (!firstAlbum) {
    throw new Error("样本库扫描完成后仍没有可用于验收的 ZIP 图集");
  }

  return {
    roots,
    sampleRoot,
    firstAlbum
  };
};

const addAuthenticatedState = async (context, authCookie) => {
  const cookieValue = authCookie.split("=")[1] ?? "";
  await context.addCookies([
    {
      name: "moment_pic_auth",
      value: cookieValue,
      url: baseUrl
    }
  ]);
  await context.addInitScript(() => {
    localStorage.setItem("auth_token", "authenticated");
  });
};

const runDesktopFlow = async (browser, authCookie, firstAlbum) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 }
  });
  await addAuthenticatedState(context, authCookie);
  const page = await context.newPage();

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=瞬间图库");
  const galleryCards = await page.locator(".group.cursor-pointer").count();
  await page.screenshot({ path: path.join(outputDir, "desktop-home.png"), fullPage: true });

  const searchKeyword = firstAlbum.name.slice(0, Math.max(1, Math.min(4, firstAlbum.name.length)));
  await page.fill('input[placeholder="搜索相册名称"]', searchKeyword);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outputDir, "desktop-search.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html?sourceType=zip&sortBy=assetCount&pageSize=24`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=瞬间图库");
  await page.screenshot({ path: path.join(outputDir, "desktop-zip-filter.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html?view=smart`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=自动整理");
  const smartCards = await page.locator(".group.cursor-pointer").count();
  await page.screenshot({ path: path.join(outputDir, "desktop-smart-albums.png"), fullPage: true });

  await page.goto(`${baseUrl}/index.html?screen=album&albumId=${encodeURIComponent(firstAlbum.id)}`, { waitUntil: "networkidle" });
  await page.locator(".polaroid").first().waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(outputDir, "desktop-album-detail.png"), fullPage: true });

  await page.locator(".polaroid").first().click();
  await page.waitForSelector(".viewer-counter");
  const initialCounterText = await page.locator(".viewer-counter").textContent();

  let delayNextImage = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (delayNextImage && request.resourceType() === "image") {
      await page.waitForTimeout(1200);
      delayNextImage = false;
    }
    await route.continue();
  });

  await page.waitForTimeout(500);
  delayNextImage = true;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);

  const switchedCounterText = await page.locator(".viewer-counter").textContent();
  const viewerStateAfterSwitch = await page.locator("[data-viewer-state]").getAttribute("data-viewer-state");
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-viewer-state]");
    return node?.getAttribute("data-viewer-state") === "ready";
  }, null, { timeout: 6000 });
  const viewerStateAfterLoad = await page.locator("[data-viewer-state]").getAttribute("data-viewer-state");
  const imageAltAfterLoad = await page.locator(".viewer-image").getAttribute("alt");
  await page.screenshot({ path: path.join(outputDir, "desktop-viewer.png"), fullPage: true });

  await page.keyboard.press("r");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outputDir, "desktop-viewer-rotated.png"), fullPage: true });
  await page.keyboard.press("Escape");

  await page.goto(`${baseUrl}/index.html?screen=settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=设置");
  await page.getByRole("button", { name: "高级设置" }).click();
  await page.waitForSelector("text=高级设置");
  await page.getByRole("button", { name: "智能归纳" }).click();
  await page.waitForSelector("text=自动整理重建");
  await page.screenshot({ path: path.join(outputDir, "desktop-settings-smart.png"), fullPage: true });

  await context.close();

  return {
    galleryCards,
    smartCards,
    initialCounterText,
    switchedCounterText,
    viewerStateAfterSwitch,
    viewerStateAfterLoad,
    imageAltAfterLoad
  };
};

const runMobileFlow = async (browser, authCookie, firstAlbum) => {
  const context = await browser.newContext({
    ...devices["iPhone 12"]
  });
  const loginPage = await context.newPage();
  await loginPage.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await loginPage.waitForSelector("text=登录");
  await loginPage.screenshot({ path: path.join(outputDir, "mobile-login.png"), fullPage: true });
  await loginPage.fill('input[placeholder="请输入账号（默认 admin）"]', defaultUsername);
  await loginPage.fill('input[placeholder="请输入密码"]', defaultPassword);
  await loginPage.getByRole("button", { name: /登录/ }).click();
  await loginPage.waitForSelector("text=瞬间图库");
  await loginPage.screenshot({ path: path.join(outputDir, "mobile-gallery.png"), fullPage: true });
  await loginPage.close();

  const appPage = await context.newPage();
  await addAuthenticatedState(context, authCookie);
  await appPage.goto(`${baseUrl}/index.html?screen=album&albumId=${encodeURIComponent(firstAlbum.id)}`, { waitUntil: "networkidle" });
  await appPage.locator(".polaroid").first().waitFor({ state: "visible" });
  await appPage.screenshot({ path: path.join(outputDir, "mobile-album-detail.png"), fullPage: true });
  await appPage.locator(".polaroid").first().click();
  await appPage.waitForSelector(".viewer-counter");
  await appPage.screenshot({ path: path.join(outputDir, "mobile-viewer.png"), fullPage: true });

  await context.close();

  return {
    loginVisible: true,
    galleryVisible: true,
    albumDetailVisible: true,
    viewerVisible: true
  };
};

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.access(edgePath);

  const authCookie = await loginByApi();
  const authHeaders = createAuthHeaders(authCookie);
  const { roots, sampleRoot, firstAlbum } = await ensureSampleLibraryAndZipAlbum(authHeaders);

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true
  });

  try {
    const desktop = await runDesktopFlow(browser, authCookie, firstAlbum);
    const mobile = await runMobileFlow(browser, authCookie, firstAlbum);

    console.log(JSON.stringify({
      baseUrl,
      sampleLibraryPath,
      roots: roots.map((item) => item.name),
      sampleRootName: sampleRoot.name,
      zipAlbumName: firstAlbum.name,
      desktop,
      mobile,
      screenshots: [
        path.join(outputDir, "desktop-home.png"),
        path.join(outputDir, "desktop-search.png"),
        path.join(outputDir, "desktop-zip-filter.png"),
        path.join(outputDir, "desktop-smart-albums.png"),
        path.join(outputDir, "desktop-album-detail.png"),
        path.join(outputDir, "desktop-viewer.png"),
        path.join(outputDir, "desktop-viewer-rotated.png"),
        path.join(outputDir, "desktop-settings-smart.png"),
        path.join(outputDir, "mobile-login.png"),
        path.join(outputDir, "mobile-gallery.png"),
        path.join(outputDir, "mobile-album-detail.png"),
        path.join(outputDir, "mobile-viewer.png")
      ]
    }, null, 2));
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
