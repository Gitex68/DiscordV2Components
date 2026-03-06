'use strict';

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
} = require('@discordjs/voice');
const ytdlp    = require('yt-dlp-exec');
const playdl   = require('play-dl');
const path     = require('path');
const fs       = require('fs');
const { spawn } = require('child_process');

// ── Logs multimédia ───────────────────────────────────────────────────────────
let _log = null;
try { _log = require('../logs/logManager.js'); } catch { _log = null; }

/** Envoie un log multimédia si la guild est disponible et le handler existe */
function _mlog(fnName, guild, payload) {
  if (!_log || !guild || typeof _log[fnName] !== 'function') return;
  _log[fnName](guild, payload).catch(() => {});
}

// ── Chemin des binaires ───────────────────────────────────────────────────────
// ffmpeg-static : s'assurer que le PATH est défini avant tout appel play-dl
try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
} catch { /* utilise ffmpeg système */ }

// Binaire yt-dlp embarqué dans yt-dlp-exec
const YTDLP_BIN = path.join(
  path.dirname(require.resolve('yt-dlp-exec/package.json')),
  'bin', 'yt-dlp'
);

// ─── Helper URL YouTube ───────────────────────────────────────────────────────
function isYouTubeUrl(str) {
  try { return /youtube\.com|youtu\.be/.test(new URL(str).hostname); }
  catch { return false; }
}

// Chemin pour les favoris persistants (individuels par userId)
const FAVS_PATH  = path.join(__dirname, '..', 'data', 'music_favorites.json');
// Chemin pour les files persistantes (collectif par guildId)
const QUEUE_PATH = path.join(__dirname, '..', 'data', 'guild_queues.json');

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

// ─── Favoris persistants (individuels) ────────────────────────────────────────

function _loadFavs() {
  try {
    if (fs.existsSync(FAVS_PATH)) return JSON.parse(fs.readFileSync(FAVS_PATH, 'utf8'));
  } catch {}
  return {};
}

