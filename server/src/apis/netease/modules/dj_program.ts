/**
 * 电台节目列表
 *
 * params:
 * - rid / id 电台 id
 * - limit 数量，默认 30
 * - offset 偏移，默认 0
 * - asc 是否升序，默认 false
 *
 * 响应：`{ code, count, more, programs: [...] }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const djProgram: NeteaseModule = (query, request) => {
  const data = {
    radioId: query.rid ?? query.id,
    limit: query.limit ?? 30,
    offset: query.offset ?? 0,
    asc: query.asc ?? false,
  };
  return request("/api/dj/program/byradio", data, createOption(query, "weapi"));
};

export default djProgram;
