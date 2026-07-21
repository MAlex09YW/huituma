(function () {
  "use strict";

  const SETTINGS_KEY = "huituma:publish-settings:v2";
  const PROJECT_KEY = "huituma:active-project:v2";
  const TOKEN_KEY = "huituma:github-token:v2";
  const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

  const params = new URLSearchParams(window.location.search);
  const viewId = params.get("view");

  if (viewId) {
    startViewer(viewId);
    return;
  }

  const elements = {
    studio: document.querySelector("#studio"),
    settingsModal: document.querySelector("#settings-modal"),
    openSettingsButton: document.querySelector("#open-settings-button"),
    closeSettingsButton: document.querySelector("#close-settings-button"),
    settingsForm: document.querySelector("#settings-form"),
    settingsMessage: document.querySelector("#settings-message"),
    testSettingsButton: document.querySelector("#test-settings-button"),
    toggleTokenButton: document.querySelector("#toggle-token-button"),
    publicUrl: document.querySelector("#public-url"),
    githubOwner: document.querySelector("#github-owner"),
    githubRepo: document.querySelector("#github-repo"),
    githubBranch: document.querySelector("#github-branch"),
    githubPath: document.querySelector("#github-path"),
    githubToken: document.querySelector("#github-token"),
    rememberToken: document.querySelector("#remember-token"),
    qrCanvas: document.querySelector("#qr-canvas"),
    qrPlaceholder: document.querySelector("#qr-placeholder"),
    qrInstruction: document.querySelector("#qr-instruction"),
    projectNote: document.querySelector("#project-note"),
    generateQrButton: document.querySelector("#generate-qr-button"),
    qrActions: document.querySelector("#qr-actions"),
    downloadQrButton: document.querySelector("#download-qr-button"),
    newProjectButton: document.querySelector("#new-project-button"),
    finalImageInput: document.querySelector("#final-image-input"),
    dropZone: document.querySelector("#drop-zone"),
    dropTitle: document.querySelector("#drop-title"),
    imagePreviewWrap: document.querySelector("#image-preview-wrap"),
    imagePreview: document.querySelector("#image-preview"),
    replaceImageButton: document.querySelector("#replace-image-button"),
    publishButton: document.querySelector("#publish-button"),
    publishStatus: document.querySelector("#publish-status"),
    errorMessage: document.querySelector("#error-message"),
    downloadBinButton: document.querySelector("#download-bin-button"),
  };

  let settings = loadSettings();
  let activeProject = loadProject();
  let githubToken = loadToken();
  let finalImageFile = null;
  let finalImageUrl = "";
  let encryptedBlob = null;

  fillSettingsForm();
  bindEvents();
  renderProject();

  if (!safeStorageGet(localStorage, SETTINGS_KEY)) openSettings();

  function bindEvents() {
    elements.openSettingsButton.addEventListener("click", openSettings);
    elements.closeSettingsButton.addEventListener("click", closeSettings);
    elements.settingsModal.addEventListener("click", (event) => {
      if (event.target === elements.settingsModal) closeSettings();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.settingsModal.hidden) closeSettings();
    });

    elements.settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        saveSettingsFromForm();
        showSettingsMessage("设置已保存。以后制作图片时不用再重复填写。");
        window.setTimeout(closeSettings, 650);
      } catch (error) {
        showSettingsMessage(error.message || "设置无法保存。", true);
      }
    });
    elements.testSettingsButton.addEventListener("click", testConnection);
    elements.toggleTokenButton.addEventListener("click", () => {
      const showing = elements.githubToken.type === "text";
      elements.githubToken.type = showing ? "password" : "text";
      elements.toggleTokenButton.textContent = showing ? "显示" : "隐藏";
    });

    elements.generateQrButton.addEventListener("click", generateNewProject);
    elements.downloadQrButton.addEventListener("click", downloadCurrentQr);
    elements.newProjectButton.addEventListener("click", () => {
      const okay = window.confirm("新的二维码会替换当前未完成项目。已经贴进图片的旧二维码将不能用于新项目，确定继续吗？");
      if (!okay) return;
      clearProject();
      generateNewProject();
    });

    elements.dropZone.addEventListener("click", () => elements.finalImageInput.click());
    elements.replaceImageButton.addEventListener("click", () => elements.finalImageInput.click());
    elements.finalImageInput.addEventListener("change", () => acceptFinalImage(elements.finalImageInput.files && elements.finalImageInput.files[0]));
    elements.dropZone.addEventListener("dragover", (event) => event.preventDefault());
    elements.dropZone.addEventListener("dragenter", () => elements.dropZone.classList.add("dragging"));
    elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
    elements.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragging");
      acceptFinalImage(event.dataTransfer.files && event.dataTransfer.files[0]);
    });

    elements.publishButton.addEventListener("click", publishFinalImage);
    elements.downloadBinButton.addEventListener("click", () => {
      if (encryptedBlob && activeProject) downloadBlob(encryptedBlob, `${activeProject.id}.bin`);
    });
  }

  function defaultBaseUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return normalizeBaseUrl(url.toString());
  }

  function loadSettings() {
    const defaults = {
      publicUrl: defaultBaseUrl(),
      owner: "MAlex09YW",
      repo: "huituma",
      branch: "main",
      path: "docs/vault",
    };
    try {
      const saved = JSON.parse(safeStorageGet(localStorage, SETTINGS_KEY) || "null");
      return saved ? { ...defaults, ...saved } : defaults;
    } catch (_error) {
      return defaults;
    }
  }

  function loadProject() {
    try {
      const saved = JSON.parse(safeStorageGet(localStorage, PROJECT_KEY) || "null");
      if (!saved || !/^[A-Za-z0-9_-]{16}$/.test(saved.id) || !saved.key || !saved.baseUrl) return null;
      return saved;
    } catch (_error) {
      return null;
    }
  }

  function loadToken() {
    return safeStorageGet(sessionStorage, TOKEN_KEY) || safeStorageGet(localStorage, TOKEN_KEY) || "";
  }

  function fillSettingsForm() {
    elements.publicUrl.value = settings.publicUrl;
    elements.githubOwner.value = settings.owner;
    elements.githubRepo.value = settings.repo;
    elements.githubBranch.value = settings.branch;
    elements.githubPath.value = settings.path;
    elements.githubToken.value = githubToken;
    elements.rememberToken.checked = Boolean(safeStorageGet(localStorage, TOKEN_KEY));
  }

  function readSettingsForm(requireToken) {
    const next = {
      publicUrl: normalizeBaseUrl(elements.publicUrl.value),
      owner: cleanName(elements.githubOwner.value, "GitHub 用户名"),
      repo: cleanName(elements.githubRepo.value, "仓库名"),
      branch: cleanName(elements.githubBranch.value, "分支"),
      path: cleanRepoPath(elements.githubPath.value),
    };
    const token = elements.githubToken.value.trim();
    if (requireToken && !token) throw new Error("请先填写 GitHub Fine-grained token。");
    return { next, token };
  }

  function saveSettingsFromForm() {
    const { next, token } = readSettingsForm(false);
    settings = next;
    githubToken = token;
    safeStorageSet(localStorage, SETTINGS_KEY, JSON.stringify(settings));
    if (elements.rememberToken.checked && githubToken) {
      safeStorageSet(localStorage, TOKEN_KEY, githubToken);
      safeStorageRemove(sessionStorage, TOKEN_KEY);
    } else {
      safeStorageRemove(localStorage, TOKEN_KEY);
      if (githubToken) safeStorageSet(sessionStorage, TOKEN_KEY, githubToken);
      else safeStorageRemove(sessionStorage, TOKEN_KEY);
    }
  }

  function openSettings() {
    fillSettingsForm();
    elements.settingsMessage.hidden = true;
    elements.settingsModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeSettings() {
    elements.settingsModal.hidden = true;
    document.body.style.overflow = "";
  }

  async function testConnection() {
    elements.testSettingsButton.disabled = true;
    elements.testSettingsButton.textContent = "正在连接…";
    try {
      const { next, token } = readSettingsForm(true);
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(next.owner)}/${encodeURIComponent(next.repo)}`, {
        headers: githubHeaders(token),
      });
      if (!response.ok) throw new Error(await githubError(response));
      showSettingsMessage("连接成功，token 可以访问这个仓库。");
    } catch (error) {
      showSettingsMessage(error.message || "连接失败。", true);
    } finally {
      elements.testSettingsButton.disabled = false;
      elements.testSettingsButton.textContent = "测试连接";
    }
  }

  function showSettingsMessage(message, isError) {
    elements.settingsMessage.textContent = message;
    elements.settingsMessage.style.color = isError ? "#983b2a" : "#2d6a57";
    elements.settingsMessage.hidden = false;
  }

  async function generateNewProject() {
    hideMessages();
    if (!window.crypto || !window.crypto.subtle || !window.QRCode) {
      showError("当前浏览器不支持安全加密或二维码生成，请用最新版 Chrome、Edge 或 Safari 通过 HTTPS 打开。");
      return;
    }

    try {
      const baseUrl = normalizeBaseUrl(elements.publicUrl.value || settings.publicUrl);
      const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
      activeProject = {
        id: toBase64Url(window.crypto.getRandomValues(new Uint8Array(12))),
        key: toBase64Url(rawKey),
        baseUrl,
        createdAt: new Date().toISOString(),
      };
      safeStorageSet(localStorage, PROJECT_KEY, JSON.stringify(activeProject));
      await renderProject();
      await downloadCurrentQr();
      elements.qrInstruction.textContent = "二维码已经下载。请手动把它放进图片，导出后再进行第 2 步。";
    } catch (error) {
      showError(error.message || "二维码生成失败，请重试。");
    }
  }

  async function renderProject() {
    if (!activeProject) {
      elements.qrCanvas.hidden = true;
      elements.qrPlaceholder.hidden = false;
      elements.projectNote.hidden = true;
      elements.generateQrButton.hidden = false;
      elements.qrActions.hidden = true;
      elements.qrInstruction.textContent = "软件会为这张图预留一个随机地址和一把解密钥匙，并立即下载二维码 PNG。";
      updatePublishButton();
      return;
    }

    try {
      await window.QRCode.toCanvas(elements.qrCanvas, projectUrl(activeProject), qrOptions(560));
      elements.qrCanvas.hidden = false;
      elements.qrPlaceholder.hidden = true;
      elements.projectNote.hidden = false;
      elements.generateQrButton.hidden = true;
      elements.qrActions.hidden = false;
      elements.qrInstruction.textContent = activeProject.publishedAt
        ? "这组二维码和成品图已经发布。你仍可更换成品图并再次发布。"
        : "当前项目已保存在本机。请勿为同一张成品图重新生成另一个二维码。";
    } catch (error) {
      showError(error.message || "无法恢复当前二维码。");
    }
    updatePublishButton();
  }

  async function downloadCurrentQr() {
    if (!activeProject) return;
    const canvas = document.createElement("canvas");
    await window.QRCode.toCanvas(canvas, projectUrl(activeProject), qrOptions(1200));
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, `二维码-${activeProject.id.slice(0, 8)}.png`);
  }

  function qrOptions(width) {
    return {
      width,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    };
  }

  function projectUrl(project) {
    const url = new URL(project.baseUrl);
    url.searchParams.set("view", project.id);
    url.hash = `k=${project.key}`;
    return url.toString();
  }

  function clearProject() {
    activeProject = null;
    safeStorageRemove(localStorage, PROJECT_KEY);
    clearFinalImage();
    renderProject();
  }

  function acceptFinalImage(file) {
    hideMessages();
    encryptedBlob = null;
    elements.downloadBinButton.hidden = true;
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      showError("请选择 PNG、JPG、WebP 或 GIF 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showError("最终图片不能超过 25 MB，请先压缩后再试。");
      return;
    }

    clearFinalImage();
    finalImageFile = file;
    finalImageUrl = URL.createObjectURL(file);
    elements.imagePreview.src = finalImageUrl;
    elements.imagePreviewWrap.hidden = false;
    elements.dropZone.hidden = true;
    elements.dropTitle.textContent = file.name;
    updatePublishButton();
    if (!activeProject) showError("请先完成第 1 步，生成要放进这张图片的二维码。");
  }

  function clearFinalImage() {
    if (finalImageUrl) URL.revokeObjectURL(finalImageUrl);
    finalImageUrl = "";
    finalImageFile = null;
    encryptedBlob = null;
    elements.finalImageInput.value = "";
    elements.imagePreview.removeAttribute("src");
    elements.imagePreviewWrap.hidden = true;
    elements.dropZone.hidden = false;
    elements.dropTitle.textContent = "选择已经带二维码的最终图片";
    elements.downloadBinButton.hidden = true;
    updatePublishButton();
  }

  function updatePublishButton() {
    elements.publishButton.disabled = !(activeProject && finalImageFile);
  }

  async function publishFinalImage() {
    hideMessages();
    if (!activeProject || !finalImageFile) {
      showError("请先生成二维码，并选择带有该二维码的最终图片。");
      return;
    }

    elements.publishButton.disabled = true;
    elements.publishButton.textContent = "正在本机加密…";
    try {
      encryptedBlob = await encryptImage(finalImageFile, activeProject.key);
      elements.downloadBinButton.hidden = false;

      githubToken = loadToken() || githubToken;
      if (!githubToken) {
        showError("还没有 GitHub token。请打开“发布设置”完成一次性授权，然后再点发布。");
        openSettings();
        return;
      }

      setPublishStatus("图片已经在本机加密，正在上传加密文件…");
      elements.publishButton.textContent = "正在上传…";
      const result = await uploadEncryptedFile(encryptedBlob, activeProject);
      activeProject.sha = result.sha || activeProject.sha;
      activeProject.publishedAt = new Date().toISOString();
      safeStorageSet(localStorage, PROJECT_KEY, JSON.stringify(activeProject));

      elements.downloadBinButton.hidden = true;
      elements.publishButton.textContent = "等待网站同步…";
      setPublishStatus("GitHub 已接收加密文件，正在等待 GitHub Pages 更新…");
      const ready = await waitForPublishedFile(activeProject);
      if (ready) {
        setPublishStatus("发布完成。现在扫描图片里的二维码，就会在纯白页面中直接看到这张成品图。");
      } else {
        setPublishStatus("上传已成功。GitHub Pages 仍在同步，通常再等 1–2 分钟即可扫描。");
      }
      renderProject();
    } catch (error) {
      showError(error.message || "发布失败。你可以重试，或下载 .bin 后手动上传。");
      elements.downloadBinButton.hidden = !encryptedBlob;
    } finally {
      elements.publishButton.disabled = !(activeProject && finalImageFile);
      elements.publishButton.textContent = "加密并自动发布";
    }
  }

  async function encryptImage(file, keyText) {
    if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器不支持安全加密。");
    const rawKey = fromBase64Url(keyText);
    if (rawKey.length !== 32) throw new Error("当前项目的解密钥匙无效，请重新生成二维码。");

    const mimeText = file.type || "image/png";
    const mime = new TextEncoder().encode(mimeText);
    if (mime.length > 255) throw new Error("图片类型信息异常。");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
    const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      await file.arrayBuffer(),
    ));

    const sealed = new Uint8Array(17 + mime.length + ciphertext.length);
    sealed.set([0x48, 0x54, 0x4d, 0x32], 0);
    sealed.set(iv, 4);
    sealed[16] = mime.length;
    sealed.set(mime, 17);
    sealed.set(ciphertext, 17 + mime.length);
    return new Blob([sealed], { type: "application/octet-stream" });
  }

  async function uploadEncryptedFile(blob, project) {
    const filePath = `${settings.path}/${project.id}.bin`;
    const apiUrl = githubContentsUrl(settings, filePath);
    const body = {
      message: `Publish encrypted image ${project.id}`,
      content: arrayBufferToBase64(await blob.arrayBuffer()),
      branch: settings.branch,
    };
    if (project.sha) body.sha = project.sha;

    let response = await githubPut(apiUrl, body);
    if (response.status === 422 && !body.sha) {
      const existing = await fetch(apiUrl, { headers: githubHeaders(githubToken), cache: "no-store" });
      if (existing.ok) {
        const existingFile = await existing.json();
        if (existingFile.sha) {
          body.sha = existingFile.sha;
          response = await githubPut(apiUrl, body);
        }
      }
    }
    if (!response.ok) throw new Error(await githubError(response));
    const data = await response.json();
    return data.content || {};
  }

  function githubPut(url, body) {
    return fetch(url, {
      method: "PUT",
      headers: { ...githubHeaders(githubToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function githubContentsUrl(config, filePath) {
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`;
  }

  function githubHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    };
  }

  async function githubError(response) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.message || "";
    } catch (_error) { /* Ignore invalid JSON error pages. */ }
    if (response.status === 401) return "GitHub 拒绝了 token，请检查 token 是否正确或是否已经过期。";
    if (response.status === 403) return "token 没有写入权限。请把所选仓库的 Contents 权限设为 Read and write。";
    if (response.status === 404) return "找不到仓库。请检查用户名、仓库名，以及 token 是否授权了这个仓库。";
    if (response.status === 409) return "GitHub 暂时无法写入该分支，请稍后重试。";
    if (response.status === 422) return `GitHub 无法保存文件${detail ? `：${detail}` : ""}`;
    return `GitHub 请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ""}`;
  }

  async function waitForPublishedFile(project) {
    const fileUrl = new URL(`vault/${encodeURIComponent(project.id)}.bin`, project.baseUrl);
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (attempt > 0) await delay(4000);
      try {
        fileUrl.searchParams.set("_", `${Date.now()}-${attempt}`);
        const response = await fetch(fileUrl.toString(), { cache: "no-store" });
        if (response.ok) return true;
      } catch (_error) { /* Keep waiting while Pages deploys. */ }
    }
    return false;
  }

  function setPublishStatus(message) {
    elements.publishStatus.textContent = message;
    elements.publishStatus.hidden = false;
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.hidden = false;
  }

  function hideMessages() {
    elements.errorMessage.hidden = true;
    elements.errorMessage.textContent = "";
    elements.publishStatus.hidden = true;
    elements.publishStatus.textContent = "";
  }

  function normalizeBaseUrl(value) {
    let url;
    try {
      url = new URL(String(value || "").trim());
    } catch (_error) {
      throw new Error("请输入完整网址，例如 https://malex09yw.github.io/huituma/");
    }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      throw new Error("正式二维码必须使用 HTTPS 网址；HTTP 只允许本机测试。");
    }
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  }

  function cleanName(value, label) {
    const result = String(value || "").trim();
    if (!result || /[\\/?#\s]/.test(result)) throw new Error(`${label}填写不正确。`);
    return result;
  }

  function cleanRepoPath(value) {
    const result = String(value || "").trim().replace(/^\/+|\/+$/g, "");
    if (!result || result.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("加密文件目录填写不正确。");
    }
    return result;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return btoa(chunks.join(""));
  }

  function toBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function fromBase64Url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成二维码图片。")), "image/png");
    });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key) || ""; } catch (_error) { return ""; }
  }

  function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (_error) { /* Storage may be disabled. */ }
  }

  function safeStorageRemove(storage, key) {
    try { storage.removeItem(key); } catch (_error) { /* Storage may be disabled. */ }
  }

  async function startViewer(fileId) {
    const studio = document.querySelector("#studio");
    const viewer = document.querySelector("#viewer");
    const viewerImage = document.querySelector("#viewer-image");
    const viewerError = document.querySelector("#viewer-error");

    document.title = "";
    document.body.classList.add("viewer-active");
    studio.hidden = true;
    viewer.hidden = false;

    try {
      if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器无法安全打开这张图片。");
      if (!/^[A-Za-z0-9_-]{16}$/.test(fileId)) throw new Error("二维码中的图片编号无效。");

      const fragment = new URLSearchParams(window.location.hash.slice(1));
      let keyText = fragment.get("k") || "";
      const sessionKey = `huituma:image-key:${fileId}`;
      if (keyText) {
        safeStorageSet(sessionStorage, sessionKey, keyText);
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } else {
        keyText = safeStorageGet(sessionStorage, sessionKey);
      }
      if (!keyText) throw new Error("缺少解密钥匙，请重新扫描原二维码。");

      const rawKey = fromBase64Url(keyText);
      if (rawKey.length !== 32) throw new Error("二维码中的解密钥匙无效。");
      const response = await fetch(`./vault/${encodeURIComponent(fileId)}.bin`, { cache: "no-store" });
      if (!response.ok) throw new Error("图片尚未发布，或已经被发布者删除。");

      const sealed = new Uint8Array(await response.arrayBuffer());
      if (sealed.length < 33 || sealed[0] !== 0x48 || sealed[1] !== 0x54 || sealed[2] !== 0x4d) {
        throw new Error("图片文件格式不正确。");
      }

      const version = sealed[3];
      const iv = sealed.slice(4, 16);
      let mimeType = "image/png";
      let ciphertext;
      if (version === 0x31) {
        ciphertext = sealed.slice(16);
      } else if (version === 0x32) {
        const mimeLength = sealed[16];
        const dataStart = 17 + mimeLength;
        if (!mimeLength || sealed.length <= dataStart + 16) throw new Error("图片文件格式不正确。");
        mimeType = new TextDecoder().decode(sealed.slice(17, dataStart));
        if (!mimeType.startsWith("image/")) throw new Error("图片类型不正确。");
        ciphertext = sealed.slice(dataStart);
      } else {
        throw new Error("图片文件版本不受支持。");
      }

      const key = await window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
      const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const imageUrl = URL.createObjectURL(new Blob([plaintext], { type: mimeType }));
      viewerImage.addEventListener("error", () => {
        viewerImage.hidden = true;
        viewerError.textContent = "图片无法显示。";
        viewerError.hidden = false;
      }, { once: true });
      viewerImage.src = imageUrl;
      viewerImage.hidden = false;
    } catch (error) {
      viewerError.textContent = error.message || "无法打开图片。";
      viewerError.hidden = false;
    }
  }
})();
