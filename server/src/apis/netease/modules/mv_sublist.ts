/**
 * 用户收藏的 MV 列表
 *
 * params:
 * - limit 数量，默认 25
 * - offset 偏移，默认 0
 *
 * 响应：`{ code, count, hasMore, data: [...] }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const mvSublist: NeteaseModule = (query, request) => {
  const data = {
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
    total: true,
  };
  return request("/api/cloudvideo/allvideo/sublist", data, createOption(query, "weapi"));
};

export default mvSublist;
