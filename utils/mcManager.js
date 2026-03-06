// utils/mcManager.js — Tracker de statut Minecraft (protocole SLP natif)
// Protocole Java Server List Ping (1.7+) implémenté via net + dns natifs Node.js.
// Panel Components V2 avec MOTD, icône serveur, joueurs, latence.
'use strict';

const net  = require('net');
const dns  = require('dns').promises;
const db   = require('./mcDB.js');
const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

// ─── Protocole SLP ────────────────────────────────────────────────────────────

/**
 * Encode un entier en VarInt (format Minecraft).
 */
function encodeVarInt(value) {
  const bytes = [];
  do {
    let b = value & 0x7f;
    value >>>= 7;
    if (value !== 0) b |= 0x80;
    bytes.push(b);
  } while (value !== 0);
  return Buffer.from(bytes);
}

/**
 * Encode une chaîne en UTF-8 préfixée par sa longueur en VarInt.
 */
function encodeString(str) {
  const strBuf = Buffer.from(str, 'utf8');
  return Buffer.concat([encodeVarInt(strBuf.length), strBuf]);
}

/**
 * Lit un VarInt depuis un Buffer à partir de l'offset donné.
 * Retourne { value, bytesRead }.
 */
function readVarInt(buf, offset = 0) {
  let value = 0, shift = 0, bytesRead = 0;
  let b;
  do {
    if (offset + bytesRead >= buf.length) throw new Error('VarInt trop court');
    b = buf[offset + bytesRead++];
    value |= (b & 0x7f) << shift;
    shift += 7;
    if (shift >= 35) throw new Error('VarInt trop grand');
  } while (b & 0x80);
  return { value, bytesRead };
}

/**
 * Ping un serveur Minecraft Java via le protocole SLP 1.7+.
 * Retourne { online: true, latency, version, protocol, players, motdRaw, favicon }
 * ou { online: false, error }.
 */
function pingMinecraft(host, port = 25565, timeout = 5000) {
  return new Promise((resolve) => {
    const start  = Date.now();
    const socket = new net.Socket();
    let   resolved = false;
    let   buf = Buffer.alloc(0);

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.on('timeout', () => done({ online: false, error: 'Timeout' }));
    socket.on('error',  (e) => done({ online: false, error: e.message }));

    socket.connect(port, host, () => {
      // Paquet Handshake (0x00)
      const handshakeData = Buffer.concat([
        encodeVarInt(0x00),           // Packet ID
        encodeVarInt(754),            // Protocol version (compatible 1.16+)
        encodeString(host),           // Server address
        Buffer.from([port >> 8, port & 0xff]), // Port (Big-Endian short)
        encodeVarInt(1),              // Next state: Status
      ]);
      const handshakePkt = Buffer.concat([encodeVarInt(handshakeData.length), handshakeData]);

      // Paquet Status Request (0x00)
      const statusPkt = Buffer.concat([encodeVarInt(1), encodeVarInt(0x00)]);

      socket.write(Buffer.concat([handshakePkt, statusPkt]));
    });

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      try {
        // Lire longueur du paquet
        const { value: pktLen, bytesRead: pktLenBytes } = readVarInt(buf, 0);
        if (buf.length < pktLenBytes + pktLen) return; // Pas encore complet

        const pktStart = pktLenBytes;
        const { bytesRead: idBytes } = readVarInt(buf, pktStart);
        const jsonStart = pktStart + idBytes;

        // Lire longueur de la chaîne JSON
        const { value: strLen, bytesRead: strLenBytes } = readVarInt(buf, jsonStart);
        const jsonBuf = buf.slice(jsonStart + strLenBytes, jsonStart + strLenBytes + strLen);
        const json = JSON.parse(jsonBuf.toString('utf8'));

        const latency = Date.now() - start;

        // Extraire MOTD (peut être string ou objet)
        let motdText = '';
        if (json.description) {
          motdText = extractMotd(json.description);
        }

        // Extraire joueurs
        const players = {
          online: json.players?.online ?? 0,
          max:    json.players?.max    ?? 0,
          sample: (json.players?.sample ?? []).map(p => p.name),
        };

        done({
          online:    true,
          latency,
          version:   json.version?.name    ?? 'Inconnu',
          protocol:  json.version?.protocol ?? -1,
          players,
          motdText,
          motdRaw:   json.description,
          favicon:   json.favicon ?? null, // data:image/png;base64,...
        });
      } catch {
        // Attendre plus de données
      }
    });
  });
}

