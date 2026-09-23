import { createOption } from "../core/option.js";
import type { NeteaseModule } from "../core/types.js";

const topSong: NeteaseModule = (query, request) => {
  const data = {
    areaId: query.type ?? 0,
    total: true,
  };
  return request("/api/v1/discovery/new/songs", data, createOption(query, "weapi"));
};

export default topSong;