function _saveFavs(data) {
  try {
    fs.mkdirSync(path.dirname(FAVS_PATH), { recursive: true });
    fs.writeFileSync(FAVS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('[Music] favs save error:', e); }
}

const favsStore = _loadFavs();

// ─── Files persistantes (collectif par guild) ────────────────────────────────

function _loadQueues() {
  try {
    if (fs.existsSync(QUEUE_PATH)) return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch {}
  return {};
}

function _saveQueues(data) {
  try {
    fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('[Music] queue save error:', e); }
}

const queuesStore = _loadQueues();

/**
 * Sauvegarde la file d'un guild sur disque.
 * Ne conserve que les champs sérialisables (pas les objets Discord).
 * @param {string} guildId
 * @param {Track[]} queue
 * @param {string} [ownerId]
 */
function _persistQueue(guildId, queue, ownerId) {
  queuesStore[guildId] = {
    ownerId: ownerId || queuesStore[guildId]?.ownerId || null,
    tracks: queue.map(t => ({
      title:        t.title,
      url:          t.url,
      duration:     t.duration,
      durationSecs: t.durationSecs || 0,
      thumbnail:    t.thumbnail,
      requestedBy:  t.requestedBy,
    })),
  };
  _saveQueues(queuesStore);
}

/**
 * Supprime la file sauvegardée d'un guild.
 * @param {string} guildId
 */
function _deletePersistQueue(guildId) {
  delete queuesStore[guildId];
  _saveQueues(queuesStore);
}

/**
 * Vérifie si un membre est le owner de la file OU administrateur.
 * @param {import('discord.js').GuildMember} member
 * @param {string} guildId
 * @returns {boolean}
 */
function isQueueOwnerOrAdmin(member, guildId) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const stored = queuesStore[guildId];
  if (stored?.ownerId && stored.ownerId === member.id) return true;
  const q = queues.get(guildId);
  return q?.ownerId === member.id;
}

// ─── Track helper ────────────────────────────────────────────────────────────

/**
 * @typedef {{ title: string, url: string, duration: string, thumbnail: string, requestedBy: string }} Track
 */

/**
 * Crée un objet Track à partir d'une URL ou d'une recherche.
 * - URL YouTube → yt-dlp-exec (fiable, pas de "Could not extract functions")
 * - Mots-clés   → play-dl search (renvoie la première correspondance)
 * @param {string} query
 * @param {string} requestedBy
 * @returns {Promise<Track|null>}
 */
async function resolveTrack(query, requestedBy) {
  try {
    if (isYouTubeUrl(query)) {
      // ── URL YouTube → yt-dlp-exec ──────────────────────────────────────────
      const info = await ytdlp(query, {
        'dump-json':    true,
        'no-playlist':  true,
        'no-warnings':  true,
      });
      const secs = info.duration || 0;
      return {
        title:        info.title        || 'Sans titre',
        url:          info.webpage_url  || query,
        duration:     _formatDuration(secs),
        durationSecs: secs,
        thumbnail:    info.thumbnail    || '',
        requestedBy,
      };
    }

    // ── Mots-clés → play-dl search ─────────────────────────────────────────
    const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
    if (!results?.length) return null;
    const r = results[0];
    return {
      title:        r.title           || 'Sans titre',
      url:          r.url,
      duration:     r.durationRaw     || '?:??',
      durationSecs: r.durationInSec   || 0,
      thumbnail:    r.thumbnails?.[0]?.url || '',
      requestedBy,
    };
  } catch (e) {
    console.error('[Music] resolveTrack error:', e.message);
    return null;
  }
}

/**
 * Recherche plusieurs tracks (jusqu'à 5).
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Track[]>}
 */
async function searchTracks(query, limit = 5) {
  try {
    const results = await playdl.search(query, { source: { youtube: 'video' }, limit });
    return results.map(r => ({
      title: r.title,
      url: r.url,
      duration: r.durationRaw || '?:??',
      durationSecs: r.durationInSec || 0,
      thumbnail: r.thumbnails?.[0]?.url || '',
      requestedBy: '',
    }));
  } catch (e) {
    console.error('[Music] searchTracks error:', e.message);
    return [];
  }
}

function _formatDuration(secs) {
  if (!secs || isNaN(secs)) return '?:??';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── GuildQueue ───────────────────────────────────────────────────────────────

class GuildQueue {
  constructor(guild, voiceChannel, textChannel, ownerId = null) {
    this.guild = guild;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    /** ID de l'utilisateur qui a invoqué .play en premier (propriétaire de session) */
    this.ownerId = ownerId;
    /** @type {Track[]} */
    this.queue = [];
    /** @type {Track|null} */
    this.current = null;
    /** @type {Track[]} */
    this.history = [];
    this.volume = 80;   // 0–150
    this.loop = false;
    this.loopQueue = false;
    this.paused = false;
    this.connection = null;
    this.player = null;
    /** Message du dashboard CV2 (pour mise à jour) */
    this.dashboardMessage = null;
  }
}

// ─── Gestion des connexions ───────────────────────────────────────────────────

/**
 * Crée ou récupère la GuildQueue et rejoint le salon vocal.
 * Charge automatiquement la file sauvegardée si elle existe.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @param {import('discord.js').TextChannel} textChannel
 * @param {string} [ownerId]  — userId de celui qui invoque .play
 * @returns {GuildQueue}
 */
function getOrCreateQueue(guild, voiceChannel, textChannel, ownerId = null) {
  if (queues.has(guild.id)) return queues.get(guild.id);

  const stored = queuesStore[guild.id];
  const resolvedOwner = ownerId || stored?.ownerId || null;
  const q = new GuildQueue(guild, voiceChannel, textChannel, resolvedOwner);

  // Restaurer la file sauvegardée
  if (stored?.tracks?.length) {
    q.queue = stored.tracks.slice();
    console.log(`[Music] File restaurée pour guild ${guild.id} — ${q.queue.length} piste(s)`);
  }

  queues.set(guild.id, q);
  return q;
}

/**
 * @param {string} guildId
 * @returns {GuildQueue|null}
 */
function getQueue(guildId) {
  return queues.get(guildId) || null;
}

/**
 * Détruit la session en mémoire (déconnecte le bot) mais SAUVEGARDE la file
 * pour la prochaine invocation.
 * @param {string} guildId
 */
function destroyQueue(guildId) {
  const q = queues.get(guildId);
  if (!q) return;
  // Sauvegarder : piste en cours + reste de la file
  const remaining = [];
  if (q.current) remaining.push(q.current);
  remaining.push(...q.queue);
  _persistQueue(guildId, remaining, q.ownerId);
  // Fermer proprement le dashboard (collector + interval) s'il est actif
  if (q._stopDash) q._stopDash();
  if (q.player) q.player.stop(true);
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
  queues.delete(guildId);
}

// ─── Playback ─────────────────────────────────────────────────────────────────

/**
 * Joue la piste suivante dans la queue.
 * @param {GuildQueue} q
 * @param {Function} [onUpdate]  callback(q, status) appelé pour rafraîchir le dashboard
 */
async function playNext(q, onUpdate) {
  // Mémoriser le callback pour le réutiliser depuis les event handlers
  if (onUpdate) q._onUpdate = onUpdate;
  const _upd = (status) => { if (q._onUpdate) q._onUpdate(q, status); };

  if (!q.queue.length) {
    q.current = null;
    q.paused  = false;
    if (q._onUpdate) q._onUpdate(null, 'idle');
    return;
  }

  const track = q.queue.shift();
  q.current = track;
  q.paused  = false;
  // Mettre à jour la sauvegarde (piste retirée)
  _persistQueue(q.guild.id, q.queue, q.ownerId);

  // ── Rejoindre le vocal si pas encore connecté ──────────────────────────────
  if (!q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed) {
    q.connection = joinVoiceChannel({
      channelId:      q.voiceChannel.id,
      guildId:        q.guild.id,
      adapterCreator: q.guild.voiceAdapterCreator,
      selfDeaf:       true,
    });
    try {
      await entersState(q.connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (e) {
      console.error('[Music] Connection timeout:', e.message);
      destroyQueue(q.guild.id);
      if (q._onUpdate) q._onUpdate(null, 'error');
      return;
    }

    q.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(q.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(q.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        destroyQueue(q.guild.id);
        if (q._onUpdate) q._onUpdate(null, 'disconnected');
      }
    });
  }

  // ── Créer ou réutiliser le player ──────────────────────────────────────────
  if (!q.player) {
    q.player = createAudioPlayer();
    q.connection.subscribe(q.player);

    q.player.on(AudioPlayerStatus.Idle, () => {
      if (q.current) {
        q.history.push(q.current);
        if (q.history.length > 20) q.history.shift();
      }
      if (q.loop && q.current)      { q.queue.unshift(q.current); }
      else if (q.loopQueue && q.current) { q.queue.push(q.current); }
      playNext(q); // onUpdate déjà dans q._onUpdate
    });

    q.player.on('error', err => {
      console.error('[Music] Player error:', err.message);
      if (q.current) q.history.push(q.current);
      playNext(q);
    });
  }

  // ── Stream audio : yt-dlp → ffmpeg → opus (Readable) ─────────────────────
  try {
    const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';

    // yt-dlp extrait l'URL du flux audio brut (pas de téléchargement disque)
    const ytdlpProc = spawn(
      YTDLP_BIN,
      [
        track.url,
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '--no-playlist',
        '--quiet',
        '-o', '-',   // sortie stdout
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    // ffmpeg transcode en PCM signed 16-bit stéréo 48kHz → @discordjs/voice l'encode en Opus
    const ffmpegProc = spawn(ffmpegBin, [
      '-i', 'pipe:0',          // stdin = flux yt-dlp
      '-ac', '2',              // stéréo
      '-ar', '48000',          // 48 kHz requis par Discord
      '-f', 's16le',           // PCM raw 16-bit little-endian
      'pipe:1',                // stdout
    ], { stdio: ['pipe', 'pipe', 'ignore'] });

    ytdlpProc.stdout.pipe(ffmpegProc.stdin);

    // Gérer les erreurs de spawn
    ytdlpProc.on('error', err => console.error('[Music] yt-dlp spawn error:', err.message));
    ffmpegProc.on('error', err => console.error('[Music] ffmpeg spawn error:', err.message));
    ytdlpProc.stdout.on('error', () => {});
    ffmpegProc.stdin.on('error',  () => {});

    const resource = createAudioResource(ffmpegProc.stdout, {
      inputType:    StreamType.Raw,  // PCM s16le
      inlineVolume: true,
    });
    resource.volume?.setVolumeLogarithmic(q.volume / 100);

    // Nettoyer les processus quand la ressource se termine
    resource.playStream.on('close', () => {
      try { ytdlpProc.kill('SIGKILL'); } catch {}
      try { ffmpegProc.kill('SIGKILL'); } catch {}
    });

    q.player.play(resource);
    q._resource  = resource;
    q._ytdlpProc = ytdlpProc;
    q._ffmpegProc = ffmpegProc;
    _mlog('onMusicPlay', q.guild, { track: q.current, requestedBy: q.current.requestedBy, queueSize: q.queue.length });
    _upd('playing');

  } catch (e) {
    console.error('[Music] Stream error:', e.message);
    if (q.current) q.history.push(q.current);
    q.current = null;
    playNext(q);
  }
}

// ─── Commandes de lecture ─────────────────────────────────────────────────────

function pause(guildId) {
  const q = queues.get(guildId);
  if (!q || !q.player) return false;
  if (q.player.state.status === AudioPlayerStatus.Playing) {
    q.player.pause();
    q.paused = true;
    return true;
  }
  return false;
}

function resume(guildId) {
  const q = queues.get(guildId);
  if (!q || !q.player) return false;
  if (q.player.state.status === AudioPlayerStatus.Paused) {
    q.player.unpause();
    q.paused = false;
    return true;
  }
  return false;
}

function skip(guildId, onUpdate) {
  const q = queues.get(guildId);
  if (!q || !q.player) return false;
  if (q.current) q.history.push(q.current);
  _mlog('onMusicSkip', q.guild, { track: q.current, skippedBy: null });
  q.player.stop(); // déclenche AudioPlayerStatus.Idle → playNext
  return true;
}

function back(guildId, onUpdate) {
  const q = queues.get(guildId);
  if (!q) return false;
  if (!q.history.length) return false;
  const prev = q.history.pop();
  if (q.current) q.queue.unshift(q.current);
  q.queue.unshift(prev);
  if (q.player) q.player.stop();
  return true;
}

function stop(guildId, actorId = null) {
  const q = queues.get(guildId);
  _mlog('onMusicStop', q?.guild ?? null, { stoppedBy: actorId });
  destroyQueue(guildId);
}

function setVolume(guildId, vol) {
  const q = queues.get(guildId);
  if (!q) return false;
  q.volume = Math.max(0, Math.min(150, vol));
  if (q._resource?.volume) {
    q._resource.volume.setVolumeLogarithmic(q.volume / 100);
  }
  return true;
}

function toggleLoop(guildId) {
  const q = queues.get(guildId);
  if (!q) return null;
  q.loop = !q.loop;
  if (q.loop) q.loopQueue = false;
  return q.loop;
}

function toggleLoopQueue(guildId) {
  const q = queues.get(guildId);
  if (!q) return null;
  q.loopQueue = !q.loopQueue;
  if (q.loopQueue) q.loop = false;
  return q.loopQueue;
}

// ─── Gestion file (ajout, doublons, suppression) ─────────────────────────────

/**
 * Ajoute une piste à la file si elle n'y est pas déjà (ni en cours de lecture).
 * @param {string} guildId
 * @param {Track} track
 * @returns {'added'|'duplicate'|'no_queue'}
 */
function addToQueue(guildId, track) {
  const q = queues.get(guildId);
  if (!q) return 'no_queue';
  // Vérif doublon : même URL dans la file ou en cours
  const allUrls = new Set([
    ...(q.current ? [q.current.url] : []),
    ...q.queue.map(t => t.url),
  ]);
  if (allUrls.has(track.url)) return 'duplicate';
  q.queue.push(track);
  _persistQueue(guildId, q.queue, q.ownerId);
  _mlog('onMusicAdd', q.guild, { track, addedBy: track.requestedBy, queueSize: q.queue.length });
  return 'added';
}

/**
 * Vide la file (ne touche pas la piste en cours).
 * @param {string} guildId
 */
function clearQueue(guildId, actorId = null) {
  const q = queues.get(guildId);
  if (!q) return;
  const count = q.queue.length;
  q.queue = [];
  _persistQueue(guildId, [], q.ownerId);
  _mlog('onMusicClear', q.guild, { clearedBy: actorId, count });
}

/**
 * Supprime définitivement la file sauvegardée et vide la session en cours.
 * @param {string} guildId
 */
function deleteQueue(guildId) {
  const q = queues.get(guildId);
  if (q) q.queue = [];
  _deletePersistQueue(guildId);
}

/**
 * Retire une piste de la file par index (0-based).
 * @param {string} guildId
 * @param {number} idx
 * @returns {Track|null}  la piste retirée, ou null
 */
function removeTrackFromQueue(guildId, idx, actorId = null) {
  const q = queues.get(guildId);
  if (!q || idx < 0 || idx >= q.queue.length) return null;
  const [removed] = q.queue.splice(idx, 1);
  _persistQueue(guildId, q.queue, q.ownerId);
  _mlog('onMusicRemove', q.guild, { track: removed, removedBy: actorId });
  return removed;
}

/**
 * Déplace une piste dans la file (drag-and-drop lite : move up/down).
 * @param {string} guildId
 * @param {number} from  index source (0-based)
 * @param {number} to    index cible (0-based)
 */
function moveTrackInQueue(guildId, from, to) {
  const q = queues.get(guildId);
  if (!q) return;
  if (from < 0 || from >= q.queue.length) return;
  to = Math.max(0, Math.min(q.queue.length - 1, to));
  const [track] = q.queue.splice(from, 1);
  q.queue.splice(to, 0, track);
  _persistQueue(guildId, q.queue, q.ownerId);
}

// ─── Favoris (individuels par userId) ────────────────────────────────────────

function addFavorite(userId, track) {
  if (!favsStore[userId]) favsStore[userId] = [];
  const already = favsStore[userId].find(t => t.url === track.url);
  if (already) return false;
  favsStore[userId].push({ title: track.title, url: track.url, duration: track.duration, thumbnail: track.thumbnail });
  _saveFavs(favsStore);
  return true;
}

function removeFavorite(userId, url) {
  if (!favsStore[userId]) return false;
  const before = favsStore[userId].length;
  favsStore[userId] = favsStore[userId].filter(t => t.url !== url);
  if (favsStore[userId].length === before) return false;
  _saveFavs(favsStore);
  return true;
}

/** @returns {Track[]} */
function getFavorites(userId) {
  return favsStore[userId] || [];
}

/** Supprime tous les favoris d'un utilisateur */
function clearFavorites(userId) {
  favsStore[userId] = [];
  _saveFavs(favsStore);
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  resolveTrack,
  searchTracks,
  getOrCreateQueue,
  getQueue,
  destroyQueue,
  playNext,
  pause,
  resume,
  skip,
  back,
  stop,
  setVolume,
  toggleLoop,
  toggleLoopQueue,
  // File
  addToQueue,
  clearQueue,
  deleteQueue,
  removeTrackFromQueue,
  moveTrackInQueue,
  isQueueOwnerOrAdmin,
  // Favoris
  addFavorite,
  removeFavorite,
  getFavorites,
  clearFavorites,
};
