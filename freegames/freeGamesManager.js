// freegames/freeGamesManager.js
// Récupère les jeux gratuits Epic Games & Steam, puis les annonce dans le salon configuré.
//
// Sources Epic Games (croisées pour exhaustivité) :
//   1. API officielle Epic Store  → freeGamesPromotions (offres avec fenêtre de temps)
//   2. GamerPower endpoint epic   → /api/giveaways?platform=epic-games (filet de sécurité)
//   3. Free-to-Game API           → /api/giveaways?platform=epic-games (troisième filet)
// Sources Steam :
//   GamerPower endpoint steam     → /api/giveaways?platform=steam&type=game
//                                   Lien : game_url (URL directe Steam store)
//
// Déduplication : par ID unique par source, puis par titre normalisé entre sources.
// Scheduler : intervalle configurable par guilde (défaut 6h).
// Anti-doublon : les IDs déjà postés sont sauvegardés dans freeGamesDB.

'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./freeGamesDB.js');

// ─── HTTP helper (Node.js natif fetch, disponible depuis Node 18) ─────────────

async function httpGet(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FreeGamesBot/1.0)',
      ...headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

// ─── Epic Games — Source 1 : API officielle Epic Store ───────────────────────

const EPIC_URL =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR';

/**
 * Construit l'URL directe du store Epic depuis les métadonnées d'un élément.
 * Priorité : catalogNs.mappings[0].pageSlug > productSlug > urlSlug
 */
function epicStoreUrl(e) {
  const slug =
    e.catalogNs?.mappings?.[0]?.pageSlug ||
    e.productSlug ||
    e.urlSlug ||
    '';
  if (!slug || slug === 'home') return 'https://store.epicgames.com/fr/free-games';
  return `https://store.epicgames.com/fr/p/${slug}`;
}

/** Normalise un titre pour la déduplication inter-sources */
function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Source 1 — API officielle Epic Games Store.
 * Filtre strict : fenêtre promotionnelle active + discountPrice === 0.
 * @returns {Promise<FreeGame[]>}
 */
async function fetchEpicOfficial() {
  try {
    const json = await httpGet(EPIC_URL);
    const elements = json?.data?.Catalog?.searchStore?.elements ?? [];
    const now = Date.now();

    return elements
      .filter(e => {
        const offers = e.promotions?.promotionalOffers ?? [];
        if (!offers.length) return false;
        const promo = offers[0]?.promotionalOffers?.[0];
        if (!promo?.startDate || !promo?.endDate) return false;
        const start = new Date(promo.startDate).getTime();
        const end   = new Date(promo.endDate).getTime();
        return now >= start && now <= end && e.price?.totalPrice?.discountPrice === 0;
      })
      .map(e => {
        const promo  = e.promotions.promotionalOffers[0].promotionalOffers[0];
        const imgKey = e.keyImages?.find(i =>
          i.type === 'DieselStoreFrontWide' || i.type === 'OfferImageWide' || i.type === 'Thumbnail'
        );
        return {
          id:            `epic:${e.id}`,
          source:        'Epic Games',
          sourceColor:   0x2a2a2a,
          title:         e.title,
          _titleNorm:    normalizeTitle(e.title),
          description:   e.description?.slice(0, 300) || null,
          imageUrl:      imgKey?.url || null,
          storeUrl:      epicStoreUrl(e),
          originalPrice: e.price?.totalPrice?.fmtPrice?.originalPrice ?? 'Gratuit',
          expiresAt:     new Date(promo.endDate).getTime(),
        };
      });
  } catch (e) {
    console.error('[FreeGames] Epic (officiel) fetch error:', e.message);
    return [];
  }
}

// ─── Epic Games — Source 2 : GamerPower endpoint epic-games ─────────────────

const GAMERPOWER_EPIC_URL =
  'https://www.gamerpower.com/api/giveaways?platform=epic-games&type=game&sort-by=date';

