/**
 * 电台详情
 *
 * params:
 * - rid / id 电台 id
 *
 * 响应：`{ code, djRadio: { ... } }`
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const djDetail: NeteaseModule = (query, request) => {
  const data = {
    id: query.rid ?? query.id,
  };
  return request("/api/djradio/v2/get", data, createOption(query, "weapi"));
};

export default djDetail;
