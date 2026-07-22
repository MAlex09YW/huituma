(function () {
  "use strict";

  const SETTINGS_KEY = "huituma:publish-settings:v2";
  const PROJECTS_KEY = "huituma:projects:v3";
  const LEGACY_PROJECT_KEY = "huituma:active-project:v2";
  const TOKEN_KEY = "huituma:github-token:v2";
  const CUSTOM_PUBLIC_URL = "https://www.henanshebaogov.com/";
  const SLOT_COUNT = 3;
  const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

  const elements = {
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
    taskGrid: document.querySelector("#task-grid"),
    taskTemplate: document.querySelector("#task-template"),
    batchSummary: document.querySelector("#batch-summary"),
    publishAllButton: document.querySelector("#publish-all-button"),
    exportProjectsButton: document.querySelector("#export-projects-button"),
    importProjectsButton: document.querySelector("#import-projects-button"),
    importProjectsInput: document.querySelector("#import-projects-input"),
    fixedImageInput: document.querySelector("#fixed-image-input"),
    fixedImageSelectButton: document.querySelector("#fixed-image-select-button"),
    fixedImagePublishButton: document.querySelector("#fixed-image-publish-button"),
    fixedImagePreviewWrap: document.querySelector("#fixed-image-preview-wrap"),
    fixedImagePreview: document.querySelector("#fixed-image-preview"),
    fixedImagePlaceholder: document.querySelector("#fixed-image-placeholder"),
    fixedImageStatus: document.querySelector("#fixed-image-status"),
    fixedImageError: document.querySelector("#fixed-image-error"),
  };

  let settings = loadSettings();
  let githubToken = loadToken();
  let projects = loadProjects();
  let batchPublishing = false;
  let fixedImageFile = null;
  let fixedImageUrl = "";
  let fixedImageBusy = false;
  const slots = [];

  createTaskSlots();
  fillSettingsForm();
  bindGlobalEvents();
  renderAllSlots();
  saveProjects();
  loadCurrentFixedImage();
  if (!safeStorageGet(localStorage, SETTINGS_KEY)) openSettings();

  function createTaskSlots() {
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const fragment = elements.taskTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".task-card");
      const slot = {
        index,
        project: projects[index],
        file: null,
        imageUrl: "",
        encryptedBlob: null,
        needsPublish: false,
        busy: false,
        elements: {
          card,
          taskIndex: fragment.querySelector(".task-index"),
          taskTitle: fragment.querySelector(".task-title"),
          badge: fragment.querySelector(".task-badge"),
          qrCanvas: fragment.querySelector(".qr-canvas"),
          qrPlaceholder: fragment.querySelector(".qr-placeholder"),
          qrInstruction: fragment.querySelector(".qr-instruction"),
          generateQrButton: fragment.querySelector(".generate-qr-button"),
          qrActions: fragment.querySelector(".qr-actions"),
          downloadQrButton: fragment.querySelector(".download-qr-button"),
          resetTaskButton: fragment.querySelector(".reset-task-button"),
          formCodeRow: fragment.querySelector(".form-code-copy-row"),
          formCodeInput: fragment.querySelector(".form-code-copy-input"),
          formCodeCopyButton: fragment.querySelector(".form-code-copy-button"),
          finalImageInput: fragment.querySelector(".final-image-input"),
          dropZone: fragment.querySelector(".final-section .drop-zone"),
          dropTitle: fragment.querySelector(".final-section .drop-title"),
          imagePreviewWrap: fragment.querySelector(".final-section .image-preview-wrap"),
          imagePreview: fragment.querySelector(".final-section .image-preview"),
          replaceButton: fragment.querySelector(".final-section .replace-button"),
          publishButton: fragment.querySelector(".publish-button"),
          status: fragment.querySelector(".task-status"),
          error: fragment.querySelector(".task-error"),
          downloadBinButton: fragment.querySelector(".download-bin-button"),
        },
      };
      slot.elements.taskIndex.textContent = String(index + 1);
      slot.elements.taskTitle.textContent = `图片 ${index + 1}`;
      bindSlotEvents(slot);
      slots.push(slot);
      elements.taskGrid.appendChild(fragment);
    }
  }

  function bindGlobalEvents() {
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
        showSettingsMessage("设置已保存。新生成的二维码将使用这里的网址。");
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
    elements.publishAllButton.addEventListener("click", publishAllReady);
    elements.exportProjectsButton.addEventListener("click", exportProjectBackup);
    elements.importProjectsButton.addEventListener("click", () => elements.importProjectsInput.click());
    elements.importProjectsInput.addEventListener("change", () => importProjectBackup(elements.importProjectsInput.files && elements.importProjectsInput.files[0]));
    elements.fixedImageSelectButton.addEventListener("click", () => elements.fixedImageInput.click());
    elements.fixedImageInput.addEventListener("change", () => acceptFixedImage(elements.fixedImageInput.files && elements.fixedImageInput.files[0]));
    elements.fixedImagePublishButton.addEventListener("click", publishFixedImage);
  }

  function bindSlotEvents(slot) {
    const ui = slot.elements;
    ui.generateQrButton.addEventListener("click", () => generateProject(slot));
    ui.downloadQrButton.addEventListener("click", () => downloadQr(slot));
    ui.resetTaskButton.addEventListener("click", () => resetSlot(slot));
    ui.formCodeInput.addEventListener("click", () => ui.formCodeInput.select());
    ui.formCodeCopyButton.addEventListener("click", () => copyFormCode(slot));
    ui.dropZone.addEventListener("click", () => ui.finalImageInput.click());
    ui.replaceButton.addEventListener("click", () => ui.finalImageInput.click());
    ui.finalImageInput.addEventListener("change", () => acceptImage(slot, ui.finalImageInput.files && ui.finalImageInput.files[0]));
    ui.dropZone.addEventListener("dragover", (event) => event.preventDefault());
    ui.dropZone.addEventListener("dragenter", () => ui.dropZone.classList.add("dragging"));
    ui.dropZone.addEventListener("dragleave", () => ui.dropZone.classList.remove("dragging"));
    ui.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      ui.dropZone.classList.remove("dragging");
      acceptImage(slot, event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    ui.publishButton.addEventListener("click", () => publishSlot(slot, true));
    ui.downloadBinButton.addEventListener("click", () => {
      if (slot.encryptedBlob && slot.project) downloadBlob(slot.encryptedBlob, `${slot.project.id}.bin`);
    });
  }

  function defaultBaseUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    return local ? normalizeBaseUrl(url.toString()) : CUSTOM_PUBLIC_URL;
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
      const merged = saved ? { ...defaults, ...saved } : defaults;
      if (isLegacyPagesUrl(merged.publicUrl)) merged.publicUrl = CUSTOM_PUBLIC_URL;
      return merged;
    } catch (_error) {
      return defaults;
    }
  }

  function loadProjects() {
    const blank = Array.from({ length: SLOT_COUNT }, () => null);
    try {
      const saved = JSON.parse(safeStorageGet(localStorage, PROJECTS_KEY) || "null");
      if (Array.isArray(saved)) {
        return blank.map((_, index) => validProject(saved[index]) ? saved[index] : null);
      }
      const legacy = JSON.parse(safeStorageGet(localStorage, LEGACY_PROJECT_KEY) || "null");
      if (validProject(legacy)) blank[0] = legacy;
    } catch (_error) { /* Start with empty slots when saved state is invalid. */ }
    return blank;
  }

  function validProject(project) {
    return Boolean(
      project
      && /^[A-Za-z0-9_-]{16}$/.test(project.id)
      && project.key
      && project.baseUrl
      && (project.formCode === undefined || /^[a-f0-9]{32}$/.test(project.formCode)),
    );
  }

  function saveProjects() {
    projects = slots.length ? slots.map((slot) => slot.project) : projects;
    safeStorageSet(localStorage, PROJECTS_KEY, JSON.stringify(projects));
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

  function acceptFixedImage(file) {
    clearFixedImageMessages();
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      showFixedImageError("请选择 PNG、JPG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showFixedImageError("固定顶部图片不能超过 25 MB，请先压缩后再试。");
      return;
    }
    if (fixedImageUrl) URL.revokeObjectURL(fixedImageUrl);
    fixedImageFile = file;
    fixedImageUrl = URL.createObjectURL(file);
    elements.fixedImagePreview.src = fixedImageUrl;
    elements.fixedImagePreview.hidden = false;
    elements.fixedImagePlaceholder.hidden = true;
    elements.fixedImagePublishButton.disabled = false;
    elements.fixedImageSelectButton.textContent = "重新选择";
  }

  async function publishFixedImage() {
    clearFixedImageMessages();
    if (!fixedImageFile || fixedImageBusy) return;
    githubToken = loadToken() || githubToken;
    if (!githubToken) {
      showFixedImageError("还没有 GitHub token。请先完成发布设置。");
      openSettings();
      return;
    }
    fixedImageBusy = true;
    elements.fixedImageInput.disabled = true;
    elements.fixedImageSelectButton.disabled = true;
    elements.fixedImagePublishButton.disabled = true;
    elements.fixedImagePublishButton.textContent = "正在处理…";
    try {
      const pngBlob = await convertToPng(fixedImageFile);
      const digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", await pngBlob.arrayBuffer()));
      const fileName = `verification-header-${toHex(digest.slice(0, 12))}.png`;
      const rootPath = settings.path.split("/").slice(0, -1).join("/");
      const imagePath = [rootPath, fileName].filter(Boolean).join("/");
      const configPath = [rootPath, "verification-header.json"].filter(Boolean).join("/");
      elements.fixedImagePublishButton.textContent = "正在上传图片…";
      await uploadRepoFile(pngBlob, imagePath, "Update fixed verification header image", true);
      const configBlob = new Blob([JSON.stringify({ file: fileName })], { type: "application/json" });
      elements.fixedImagePublishButton.textContent = "正在启用…";
      await uploadRepoFile(configBlob, configPath, "Activate fixed verification header image", false);
      setFixedImageStatus("上传成功，正在等待网站同步…");
      const ready = await waitForFixedImage(fileName);
      setFixedImageStatus(ready
        ? "固定图片已经生效。所有二维码的验证页都会显示这张图。"
        : "文件已上传，网站仍在同步；通常再等 1–2 分钟即可生效。");
      fixedImageFile = null;
    } catch (error) {
      showFixedImageError(error.message || "固定图片上传失败，请重试。");
    } finally {
      fixedImageBusy = false;
      elements.fixedImageInput.disabled = false;
      elements.fixedImageSelectButton.disabled = false;
      elements.fixedImagePublishButton.disabled = !fixedImageFile;
      elements.fixedImagePublishButton.textContent = "上传并设为固定图片";
    }
  }

  async function loadCurrentFixedImage() {
    try {
      const configUrl = new URL("verification-header.json", settings.publicUrl);
      configUrl.searchParams.set("_", Date.now());
      const response = await fetch(configUrl.toString(), { cache: "no-store" });
      if (!response.ok) return;
      const config = await response.json();
      if (!config || !/^verification-header-[a-f0-9]{24}\.png$/.test(config.file)) return;
      const imageUrl = new URL(config.file, settings.publicUrl).toString();
      elements.fixedImagePreview.onload = () => {
        elements.fixedImagePreview.hidden = false;
        elements.fixedImagePlaceholder.hidden = true;
      };
      elements.fixedImagePreview.src = imageUrl;
      setFixedImageStatus("网站当前已有固定验证页图片；重新上传即可替换。");
    } catch (_error) { /* A missing fixed image is valid before first setup. */ }
  }

  function convertToPng(file) {
    if (file.type === "image/png") return Promise.resolve(file);
    return new Promise((resolve, reject) => {
      const imageUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(imageUrl);
            if (blob) resolve(blob);
            else reject(new Error("图片无法转换为 PNG。"));
          }, "image/png");
        } catch (error) {
          URL.revokeObjectURL(imageUrl);
          reject(error);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("选择的图片无法读取。"));
      };
      image.src = imageUrl;
    });
  }

  async function uploadRepoFile(blob, filePath, message, skipIfExists) {
    const apiUrl = githubContentsUrl(settings, filePath);
    const existingResponse = await fetch(apiUrl, { headers: githubHeaders(githubToken), cache: "no-store" });
    let existingSha = "";
    if (existingResponse.ok) {
      const existing = await existingResponse.json();
      if (skipIfExists) return existing;
      existingSha = existing.sha || "";
    } else if (existingResponse.status !== 404) {
      throw new Error(await githubError(existingResponse));
    }
    const body = {
      message,
      content: arrayBufferToBase64(await blob.arrayBuffer()),
      branch: settings.branch,
    };
    if (existingSha) body.sha = existingSha;
    const response = await githubPut(apiUrl, body);
    if (!response.ok) throw new Error(await githubError(response));
    const data = await response.json();
    return data.content || {};
  }

  async function waitForFixedImage(fileName) {
    const configUrl = new URL("verification-header.json", settings.publicUrl);
    const imageUrl = new URL(fileName, settings.publicUrl);
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (attempt > 0) await delay(4000);
      try {
        configUrl.searchParams.set("_", `${Date.now()}-${attempt}`);
        imageUrl.searchParams.set("_", `${Date.now()}-${attempt}`);
        const configResponse = await fetch(configUrl.toString(), { cache: "no-store" });
        if (!configResponse.ok) continue;
        const config = await configResponse.json();
        if (config.file !== fileName) continue;
        const imageResponse = await fetch(imageUrl.toString(), { cache: "no-store" });
        if (imageResponse.ok) return true;
      } catch (_error) { /* Keep waiting while Pages deploys. */ }
    }
    return false;
  }

  function clearFixedImageMessages() {
    elements.fixedImageStatus.hidden = true;
    elements.fixedImageError.hidden = true;
  }

  function setFixedImageStatus(message) {
    elements.fixedImageStatus.textContent = message;
    elements.fixedImageStatus.hidden = false;
    elements.fixedImageError.hidden = true;
  }

  function showFixedImageError(message) {
    elements.fixedImageError.textContent = message;
    elements.fixedImageError.hidden = false;
    elements.fixedImageStatus.hidden = true;
  }

  async function generateProject(slot) {
    clearMessages(slot);
    if (!window.crypto || !window.crypto.subtle || !window.QRCode) {
      showSlotError(slot, "当前浏览器不支持安全加密或二维码生成，请使用最新版浏览器通过 HTTPS 打开。");
      return;
    }
    try {
      const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
      const id = toBase64Url(window.crypto.getRandomValues(new Uint8Array(12)));
      const keyText = toBase64Url(rawKey);
      slot.project = {
        id,
        key: keyText,
        formCode: await deriveFormCode(id, keyText),
        baseUrl: normalizeBaseUrl(settings.publicUrl),
        createdAt: new Date().toISOString(),
      };
      saveProjects();
      await renderSlot(slot);
      await downloadQr(slot);
      slot.elements.qrInstruction.textContent = "二维码已下载。把它放进图片后，再在下方选择成品图。";
    } catch (error) {
      showSlotError(slot, error.message || "二维码生成失败，请重试。");
    }
  }

  async function downloadQr(slot) {
    if (!slot.project) return;
    const canvas = document.createElement("canvas");
    await window.QRCode.toCanvas(canvas, projectUrl(slot.project), qrOptions(1200));
    downloadBlob(await canvasToBlob(canvas), `二维码-${slot.index + 1}-${slot.project.id.slice(0, 8)}.png`);
  }

  async function copyFormCode(slot) {
    if (!slot.project || !slot.project.formCode) return;
    const ui = slot.elements;
    try {
      await navigator.clipboard.writeText(slot.project.formCode);
    } catch (_error) {
      ui.formCodeInput.focus();
      ui.formCodeInput.select();
      document.execCommand("copy");
    }
    ui.formCodeCopyButton.textContent = "已复制";
    window.setTimeout(() => { ui.formCodeCopyButton.textContent = "复制"; }, 1200);
  }

  function resetSlot(slot) {
    const published = slot.project && slot.project.publishedAt;
    const message = published
      ? "重置只会清空这个任务位，不会删除 GitHub 上已发布的图片。确定继续吗？"
      : "重置后，已经贴进图片的这个二维码将不能用于新任务。确定继续吗？";
    if (!window.confirm(message)) return;
    clearSlotFile(slot);
    slot.project = null;
    saveProjects();
    renderSlot(slot);
  }

  function acceptImage(slot, file) {
    clearMessages(slot);
    slot.encryptedBlob = null;
    slot.elements.downloadBinButton.hidden = true;
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      showSlotError(slot, "请选择 PNG、JPG、WebP 或 GIF 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showSlotError(slot, "最终图片不能超过 25 MB，请先压缩后再试。");
      return;
    }
    clearSlotFile(slot);
    slot.file = file;
    slot.needsPublish = true;
    slot.imageUrl = URL.createObjectURL(file);
    slot.elements.imagePreview.src = slot.imageUrl;
    slot.elements.imagePreviewWrap.hidden = false;
    slot.elements.dropZone.hidden = true;
    slot.elements.dropTitle.textContent = file.name;
    if (!slot.project) showSlotError(slot, "请先在这个任务位生成二维码，再选择包含该二维码的成品图。");
    renderSlotState(slot);
  }

  function clearSlotFile(slot) {
    if (slot.imageUrl) URL.revokeObjectURL(slot.imageUrl);
    slot.imageUrl = "";
    slot.file = null;
    slot.needsPublish = false;
    slot.encryptedBlob = null;
    slot.elements.finalImageInput.value = "";
    slot.elements.imagePreview.removeAttribute("src");
    slot.elements.imagePreviewWrap.hidden = true;
    slot.elements.dropZone.hidden = false;
    slot.elements.dropTitle.textContent = "选择最终图片";
    slot.elements.downloadBinButton.hidden = true;
    renderSlotState(slot);
  }

  async function renderAllSlots() {
    await Promise.all(slots.map(renderSlot));
    updateBatchState();
  }

  async function renderSlot(slot) {
    const ui = slot.elements;
    if (!slot.project) {
      ui.qrCanvas.hidden = true;
      ui.qrPlaceholder.hidden = false;
      ui.generateQrButton.hidden = false;
      ui.qrActions.hidden = true;
      ui.qrInstruction.textContent = "先为这张图片生成专属二维码。";
      ui.formCodeRow.hidden = true;
      ui.formCodeInput.value = "";
      renderSlotState(slot);
      return;
    }
    try {
      await window.QRCode.toCanvas(ui.qrCanvas, projectUrl(slot.project), qrOptions(360));
      ui.qrCanvas.hidden = false;
      ui.qrPlaceholder.hidden = true;
      ui.generateQrButton.hidden = true;
      ui.qrActions.hidden = false;
      const hasFormCode = /^[a-f0-9]{32}$/.test(slot.project.formCode || "");
      ui.formCodeRow.hidden = !hasFormCode;
      ui.formCodeInput.value = hasFormCode ? slot.project.formCode : "";
      ui.qrInstruction.textContent = slot.project.publishedAt
        ? "已发布。可重新选择成品图来更新这个二维码对应的图片。"
        : "二维码已锁定，请把它放进这张图片。";
    } catch (error) {
      showSlotError(slot, error.message || "无法恢复当前二维码。");
    }
    renderSlotState(slot);
  }

  function renderSlotState(slot) {
    const ui = slot.elements;
    const ready = isSlotReady(slot);
    ui.card.classList.toggle("busy", slot.busy);
    ui.publishButton.disabled = Boolean(slot.busy || !ready);
    ui.generateQrButton.disabled = slot.busy;
    ui.downloadQrButton.disabled = slot.busy;
    ui.resetTaskButton.disabled = slot.busy;
    ui.formCodeCopyButton.disabled = slot.busy;
    ui.finalImageInput.disabled = slot.busy;
    ui.badge.className = "task-badge";
    if (!slot.project) {
      ui.badge.textContent = "等待二维码";
    } else if (slot.project.publishedAt && !slot.needsPublish) {
      ui.badge.textContent = "已发布";
      ui.badge.classList.add("published");
    } else if (!slot.file && !slot.project.publishedAt) {
      ui.badge.textContent = "等待成品图";
    } else if (ready) {
      ui.badge.textContent = slot.project.publishedAt ? "可以更新" : "可以发布";
      ui.badge.classList.add("ready");
    } else {
      ui.badge.textContent = "等待图片";
    }
    updateBatchState();
  }

  function isSlotReady(slot) {
    return Boolean(slot.project && !slot.busy && slot.file && slot.needsPublish);
  }

  function updateBatchState() {
    if (!slots.length) return;
    const ready = slots.filter(isSlotReady).length;
    const published = slots.filter((slot) => slot.project && slot.project.publishedAt).length;
    elements.batchSummary.textContent = `${ready} / 3 张已准备${published ? ` · ${published} 张已发布` : ""}`;
    elements.publishAllButton.disabled = batchPublishing || ready === 0 || slots.some((slot) => slot.busy);
    elements.exportProjectsButton.disabled = !slots.some((slot) => slot.project) || slots.some((slot) => slot.busy);
  }

  function exportProjectBackup() {
    const savedProjects = slots.map((slot) => slot.project).filter(Boolean);
    if (!savedProjects.length) return;
    const backup = {
      format: "huituma-project-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      warning: "本文件包含二维码解密钥匙，请像二维码一样私密保管；不包含 GitHub token。",
      projects: savedProjects,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `私密图片任务备份-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importProjectBackup(file) {
    elements.importProjectsInput.value = "";
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== "huituma-project-backup" || !Array.isArray(backup.projects)) {
        throw new Error("这不是有效的私密图片任务备份。");
      }
      const imported = backup.projects.slice(0, SLOT_COUNT);
      if (!imported.length || imported.some((project) => !validProject(project))) {
        throw new Error("任务备份内容不完整或已经损坏。");
      }
      if (!window.confirm("导入会替换当前三个任务位，但不会删除已经发布的文件。确定继续吗？")) return;
      slots.forEach((slot, index) => {
        clearSlotFile(slot);
        clearMessages(slot);
        slot.project = imported[index] || null;
      });
      saveProjects();
      await renderAllSlots();
    } catch (error) {
      window.alert(error.message || "任务备份无法导入。");
    }
  }

  async function publishAllReady() {
    const readySlots = slots.filter(isSlotReady);
    if (!readySlots.length) return;
    githubToken = loadToken() || githubToken;
    if (!githubToken) {
      showSlotError(readySlots[0], "请先在“发布设置”中填写 GitHub token。");
      openSettings();
      return;
    }

    batchPublishing = true;
    elements.publishAllButton.textContent = "正在依次安全发布…";
    updateBatchState();
    const uploaded = [];
    try {
      for (const slot of readySlots) {
        if (await publishSlot(slot, false)) uploaded.push(slot);
      }
      elements.publishAllButton.textContent = "等待网站同步…";
      const results = await Promise.all(uploaded.map((slot) => waitForPublishedFile(slot.project)));
      uploaded.forEach((slot, index) => {
        setSlotStatus(slot, results[index]
          ? "发布完成。扫描对应二维码即可查看这张图片。"
          : "上传成功，GitHub Pages 仍在同步；请稍后再扫描。");
      });
    } finally {
      batchPublishing = false;
      elements.publishAllButton.textContent = "发布全部已准备图片";
      updateBatchState();
    }
  }

  async function publishSlot(slot, waitForPages) {
    clearMessages(slot);
    if (!isSlotReady(slot)) {
      showSlotError(slot, "请先生成二维码，并选择带二维码的最终图片。");
      return false;
    }
    githubToken = loadToken() || githubToken;
    if (!githubToken) {
      showSlotError(slot, "还没有 GitHub token。请先完成发布设置。");
      openSettings();
      return false;
    }

    slot.busy = true;
    slot.elements.publishButton.textContent = "正在本机加密…";
    renderSlotState(slot);
    try {
      if (slot.file && slot.needsPublish) {
        slot.encryptedBlob = await encryptImage(slot.file, slot.project.key);
        slot.elements.downloadBinButton.hidden = false;
      }
      setSlotStatus(slot, "加密完成，正在上传加密文件…");
      slot.elements.publishButton.textContent = "正在上传…";
      if (slot.encryptedBlob && slot.needsPublish) {
        const result = await uploadEncryptedFile(slot.encryptedBlob, slot.project);
        slot.project.sha = result.sha || slot.project.sha;
        slot.project.publishedAt = new Date().toISOString();
        slot.needsPublish = false;
      }
      saveProjects();
      slot.elements.downloadBinButton.hidden = true;

      if (waitForPages) {
        slot.elements.publishButton.textContent = "等待网站同步…";
        setSlotStatus(slot, "GitHub 已接收，正在等待 GitHub Pages 更新…");
        const ready = await waitForPublishedFile(slot.project);
        setSlotStatus(slot, ready
          ? "发布完成。扫描对应二维码即可查看这张图片。"
          : "上传成功，GitHub Pages 仍在同步；通常再等 1–2 分钟即可。");
      } else {
        setSlotStatus(slot, "加密文件已上传，等待本批次全部完成。 ");
      }
      renderSlot(slot);
      return true;
    } catch (error) {
      showSlotError(slot, error.message || "发布失败。可以重试，或下载 .bin 手动上传。");
      slot.elements.downloadBinButton.hidden = !slot.encryptedBlob;
      return false;
    } finally {
      slot.busy = false;
      slot.elements.publishButton.textContent = "加密并发布这张";
      renderSlotState(slot);
    }
  }

  async function encryptImage(file, keyText) {
    if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器不支持安全加密。");
    const rawKey = fromBase64Url(keyText);
    if (rawKey.length !== 32) throw new Error("当前任务的解密钥匙无效，请重新生成二维码。");
    const mime = new TextEncoder().encode(file.type || "image/png");
    if (mime.length > 255) throw new Error("图片类型信息异常。");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
    const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, await file.arrayBuffer(),
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
        const file = await existing.json();
        if (file.sha) {
          body.sha = file.sha;
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
    try { detail = (await response.json()).message || ""; } catch (_error) { /* Ignore invalid error bodies. */ }
    if (response.status === 401) return "GitHub 拒绝了 token，请检查 token 是否正确或已经过期。";
    if (response.status === 403) return "token 没有写入权限，请把 Contents 设为 Read and write。";
    if (response.status === 404) return "找不到仓库，请检查用户名、仓库名和 token 授权范围。";
    if (response.status === 409) return "GitHub 分支正在更新，请稍后重试。";
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

  function setSlotStatus(slot, message) {
    slot.elements.status.textContent = message;
    slot.elements.status.hidden = false;
    slot.elements.error.hidden = true;
  }

  function showSlotError(slot, message) {
    slot.elements.error.textContent = message;
    slot.elements.error.hidden = false;
    slot.elements.status.hidden = true;
  }

  function clearMessages(slot) {
    slot.elements.error.hidden = true;
    slot.elements.error.textContent = "";
    slot.elements.status.hidden = true;
    slot.elements.status.textContent = "";
  }

  function projectUrl(project) {
    const url = new URL(project.baseUrl);
    url.searchParams.set("view", project.id);
    if (project.formCode) url.searchParams.set("form", project.formCode);
    url.hash = `k=${project.key}`;
    return url.toString();
  }

  function qrOptions(width) {
    return { width, margin: 4, errorCorrectionLevel: "H", color: { dark: "#000000", light: "#ffffff" } };
  }

  function normalizeBaseUrl(value) {
    let url;
    try { url = new URL(String(value || "").trim()); }
    catch (_error) { throw new Error("请输入完整网址，例如 https://你的域名.com/"); }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      throw new Error("正式二维码必须使用 HTTPS 网址；HTTP 只允许本机测试。");
    }
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  }

  function isLegacyPagesUrl(value) {
    try {
      const url = new URL(value);
      return url.hostname.toLowerCase() === "malex09yw.github.io" && /^\/huituma\/?$/i.test(url.pathname);
    } catch (_error) {
      return false;
    }
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
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    }
    return btoa(chunks.join(""));
  }

  function toBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function toHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function deriveFormCode(fileId, keyText) {
    const payload = new TextEncoder().encode(`huituma-form:${fileId}:${keyText}`);
    const digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", payload));
    return toHex(digest.slice(0, 16));
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
    const image = document.querySelector("#viewer-image");
    const errorText = document.querySelector("#viewer-error");
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

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      let response;
      try {
        response = await fetch(`./vault/${encodeURIComponent(fileId)}.bin`, { cache: "no-store", signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
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
        const start = 17 + mimeLength;
        if (!mimeLength || sealed.length <= start + 16) throw new Error("图片文件格式不正确。");
        mimeType = new TextDecoder().decode(sealed.slice(17, start));
        if (!mimeType.startsWith("image/")) throw new Error("图片类型不正确。");
        ciphertext = sealed.slice(start);
      } else {
        throw new Error("图片文件版本不受支持。");
      }

      const key = await window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
      const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const imageUrl = URL.createObjectURL(new Blob([plaintext], { type: mimeType }));
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("图片无法显示。"));
        image.src = imageUrl;
      });
      image.hidden = false;
    } catch (error) {
      errorText.textContent = error.name === "AbortError"
        ? "网络超时，请检查连接后重新扫描。"
        : (error.message || "无法打开图片。");
      errorText.hidden = false;
    }
  }
})();