/**
 * Source 2 — GamerPower Epic Games (filet de sécurité).
 * Capture les jeux Epic que l'API officielle peut omettre (DLC, bundles, etc.)
 * @returns {Promise<FreeGame[]>}
 */
async function fetchEpicGamerPower() {
  try {
    const json = await httpGet(GAMERPOWER_EPIC_URL);
    if (!Array.isArray(json)) return [];

    return json
      .filter(g => g.status === 'Active')
      .map(g => {
        const expiresAt = g.end_date && g.end_date !== 'N/A'
          ? new Date(g.end_date).getTime() : null;
        const storeUrl = (g.game_url?.includes('epicgames.com') ? g.game_url : null)
          || g.open_giveaway_url
          || 'https://store.epicgames.com/fr/free-games';
        return {
          id:            `gamerpower-epic:${g.id}`,
          source:        'Epic Games',
          sourceColor:   0x2a2a2a,
          title:         g.title,
          _titleNorm:    normalizeTitle(g.title),
          description:   g.description?.slice(0, 300) || null,
          imageUrl:      g.thumbnail || null,
          storeUrl,
          originalPrice: g.worth && g.worth !== 'N/A' ? g.worth : 'Gratuit',
          expiresAt,
        };
      });
  } catch (e) {
    console.error('[FreeGames] Epic/GamerPower fetch error:', e.message);
    return [];
  }
}

// ─── Epic Games — Source 3 : Free-to-Game API ────────────────────────────────

const FREETOGAME_EPIC_URL =
  'https://www.freetogame.com/api/giveaways?platform=epic-games-store&sort-by=date';

/**
 * Source 3 — Free-to-Game giveaways Epic (troisième filet).
 * Liste les cadeaux/promotions Epic indexés par FreeToGame.
 * @returns {Promise<FreeGame[]>}
 */
async function fetchEpicFreeToGame() {
  try {
    const json = await httpGet(FREETOGAME_EPIC_URL);
    if (!Array.isArray(json)) return [];

    const now = Date.now();
    return json
      .filter(g => {
        // Exclure les offres expirées si une date de fin est fournie
        if (g.end_date && g.end_date !== 'N/A') {
          return new Date(g.end_date).getTime() > now;
        }
        return true;
      })
      .map(g => {
        const expiresAt = g.end_date && g.end_date !== 'N/A'
          ? new Date(g.end_date).getTime() : null;
        return {
          id:            `freetogame:${g.id}`,
          source:        'Epic Games',
          sourceColor:   0x2a2a2a,
          title:         g.title,
          _titleNorm:    normalizeTitle(g.title),
          description:   g.description?.slice(0, 300) || null,
          imageUrl:      g.thumbnail || null,
          storeUrl:      g.game_url || 'https://store.epicgames.com/fr/free-games',
          originalPrice: g.worth && g.worth !== 'N/A' ? g.worth : 'Gratuit',
          expiresAt,
        };
      });
  } catch (e) {
    console.error('[FreeGames] FreeToGame/Epic fetch error:', e.message);
    return [];
  }
}

/**
 * Agrège les 3 sources Epic et déduplique par titre normalisé.
 * Priorité : source officielle > GamerPower > FreeToGame
 * @returns {Promise<FreeGame[]>}
 */
async function fetchEpic() {
  const [official, gamerpower, f2g] = await Promise.all([
    fetchEpicOfficial(),
    fetchEpicGamerPower(),
    fetchEpicFreeToGame(),
  ]);

  const seenTitles = new Set();
  const result = [];

  for (const game of [...official, ...gamerpower, ...f2g]) {
    const key = game._titleNorm;
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    const { _titleNorm, ...clean } = game;
    result.push(clean);
  }

  return result;
}

// ─── Steam via GamerPower ─────────────────────────────────────────────────────

// On interroge directement l'endpoint Steam de GamerPower pour n'avoir que
// les jeux Steam gratuits. Le champ `game_url` contient l'URL directe du store Steam.
const GAMERPOWER_STEAM_URL =
  'https://www.gamerpower.com/api/giveaways?platform=steam&type=game&sort-by=date';

