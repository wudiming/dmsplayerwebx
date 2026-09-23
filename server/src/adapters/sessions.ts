import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestSessionStore {
  cookies: Record<string, Record<string, string>>;
  patch: Record<string, Record<string, string>>;
}

export const requestSessionStorage = new AsyncLocalStorage<RequestSessionStore>();

/**
 * 获取当前请求上下文中的某平台 Cookie
 * 如果不在请求上下文（例如后台定时任务），则返回空对象
 */
export const getSessionCookies = (platform: string): Record<string, string> => {
  const store = requestSessionStorage.getStore();
  if (store && store.cookies && store.cookies[platform]) {
    return { ...store.cookies[platform] };
  }
  return {};
};

/**
 * 保存或合并某平台 Cookie 到当前请求上下文
 * 并标记到 cookiePatch 中，以便最终响应返回给客户端持久化在 localStorage 中
 */
export const saveSessionCookies = (platform: string, cookies: Record<string, string>): void => {
  const store = requestSessionStorage.getStore();
  if (store) {
    store.cookies[platform] = { ...cookies };
    store.patch[platform] = { ...cookies };
  }
};

/**
 * 清空某平台 Cookie
 */
export const clearSessionCookies = (platform: string): void => {
  const store = requestSessionStorage.getStore();
  if (store) {
    store.cookies[platform] = {};
    store.patch[platform] = {};
  }
};
