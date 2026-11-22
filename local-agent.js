(function () {
  "use strict";
  const DEFAULT_URL = "http://127.0.0.1:8765";
  let baseUrl = DEFAULT_URL;

  function normalizeBase(value) {
    const url = new URL(value || DEFAULT_URL);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Local service URL must use HTTP or HTTPS.");
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const allowed = ["127.0.0.1", "localhost", "::1"];
    if (!allowed.includes(host)) throw new Error("For security, Kerno currently connects only to a local loopback service.");
    return url.origin;
  }

  function configure(url) {
    baseUrl = normalizeBase(url || DEFAULT_URL);
    return baseUrl;
  }

  async function request(path, options) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), (options && options.timeout) || 5000);
    const init = Object.assign({ method: "GET", headers: { "Accept": "application/json" } }, options || {});
    delete init.timeout;
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
    const result = await request("/api/v1/health", { method: "GET", timeout: 3500 });
    if (result.service && result.service !== "kerno-local-agent") {
      throw new Error("Unexpected local service identity.");
    }
    return result;
  }

  async function build(project, settings) {
    return request("/api/v1/build", {
      method: "POST",
      timeout: 15000,
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

  async function toolchain() {
    return request("/api/v1/toolchain", { method: "GET", timeout: 5000 });
  }

  async function resourceEstimate(project, settings) {
    return request("/api/v1/memory/estimate", {
      method: "POST",
      timeout: 5000,
      body: { project: project, settings: settings }
    });
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
    resourceEstimate: resourceEstimate
  });
})();