/**
 * Extrait le texte brut d'un objet MOTD Minecraft (ChatComponent ou string).
 */
function extractMotd(desc) {
  if (typeof desc === 'string') return desc;
  let text = desc.text ?? '';
  if (Array.isArray(desc.extra)) {
    text += desc.extra.map(e => (typeof e === 'string' ? e : (e.text ?? ''))).join('');
  }
  return text;
}

/**
 * Nettoie les codes couleur/style Minecraft (§a, §l, etc.)
 */
function stripMotdCodes(str) {
  return str.replace(/§[0-9a-fk-or]/gi, '').trim();
}

/**
 * Détecte le type de serveur depuis la version + MOTD.
 */
function detectServerType(versionName, motdText) {
  const combined = `${versionName} ${motdText}`.toLowerCase();
  if (combined.includes('fabric'))        return '🧵 Fabric';
  if (combined.includes('quilt'))         return '🪡 Quilt';
  if (combined.includes('neoforge'))      return '🦊 NeoForge';
  if (combined.includes('forge') || combined.includes('fml')) return '🔨 Forge';
  if (combined.includes('purpur'))        return '🟣 Purpur';
  if (combined.includes('pufferfish'))    return '🐡 Pufferfish';
  if (combined.includes('paper'))         return '📝 Paper';
  if (combined.includes('airplane'))      return '✈️ Airplane';
  if (combined.includes('mohist'))        return '⚙️ Mohist';
  if (combined.includes('catserver'))     return '🐱 CatServer';
  if (combined.includes('arclight'))      return '💡 Arclight';
  if (combined.includes('magma'))         return '🔥 Magma';
  if (combined.includes('spigot'))        return '🔌 Spigot';
  if (combined.includes('bukkit'))        return '🪣 Bukkit';
  if (combined.includes('sponge'))        return '🧽 Sponge';
  if (combined.includes('velocity'))      return '⚡ Velocity';
  if (combined.includes('waterfall'))     return '💧 Waterfall';
  if (combined.includes('bungeecord') || combined.includes('bungee')) return '🔀 BungeeCord';
  if (combined.includes('vanilla'))       return '🍦 Vanilla';
  return '⬜ Vanilla/Inconnu';
}

/**
 * Formatte la latence avec emoji couleur.
 */
function formatLatency(ms) {
  if (ms < 50)  return `🟢 **${ms}ms** — Excellente`;
  if (ms < 100) return `🟢 **${ms}ms** — Bonne`;
  if (ms < 200) return `🟡 **${ms}ms** — Correcte`;
  if (ms < 500) return `🟠 **${ms}ms** — Élevée`;
  return `🔴 **${ms}ms** — Critique`;
}

// ─── Construction du panel Components V2 ─────────────────────────────────────

function sep(large = false) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

// Icône de fallback : tête de creeper Minecraft (Wikimedia Commons)
const MC_FALLBACK_ICON = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Minecraft_logo.svg/320px-Minecraft_logo.svg.png';

/**
 * Construit le panel CV2 complet pour un statut donné.
 * @param {object} status  résultat de pingMinecraft (ou null si hors ligne)
 * @param {object} cfg     config depuis mcDB
 * @param {string} updatedAt  horodatage formaté
 */