async function fetchSteam() {
  try {
    const json = await httpGet(GAMERPOWER_STEAM_URL);
    if (!Array.isArray(json)) return [];

    return json
      .filter(g => g.status === 'Active')
      .map(g => {
        // game_url = lien direct Steam store (ex: https://store.steampowered.com/app/XXXX)
        // open_giveaway_url = page gamerpower (ne pas utiliser comme lien principal)
        const storeUrl = g.game_url || g.open_giveaway_url || 'https://store.steampowered.com/';
        const expiresAt = g.end_date && g.end_date !== 'N/A'
          ? new Date(g.end_date).getTime() : null;

        return {
          id:            `gamerpower:${g.id}`,
          source:        'Steam',
          sourceColor:   0x1b2838,
          title:         g.title,
          description:   g.description?.slice(0, 300) || null,
          imageUrl:      g.thumbnail || null,
          storeUrl,
          originalPrice: g.worth && g.worth !== 'N/A' ? g.worth : 'Gratuit',
          expiresAt,
        };
      });
  } catch (e) {
    console.error('[FreeGames] Steam/GamerPower fetch error:', e.message);
    return [];
  }
}

// ─── Agrégation des sources ───────────────────────────────────────────────────

/**
 * Récupère tous les jeux gratuits selon les sources activées pour une guilde.
 * @param {object} config - Config de guilde depuis freeGamesDB
 * @returns {Promise<FreeGame[]>}
 */
async function fetchAll(config) {
  const results = [];

  // Epic Games (API officielle, offres limitées dans le temps)
  if (config.sources?.epic) {
    const epicGames = await fetchEpic();
    results.push(...epicGames);
  }

  // Steam (via GamerPower, endpoint steam uniquement, lien direct store)
  if (config.sources?.steam) {
    const steamGames = await fetchSteam();
    results.push(...steamGames);
  }

  return results;
}

// ─── Construction de l'embed + bouton d'annonce ──────────────────────────────

const SOURCE_LABEL = {
  'Epic Games': '🟣 Epic Games Store',
  'Steam':      '🔵 Steam',
};

/**
 * @param {FreeGame} game
 * @param {object} config
 * @returns {{ embed: EmbedBuilder, row: ActionRowBuilder }}
 */
function buildGameEmbed(game, config) {
  const embed = new EmbedBuilder()
    .setColor(game.sourceColor ?? 0x5865f2)
    .setTitle(`� ${game.title}`)
    .setURL(game.storeUrl)
    .addFields(
      { name: '🏪 Plateforme',    value: SOURCE_LABEL[game.source] ?? game.source, inline: true },
      { name: '💰 Prix original', value: game.originalPrice || 'Inconnu',          inline: true },
    );

  if (config.showExpiry && game.expiresAt) {
    const ts = Math.floor(game.expiresAt / 1000);
    embed.addFields({
      name:   '⏳ Offre valable jusqu\'au',
      value:  `<t:${ts}:F>  ·  <t:${ts}:R>`,
      inline: false,
    });
  }

  if (config.showDescription && game.description) {
    embed.setDescription(`> ${game.description}`);
  }

  if (game.imageUrl) {
    embed.setImage(game.imageUrl);
  }

  embed.setFooter({ text: `Jeu gratuit limité dans le temps • ${game.source}` }).setTimestamp();

  // Bouton lien direct vers le store
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(`Obtenir gratuitement sur ${game.source}`)
      .setStyle(ButtonStyle.Link)
      .setURL(game.storeUrl)
      .setEmoji('🎮'),
  );

  return { embed, row };
}

// ─── Envoi dans le salon ──────────────────────────────────────────────────────

/**
 * Vérifie et envoie les nouveaux jeux gratuits pour une guilde.
 * @param {import('discord.js').Guild} guild
 */
