import { createOption } from "../core/option.js";
import type { NeteaseModule } from "../core/types.js";

const playlistCatlist: NeteaseModule = (query, request) => {
  return request("/api/playlist/catalogue", {}, createOption(query, "weapi"));
};

export default playlistCatlist;