function buildStatusPanel(status, cfg, updatedAt) {
  const c = new ContainerBuilder();

  // Favicon : priorité au ping live, sinon favicon stocké en DB, sinon fallback MC
  const faviconUrl = status?.favicon ?? cfg.faviconData ?? MC_FALLBACK_ICON;

  if (status?.online) {
    c.setAccentColor(0x57f287); // vert

    // ── Titre + icône serveur ──────────────────────────────────────────────
    const motdClean = stripMotdCodes(status.motdText || '');
    const serverType = detectServerType(status.version, status.motdText || '');

    c.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🟢 Serveur Minecraft EN LIGNE\n` +
            (motdClean ? `> ${motdClean.replace(/\n/g, '\n> ')}\n` : '') +
            `-# 📡 \`${cfg.serverIp}:${cfg.port}\``
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(faviconUrl).setDescription('Icône du serveur')
        )
    );

    c.addSeparatorComponents(sep(true));

    // ── Infos principales ─────────────────────────────────────────────────
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🛠️ **Type :** ${serverType}\n` +
        `📦 **Version :** \`${status.version}\`\n` +
        `👥 **Joueurs :** **${status.players.online}** / **${status.players.max}**\n` +
        `📶 **Latence :** ${formatLatency(status.latency)}`
      )
    );

    // ── Liste des joueurs ─────────────────────────────────────────────────
    if (status.players.online > 0 && status.players.sample.length > 0) {
      c.addSeparatorComponents(sep());
      const sorted  = [...status.players.sample].sort();
      const display = sorted.length <= 12
        ? sorted.map(p => `🎮 **${p}**`).join('\n')
        : sorted.map(p => `**${p}**`).join(' · ');
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🎲 Joueurs en ligne (${status.players.online})\n${display}`
        )
      );
    } else if (status.players.online === 0) {
      c.addSeparatorComponents(sep());
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('*Aucun joueur connecté pour le moment.*')
      );
    }

  } else {
    // ── Hors ligne ────────────────────────────────────────────────────────
    c.setAccentColor(0xed4245);
    c.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🔴 Serveur Minecraft HORS LIGNE\n` +
            `Le serveur n'est pas accessible actuellement.\n` +
            `-# 📡 \`${cfg.serverIp}:${cfg.port}\``
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(faviconUrl)
            .setDescription('Serveur hors ligne')
        )
    );
    c.addSeparatorComponents(sep(true));
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `⏱️ **Prochaine vérification :** dans ${cfg.checkInterval}s`
      )
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# 🕐 Dernière mise à jour : ${updatedAt}`)
  );

  return c;
}

// ─── Helpers date ─────────────────────────────────────────────────────────────

function nowParis() {
  return new Date().toLocaleString('fr-FR', {
    timeZone:    'Europe/Paris',
    day:         '2-digit',
    month:       '2-digit',
    year:        'numeric',
    hour:        '2-digit',
    minute:      '2-digit',
  });
}

// ─── Résolution DNS + SRV ────────────────────────────────────────────────────

async function resolveHost(host, port) {
  // Tentative SRV _minecraft._tcp.<host>
  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
  } catch {
    // pas de SRV
  }
  // Résolution A/AAAA
  try {
    const addrs = await dns.resolve(host);
    return { host: addrs[0] ?? host, port };
  } catch {
    return { host, port };
  }
}

// ─── Tracker principal ────────────────────────────────────────────────────────

class MCManager {
  constructor() {
    /** @type {Map<string, NodeJS.Timeout>} guildId → interval */
    this._timers = new Map();
    /** @type {Map<string, { players: string[], online: boolean }>} état précédent */
    this._state  = new Map();
    /** @type {Client | null} */
    this._client = null;
  }

  init(client) {
    this._client = client;
    // Démarrer un tracker pour chaque guild qui a le MC configuré
    for (const guild of client.guilds.cache.values()) {
      const cfg = db.getConfig(guild.id);
      if (cfg.enabled && cfg.serverIp && cfg.statusChannelId) {
        this.startTracker(guild.id);
      }
    }
    console.log('[MCManager] Initialisé ✅');
  }

