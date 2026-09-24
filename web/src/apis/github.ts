/**
 * GitHub 仓库相关接口
 */

/** 贡献者信息 */
export interface Contributor {
  /** 用户名 */
  login: string;
  /** 主页地址 */
  htmlUrl: string;
  /** 头像地址 */
  avatar: string;
}

import { REPO_NAME } from "@/utils/config";

/* 仓库标识 */
const repoSlug = REPO_NAME && REPO_NAME.includes("/") ? REPO_NAME : "";

/**
 * 获取仓库贡献者列表
 * @returns 贡献者数组
 */
export const getContributors = async (): Promise<Contributor[]> => {
  if (!repoSlug) return [];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoSlug}/contributors?per_page=100&anon=true`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item.type !== "Bot" && item.login !== "type-bot")
      .map((item) => ({
        login: item.login ?? item.name ?? "anonymous",
        htmlUrl: item.html_url ?? "",
        avatar: item.avatar_url ?? "",
      }));
  } catch {
    return [];
  }
};
