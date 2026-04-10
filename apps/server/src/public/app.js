const state = {
  albums: [],
  libraryRoots: [],
  currentAlbum: null,
  currentAssets: [],
  currentAssetGlobalIndex: 0,
  viewer: {
    fitMode: "fit",
    uiVisible: false,
    rotation: 0,
    progressTimer: null,
    preloadRadius: 10,
    preloadTaskId: 0,
    pageCacheAlbumId: null,
    pageCache: new Map(),
    preloadedAssetIds: new Set(),
    scale: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    touchStartX: 0,
    touchStartY: 0,
    touchLastX: 0,
    touchLastY: 0,
    touchMoved: false,
    touchMode: "none",
    pinchStartDistance: 0,
    pinchStartScale: 1,
    suppressNextStageClick: false
  },
  filters: {
    keyword: "",
    libraryRootId: "",
    sourceType: "",
    sortBy: "name",
    sortOrder: "asc",
    page: 1,
    pageSize: 24
  },
  pagination: {
    page: 1,
    pageSize: 24,
    total: 0
  },
  albumPagination: {
    page: 1,
    pageSize: 48,
    total: 0
  },
  ui: {
    filtersExpanded: false
  }
};

const app = document.querySelector("#app");
const VIEWER_PRELOAD_RADIUS_KEY = "moment_pic_viewer_preload_radius";

const clampPreloadRadius = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const readPreloadRadius = () => {
  try {
    return clampPreloadRadius(localStorage.getItem(VIEWER_PRELOAD_RADIUS_KEY) ?? "10");
  } catch {
    return 10;
  }
};

const writePreloadRadius = (value) => {
  try {
    localStorage.setItem(VIEWER_PRELOAD_RADIUS_KEY, String(value));
  } catch {
    // 浏览器禁用本地存储时忽略，保留内存值
  }
};

state.viewer.preloadRadius = readPreloadRadius();

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }
  return payload.data;
};

