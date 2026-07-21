(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const viewId = params.get("view");
  const studio = document.querySelector("#studio");
  const viewer = document.querySelector("#viewer");

  if (viewId) {
    studio.hidden = true;
    viewer.hidden = false;
    void startViewer(viewId);
    return;
  }

  const publicUrlInput = document.querySelector("#public-url");
  const fileInput = document.querySelector("#file-input");
  const uploadBox = document.querySelector("#upload-box");
  const uploadTitle = document.querySelector("#upload-title");
  const sizeRange = document.querySelector("#size-range");
  const sizeOutput = document.querySelector("#size-output");
  const generateButton = document.querySelector("#generate-button");
  const errorMessage = document.querySelector("#error-message");
  const previewEmpty = document.querySelector("#preview-empty");
  const previewResult = document.querySelector("#preview-result");
  const previewImage = document.querySelector("#preview-image");
  const previewCaption = document.querySelector("#preview-caption");
  const downloadImageButton = document.querySelector("#download-image-button");
  const downloadEncryptedButton = document.querySelector("#download-encrypted-button");
  const publishFileName = document.querySelector("#publish-file-name");
  const positionButtons = Array.from(document.querySelectorAll("[data-position]"));

  let sourceImage = "";
  let resultImageUrl = "";
  let resultImageBlob = null;
  let encryptedBlob = null;
  let encryptedFileName = "";
  let position = "bottom-right";

  const pageUrl = new URL(window.location.href);
  pageUrl.search = "";
  pageUrl.hash = "";
  publicUrlInput.value = pageUrl.toString();

  uploadBox.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => acceptFile(fileInput.files && fileInput.files[0]));
  uploadBox.addEventListener("dragover", (event) => event.preventDefault());
  uploadBox.addEventListener("dragenter", () => uploadBox.classList.add("dragging"));
  uploadBox.addEventListener("dragleave", () => uploadBox.classList.remove("dragging"));
  uploadBox.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadBox.classList.remove("dragging");
    acceptFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  publicUrlInput.addEventListener("input", clearResult);
  sizeRange.addEventListener("input", () => {
    sizeOutput.textContent = `${sizeRange.value}%`;
    clearResult();
  });

  positionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      position = button.dataset.position;
      positionButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      clearResult();
    });
  });

  generateButton.addEventListener("click", generateImage);
  downloadImageButton.addEventListener("click", () => {
    if (resultImageBlob) downloadBlob(resultImageBlob, `回图码-${encryptedFileName.slice(0, 8)}.png`);
  });
  downloadEncryptedButton.addEventListener("click", () => {
    if (encryptedBlob && encryptedFileName) downloadBlob(encryptedBlob, encryptedFileName);
  });

  async function acceptFile(file) {
    hideError();
    clearResult();
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError("请选择 JPG、PNG、WebP 等常见图片文件。");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      showError("图片不能超过 30 MB，请先压缩后再试。");
      return;
    }
    try {
      sourceImage = await readFile(file);
      uploadTitle.textContent = file.name;
      generateButton.disabled = false;
      showPreview(sourceImage, false);
    } catch (error) {
      showError(error.message || "图片读取失败。");
    }
  }

  async function generateImage() {
    hideError();
    if (!sourceImage) {
      showError("请先选择一张图片。");
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      showError("当前浏览器不支持安全加密，请使用最新版 Chrome、Edge 或 Safari，并通过 HTTPS 打开页面。");
      return;
    }

    let baseUrl;
    try {
      baseUrl = new URL(publicUrlInput.value.trim());
      if (!["http:", "https:"].includes(baseUrl.protocol)) throw new Error();
      baseUrl.search = "";
      baseUrl.hash = "";
    } catch (_error) {
      showError("请输入完整的 GitHub Pages 网址，例如 https://用户名.github.io/项目名/");
      return;
    }

    generateButton.disabled = true;
    generateButton.textContent = "正在加密生成…";
    try {
      const fileId = toBase64Url(window.crypto.getRandomValues(new Uint8Array(12)));
      const rawKey = window.crypto.getRandomValues(new Uint8Array(32));
      const destination = new URL(baseUrl.toString());
      destination.searchParams.set("view", fileId);
      destination.hash = `k=${toBase64Url(rawKey)}`;

      const image = await loadImage(sourceImage);
      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, 6000 / longestSide);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const shortestSide = Math.min(width, height);
      const sizePercent = Number(sizeRange.value);
      const qrSize = Math.round(Math.min(shortestSide * 0.44, Math.max(shortestSide * (sizePercent / 100), 112)));
      const padding = Math.max(7, Math.round(qrSize * 0.035));
      const panelSize = qrSize + padding * 2;
      const margin = Math.max(12, Math.round(shortestSide * 0.025));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法处理图片。");
      context.drawImage(image, 0, 0, width, height);

      const qrCanvas = document.createElement("canvas");
      await window.QRCode.toCanvas(qrCanvas, destination.toString(), {
        width: qrSize,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#101715", light: "#ffffff" },
      });

      const left = position.endsWith("left");
      const top = position.startsWith("top");
      const x = left ? margin : width - panelSize - margin;
      const y = top ? margin : height - panelSize - margin;

      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.26)";
      context.shadowBlur = Math.max(10, Math.round(qrSize * 0.08));
      context.shadowOffsetY = Math.max(4, Math.round(qrSize * 0.025));
      context.fillStyle = "#ffffff";
      roundedRect(context, x, y, panelSize, panelSize, Math.max(10, qrSize * 0.06));
      context.fill();
      context.restore();
      context.drawImage(qrCanvas, x + padding, y + padding, qrSize, qrSize);

      resultImageBlob = await canvasToBlob(canvas);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const key = await window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
      const ciphertext = new Uint8Array(
        await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          await resultImageBlob.arrayBuffer(),
        ),
      );
      const sealed = new Uint8Array(16 + ciphertext.length);
      sealed.set([0x48, 0x54, 0x4d, 0x31], 0);
      sealed.set(iv, 4);
      sealed.set(ciphertext, 16);
      encryptedBlob = new Blob([sealed], { type: "application/octet-stream" });
      encryptedFileName = `${fileId}.bin`;

      if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
      resultImageUrl = URL.createObjectURL(resultImageBlob);
      publishFileName.textContent = `docs/vault/${encryptedFileName}`;
      showPreview(resultImageUrl, true);
    } catch (error) {
      clearResult();
      showError(error.message || "生成失败，请换一张图片再试。");
    } finally {
      generateButton.disabled = !sourceImage;
      generateButton.textContent = "生成加密二维码图片";
    }
  }

  function clearResult() {
    if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
    resultImageUrl = "";
    resultImageBlob = null;
    encryptedBlob = null;
    encryptedFileName = "";
    publishFileName.textContent = "docs/vault/随机编号.bin";
    if (sourceImage) showPreview(sourceImage, false);
  }

  function showPreview(source, finished) {
    previewEmpty.hidden = true;
    previewResult.hidden = false;
    previewImage.src = source;
    previewImage.alt = finished ? "已添加私密二维码的成品预览" : "待处理图片预览";
    previewCaption.textContent = finished
      ? "已生成：图片只保存在本机；上传时只上传加密文件。"
      : "这是原图预览，点击左侧按钮生成加密二维码。";
    downloadImageButton.hidden = !finished;
    downloadEncryptedButton.hidden = !finished;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("无法读取这张图片，请换一张再试。"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片格式无法识别，请使用 JPG、PNG 或 WebP。"));
      image.src = source;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("无法生成图片文件。"));
      }, "image/png");
    });
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
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

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }

  function hideError() {
    errorMessage.textContent = "";
    errorMessage.hidden = true;
  }

  async function startViewer(fileId) {
    const viewerImage = document.querySelector("#viewer-image");
    const viewerStatus = document.querySelector("#viewer-status");
    const viewerStatusTitle = document.querySelector("#viewer-status-title");
    const viewerStatusText = document.querySelector("#viewer-status-text");
    const viewerTools = document.querySelector("#viewer-tools");
    const viewerDownload = document.querySelector("#viewer-download");

    function setStatus(title, text) {
      viewerStatusTitle.textContent = title;
      viewerStatusText.textContent = text;
      viewerStatus.hidden = false;
      viewerImage.hidden = true;
      viewerTools.hidden = true;
    }

    try {
      if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器不支持安全解密，请换用最新版浏览器。 ");
      if (!/^[A-Za-z0-9_-]{16}$/.test(fileId)) throw new Error("图片编号无效，请重新扫描二维码。");

      const fragment = new URLSearchParams(window.location.hash.slice(1));
      let keyText = fragment.get("k") || "";
      const sessionKey = `huituma:${fileId}`;
      if (keyText) {
        try { sessionStorage.setItem(sessionKey, keyText); } catch (_error) { /* Session storage may be disabled. */ }
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } else {
        try { keyText = sessionStorage.getItem(sessionKey) || ""; } catch (_error) { /* Session storage may be disabled. */ }
      }
      if (!keyText) throw new Error("缺少解密钥匙，请直接扫描原二维码进入。");

      const rawKey = fromBase64Url(keyText);
      if (rawKey.length !== 32) throw new Error("二维码中的解密钥匙无效。");
      setStatus("正在安全解密", "图片只会在当前设备的浏览器中还原。 ");

      const response = await fetch(`./vault/${encodeURIComponent(fileId)}.bin`, { cache: "no-store" });
      if (!response.ok) throw new Error("加密图片尚未发布，或已经被发布者删除。");
      const sealed = new Uint8Array(await response.arrayBuffer());
      if (
        sealed.length < 33 ||
        sealed[0] !== 0x48 || sealed[1] !== 0x54 || sealed[2] !== 0x4d || sealed[3] !== 0x31
      ) throw new Error("加密图片文件格式不正确。");

      const iv = sealed.slice(4, 16);
      const ciphertext = sealed.slice(16);
      const key = await window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
      const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const imageBlob = new Blob([plaintext], { type: "image/png" });
      const imageUrl = URL.createObjectURL(imageBlob);
      viewerImage.src = imageUrl;
      viewerImage.hidden = false;
      viewerStatus.hidden = true;
      viewerTools.hidden = false;
      viewerDownload.href = imageUrl;
      viewerDownload.download = `回图码-${fileId.slice(0, 8)}.png`;
    } catch (error) {
      setStatus("无法打开图片", error.message || "二维码无效或图片已经失效。");
    }
  }
})();
