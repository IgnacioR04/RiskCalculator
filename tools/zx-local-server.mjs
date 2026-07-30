import { createReadStream, stat } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.cwd());
const port = Number(process.argv[3] ?? 8765);

const contentTypes = new Map([
  ['.tap', 'application/octet-stream'],
  ['.tzx', 'application/octet-stream'],
  ['.bin', 'application/octet-stream'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const server = createServer((req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const filePath = path.resolve(root, requestPath.replace(/^\/+/, ''));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  stat(filePath, (err, info) => {
    if (err || !info.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
      'Content-Length': info.size,
    });
    createReadStream(filePath).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}/`);
});
