/**
 * Initialize QWebChannel bridge once. Returns a promise that resolves with the bridge object.
 * Retries until window.qt and QWebChannel are available.
 */
export function initQtBridge(bridgeName = 'qtBridge') {
  return new Promise((resolve) => {
    const tryInit = () => {
      if (!window.QWebChannel || !window.qt?.webChannelTransport) return false;

      new window.QWebChannel(window.qt.webChannelTransport, (channel) => {
        const bridge = channel.objects?.[bridgeName];
        if (bridge) {
          window.qtBridge = bridge;
          resolve(bridge);
        }
      });
      return true;
    };

    if (!tryInit()) {
      const timer = setInterval(() => {
        if (tryInit()) clearInterval(timer);
      }, 300);
    }
  });
}
