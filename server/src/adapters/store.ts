const configData: Record<string, any> = {
  "system.neteaseRealIp": true,
  "system.networkProxy": { protocol: "off", host: "", port: "" },
};

export const store = {
  get: <T = any>(key: string, defaultValue?: T): T => {
    if (key in configData) {
      return configData[key] as T;
    }
    return defaultValue as T;
  },
  set: (key: string, value: any): void => {
    configData[key] = value;
  },
};
