import { createMessage, TIMEOUT_MS, MESSAGE_TYPES } from './bridgeMessages';

export class BridgeClient {
  constructor(from) {
    this.from = from;
    this.bridge = null;
    this.pending = new Map();
    this.handlers = new Map();
    this.peerStatus = {};

    // Built-in handlers for readiness broadcasts
    this.registerHandler(MESSAGE_TYPES.PEER_READY, (msg) => {
      this.peerStatus[msg.payload.peer] = true;
    });
    this.registerHandler(MESSAGE_TYPES.PEER_UNAVAILABLE, (msg) => {
      this.peerStatus[msg.payload.peer] = false;
    });
  }

  setBridge(bridge) {
    this.bridge = bridge;
  }

  isReady(peer) {
    return !!this.peerStatus[peer];
  }

  send(type, payload, timeoutMs = TIMEOUT_MS) {
    const msg = createMessage(type, payload, this.from);

    if (!this.bridge || typeof this.bridge.sendMessage !== 'function') {
      return Promise.reject(new Error('Bridge not connected or sendMessage not available'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error(`Timeout waiting for ${type}Response`));
      }, timeoutMs);

      this.pending.set(msg.id, { resolve, reject, timer });
      this.bridge.sendMessage(JSON.stringify(msg));
    });
  }

  // Called by Qt via window.onBridgeMessage
  onMessage(msgJson) {
    let msg;
    try {
      msg = typeof msgJson === 'string' ? JSON.parse(msgJson) : msgJson;
    } catch {
      console.warn('BridgeClient: invalid message JSON');
      return;
    }

    // Check if this is a response to a pending request
    const pendingEntry = this.pending.get(msg.id);
    if (pendingEntry && msg.type?.endsWith('Response')) {
      this.pending.delete(msg.id);
      clearTimeout(pendingEntry.timer);
      if (msg.status === 'ok') {
        pendingEntry.resolve(msg);
      } else {
        pendingEntry.reject(new Error(msg.error || `${msg.type} failed`));
      }
      return;
    }

    // Otherwise dispatch to a registered handler
    const handler = this.handlers.get(msg.type);
    if (handler) {
      handler(msg);
    }
  }

  registerHandler(type, fn) {
    this.handlers.set(type, fn);
  }

  // Emit a fire-and-forget message (no response expected)
  emit(type, payload) {
    const msg = createMessage(type, payload, this.from);
    if (this.bridge && typeof this.bridge.sendMessage === 'function') {
      this.bridge.sendMessage(JSON.stringify(msg));
    }
  }

  destroy() {
    for (const { timer } of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    this.handlers.clear();
  }
}