const setStatus = (message) => {
  const node = document.querySelector("[data-status]");
  if (node) {
    node.textContent = message;
  }
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const buildAlbumQuery = () => {
  const params = new URLSearchParams({
    page: String(state.filters.page),
    pageSize: String(state.filters.pageSize),
    sortBy: state.filters.sortBy,
    sortOrder: state.filters.sortOrder
  });

  if (state.filters.keyword.trim()) {
    params.set("keyword", state.filters.keyword.trim());
  }

  if (state.filters.libraryRootId) {
    params.set("libraryRootId", state.filters.libraryRootId);
  }

  if (state.filters.sourceType) {
    params.set("sourceType", state.filters.sourceType);
  }

  return `/api/v1/albums?${params.toString()}`;
};

const createAlbumCard = (album) => `
  <article class="album-card" data-album-id="${album.id}">
    <div class="album-cover">
      ${album.coverUrl ? `<img src="${album.coverUrl}" alt="${escapeHtml(album.name)}" loading="lazy" />` : `<div class="album-cover-placeholder">暂无封面</div>`}
      <div class="album-cover-info">
        <h3>${escapeHtml(album.name)}</h3>
        <div class="album-cover-meta">${album.assetCount} 张图片</div>
      </div>
    </div>
    <div class="album-body">
      <div class="album-badge">${album.sourceType === "folder" ? "目录图集" : "ZIP 图集"}</div>
    </div>
  </article>
`;

const createAssetCard = (asset, index) => `
  <article class="thumb-card" data-asset-index="${index}">
    ${asset.thumbnailUrl ? `<img src="${asset.thumbnailUrl}" alt="${escapeHtml(asset.name)}" loading="lazy" />` : `<div class="thumb-placeholder">无缩略图</div>`}
    <div class="thumb-caption">
      <div class="thumb-name">${escapeHtml(asset.name)}</div>
      <div class="thumb-meta">${asset.extension.toUpperCase()}${asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}</div>
    </div>
  </article>
`;

const createLibraryRoots = () => {
  if (state.libraryRoots.length === 0) {
    return "";
  }

  return `
    <div class="library-roots">
      ${state.libraryRoots
        .map(
          (root) => `
            <div class="root-chip">
              <strong>${escapeHtml(root.name)}</strong>
              <span>${escapeHtml(root.path)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
};

const createToolbarFilters = () => `
  <div class="filter-panel ${state.ui.filtersExpanded ? "expanded" : "collapsed"}">
    <button class="button button-secondary" data-action="toggle-filters">${state.ui.filtersExpanded ? "收起筛选" : "展开筛选"}</button>
    <div class="toolbar-group">
      <input class="control control-input" type="search" name="keyword" placeholder="搜索图集名称" value="${escapeHtml(state.filters.keyword)}" data-filter="keyword" />
      <select class="control" name="libraryRootId" data-filter="libraryRootId">
        <option value="" ${state.filters.libraryRootId === "" ? "selected" : ""}>全部目录</option>
        ${state.libraryRoots
          .map(
            (root) => `<option value="${root.id}" ${state.filters.libraryRootId === root.id ? "selected" : ""}>${escapeHtml(root.name)}</option>`
          )
          .join("")}
      </select>
      <select class="control" name="sourceType" data-filter="sourceType">
        <option value="" ${state.filters.sourceType === "" ? "selected" : ""}>全部来源</option>
        <option value="folder" ${state.filters.sourceType === "folder" ? "selected" : ""}>目录图集</option>
        <option value="zip" ${state.filters.sourceType === "zip" ? "selected" : ""}>ZIP 图集</option>
      </select>
      <select class="control" name="sortBy" data-filter="sortBy">
        <option value="name" ${state.filters.sortBy === "name" ? "selected" : ""}>按名称排序</option>
        <option value="updatedAt" ${state.filters.sortBy === "updatedAt" ? "selected" : ""}>按更新时间排序</option>
        <option value="assetCount" ${state.filters.sortBy === "assetCount" ? "selected" : ""}>按图片数量排序</option>
      </select>
      <select class="control" name="sortOrder" data-filter="sortOrder">
        <option value="asc" ${state.filters.sortOrder === "asc" ? "selected" : ""}>升序</option>
        <option value="desc" ${state.filters.sortOrder === "desc" ? "selected" : ""}>降序</option>
      </select>
      <select class="control" name="pageSize" data-filter="pageSize">
        <option value="12" ${state.filters.pageSize === 12 ? "selected" : ""}>12 / 页</option>
        <option value="24" ${state.filters.pageSize === 24 ? "selected" : ""}>24 / 页</option>
        <option value="48" ${state.filters.pageSize === 48 ? "selected" : ""}>48 / 页</option>
      </select>
      <label class="control preload-setting" title="查看器预加载半径">
        预加载 ±
        <input type="number" min="0" max="100" step="1" value="${state.viewer.preloadRadius}" data-action="set-preload-radius" />
      </label>
    </div>
  </div>
`;

const createPagination = () => {
  const { page, pageSize, total } = state.pagination;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return `
    <div class="pagination">
      <div class="pagination-meta">显示 ${start}-${end} / 共 ${total} 个图集，第 ${page} / ${totalPages} 页</div>
      <div class="pagination-actions">
        <button class="button button-secondary" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <button class="button button-secondary" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
      </div>
    </div>
  `;
};

const createAlbumPagination = () => {
  const { page, pageSize, total } = state.albumPagination;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return `
    <div class="pagination">
      <div class="pagination-meta">当前显示第 ${start}-${end} 张 / 共 ${total} 张，第 ${page} / ${totalPages} 页</div>
      <div class="pagination-actions">
        <button class="button button-secondary" data-album-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <button class="button button-secondary" data-album-page-action="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
      </div>
    </div>
  `;
};

const renderShell = (content) => {
  const hash = location.hash || "#/";
  const isManage = /^#\/manage$/.test(hash);
  const isHome = !hash || hash === "#/" || hash === "#";
  const quickActions = [
    `<button class="button button-primary button-compact" data-action="rescan">扫描</button>`,
    !isHome ? `<button class="button button-secondary button-compact" data-action="go-home">首页</button>` : "",
    !isManage ? `<button class="button button-secondary button-compact" data-action="go-manage">管理</button>` : ""
  ]
    .filter(Boolean)
    .join("");

  app.innerHTML = `
    <div class="shell">
      <section class="hero">
        <div class="hero-top">
          <div>
            <span class="eyebrow">Moment Pic / Local Gallery</span>
            <h1>瞬间图库</h1>
            <p>当前版本支持多目录扫描、图集搜索筛选、分页浏览，以及全屏大图查看。</p>
          </div>
          <div class="status" data-status>准备就绪</div>
        </div>
        ${createLibraryRoots()}
        <div class="toolbar">
          ${createToolbarFilters()}
          <div class="quick-actions">${quickActions}</div>
        </div>
      </section>
      <section class="content">${content}</section>
    </div>
    <div class="viewer" id="viewer"></div>
  `;
};

const ensureLibraryRoots = async () => {
  if (state.libraryRoots.length > 0) {
    return;
  }

  state.libraryRoots = await fetchJson("/api/v1/library-roots");
};

const renderHome = async () => {
  await ensureLibraryRoots();
  renderShell(`<div class="empty-state">正在读取图集列表...</div>`);
  bindCommonEvents();
  const data = await fetchJson(buildAlbumQuery());
  state.albums = data.items;
  state.pagination = data.pagination;

  const grid = data.items.length
    ? `<div class="album-grid">${data.items.map(createAlbumCard).join("")}</div>${createPagination()}`
    : `<div class="empty-state">没有匹配到图集。可以调整搜索词、目录、来源筛选或排序方式后再试。</div>`;

  renderShell(grid);
  bindCommonEvents();
  document.querySelectorAll("[data-album-id]").forEach((node) => {
    node.addEventListener("click", () => {
      location.hash = `#/albums/${node.getAttribute("data-album-id")}`;
    });
  });
  setStatus(`当前结果 ${data.pagination.total} 个图集`);
};

const renderManage = async () => {
  await ensureLibraryRoots();
  renderShell(`<div class="empty-state">正在读取目录列表...</div>`);
  bindCommonEvents();
  const libraryRoots = await fetchJson("/api/v1/library-roots");

  const createRootItem = (root) => {
    const lastScanned = root.lastScannedAt ? new Date(root.lastScannedAt).toLocaleString("zh-CN") : "从未扫描";
    return `
      <div class="manage-item" data-root-id="${root.id}">
        <div class="manage-item-body">
          <h3>${escapeHtml(root.name)}</h3>
          <div class="album-meta">${escapeHtml(root.path)}</div>
          <div class="album-meta">最近扫描：${lastScanned}</div>
          <div class="manage-item-actions">
            <button class="button button-danger button-sm" data-action="delete" data-root-id="${root.id}">移除</button>
          </div>
        </div>
      </div>
    `;
  };

  const rootsContent = libraryRoots.length
    ? `<div class="manage-grid">${libraryRoots.map(createRootItem).join("")}</div>`
    : `<div class="empty-state">暂无配置的图库目录。</div>`;

  const addForm = `
    <div class="add-root-form">
      <input class="control" type="text" id="new-root-path" placeholder="输入目录路径，如 D:\\图片" />
      <input class="control" type="text" id="new-root-name" placeholder="目录名称（可选）" />
      <button class="button button-primary" id="add-root-btn">添加目录</button>
    </div>
  `;

  renderShell(`
    <div class="detail-header">
      <div>
        <a href="#/" class="back-link">← 返回首页</a>
        <h2 style="margin-top: 10px;">图库目录管理</h2>
        <p style="margin-top: 8px; color: var(--muted);">管理图库扫描的根目录，添加或移除目录后需要重新扫描。</p>
      </div>
    </div>
    ${addForm}
    <h3 style="margin: 24px 0 16px;">已配置的目录</h3>
    ${rootsContent}
  `);
  bindCommonEvents();

  document.getElementById("add-root-btn")?.addEventListener("click", async () => {
    const pathInput = document.getElementById("new-root-path");
    const nameInput = document.getElementById("new-root-name");
    const path = pathInput?.value.trim();
    if (!path) {
      setStatus("请输入目录路径");
      return;
    }
    try {
      await fetchJson("/api/v1/library-roots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, name: nameInput?.value.trim() || undefined })
      });
      setStatus("目录添加成功，请重新扫描");
      await renderManage();
    } catch (error) {
      setStatus(`添加失败：${error.message}`);
    }
  });

  document.querySelectorAll("[data-action='delete']").forEach((node) => {
    node.addEventListener("click", async () => {
      const rootId = node.getAttribute("data-root-id");
      const root = libraryRoots.find((r) => r.id === rootId);
      if (!root) return;
      if (!confirm(`确定要移除目录「${root.name}」吗？该目录下的所有图集数据将被删除。`)) return;
      try {
        await fetchJson(`/api/v1/library-roots/${rootId}`, { method: "DELETE" });
        setStatus("目录已移除");
        await renderManage();
      } catch (error) {
        setStatus(`移除失败：${error.message}`);
      }
    });
  });

  setStatus("图库目录管理");
};

const resetViewerPageCache = (albumId = null) => {
  state.viewer.pageCacheAlbumId = albumId;
  state.viewer.pageCache = new Map();
  state.viewer.preloadedAssetIds = new Set();
};

const getCachedAlbumPage = (albumId, page) => {
  if (state.viewer.pageCacheAlbumId !== albumId) {
    return null;
  }
  return state.viewer.pageCache.get(page) ?? null;
};

const loadAlbumPage = async (albumId, page) => {
  const cached = getCachedAlbumPage(albumId, page);
  if (cached) {
    return cached;
  }

  const data = await fetchJson(`/api/v1/albums/${albumId}/assets?page=${page}&pageSize=${state.albumPagination.pageSize}`);
  if (state.viewer.pageCacheAlbumId !== albumId) {
    resetViewerPageCache(albumId);
  }
  state.viewer.pageCache.set(page, data);
  return data;
};

const getAssetByGlobalIndex = async (albumId, index) => {
  const page = Math.floor(index / state.albumPagination.pageSize) + 1;
  const data = await loadAlbumPage(albumId, page);
  const localIndex = index - (page - 1) * state.albumPagination.pageSize;
  return data.items[localIndex] ?? null;
};

const preloadViewerAssets = async () => {
  if (!state.currentAlbum || state.albumPagination.total <= 0) {
    return;
  }

  const radius = state.viewer.preloadRadius;
  if (radius <= 0) {
    return;
  }

  const albumId = state.currentAlbum.id;
  const total = state.albumPagination.total;
  const center = state.currentAssetGlobalIndex;
  const start = Math.max(0, center - radius);
  const end = Math.min(total - 1, center + radius);
  const taskId = ++state.viewer.preloadTaskId;
  const pageNumbers = new Set();

  for (let index = start; index <= end; index += 1) {
    if (index === center) {
      continue;
    }
    const page = Math.floor(index / state.albumPagination.pageSize) + 1;
    pageNumbers.add(page);
  }

  await Promise.all([...pageNumbers].map((page) => loadAlbumPage(albumId, page)));

  if (taskId !== state.viewer.preloadTaskId) {
    return;
  }

  for (let index = start; index <= end; index += 1) {
    if (index === center) {
      continue;
    }

    const asset = await getAssetByGlobalIndex(albumId, index);
    if (!asset || state.viewer.preloadedAssetIds.has(asset.id)) {
      continue;
    }

    state.viewer.preloadedAssetIds.add(asset.id);
    const image = new Image();
    image.decoding = "async";
    image.src = asset.originalUrl;
  }
};

const getCurrentAsset = () => {
  const localIndex = state.currentAssetGlobalIndex - (state.albumPagination.page - 1) * state.albumPagination.pageSize;
  return state.currentAssets[localIndex] ?? null;
};

const renderAlbum = async (albumId, viewerIndex = null, requestedPage = null) => {
  await ensureLibraryRoots();
  if (state.viewer.pageCacheAlbumId !== albumId) {
    resetViewerPageCache(albumId);
  }
  renderShell(`<div class="empty-state">正在读取图集详情...</div>`);
  bindCommonEvents();
  const targetPage =
    requestedPage ??
    (viewerIndex !== null ? Math.floor(viewerIndex / state.albumPagination.pageSize) + 1 : 1);
  const data = await loadAlbumPage(albumId, targetPage);
  state.currentAlbum = data.album;
  state.currentAssets = data.items;
  state.albumPagination = data.pagination;

  const content = `
    <div class="detail-header">
      <div>
        <a href="#/" class="back-link">← 返回图集列表</a>
        <h2 style="margin-top: 10px;">${escapeHtml(data.album.name)}</h2>
        <p style="margin-top: 8px; color: var(--muted);">${data.album.assetCount} 张图片，当前页 ${data.pagination.page} / ${Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize))}</p>
      </div>
    </div>
    <div class="thumb-grid">
      ${data.items.map((asset, index) => createAssetCard(asset, index)).join("")}
    </div>
    ${createAlbumPagination()}
  `;

  renderShell(content);
  bindCommonEvents();
  document.querySelectorAll("[data-asset-index]").forEach((node) => {
    node.addEventListener("click", () => {
      const localIndex = Number(node.getAttribute("data-asset-index"));
      const globalIndex = (state.albumPagination.page - 1) * state.albumPagination.pageSize + localIndex;
      location.hash = `#/albums/${albumId}/view/${globalIndex}`;
    });
  });
  setStatus(`正在浏览图集：${data.album.name}`);

  if (viewerIndex !== null && Number.isInteger(viewerIndex) && viewerIndex >= 0 && viewerIndex < data.pagination.total) {
    await openViewer(viewerIndex);
  }
};

const showViewerProgress = () => {
  const progress = document.querySelector("[data-viewer-progress]");
  if (!progress) {
    return;
  }

  progress.classList.add("visible");
  if (state.viewer.progressTimer) {
    clearTimeout(state.viewer.progressTimer);
  }

  state.viewer.progressTimer = setTimeout(() => {
    progress.classList.remove("visible");
  }, 2200);
};

const applyViewerUiState = () => {
  const shell = document.querySelector("[data-viewer-shell]");
  if (!shell) {
    return;
  }

  shell.classList.toggle("ui-hidden", !state.viewer.uiVisible);
};

const setViewerUiVisible = (visible) => {
  state.viewer.uiVisible = visible;
  applyViewerUiState();
  if (visible) {
    showViewerProgress();
  }
};

const handleViewerTap = async (clientX, clientY) => {
  const stage = document.querySelector(".viewer-stage");
  if (!(stage instanceof HTMLElement)) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  const isCenterArea = relativeX >= 0.34 && relativeX <= 0.66 && relativeY >= 0.34 && relativeY <= 0.66;

  if (isCenterArea) {
    setViewerUiVisible(!state.viewer.uiVisible);
    return;
  }

  if (relativeY <= 0.25) {
    await moveViewer(-1);
    return;
  }

  if (relativeY >= 0.75) {
    await moveViewer(1);
    return;
  }

  if (relativeX <= 0.5) {
    await moveViewer(-1);
    return;
  }

  await moveViewer(1);
};

const renderViewer = () => {
  const asset = getCurrentAsset();
  if (!asset) {
    return;
  }

  const viewer = document.querySelector("#viewer");
  const progressPercent = ((state.currentAssetGlobalIndex + 1) / Math.max(1, state.albumPagination.total)) * 100;
  const rotation = state.viewer.rotation * 90;
  const imageClass = state.viewer.fitMode === "original" ? "viewer-image original-mode" : "viewer-image fit-mode";
  const sizeLabel = asset.width && asset.height ? `${asset.width} × ${asset.height}` : "尺寸待解析";

  viewer.innerHTML = `
    <div class="viewer-fullscreen${state.viewer.uiVisible ? "" : " ui-hidden"}" data-viewer-shell>
      <div class="viewer-topbar">
        <div class="viewer-title">
          <h3>${escapeHtml(asset.name)}</h3>
          <div class="muted">原始尺寸 ${sizeLabel} · 当前 ${state.currentAssetGlobalIndex + 1} / ${state.albumPagination.total}</div>
        </div>
        <div class="viewer-actions">
          <button class="button button-ghost" data-action="viewer-fit-toggle">${state.viewer.fitMode === "original" ? "适应窗口" : "原始尺寸"}</button>
          <button class="button button-ghost" data-action="viewer-rotate">旋转 90°</button>
          <button class="button button-ghost" data-action="viewer-reset">重置缩放</button>
          <button class="button button-ghost" data-action="viewer-open-tab">新标签打开</button>
          <button class="button button-ghost" data-action="viewer-close">关闭</button>
        </div>
      </div>
      <button class="viewer-nav prev" data-action="viewer-prev">‹</button>
      <div class="viewer-stage" data-viewer-stage>
        <img class="${imageClass}" src="${asset.originalUrl}" alt="${escapeHtml(asset.name)}" style="transform: rotate(${rotation}deg) scale(${state.viewer.scale}) translate(${state.viewer.panX}px, ${state.viewer.panY}px);" />
      </div>
      <button class="viewer-nav next" data-action="viewer-next">›</button>
      <div class="viewer-progress" data-viewer-progress>
        <div class="viewer-progress-meta">
          <span>${state.currentAssetGlobalIndex + 1} / ${state.albumPagination.total}</span>
          <span>${Math.round(progressPercent)}%</span>
        </div>
        <div class="viewer-progress-track">
          <div class="viewer-progress-fill" style="width:${progressPercent}%;"></div>
        </div>
      </div>
    </div>
  `;
  viewer.classList.add("open");
  bindViewerEvents();
  showViewerProgress();
};

const updateViewerContent = () => {
  const asset = getCurrentAsset();
  if (!asset) {
    return;
  }

  const viewer = document.querySelector("#viewer");
  if (!viewer.classList.contains("open")) {
    return;
  }

  const progressPercent = ((state.currentAssetGlobalIndex + 1) / Math.max(1, state.albumPagination.total)) * 100;
  const rotation = state.viewer.rotation * 90;
  const imageClass = state.viewer.fitMode === "original" ? "viewer-image original-mode" : "viewer-image fit-mode";
  const sizeLabel = asset.width && asset.height ? `${asset.width} × ${asset.height}` : "尺寸待解析";

  const titleEl = viewer.querySelector(".viewer-title h3");
  const metaEl = viewer.querySelector(".viewer-title .muted");
  const imageEl = viewer.querySelector(".viewer-image");
  const progressMetaEl = viewer.querySelector(".viewer-progress-meta span:first-child");
  const progressFillEl = viewer.querySelector(".viewer-progress-fill");
  const fitToggleBtn = viewer.querySelector("[data-action='viewer-fit-toggle']");

  if (titleEl) titleEl.textContent = asset.name;
  if (metaEl) metaEl.textContent = `原始尺寸 ${sizeLabel} · 当前 ${state.currentAssetGlobalIndex + 1} / ${state.albumPagination.total}`;
  if (progressMetaEl) progressMetaEl.textContent = `${state.currentAssetGlobalIndex + 1} / ${state.albumPagination.total}`;
  if (progressFillEl) progressFillEl.style.width = `${progressPercent}%`;
  if (fitToggleBtn) fitToggleBtn.textContent = state.viewer.fitMode === "original" ? "适应窗口" : "原始尺寸";

  if (imageEl) {
    imageEl.src = asset.originalUrl;
    imageEl.alt = asset.name;
    imageEl.className = imageClass;
    imageEl.style.transform = `rotate(${rotation}deg) scale(${state.viewer.scale}) translate(${state.viewer.panX}px, ${state.viewer.panY}px)`;
  }

  showViewerProgress();
};

const applyViewerTransform = () => {
  const viewer = document.querySelector("#viewer");
  const imageEl = viewer?.querySelector(".viewer-image");
  if (!imageEl) return;
  const rotation = state.viewer.rotation * 90;
  imageEl.style.transform = `rotate(${rotation}deg) scale(${state.viewer.scale}) translate(${state.viewer.panX}px, ${state.viewer.panY}px)`;
};

const getTouchDistance = (touchA, touchB) => {
  const deltaX = touchA.clientX - touchB.clientX;
  const deltaY = touchA.clientY - touchB.clientY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

const resetViewerTransform = () => {
  state.viewer.scale = 1;
  state.viewer.panX = 0;
  state.viewer.panY = 0;
  applyViewerTransform();
};

const requestViewerFullscreen = async () => {
  if (window.matchMedia("(max-width: 900px)").matches) {
    return;
  }

  const shell = document.querySelector("[data-viewer-shell]");
  if (!shell || document.fullscreenElement) {
    return;
  }

  try {
    await shell.requestFullscreen();
  } catch {
    // 浏览器不支持或用户环境禁止时，保持全屏遮罩显示即可。
  }
};

const openViewer = async (index) => {
  const targetPage = Math.floor(index / state.albumPagination.pageSize) + 1;
  if (targetPage !== state.albumPagination.page) {
    const data = await loadAlbumPage(state.currentAlbum.id, targetPage);
    state.currentAlbum = data.album;
    state.currentAssets = data.items;
    state.albumPagination = data.pagination;
  }

  state.currentAssetGlobalIndex = index;
  state.viewer.uiVisible = false;
  state.viewer.rotation = 0;
  state.viewer.fitMode = "fit";
  state.viewer.scale = 1;
  state.viewer.panX = 0;
  state.viewer.panY = 0;
  state.viewer.touchMode = "none";
  state.viewer.touchMoved = false;
  state.viewer.suppressNextStageClick = false;
  renderViewer();
  void preloadViewerAssets();
  await requestViewerFullscreen();
};

const moveViewer = async (offset) => {
  const total = Math.max(1, state.albumPagination.total);
  const nextIndex = (state.currentAssetGlobalIndex + offset + total) % total;
  const targetPage = Math.floor(nextIndex / state.albumPagination.pageSize) + 1;

  if (targetPage !== state.albumPagination.page) {
    const data = await loadAlbumPage(state.currentAlbum.id, targetPage);
    state.currentAlbum = data.album;
    state.currentAssets = data.items;
    state.albumPagination = data.pagination;
  }

  state.currentAssetGlobalIndex = nextIndex;
  state.viewer.rotation = 0;
  state.viewer.fitMode = "fit";
  state.viewer.scale = 1;
  state.viewer.panX = 0;
  state.viewer.panY = 0;
  state.viewer.touchMode = "none";
  state.viewer.touchMoved = false;
  updateViewerContent();
  void preloadViewerAssets();
};

const closeViewer = async () => {
  if (state.viewer.progressTimer) {
    clearTimeout(state.viewer.progressTimer);
    state.viewer.progressTimer = null;
  }

  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      // 忽略全屏退出失败，继续关闭查看器。
    }
  }

  const viewer = document.querySelector("#viewer");
  if (!viewer) {
    return;
  }

  viewer.classList.remove("open");
  viewer.innerHTML = "";
  state.viewer.uiVisible = false;
};

