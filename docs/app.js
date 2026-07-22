(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const viewId = params.get("view");
  const formCode = params.get("form") || "";

  // A normal visit to the domain deliberately renders nothing. A complete QR
  // link is required before any encrypted image is requested.
  if (!viewId) return;

  if (formCode) {
    startVerification(viewId, formCode);
  } else {
    // QR codes created before the verification feature remain compatible.
    startViewer(viewId);
  }

  async function startVerification(fileId, expectedFormCode) {
    const verification = document.querySelector("#verification");
    const verificationImage = document.querySelector("#verification-image");
    const formCodeInput = document.querySelector("#form-code");
    const captchaInput = document.querySelector("#captcha-input");
    const captchaCanvas = document.querySelector("#captcha-canvas");
    const queryButton = document.querySelector("#query-button");

    if (!/^[A-Za-z0-9_-]{16}$/.test(fileId) || !/^[a-f0-9]{32}$/.test(expectedFormCode)) {
      showViewerError("二维码中的验证码无效。");
      return;
    }

    let keyText;
    try {
      keyText = captureImageKey(fileId);
      const boundFormCode = await deriveFormCode(fileId, keyText);
      if (boundFormCode !== expectedFormCode) throw new Error("二维码中的验证码无效。");
    } catch (error) {
      showViewerError(error.message || "无法打开图片。");
      return;
    }

    formCodeInput.value = expectedFormCode;
    let captchaText = drawCaptcha(captchaCanvas);
    let verified = false;

    // The first page uses one site-wide fixed image. It is unrelated to the
    // QR task and can be replaced independently in the publishing dashboard.
    // Keep the whole page hidden until the image has actually decoded, so the
    // image and verification controls appear in the same rendered frame.
    try {
      await loadFixedVerificationImage(verificationImage);
    } catch (_error) { /* Keep the clean page usable if the fixed image is unavailable. */ }
    verification.hidden = false;

    function refreshCaptcha() {
      captchaText = drawCaptcha(captchaCanvas);
      captchaInput.value = "";
      captchaInput.focus();
    }

    function submitCaptcha() {
      if (verified) return;
      const entered = captchaInput.value.replace(/\s+/g, "").toUpperCase();
      if (entered !== captchaText) {
        refreshCaptcha();
        return;
      }
      verified = true;
      captchaInput.disabled = true;
      queryButton.disabled = true;
      verification.hidden = true;
      startViewer(fileId);
    }

    captchaCanvas.addEventListener("click", refreshCaptcha);
    queryButton.addEventListener("click", submitCaptcha);
    captchaInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitCaptcha();
    });
    captchaInput.focus({ preventScroll: true });
  }

  function drawCaptcha(canvas) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const colors = ["#bec400", "#a42a78", "#28ad54", "#174c85"];
    const challenge = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const context = canvas.getContext("2d");
    const scaleX = canvas.width / 218;
    const scaleY = canvas.height / 66;

    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.clearRect(0, 0, 218, 66);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 218, 66);
    context.textAlign = "center";
    context.textBaseline = "middle";

    challenge.split("").forEach((character, index) => {
      const centerX = 31 + index * 50 + randomInt(7) - 3;
      const centerY = 34 + randomInt(7) - 3;
      const angle = (randomInt(17) - 8) * Math.PI / 180;
      context.save();
      context.translate(centerX, centerY);
      context.rotate(angle);
      context.font = `${45 + randomInt(6)}px Arial, Helvetica, sans-serif`;
      context.fillStyle = colors[index % colors.length];
      context.fillText(character, 0, 0);
      context.restore();
    });

    return challenge;
  }

  function randomInt(maximum) {
    const value = window.crypto.getRandomValues(new Uint32Array(1))[0];
    return value % maximum;
  }

  async function startViewer(fileId) {
    const verification = document.querySelector("#verification");
    const viewer = document.querySelector("#viewer");
    const image = document.querySelector("#viewer-image");
    const errorText = document.querySelector("#viewer-error");
    document.title = "信息查询页";
    verification.hidden = true;
    viewer.hidden = false;

    try {
      if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器无法安全打开这张图片。");
      if (!/^[A-Za-z0-9_-]{16}$/.test(fileId)) throw new Error("二维码中的图片编号无效。");
      const keyText = captureImageKey(fileId);
      const imageUrl = await loadEncryptedImage(`${fileId}.bin`, keyText);
      await showImage(image, imageUrl);
    } catch (error) {
      errorText.textContent = error.name === "AbortError"
        ? "网络超时，请检查连接后重新扫描。"
        : (error.message || "无法打开图片。");
      errorText.hidden = false;
    }
  }

  async function loadEncryptedImage(fileName, keyText) {
    const rawKey = fromBase64Url(keyText);
    if (rawKey.length !== 32) throw new Error("二维码中的解密钥匙无效。");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(`./vault/${encodeURIComponent(fileName)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
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
    return URL.createObjectURL(new Blob([plaintext], { type: mimeType }));
  }

  async function loadFixedVerificationImage(image) {
    const configUrl = new URL("./verification-header.json", window.location.href);
    configUrl.searchParams.set("_", Date.now());
    const response = await fetch(configUrl.toString(), { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    if (!config || !/^verification-header-[a-f0-9]{24}\.png$/.test(config.file)) return;
    const imageUrl = new URL(`./${config.file}`, window.location.href);
    imageUrl.searchParams.set("v", config.file.slice(20, 44));
    await showImage(image, imageUrl.toString());
  }

  function showImage(image, imageUrl) {
    return new Promise((resolve, reject) => {
      image.onload = () => {
        image.hidden = false;
        resolve();
      };
      image.onerror = () => reject(new Error("图片无法显示。"));
      image.src = imageUrl;
    });
  }

  function captureImageKey(fileId) {
    if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器无法安全打开这张图片。");
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
    return keyText;
  }

  function showViewerError(message) {
    const verification = document.querySelector("#verification");
    const viewer = document.querySelector("#viewer");
    const errorText = document.querySelector("#viewer-error");
    verification.hidden = true;
    viewer.hidden = false;
    errorText.textContent = message;
    errorText.hidden = false;
  }

  function fromBase64Url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function deriveFormCode(fileId, keyText) {
    const payload = new TextEncoder().encode(`huituma-form:${fileId}:${keyText}`);
    const digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", payload));
    return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key) || ""; } catch (_error) { return ""; }
  }

  function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (_error) { /* Storage may be disabled. */ }
  }
})();
