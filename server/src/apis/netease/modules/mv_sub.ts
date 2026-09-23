/**
 * 收藏 / 取消收藏 MV
 *
 * params:
 * - mvid / id MV id
 * - t 1 收藏 / 0 或 2 取消收藏
 *
 * 响应：`{ code }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const mvSub: NeteaseModule = (query, request) => {
  const action = Number(query.t) === 1 ? "sub" : "unsub";
  const mvid = String(query.mvid ?? query.id);
  const data = {
    mvId: mvid,
    mvIds: `["${mvid}"]`,
  };
  return request(`/api/mv/${action}`, data, createOption(query, "weapi"));
};

export default mvSub;