const bindViewerEvents = () => {
  document.querySelector("[data-action='viewer-close']")?.addEventListener("click", () => {
    location.hash = `#/albums/${state.currentAlbum.id}`;
  });
  document.querySelector("[data-action='viewer-prev']")?.addEventListener("click", async () => moveViewer(-1));
  document.querySelector("[data-action='viewer-next']")?.addEventListener("click", async () => moveViewer(1));
  document.querySelector("[data-action='viewer-open-tab']")?.addEventListener("click", () => {
    const asset = getCurrentAsset();
    if (!asset) {
      return;
    }
    window.open(asset.originalUrl, "_blank", "noopener,noreferrer");
  });
  document.querySelector("[data-action='viewer-fit-toggle']")?.addEventListener("click", () => {
    state.viewer.fitMode = state.viewer.fitMode === "fit" ? "original" : "fit";
    const viewer = document.querySelector("#viewer");
    const imageEl = viewer?.querySelector(".viewer-image");
    const btn = viewer?.querySelector("[data-action='viewer-fit-toggle']");
    if (imageEl) {
      imageEl.className = state.viewer.fitMode === "original" ? "viewer-image original-mode" : "viewer-image fit-mode";
    }
    if (btn) {
      btn.textContent = state.viewer.fitMode === "original" ? "适应窗口" : "原始尺寸";
    }
  });
  document.querySelector("[data-action='viewer-rotate']")?.addEventListener("click", () => {
    state.viewer.rotation = (state.viewer.rotation + 1) % 4;
    applyViewerTransform();
  });
  document.querySelector("[data-action='viewer-reset']")?.addEventListener("click", () => {
    resetViewerTransform();
  });

  const stage = document.querySelector(".viewer-stage");
  if (stage) {
    stage.addEventListener("touchstart", (e) => {
      if (e.touches.length >= 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        state.viewer.touchMode = "pinch";
        state.viewer.touchMoved = true;
        state.viewer.pinchStartDistance = getTouchDistance(first, second);
        state.viewer.pinchStartScale = state.viewer.scale;
        return;
      }

      const touch = e.touches[0];
      if (!touch) {
        return;
      }

      state.viewer.touchMode = "swipe";
      state.viewer.touchMoved = false;
      state.viewer.touchStartX = touch.clientX;
      state.viewer.touchStartY = touch.clientY;
      state.viewer.touchLastX = touch.clientX;
      state.viewer.touchLastY = touch.clientY;
    }, { passive: true });

    stage.addEventListener("touchmove", (e) => {
      if (state.viewer.touchMode === "pinch" && e.touches.length >= 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        const distance = getTouchDistance(first, second);
        if (state.viewer.pinchStartDistance <= 0) {
          return;
        }

        const scaleRatio = distance / state.viewer.pinchStartDistance;
        const nextScale = Math.max(0.1, Math.min(10, state.viewer.pinchStartScale * scaleRatio));
        state.viewer.scale = nextScale;
        applyViewerTransform();
        e.preventDefault();
        return;
      }

      if (e.touches.length !== 1) {
        return;
      }

      const touch = e.touches[0];
      const deltaX = touch.clientX - state.viewer.touchLastX;
      const deltaY = touch.clientY - state.viewer.touchLastY;
      const movedDistance = Math.abs(touch.clientX - state.viewer.touchStartX) + Math.abs(touch.clientY - state.viewer.touchStartY);

      if (movedDistance > 8) {
        state.viewer.touchMoved = true;
      }

      if (state.viewer.scale > 1.02) {
        state.viewer.panX += deltaX;
        state.viewer.panY += deltaY;
        applyViewerTransform();
        e.preventDefault();
      }

      state.viewer.touchLastX = touch.clientX;
      state.viewer.touchLastY = touch.clientY;
    }, { passive: false });

    stage.addEventListener("touchend", async (e) => {
      if (state.viewer.touchMode === "pinch") {
        if (e.touches.length >= 2) {
          const first = e.touches[0];
          const second = e.touches[1];
          state.viewer.pinchStartDistance = getTouchDistance(first, second);
          state.viewer.pinchStartScale = state.viewer.scale;
          return;
        }

        state.viewer.touchMode = "none";
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - state.viewer.touchStartX;
      const deltaY = touch.clientY - state.viewer.touchStartY;
      const isHorizontalSwipe = Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
      const canSwipe = state.viewer.scale <= 1.02;

      if (!state.viewer.touchMoved) {
        state.viewer.suppressNextStageClick = true;
        await handleViewerTap(touch.clientX, touch.clientY);
        state.viewer.touchMode = "none";
        return;
      }

      if (!canSwipe || !isHorizontalSwipe) {
        state.viewer.touchMode = "none";
        return;
      }

      state.viewer.suppressNextStageClick = true;
      if (deltaX < 0) {
        await moveViewer(1);
      } else {
        await moveViewer(-1);
      }
      state.viewer.touchMode = "none";
    }, { passive: true });

    stage.addEventListener("click", async (event) => {
      if (state.viewer.suppressNextStageClick) {
        state.viewer.suppressNextStageClick = false;
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".viewer-image") || target === stage) {
        await handleViewerTap(event.clientX, event.clientY);
      }
    });

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(10, state.viewer.scale * delta));
      state.viewer.scale = newScale;
      applyViewerTransform();
    }, { passive: false });

    stage.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      state.viewer.isDragging = true;
      state.viewer.dragStartX = e.clientX - state.viewer.panX;
      state.viewer.dragStartY = e.clientY - state.viewer.panY;
      stage.style.cursor = "grabbing";
    });

    stage.addEventListener("mousemove", (e) => {
      if (!state.viewer.isDragging) return;
      state.viewer.panX = e.clientX - state.viewer.dragStartX;
      state.viewer.panY = e.clientY - state.viewer.dragStartY;
      applyViewerTransform();
    });

    stage.addEventListener("mouseup", () => {
      state.viewer.isDragging = false;
      if (stage) stage.style.cursor = "grab";
    });

    stage.addEventListener("mouseleave", () => {
      state.viewer.isDragging = false;
      if (stage) stage.style.cursor = "grab";
    });
  }
};

