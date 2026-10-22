// Single-process dev server: stable when launched in the background on Windows.
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const load = createRequire(join(process.cwd(), 'package.json'));
const next = load('next');
const port = Number(process.argv[2]);
if (![5173, 5174].includes(port)) throw new Error('Unexpected local frontend port');
const app = next({ dev: true, dir: process.cwd(), hostname: '127.0.0.1', port });
app.prepare().then(() => {
  const server = createServer(app.getRequestHandler());
  server.on('upgrade', app.getUpgradeHandler());
  server.listen(port, '127.0.0.1', () => console.log(`Local frontend ready at http://127.0.0.1:${port}`));
}).catch(error => { console.error(error); process.exitCode = 1; });
