const createLogger = (tag: string) => ({
  info: (...args: unknown[]) => console.log(`[${tag}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${tag}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${tag}]`, ...args),
  debug: (...args: unknown[]) => console.debug(`[${tag}]`, ...args),
});

export const coreLog = createLogger("core");
export const neteaseLog = createLogger("netease");
export const systemLog = createLogger("system");
export const pluginLog = createLogger("plugin");
export const qmLog = createLogger("qqmusic");
export const kgLog = createLogger("kugou");