  /** Démarre (ou redémarre) le tracker pour une guild. */
  startTracker(guildId) {
    this.stopTracker(guildId);
    const cfg = db.getConfig(guildId);
    if (!cfg.enabled || !cfg.serverIp) return;

    // Premier tick immédiat
    this._tick(guildId);

    const interval = Math.max(15, cfg.checkInterval ?? 60) * 1000;
    this._timers.set(guildId, setInterval(() => this._tick(guildId), interval));
  }

  /** Arrête le tracker pour une guild. */
  stopTracker(guildId) {
    const t = this._timers.get(guildId);
    if (t) { clearInterval(t); this._timers.delete(guildId); }
  }

  /** Recharge la config et redémarre le tracker. */
  reload(guildId) {
    this.startTracker(guildId);
  }

  /** Force un ping et met à jour le panel. */
  async forceRefresh(guildId) {
    return this._tick(guildId);
  }

  // ── Tick interne ────────────────────────────────────────────────────────────
  async _tick(guildId) {
    if (!this._client) return;
    const cfg = db.getConfig(guildId);
    if (!cfg.enabled || !cfg.serverIp || !cfg.statusChannelId) return;

    const guild   = this._client.guilds.cache.get(guildId);
    const channel = this._client.channels.cache.get(cfg.statusChannelId);
    if (!guild || !channel?.isTextBased()) return;

    // Ping serveur
    const resolved = await resolveHost(cfg.serverIp, cfg.port ?? 25565);
    const status   = await pingMinecraft(resolved.host, resolved.port, 6000);

    const ts   = nowParis();
    const prev = this._state.get(guildId) ?? { players: [], online: null };

    // ── Notifications de changement d'état ────────────────────────────────
    if (prev.online !== null && status.online !== prev.online) {
      if (cfg.notifyOnline && status.online) {
        this._notifyStateChange(channel, guild, cfg, true);
      } else if (cfg.notifyOffline && !status.online) {
        this._notifyStateChange(channel, guild, cfg, false);
      }
    }

    // ── Notifications joueurs ────────────────────────────────────────────
    if (status.online) {
      const current   = status.players.sample ?? [];
      const newPlayers  = current.filter(p => !prev.players.includes(p));
      const leftPlayers = prev.players.filter(p => !current.includes(p));

      if (cfg.notifyJoin  && newPlayers.length > 0)  this._notifyPlayers(channel, newPlayers, 'join',  status.players.online, cfg.joinNotifDuration  ?? 60);
      if (cfg.notifyLeave && leftPlayers.length > 0) this._notifyPlayers(channel, leftPlayers, 'leave', status.players.online, cfg.leaveNotifDuration ?? 120);

      this._state.set(guildId, { players: current, online: true });
    } else {
      this._state.set(guildId, { players: [], online: false });
    }

    // ── Mise à jour du panel ─────────────────────────────────────────────
    // Persister le favicon en DB dès qu'on en reçoit un
    if (status.online && status.favicon && status.favicon !== cfg.faviconData) {
      db.set(guildId, 'faviconData', status.favicon);
      cfg = db.getConfig(guildId); // recharger avec le favicon mis à jour
    }

    await this._updatePanel(guildId, guild, channel, cfg, status, ts);
  }

