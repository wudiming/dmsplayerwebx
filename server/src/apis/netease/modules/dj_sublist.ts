/**
 * 用户订阅的电台列表
 *
 * params:
 * - limit 数量，默认 30
 * - offset 偏移，默认 0
 *
 * 响应：`{ code, count, hasMore, djRadios: [...] }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const djSublist: NeteaseModule = (query, request) => {
  const data = {
    limit: query.limit ?? 30,
    offset: query.offset ?? 0,
    total: true,
  };
  return request("/api/djradio/get/subed", data, createOption(query, "weapi"));
};

export default djSublist;
