/**
 * 订阅 / 取消订阅电台
 *
 * params:
 * - rid / id 电台 id
 * - t 1 订阅 / 0 或 2 取消订阅
 *
 * 响应：`{ code }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const djSub: NeteaseModule = (query, request) => {
  const action = Number(query.t) === 1 ? "sub" : "unsub";
  const data = {
    id: query.rid ?? query.id,
  };
  return request(`/api/djradio/${action}`, data, createOption(query, "weapi"));
};

export default djSub;
