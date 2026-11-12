import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT) || 8000;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const filename = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (filename !== root && !filename.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const extension = filename.slice(filename.lastIndexOf("."));
    if (!mime[extension]) {
      response.writeHead(404).end("Not found");
      return;
    }
    const bytes = await readFile(filename);
    response.writeHead(200, { "Content-Type": `${mime[extension]}; charset=utf-8`, "Cache-Control": "no-store" }).end(bytes);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Task-aware BRT: http://127.0.0.1:${port}`);
});
