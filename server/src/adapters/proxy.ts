import net from "node:net";

export const fetchWithProxy = (input: string | URL, init?: RequestInit): Promise<Response> => {
  return fetch(input, init);
};

export const testNetworkProxy = async (proxy?: {
  protocol?: string;
  host?: string;
  port?: number | string;
}): Promise<boolean> => {
  if (!proxy || proxy.protocol === "off" || !proxy.host || !proxy.port) {
    try {
      const res = await fetch("https://music.163.com", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  const port = Number(proxy.port);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return false;

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: proxy.host,
      port,
      timeout: 3500,
    });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
};
