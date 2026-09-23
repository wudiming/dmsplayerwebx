import { requestSessionStorage } from "./sessions";

const configData: Record<string, any> = {
  "system.neteaseRealIp": true,
  "system.networkProxy": { protocol: "off", host: "", port: "" },
};

export const store = {
  get: <T = any>(key: string, defaultValue?: T): T => {
    // 优先从当前客户端会话的隔离配置中读取
    const session = requestSessionStorage.getStore();
    if (session?.config) {
      if (key in session.config) {
        return session.config[key] as T;
      }
      // 支持形如 "system.kugouLoginVersion" 的属性层级点路径查询
      const parts = key.split(".");
      let cur: any = session.config;
      let found = true;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in cur) {
          cur = cur[p];
        } else {
          found = false;
          break;
        }
      }
      if (found && cur !== undefined) {
        return cur as T;
      }
    }

    if (key in configData) {
      return configData[key] as T;
    }
    return defaultValue as T;
  },
  set: (key: string, value: any): void => {
    configData[key] = value;
  },
};