async function checkAndPost(guild) {
  const config = db.getConfig(guild.id);
  if (!config.enabled || !config.channelId) return;

  // Purger les entrées datant de plus de 2 semaines
  db.purgeOldEntries(guild.id);

  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased()) return;

  const games = await fetchAll(config);
  if (!games.length) return;

  let posted = 0;
  for (const game of games) {
    if (db.isPosted(guild.id, game.id)) continue;

    try {
      const { embed, row } = buildGameEmbed(game, config);
      const content        = config.pingRoleId ? `<@&${config.pingRoleId}>` : undefined;

      await channel.send({ content, embeds: [embed], components: [row] });
      db.markPosted(guild.id, game.id);
      posted++;

      // Petite pause pour éviter le rate-limit
      if (posted > 0) await new Promise(r => setTimeout(r, 1_500));
    } catch (e) {
      console.error(`[FreeGames] Erreur envoi jeu "${game.title}" dans ${guild.name}:`, e.message);
    }
  }

  if (posted > 0) {
    console.log(`[FreeGames] ${posted} jeu(x) posté(s) dans "${guild.name}"`);
  }
}

// ─── Scheduler global ─────────────────────────────────────────────────────────

let _client    = null;
let _intervals = new Map(); // guildId → intervalId

/**
 * Démarre le scheduler pour une guilde.
 * @param {string} guildId
 * @param {number} intervalHours
 */
function startGuild(guildId, intervalHours = 6) {
  stopGuild(guildId);
  const ms = Math.max(1, intervalHours) * 3_600_000;
  const id = setInterval(async () => {
    if (!_client) return;
    const guild = _client.guilds.cache.get(guildId);
    if (guild) await checkAndPost(guild).catch(e =>
      console.error(`[FreeGames] Scheduler error (${guildId}):`, e.message)
    );
  }, ms);
  _intervals.set(guildId, id);
}

function stopGuild(guildId) {
  if (_intervals.has(guildId)) {
    clearInterval(_intervals.get(guildId));
    _intervals.delete(guildId);
  }
}

/**
 * Initialise le manager au démarrage du bot.
 * @param {import('discord.js').Client} client
 */
function init(client) {
  _client = client;

  for (const guildId of db.getAllGuilds()) {
    const cfg = db.getConfig(guildId);
    if (cfg.enabled && cfg.channelId) {
      startGuild(guildId, cfg.checkInterval);
    }
  }

  // Vérification initiale immédiate (décalée de 10s pour laisser le cache se remplir)
  setTimeout(async () => {
    for (const guild of client.guilds.cache.values()) {
      if (db.isEnabled(guild.id)) {
        await checkAndPost(guild).catch(e =>
          console.error(`[FreeGames] Init check error (${guild.id}):`, e.message)
        );
      }
    }
  }, 10_000);

  console.log('[FreeGames] Initialisé ✅');
}

/**
 * Recharge le scheduler d'une guilde (après changement de config).
 * @param {string} guildId
 */
function reload(guildId) {
  const cfg = db.getConfig(guildId);
  if (cfg.enabled && cfg.channelId) {
    startGuild(guildId, cfg.checkInterval);
  } else {
    stopGuild(guildId);
  }
}

/**
 * Force une vérification immédiate pour une guilde.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<number>} nombre de jeux postés
 */
async function forceCheck(guild) {
  const config = db.getConfig(guild.id);
  if (!config.channelId) return 0;

  // Purger les entrées datant de plus de 2 semaines
  db.purgeOldEntries(guild.id);

  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased()) return 0;

  const games = await fetchAll(config);
  let posted = 0;
  for (const game of games) {
    if (db.isPosted(guild.id, game.id)) continue;
    try {
      const { embed, row } = buildGameEmbed(game, config);
      const content        = config.pingRoleId ? `<@&${config.pingRoleId}>` : undefined;
      await channel.send({ content, embeds: [embed], components: [row] });
      db.markPosted(guild.id, game.id);
      posted++;
      if (posted > 0) await new Promise(r => setTimeout(r, 1_500));
    } catch {}
  }
  return posted;
}

module.exports = { init, reload, forceCheck, checkAndPost, startGuild, stopGuild, fetchAll };
