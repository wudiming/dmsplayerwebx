import { createOption } from "../core/option.js";
import type { NeteaseModule } from "../core/types.js";

const topPlaylist: NeteaseModule = (query, request) => {
  const data = {
    cat: query.cat || "全部",
    order: query.order || "hot",
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
    total: true,
  };
  return request("/api/playlist/list", data, createOption(query, "weapi"));
};

export default topPlaylist;