  // ── Panel ───────────────────────────────────────────────────────────────────
  async _updatePanel(guildId, guild, channel, cfg, status, ts) {
    const panel = buildStatusPanel(status, cfg, ts);

    // 1. Essayer d'éditer le message connu par son ID
    if (cfg.statusMessageId) {
      const msg = await channel.messages.fetch(cfg.statusMessageId).catch(() => null);
      if (msg) {
        await msg.edit({
          components: [panel],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
        return;
      }
      // Message introuvable (supprimé ou bot redémarré depuis longtemps) → réinitialiser
      db.set(guildId, 'statusMessageId', null);
    }

    // 2. Scanner les derniers messages du salon pour retrouver un panel existant du bot
    try {
      const msgs = await channel.messages.fetch({ limit: 50 });
      for (const msg of msgs.values()) {
        if (
          msg.author.id === this._client.user.id &&
          msg.flags?.has?.('IsComponentsV2') &&
          msg.components?.length > 0
        ) {
          const edited = await msg.edit({
            components: [panel],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => null);
          if (edited) {
            db.set(guildId, 'statusMessageId', msg.id);
            return;
          }
        }
      }
    } catch { /* ignore */ }

    // 3. Aucun message existant trouvé → en créer un nouveau
    await this._cleanOldPanels(channel);
    const newMsg = await channel.send({
      components: [panel],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);
    if (newMsg) {
      db.set(guildId, 'statusMessageId', newMsg.id);
    }
  }

  async _cleanOldPanels(channel) {
    try {
      const msgs = await channel.messages.fetch({ limit: 20 });
      for (const msg of msgs.values()) {
        if (msg.author.id === this._client.user.id && msg.flags?.has?.('IsComponentsV2')) {
          await msg.delete().catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }

  // ── Notification état serveur ───────────────────────────────────────────────
  async _notifyStateChange(channel, guild, cfg, online) {
    const roleMention = cfg.notificationRoleId ? `<@&${cfg.notificationRoleId}> ` : '';
    const c = new ContainerBuilder().setAccentColor(online ? 0x57f287 : 0xed4245);
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        online
          ? `## 🟢 Serveur de nouveau en ligne !\n${roleMention}Le serveur \`${cfg.serverIp}:${cfg.port}\` est accessible.\n-# ${nowParis()}`
          : `## 🔴 Serveur hors ligne !\n${roleMention}Le serveur \`${cfg.serverIp}:${cfg.port}\` n'est plus accessible.\n-# ${nowParis()}`
      )
    );
    const msg = await channel.send({
      content:    roleMention || undefined,
      components: [c],
      flags:      MessageFlags.IsComponentsV2,
    }).catch(() => null);

    // Auto-suppression après 5 minutes pour la notif "de nouveau en ligne"
    if (msg && online) {
      setTimeout(() => msg.delete().catch(() => {}), 5 * 60 * 1000);
    }
  }

  // ── Notification joueurs ────────────────────────────────────────────────────
  async _notifyPlayers(channel, players, type, total, durationSec) {
    const isJoin = type === 'join';
    const c = new ContainerBuilder().setAccentColor(isJoin ? 0xfee75c : 0xf0a500);
    const playersStr = players.map(p => `**${p}**`).join(', ');
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isJoin
          ? `## 🎮 ${players.length > 1 ? 'Nouveaux joueurs connectés' : 'Joueur connecté'}\n${playersStr} ${players.length > 1 ? 'ont rejoint' : 'a rejoint'} le serveur !\n-# 👥 ${total} joueur${total > 1 ? 's' : ''} en ligne · ${nowParis()}`
          : `## 👋 ${players.length > 1 ? 'Joueurs déconnectés' : 'Joueur déconnecté'}\n${playersStr} ${players.length > 1 ? 'ont quitté' : 'a quitté'} le serveur.\n-# 👥 ${total} joueur${total > 1 ? 's' : ''} en ligne · ${nowParis()}`
      )
    );
    const msg = await channel.send({
      components: [c],
      flags:      MessageFlags.IsComponentsV2,
    }).catch(() => null);
    if (msg) {
      setTimeout(() => msg.delete().catch(() => {}), durationSec * 1000);
    }
  }

  /** Ping rapide public (pour le bouton Actualiser et les commandes). */
  async getStatus(serverIp, port = 25565) {
    const resolved = await resolveHost(serverIp, port);
    return pingMinecraft(resolved.host, resolved.port, 6000);
  }

  /** Construit un panel CV2 (utilisable hors tracker, ex: .mcstatus). */
  buildPanel(status, cfg, ts) {
    return buildStatusPanel(status, cfg, ts ?? nowParis());
  }
}

const manager = new MCManager();
module.exports = manager;
