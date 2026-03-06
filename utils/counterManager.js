// utils/counterManager.js
// Architecture propre basée sur une Promise chain par salon.
// Source de vérité = JSON (cfg.currentName), jamais channel.name.
'use strict';

const cdb = require('./counterDB.js');

// ─── Constantes ───────────────────────────────────────────────────────────────
const THROTTLE_MS  = 5 * 60 * 1000; // 5 min entre deux updates d'un même salon
const MAX_WAIT_MS  = 70_000;         // plafond d'attente rate-limit Discord
const CHAIN_GAP_MS = 500;            // délai entre deux renames enchaînés

// ─── État global ──────────────────────────────────────────────────────────────
const renameQueue  = new Map(); // channelId → Promise en cours
const pendingSlot  = new Map(); // channelId → { channel, newName, reason, force } (le plus récent)
const lastRename   = new Map(); // channelId → timestamp dernier rename réussi
const channelIndex = new Map(); // channelId → { guildId, type }

// ─── Index ────────────────────────────────────────────────────────────────────
function registerChannel(channelId, guildId, type) {
  if (channelId && guildId && type)
    channelIndex.set(String(channelId), { guildId: String(guildId), type });
}

function unregisterChannel(channelId) {
  if (!channelId) return;
  const id = String(channelId);
  channelIndex.delete(id);
  lastRename.delete(id);
  pendingSlot.delete(id);
}

function clearThrottle(...channelIds) {
  if (channelIds.length === 0) lastRename.clear();
  else channelIds.forEach(id => lastRename.delete(String(id)));
}

// ─── Calcul des valeurs ───────────────────────────────────────────────────────
function computeValues(guild) {
  const allMembers = guild.members.cache;
  const humans     = allMembers.filter(m => !m.user.bot);
  const bots       = allMembers.filter(m =>  m.user.bot);
  const online     = humans.filter(m => { const s = m.presence?.status; return s === 'online' || s === 'idle' || s === 'dnd'; });
  const inVoice    = humans.filter(m => m.voice?.channelId != null);
  const totalMembers = (guild.memberCount ?? allMembers.size) - bots.size;
  return {
    members: Math.max(0, totalMembers),
    online:  online.size,
    bots:    bots.size,
    voice:   inVoice.size,
    boosts:  guild.premiumSubscriptionCount ?? 0,
  };
}

function applyTemplate(template, count) {
  return template.replace(/\{count\}/g, count);
}

// ─── Lecture de la vérité JSON ────────────────────────────────────────────────
// Retourne cfg.currentName depuis le JSON pour un channelId donné.
// Jamais channel.name (cache discord.js potentiellement désynchronisé).
function _knownName(channelId, fallback) {
  const idx = channelIndex.get(channelId);
  if (!idx) return fallback;
  return cdb.getGuild(idx.guildId)?.[idx.type]?.currentName ?? fallback;
}

