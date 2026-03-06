'use strict';

const http      = require('http');
const path      = require('path');
const crypto    = require('crypto');
const { spawn } = require('child_process');

const YTDLP_BIN = path.join(
  path.dirname(require.resolve('yt-dlp-exec/package.json')),
  'bin', 'yt-dlp'
);

const PROXY_PORT  = parseInt(process.env.YTDL_PROXY_PORT || '47891', 10);
const PUBLIC_HOST = process.env.YTDL_PUBLIC_HOST || `http://localhost:${PROXY_PORT}`;

// Map token → { url, formatArgs, filename, expires }
const sessions = new Map();

let server = null;

// Correspondance formatKey → arguments yt-dlp
const FORMAT_ARGS = {
  mp3:    ['-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '0'],
  m4a:    ['-f', 'bestaudio[ext=m4a]/bestaudio', '-x', '--audio-format', 'm4a'],
  mp4_best: ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best', '--merge-output-format', 'mp4'],
  mp4_1080: ['-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]', '--merge-output-format', 'mp4'],
  mp4_720:  ['-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',   '--merge-output-format', 'mp4'],
  mp4_480:  ['-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]',   '--merge-output-format', 'mp4'],
  mp4_360:  ['-f', 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]',   '--merge-output-format', 'mp4'],
};

function _startServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    const token = req.url?.slice(1); // /<token>
    if (!token || !sessions.has(token)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const sess = sessions.get(token);
    if (Date.now() > sess.expires) {
      sessions.delete(token);
      res.writeHead(410, { 'Content-Type': 'text/plain' });
      return res.end('Expired');
    }

    res.writeHead(200, {
      'Content-Type':        'application/octet-stream',
      'Content-Disposition': `attachment; filename="${sess.filename}"`,
      'Transfer-Encoding':   'chunked',
    });

    const proc = spawn(YTDLP_BIN, [
      sess.url,
      ...sess.formatArgs,
      '--no-playlist',
      '--quiet',
      '-o', '-',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    proc.stdout.pipe(res);

    req.on('close', () => { try { proc.kill('SIGKILL'); } catch {} });
    proc.on('error', () => { try { res.end(); } catch {} });
  });

  server.listen(PROXY_PORT, () => {
    console.log(`[ytdlProxy] Proxy HTTP démarré sur le port ${PROXY_PORT}`);
  });
}

/**
 * Crée un lien de téléchargement proxy valable `ttlMs` millisecondes.
 * @param {string} videoUrl   URL YouTube
 * @param {'audio'|'mp4_hd'|'mp4_360'} formatKey
 * @param {string} title
 * @param {number} [ttlMs=3600000]  1h par défaut
 * @param {string|null} [timeRange=null]  ex: "1:30-3:45" ou "90-225"
 * @returns {{ proxyUrl: string, token: string, filename: string }}
 */
function createProxyLink(videoUrl, formatKey, title, ttlMs = 3_600_000, timeRange = null) {
  _startServer();

  const formatArgs = FORMAT_ARGS[formatKey];
  if (!formatArgs) throw new Error(`Format inconnu : ${formatKey}`);

  const isAudio = formatKey === 'mp3' || formatKey === 'm4a';
  const ext      = formatKey === 'm4a' ? 'm4a' : isAudio ? 'mp3' : 'mp4';

  // Suffixe dans le nom de fichier si time range défini
  const rangeSuffix = timeRange ? `_[${timeRange.replace(/[^0-9:\-]/g, '')}]` : '';
  const filename = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 70) + rangeSuffix + '.' + ext;

  // Ajouter --download-sections si time range fourni
  const extraArgs = timeRange ? ['--download-sections', `*${timeRange}`] : [];

  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, {
    url:        videoUrl,
    formatArgs: [...formatArgs, ...extraArgs],
    filename,
    expires:    Date.now() + ttlMs,
  });
  setTimeout(() => sessions.delete(token), ttlMs + 5_000);

  return { proxyUrl: `${PUBLIC_HOST}/${token}`, token, filename };
}

module.exports = { createProxyLink, FORMAT_ARGS, PROXY_PORT };