const updateFilterState = (name, value) => {
  if (name === "pageSize") {
    state.filters.pageSize = Number(value);
    state.filters.page = 1;
    return;
  }

  state.filters[name] = value;
  if (name !== "page") {
    state.filters.page = 1;
  }
};

const bindCommonEvents = () => {
  document.querySelectorAll("[data-filter]").forEach((node) => {
    node.addEventListener("change", async (event) => {
      const target = event.currentTarget;
      updateFilterState(target.name, target.value);
      if (!location.hash || location.hash === "#/") {
        await renderHome();
      }
    });
  });

  document.querySelector("[data-filter='keyword']")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const target = event.currentTarget;
    updateFilterState(target.name, target.value);
    if (!location.hash || location.hash === "#/") {
      await renderHome();
    }
  });

  document.querySelectorAll("[data-page-action]").forEach((node) => {
    node.addEventListener("click", async () => {
      const action = node.getAttribute("data-page-action");
      const totalPages = Math.max(1, Math.ceil(state.pagination.total / state.pagination.pageSize));
      if (action === "prev" && state.filters.page > 1) {
        state.filters.page -= 1;
      }
      if (action === "next" && state.filters.page < totalPages) {
        state.filters.page += 1;
      }
      await renderHome();
    });
  });

  document.querySelectorAll("[data-album-page-action]").forEach((node) => {
    node.addEventListener("click", async () => {
      const action = node.getAttribute("data-album-page-action");
      const totalPages = Math.max(1, Math.ceil(state.albumPagination.total / state.albumPagination.pageSize));
      let nextPage = state.albumPagination.page;
      if (action === "prev" && nextPage > 1) {
        nextPage -= 1;
      }
      if (action === "next" && nextPage < totalPages) {
        nextPage += 1;
      }
      await renderAlbum(state.currentAlbum.id, null, nextPage);
    });
  });

  document.querySelector("[data-action='rescan']")?.addEventListener("click", async () => {
    setStatus("正在重新扫描图库...");
    await fetchJson("/api/v1/scan", { method: "POST" });
    state.libraryRoots = [];
    await route();
  });

  document.querySelector("[data-action='go-home']")?.addEventListener("click", () => {
    location.hash = "#/";
  });

  document.querySelector("[data-action='go-manage']")?.addEventListener("click", () => {
    location.hash = "#/manage";
  });

  document.querySelector("[data-action='toggle-filters']")?.addEventListener("click", () => {
    state.ui.filtersExpanded = !state.ui.filtersExpanded;
    const panel = document.querySelector(".filter-panel");
    const button = document.querySelector("[data-action='toggle-filters']");
    if (!(panel instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      return;
    }

    panel.classList.toggle("expanded", state.ui.filtersExpanded);
    panel.classList.toggle("collapsed", !state.ui.filtersExpanded);
    button.textContent = state.ui.filtersExpanded ? "收起筛选" : "展开筛选";
  });

  document.querySelector("[data-action='set-preload-radius']")?.addEventListener("change", async (event) => {
    const target = event.currentTarget;
    const nextValue = clampPreloadRadius(target.value);
    target.value = String(nextValue);
    state.viewer.preloadRadius = nextValue;
    writePreloadRadius(nextValue);
    setStatus(`预加载范围已更新：前后 ${nextValue} 张`);

    const viewer = document.querySelector("#viewer");
    if (viewer?.classList.contains("open")) {
      void preloadViewerAssets();
    }
  });
};

