const state = {
  albums: [],
  libraryRoots: [],
  currentAlbum: null,
  currentAssets: [],
  currentAssetGlobalIndex: 0,
  viewer: {
    fitMode: "fit",
    rotation: 0,
    progressTimer: null,
    scale: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0
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
  }
};

const app = document.querySelector("#app");

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
    </div>
    <div class="album-body">
      <h3>${escapeHtml(album.name)}</h3>
      <div class="album-meta">${album.assetCount} 张图片</div>
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
          <button class="button button-primary" data-action="rescan">重新扫描图库</button>
          <button class="button button-secondary" data-action="go-home">返回首页</button>
          <button class="button button-secondary" data-action="go-manage">管理图集</button>
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

const loadAlbumPage = async (albumId, page) => {
  return fetchJson(`/api/v1/albums/${albumId}/assets?page=${page}&pageSize=${state.albumPagination.pageSize}`);
};

const getCurrentAsset = () => {
  const localIndex = state.currentAssetGlobalIndex - (state.albumPagination.page - 1) * state.albumPagination.pageSize;
  return state.currentAssets[localIndex] ?? null;
};

const renderAlbum = async (albumId, viewerIndex = null, requestedPage = null) => {
  await ensureLibraryRoots();
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
    <div class="viewer-fullscreen" data-viewer-shell>
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

const resetViewerTransform = () => {
  state.viewer.scale = 1;
  state.viewer.panX = 0;
  state.viewer.panY = 0;
  applyViewerTransform();
};

const requestViewerFullscreen = async () => {
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
  state.viewer.rotation = 0;
  state.viewer.fitMode = "fit";
  state.viewer.scale = 1;
  state.viewer.panX = 0;
  state.viewer.panY = 0;
  renderViewer();
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
  updateViewerContent();
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
