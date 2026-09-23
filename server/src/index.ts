import http from "node:http";
import { handleApiRequest } from "./handler.js";
import { coreLog } from "./adapters/logger.js";

const PORT = Number(process.env.PORT) || 3300;
const HOST = process.env.HOST || "0.0.0.0";

const server = http.createServer((req, res) => {
  handleApiRequest(req, res);
});

server.listen(PORT, HOST, () => {
  coreLog.info(`SPlayer-WebX Backend running at http://${HOST}:${PORT}`);
});

export { handleApiRequest };
