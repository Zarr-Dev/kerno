(function () {
  "use strict";
  const DEFAULT_URL = "http://127.0.0.1:8765";
  let baseUrl = DEFAULT_URL;
  let pairingToken = "";

  function normalizeBase(value) {
    const url = new URL(value || DEFAULT_URL);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Local service URL must use HTTP or HTTPS.");
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const allowed = ["127.0.0.1", "localhost", "::1"];
    if (!allowed.includes(host)) throw new Error("For security, Kerno currently connects only to a local loopback service.");
    return url.origin;
  }

  function configure(url, token) {
    baseUrl = normalizeBase(url || DEFAULT_URL);
    pairingToken = String(token || "").trim();
    return baseUrl;
  }

  async function request(path, options) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), (options && options.timeout) || 5000);
    const init = Object.assign({ method: "GET", headers: { "Accept": "application/json" } }, options || {});
    delete init.timeout;
    init.headers = Object.assign({}, init.headers || {}, { "X-Kerno-Token": pairingToken });
    init.signal = controller.signal;
    if (init.body && typeof init.body !== "string") {
      init.headers = Object.assign({}, init.headers, { "Content-Type": "application/json" });
      init.body = JSON.stringify(init.body);
    }
    try {
      const response = await fetch(baseUrl + path, init);
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { message: text.slice(0, 300) }; }
      if (!response.ok) {
        const error = new Error(body.message || body.error || ("Local service returned HTTP " + response.status));
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Local service request timed out.");
      if (error instanceof TypeError) throw new Error("Cannot reach Kerno Local Service. Start it and check its CORS settings.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function health() {
    if (!pairingToken) throw new Error("Pairing token is missing. Paste the token shown by Kerno Local Service in Settings → Advanced.");
    const result = await request("/api/v1/health", { method: "GET", timeout: 3500 });
    if (result.service && result.service !== "kerno-local-agent") {
      throw new Error("Unexpected local service identity.");
    }
    return result;
  }

  async function build(project, settings) {
    return request("/api/v1/build", {
      method: "POST",
      timeout: 180000,
      body: { project: project, settings: settings }
    });
  }

  async function startEmulator(project, settings) {
    return request("/api/v1/emulator/start", {
      method: "POST",
      timeout: 10000,
      body: { project: project, settings: settings }
    });
  }

  async function stopEmulator() {
    return request("/api/v1/emulator/stop", { method: "POST", timeout: 5000, body: {} });
  }

  async function emulatorStatus() {
    return request("/api/v1/emulator/status", { method: "GET", timeout: 3500 });
  }

  async function toolchain(settings) {
    return request("/api/v1/toolchain", {
      method: "POST",
      timeout: 8000,
      body: { settings: settings || {} }
    });
  }
  async function hostDiagnostics(settings) {
    return request("/api/v1/host/diagnostics", {
      method: "POST",
      timeout: 10000,
      body: { settings: settings || {} }
    });
  }


  async function resourceEstimate(project, settings) {
    return request("/api/v1/memory/estimate", {
      method: "POST",
      timeout: 5000,
      body: { project: project, settings: settings }
    });
  }

  async function downloadArtifact(artifactId) {
    if (!pairingToken) throw new Error("Pairing token is missing. Configure it in Settings → Advanced.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(baseUrl + "/api/v1/artifacts/" + encodeURIComponent(artifactId), {
        method: "GET",
        headers: { "X-Kerno-Token": pairingToken },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        let message = "Artifact download failed with HTTP " + response.status;
        try {
          const body = await response.json();
          message = body.message || message;
        } catch (_) {}
        throw new Error(message);
      }
      return await response.blob();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Artifact download timed out.");
      if (error instanceof TypeError) throw new Error("Could not reach Kerno Local Service to download the ISO.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }



  async function importIso(file) {
    if (!file || !file.size) throw new Error("Choose a non-empty ISO file first.");
    if (!/\.iso$/i.test(file.name || "")) throw new Error("The selected file must use the .iso extension.");
    if (file.size > 4 * 1024 * 1024 * 1024) throw new Error("ISO exceeds Kerno's default 4 GiB upload limit.");
    if (!pairingToken) throw new Error("Pairing token is missing. Configure it in Settings → Advanced.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15 * 60 * 1000);
    try {
      const response = await fetch(baseUrl + "/api/v1/iso/import?name=" + encodeURIComponent(file.name), {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Kerno-Token": pairingToken
        },
        body: file,
        cache: "no-store",
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || ("ISO import failed with HTTP " + response.status));
      if (!body.iso || !body.iso.id) throw new Error("Local Service did not return a valid ISO import record.");
      return body.iso;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("ISO upload timed out. Check the local service and try again.");
      if (error instanceof TypeError) throw new Error("Could not reach Kerno Local Service during ISO upload.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function extractIso(isoId) {
    return request("/api/v1/iso/extract", {
      method: "POST",
      timeout: 360000,
      body: { isoId: isoId }
    });
  }

  async function startIsoEmulator(isoId, settings) {
    return request("/api/v1/emulator/start-iso", {
      method: "POST",
      timeout: 15000,
      body: { isoId: isoId, settings: settings || {} }
    });
  }

  async function downloadIsoArchive(archiveId) {
    if (!pairingToken) throw new Error("Pairing token is missing. Configure it in Settings → Advanced.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15 * 60 * 1000);
    try {
      const response = await fetch(baseUrl + "/api/v1/iso/archives/" + encodeURIComponent(archiveId), {
        method: "GET",
        headers: { "X-Kerno-Token": pairingToken },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        let message = "ISO extraction download failed with HTTP " + response.status;
        try { const body = await response.json(); message = body.message || message; } catch (_) {}
        throw new Error(message);
      }
      return await response.blob();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Extracted archive download timed out.");
      if (error instanceof TypeError) throw new Error("Could not reach Kerno Local Service to download the extracted archive.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }



  async function openIsoWorkspace(isoId) {
    return request("/api/v1/iso/workspace/open", {
      method: "POST",
      timeout: 600000,
      body: { isoId: isoId }
    });
  }

  async function listIsoWorkspaceFiles(isoId, prefix) {
    const query = prefix ? "?prefix=" + encodeURIComponent(prefix) : "";
    return request("/api/v1/iso/workspaces/" + encodeURIComponent(isoId) + "/files" + query, {
      method: "GET",
      timeout: 15000
    });
  }

  async function readIsoWorkspaceFile(isoId, path) {
    const url = "/api/v1/iso/workspaces/" + encodeURIComponent(isoId) + "/file?path=" + encodeURIComponent(path);
    return request(url, { method: "GET", timeout: 15000 });
  }

  async function writeIsoWorkspaceFile(isoId, path, fileOrBlob) {
    if (!pairingToken) throw new Error("Pairing token is missing. Configure it in Settings → Advanced.");
    const body = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([String(fileOrBlob)], { type: "text/plain;charset=utf-8" });
    if (body.size > 16 * 1024 * 1024) throw new Error("An edited ISO file cannot exceed 16 MiB.");
    const url = baseUrl + "/api/v1/iso/workspace/file?isoId=" + encodeURIComponent(isoId) + "&path=" + encodeURIComponent(path);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Kerno-Token": pairingToken },
      body: body,
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || ("ISO file save failed with HTTP " + response.status));
    return result;
  }

  async function deleteIsoWorkspaceFile(isoId, path) {
    return request("/api/v1/iso/workspace/delete", {
      method: "POST",
      timeout: 15000,
      body: { isoId: isoId, path: path }
    });
  }

  async function repackIsoWorkspace(isoId) {
    return request("/api/v1/iso/workspace/repack", {
      method: "POST",
      timeout: 900000,
      body: { isoId: isoId }
    });
  }

  async function downloadEditedIso(isoId) {
    if (!pairingToken) throw new Error("Pairing token is missing. Configure it in Settings → Advanced.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15 * 60 * 1000);
    try {
      const response = await fetch(baseUrl + "/api/v1/iso/download/" + encodeURIComponent(isoId), {
        method: "GET",
        headers: { "X-Kerno-Token": pairingToken },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        let message = "Edited ISO download failed with HTTP " + response.status;
        try { const body = await response.json(); message = body.message || message; } catch (_) {}
        throw new Error(message);
      }
      return await response.blob();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Edited ISO download timed out.");
      if (error instanceof TypeError) throw new Error("Could not reach Kerno Local Service to download the edited ISO.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  window.KernoLocalService = Object.freeze({
    defaultUrl: DEFAULT_URL,
    configure: configure,
    getUrl: function () { return baseUrl; },
    health: health,
    build: build,
    startEmulator: startEmulator,
    stopEmulator: stopEmulator,
    emulatorStatus: emulatorStatus,
    toolchain: toolchain,
    hostDiagnostics: hostDiagnostics,
    resourceEstimate: resourceEstimate,
    downloadArtifact: downloadArtifact,
    importIso: importIso,
    extractIso: extractIso,
    startIsoEmulator: startIsoEmulator,
    downloadIsoArchive: downloadIsoArchive,
    openIsoWorkspace: openIsoWorkspace,
    listIsoWorkspaceFiles: listIsoWorkspaceFiles,
    readIsoWorkspaceFile: readIsoWorkspaceFile,
    writeIsoWorkspaceFile: writeIsoWorkspaceFile,
    deleteIsoWorkspaceFile: deleteIsoWorkspaceFile,
    repackIsoWorkspace: repackIsoWorkspace,
    downloadEditedIso: downloadEditedIso
  });
})();