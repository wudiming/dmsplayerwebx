import { createOption } from "../core/option.js";
import type { NeteaseModule } from "../core/types.js";

const toplistDetail: NeteaseModule = (query, request) => {
  return request("/api/toplist/detail", {}, createOption(query, "weapi"));
};

export default toplistDetail;
