import { createOption } from "../core/option.js";
import type { NeteaseModule } from "../core/types.js";

const artistList: NeteaseModule = (query, request) => {
  const initial = query.initial !== undefined && query.initial !== null
    ? String(query.initial).trim()
    : undefined;

  const data: Record<string, any> = {
    offset: query.offset ?? 0,
    limit: query.limit ?? 30,
    total: true,
    type: query.type ?? "1",
    area: query.area ?? "-1",
  };

  if (initial !== undefined && initial !== "-1") {
    if (initial === "0" || initial === "#") {
      data.initial = 0;
    } else if (/^[a-zA-Z]$/.test(initial)) {
      data.initial = initial.toUpperCase().charCodeAt(0);
    } else {
      data.initial = initial;
    }
  }

  return request("/api/v1/artist/list", data, createOption(query, "weapi"));
};

export default artistList;
