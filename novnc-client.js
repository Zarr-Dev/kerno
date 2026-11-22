import RFB from "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.7.0/core/rfb.js";

let currentClient = null;

function disconnectCurrent() {
  if (!currentClient) return;
  try {
    currentClient.disconnect();
  } catch (_) {
    // A disconnected RFB instance can throw while being disposed.
  }
  currentClient = null;
}

function connect(container, websocketUrl, onStatus) {
  if (!(container instanceof HTMLElement)) {
    throw new TypeError("A valid QEMU viewport element is required.");
  }

  const endpoint = new URL(websocketUrl);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(
    endpoint.hostname.replace(/^\[|\]$/g, "")
  );

  if (!localHost || !["ws:", "wss:"].includes(endpoint.protocol)) {
    throw new Error("noVNC accepts only a loopback WebSocket endpoint.");
  }

  disconnectCurrent();
  container.replaceChildren();

  const client = new RFB(container, endpoint.href, {
    shared: true
  });

  client.scaleViewport = true;
  client.resizeSession = false;
  client.clipViewport = false;
  client.showDotCursor = true;
  client.background = "#0e141b";

  client.addEventListener("connect", () => {
    onStatus?.("QEMU display connected");
  });

  client.addEventListener("disconnect", (event) => {
    if (currentClient === client) currentClient = null;
    const reason = event.detail?.reason;
    onStatus?.(reason ? "QEMU display disconnected: " + reason : "QEMU display disconnected");
  });

  client.addEventListener("credentialsrequired", () => {
    onStatus?.("QEMU VNC credentials required");
  });

  client.addEventListener("securityfailure", (event) => {
    onStatus?.("QEMU VNC security failure: " + (event.detail?.reason || "connection rejected"));
  });

  currentClient = client;
  return client;
}

window.KernoNoVNC = Object.freeze({
  connect,
  disconnect: disconnectCurrent
});
