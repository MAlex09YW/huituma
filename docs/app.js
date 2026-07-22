(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const viewId = params.get("view");

  // A normal visit to the domain deliberately renders nothing. The public
  // surface exists only so a complete QR link can decrypt its matching image.
  if (!viewId) return;

  startViewer(viewId);

  async function startViewer(fileId) {
    const viewer = document.querySelector("#viewer");
    const image = document.querySelector("#viewer-image");
    const errorText = document.querySelector("#viewer-error");
    document.title = "信息查询页";
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
        response = await fetch(`./vault/${encodeURIComponent(fileId)}.bin`, {
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

  function fromBase64Url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key) || ""; } catch (_error) { return ""; }
  }

  function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (_error) { /* Storage may be disabled. */ }
  }
})();