const route = async () => {
  await closeViewer();
  try {
    const hash = location.hash || "#/";
    const viewerMatch = hash.match(/^#\/albums\/([^/]+)\/view\/(\d+)$/);
    if (viewerMatch) {
      await renderAlbum(viewerMatch[1], Number(viewerMatch[2]));
      return;
    }

    const albumMatch = hash.match(/^#\/albums\/([^/]+)$/);
    if (albumMatch) {
      await renderAlbum(albumMatch[1]);
      return;
    }

    const manageMatch = hash.match(/^#\/manage$/);
    if (manageMatch) {
      await renderManage();
      return;
    }

    await renderHome();
  } catch (error) {
    renderShell(`<div class="empty-state">页面加载失败：${error.message}</div>`);
    bindCommonEvents();
    setStatus("加载失败");
  }
};

window.addEventListener("hashchange", route);
window.addEventListener("keydown", async (event) => {
  const viewer = document.querySelector("#viewer");
  if (!viewer?.classList.contains("open")) {
    return;
  }

  if (event.key === "Escape") {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // 忽略错误
      }
      return;
    }

    location.hash = `#/albums/${state.currentAlbum.id}`;
    return;
  }

  if (event.key === "ArrowLeft") {
    await moveViewer(-1);
  }

  if (event.key === "ArrowRight") {
    await moveViewer(1);
  }

  if (event.key.toLowerCase() === "r") {
    state.viewer.rotation = (state.viewer.rotation + 1) % 4;
    renderViewer();
  }
});

window.addEventListener("fullscreenchange", () => {
  const viewer = document.querySelector("#viewer");
  if (viewer?.classList.contains("open") && !document.fullscreenElement) {
    showViewerProgress();
  }
});

route();
