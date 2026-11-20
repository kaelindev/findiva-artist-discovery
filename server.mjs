import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.error('Failed to read .env file:', err);
  }
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || '';
const LASTFM_BASE_URL = process.env.LASTFM_BASE_URL || 'https://ws.audioscrobbler.com/2.0/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function damerauLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[m][n];
}

function cleanString(str = '') {
  return str.toLowerCase().replace(/^(the|dj)\s+/, '').replace(/[^a-z0-9]/g, '');
}

function isCloseMatch(candidate, seed) {
  const c = cleanString(candidate);
  const s = cleanString(seed);
  if (c === s) return true;
  const max = Math.max(c.length, s.length);
  if (max <= 4) return false;
  const d = damerauLevenshtein(c, s);
  if (max <= 8) return d <= 1;
  return d <= 2 || (1 - d / max) >= 0.82;
}

// Fuzzy match and resolve typoed artist names
async function resolveCanonicalArtist(rawName, apiKey) {
  try {
    const searchUrl = new URL(LASTFM_BASE_URL);
    searchUrl.searchParams.set('method', 'artist.search');
    searchUrl.searchParams.set('artist', rawName);
    searchUrl.searchParams.set('api_key', apiKey);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('limit', '5');

    const res = await fetch(searchUrl.toString());
    if (!res.ok) return rawName;

    const data = await res.json();
    const matches = data?.results?.artistmatches?.artist || [];
    let bestName = rawName;
    let maxListeners = -1;

    for (const a of matches) {
      if (a?.name && isCloseMatch(a.name, rawName)) {
        const listeners = parseInt(a.listeners || 0, 10);
        if (listeners > maxListeners) {
          maxListeners = listeners;
          bestName = a.name;
        }
      }
    }

    return bestName;
  } catch (err) {
    console.error('Failed to resolve canonical artist name:', err);
    return rawName;
  }
}

async function handleSimilarArtists(req, res, searchParams) {
  const artist = searchParams.get('artist')?.trim();

  if (!artist) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: "Missing required 'artist' query parameter." }));
    return;
  }

  if (!LASTFM_API_KEY) {
    console.error('LASTFM_API_KEY is not configured in server environment.');
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Music recommendation service is not configured.' }));
    return;
  }

  try {
    const canonicalName = await resolveCanonicalArtist(artist, LASTFM_API_KEY);

    const url = new URL(LASTFM_BASE_URL);
    url.searchParams.set('method', 'artist.getsimilar');
    url.searchParams.set('artist', canonicalName);
    url.searchParams.set('api_key', LASTFM_API_KEY);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '30');

    const upstreamRes = await fetch(url.toString());
    if (!upstreamRes.ok) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Upstream error: ${upstreamRes.status}` }));
      return;
    }

    const data = await upstreamRes.json();

    if (data?.error) {
      if (data.error === 6) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ canonicalName, similar: [] }));
        return;
      }
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: data.message || 'Upstream music provider error.' }));
      return;
    }

    const artists = data?.similarartists?.artist || [];
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify({ canonicalName, similar: artists }));
  } catch (err) {
    console.error('Fetch error in /api/similar:', err);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Failed to connect to recommendation service.' }));
  }
}

function handleStaticFile(req, res, reqPath) {
  const relativePath = reqPath === '/' ? '/index.html' : reqPath;
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      console.error('File stream error:', streamErr);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
    });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/api/similar') {
    handleSimilarArtists(req, res, parsedUrl.searchParams);
  } else {
    handleStaticFile(req, res, decodeURIComponent(parsedUrl.pathname));
  }
});

server.listen(PORT, () => {
  console.log(`[Findiva] Server running at http://localhost:${PORT}`);
  if (!LASTFM_API_KEY) {
    console.warn('[Findiva] Warning: LASTFM_API_KEY is missing in .env');
  }
});
