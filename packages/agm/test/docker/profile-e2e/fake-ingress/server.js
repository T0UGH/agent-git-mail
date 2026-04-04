import http from 'http';
import fs from 'fs';
import path from 'path';

const MODE = process.env.INGRESS_MODE || 'success';
const PORT = parseInt(process.env.PORT || '3099', 10);
const LOG_FILE = '/tmp/fake-ingress/requests.jsonl';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appendLog(record) {
  ensureDir(path.dirname(LOG_FILE));
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/internal/agm/ingress') {
    const secret = req.headers['x-internal-secret'];
    if (secret !== 'secret_123') {
      res.writeHead(401);
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(body || '{}');
      } catch (_) {
        // ignore parse errors
      }

      const record = {
        ts: new Date().toISOString(),
        mode: MODE,
        payload,
      };
      appendLog(record);

      if (MODE === 'failure') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, error: 'forced_failure' }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          delivery: 'ingressed',
          targetJid: payload.targetJid || 'feishu:test-hex',
          effectiveGroupJid: payload.targetJid || 'feishu:test-hex',
          messageId: `fake-${Date.now()}`,
        }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', mode: MODE }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`fake-ingress listening on :${PORT}, mode=${MODE}`);
});