// ─── Exécution d'un rename Discord (avec retry rate-limit) ───────────────────
async function _executeRename(channel, targetName, reason, channelId) {
  const idx          = channelIndex.get(channelId);
  const previousName = _knownName(channelId, channel.name);

  while (true) {
    try {
      const updated     = await channel.setName(targetName, reason);
      const appliedName = updated?.name ?? targetName;
      channel.name      = appliedName; // cache local cohérent
      if (idx) cdb.setChannelName(idx.guildId, idx.type, appliedName, previousName);
      lastRename.set(channelId, Date.now());
      console.log(`[Counter] ✅ "${channelId}" → "${appliedName}"`);
      return;
    } catch (err) {
      const retryAfter =
        err.retryAfter != null         ? err.retryAfter :
        err.rawError?.retry_after != null ? err.rawError.retry_after * 1000 :
        null;
      if (retryAfter != null) {
        const wait = Math.min(retryAfter + 500, MAX_WAIT_MS);
        console.warn(`[Counter] ⏳ Rate-limited "${channelId}", wait ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue; // retenter
      }
      console.warn(`[Counter] ⚠️ Rename failed "${channelId}": ${err.message}`);
      return; // abandon (erreur non-rate-limit)
    }
  }
}

// ─── Consommation du slot en attente ─────────────────────────────────────────
async function _consumePending(channel, channelId) {
  const slot = pendingSlot.get(channelId);
  if (!slot) return;
  pendingSlot.delete(channelId);

  await new Promise(r => setTimeout(r, CHAIN_GAP_MS));

  // Vérification d'égalité pour le slot (sauf forcé)
  if (!slot.force) {
    const known = _knownName(channelId, channel.name);
    if (known === slot.newName) return;
  }

  await _executeRename(slot.channel, slot.newName, slot.reason, channelId);
  await _consumePending(slot.channel, channelId);
}

// ─── Planification d'un rename (Promise chain) ───────────────────────────────
function _scheduleRename(channel, newName, reason, force) {
  const id = String(channel.id);

  // Vérification d'égalité avant tout (sauf forcé)
  if (!force) {
    const known = _knownName(id, channel.name);
    if (known === newName) return;
  }

  const current = renameQueue.get(id);
  if (!current) {
    // Pas d'opération en cours → démarrer immédiatement
    const p = _executeRename(channel, newName, reason, id)
      .then(() => _consumePending(channel, id))
      .finally(() => { if (renameQueue.get(id) === p) renameQueue.delete(id); });
    renameQueue.set(id, p);
  } else {
    // Déjà en cours → empiler dans pendingSlot (écrase l'ancien)
    pendingSlot.set(id, { channel, newName, reason, force });
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────
async function renameChannel(channel, newName, reason, force = false) {
  if (!channel || !newName) return false;
  _scheduleRename(channel, newName, reason ?? 'Compteur automatique', force);
  return true;
}

async function forceRenameChannel(channel, newName, reason) {
  if (!channel || !newName) return false;
  _scheduleRename(channel, newName, reason ?? 'Compteur automatique', true);
  return true;
}

// ─── Refresh d'un guild ───────────────────────────────────────────────────────
async function refreshGuild(guild, force = false) {
  const config = cdb.getGuild(guild.id);
  if (!Object.keys(config).length) return;

  const values = computeValues(guild);
  const now    = Date.now();

  for (const [type, cfg] of Object.entries(config)) {
    if (!cfg?.channelId) continue;
    const channelId = String(cfg.channelId);

    // Maintenir l'index à jour
    channelIndex.set(channelId, { guildId: guild.id, type });

    // Throttle (ignoré si force)
    if (!force) {
      const last = lastRename.get(channelId) ?? 0;
      if (now - last < THROTTLE_MS) continue;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    const newName = applyTemplate(cfg.template, values[type] ?? 0);

    // Comparaison via JSON (cfg.currentName). Si absent = premier démarrage.
    if (!force && cfg.currentName === newName) continue;

    renameChannel(channel, newName, `Compteur ${type} — auto`, force);
  }
}

// ─── Réinitialisation ────────────────────────────────────────────────────────
async function resetGuild(guild) {
  const config = cdb.getGuild(guild.id);
  for (const [type, cfg] of Object.entries(config)) {
    if (!cfg?.channelId) continue;
    const id = String(cfg.channelId);
    unregisterChannel(id);
    const channel = guild.channels.cache.get(id);
    if (channel) {
      await channel.delete('Réinitialisation compteurs via .sconfig').catch(err =>
        console.warn(`[Counter] Reset delete failed "${id}":`, err.message)
      );
    }
  }
  cdb.clearGuild(guild.id);
}

async function forceRefresh(guild) {
  await refreshGuild(guild, true);
}

// ─── Initialisation ───────────────────────────────────────────────────────────
function init(client) {
  // 1. Index depuis le JSON
  const allGuilds = cdb.allGuilds();
  for (const [guildId, types] of Object.entries(allGuilds)) {
    for (const [type, cfg] of Object.entries(types)) {
      if (cfg?.channelId) channelIndex.set(String(cfg.channelId), { guildId, type });
    }
  }

  // 2. Fetch membres pour counts exacts
  client.guilds.cache.forEach(guild => guild.members.fetch().catch(() => {}));

  // 3. Refresh initial (forcé)
  client.guilds.cache.forEach(guild => refreshGuild(guild, true).catch(() => {}));

  // 4. Événements Discord
  client.on('guildMemberAdd',    member => refreshGuild(member.guild).catch(() => {}));
  client.on('guildMemberRemove', member => refreshGuild(member.guild).catch(() => {}));

  client.on('presenceUpdate', (oldP, newP) => {
    const guild = newP?.guild ?? oldP?.guild;
    if (!guild) return;
    const wasOn = ['online','idle','dnd'].includes(oldP?.status);
    const isOn  = ['online','idle','dnd'].includes(newP?.status);
    if (wasOn !== isOn) refreshGuild(guild).catch(() => {});
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const guild = newState.guild ?? oldState.guild;
    if (!guild || newState.member?.user?.bot) return;
    if (oldState.channelId !== newState.channelId) refreshGuild(guild).catch(() => {});
  });

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    if ((oldMember.premiumSince != null) !== (newMember.premiumSince != null))
      refreshGuild(newMember.guild).catch(() => {});
  });

  // 5. Refresh périodique toutes les 10 min
  setInterval(() => {
    client.guilds.cache.forEach(guild => refreshGuild(guild, false).catch(() => {}));
  }, 10 * 60 * 1000);

  console.log('[CounterManager] Initialisé ✅');
}

module.exports = {
  init, forceRefresh, resetGuild,
  renameChannel, forceRenameChannel,
  registerChannel, unregisterChannel, clearThrottle,
  computeValues,
};
