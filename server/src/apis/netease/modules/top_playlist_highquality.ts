import { createOption } from "../core/option.js";
import type { NeteaseModule } from "../core/types.js";

const topPlaylistHighquality: NeteaseModule = (query, request) => {
  const data = {
    cat: query.cat || "全部",
    limit: query.limit ?? 50,
    lasttime: query.before ?? 0,
    total: true,
  };
  return request("/api/playlist/highquality/list", data, createOption(query, "weapi"));
};

export default topPlaylistHighquality;
