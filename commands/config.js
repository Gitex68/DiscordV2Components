// commands/config.js — .config
// Dashboard centralisé de configuration du bot — Multi-pages.
// Page 0 = Sommaire · Page 1 = Compteurs · Page 2 = Logs · Page 3 = Tickets · Page 4 = Jeux Gratuits
// Navigation : select menu + prev/next + boutons raccourcis.

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits,
} = require('discord.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep(large = false) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}
function si(v)  { return v ? '✅' : '❌'; }
function tog(v) { return v ? '🟢' : '🔴'; }
function cm(id) { return id ? `<#${id}>` : '*Non défini*'; }

// ─── Chargement conditionnel des DB ───────────────────────────────────────────

let cdb, logDB, ticketDB, freeGamesDB, adminCfgDB, tempVoiceDB, rulesDB, mcDB;
try { cdb         = require('../utils/counterDB.js');        } catch { cdb         = null; }
try { logDB       = require('../logs/logDB.js');              } catch { logDB       = null; }
try { ticketDB    = require('../tickets/ticketDB.js');        } catch { ticketDB    = null; }
try { freeGamesDB = require('../freegames/freeGamesDB.js');   } catch { freeGamesDB = null; }
try { adminCfgDB  = require('../utils/adminConfigDB.js');     } catch { adminCfgDB  = null; }
try { tempVoiceDB = require('../utils/tempVoiceDB.js');       } catch { tempVoiceDB = null; }
try { rulesDB     = require('../utils/rulesDB.js');           } catch { rulesDB     = null; }
try { mcDB        = require('../utils/mcDB.js');              } catch { mcDB        = null; }

// ─── Définition des modules ───────────────────────────────────────────────────

const MODULES = [
  {
    key:     'counters',
    emoji:   '📊',
    label:   'Compteurs',
    color:   0x5865f2,
    cmd:     '.sconfig',
    aliases: ['.scfg', '.counters', '.statsconfig'],
    desc:    'Salons vocaux dont le nom affiche une valeur en temps réel (membres, bots, boosts, vocal, en ligne).',
    openId:  'config_open_sconfig',
    openCmd: 'sconfig',
  },
  {
    key:     'logs',
    emoji:   '📋',
    label:   'Logs serveur',
    color:   0xfee75c,
    cmd:     '.lconfig',
    aliases: ['.lc', '.logconfig'],
    desc:    'Enregistre les événements du serveur : kicks, bans, messages supprimés, éditions, et plus.',
    openId:  'config_open_lconfig',
    openCmd: 'lconfig',
  },
  {
    key:     'tickets',
    emoji:   '🎫',
    label:   'Tickets',
    color:   0x57f287,
    cmd:     '.tconfig',
    aliases: ['.tc', '.ticketconfig'],
    desc:    'Système de tickets de support : catégorie, rôles staff, messages, tags, comportements.',
    openId:  'config_open_tconfig',
    openCmd: 'tconfig',
  },
  {
    key:     'freegames',
    emoji:   '🎮',
    label:   'Jeux Gratuits',
    color:   0x2a2a2a,
    cmd:     '.fgconfig',
    aliases: ['.fg', '.freeconfig', '.jeux'],
    desc:    'Annonces automatiques des jeux gratuits Epic Games & Steam dans un salon dédié.',
    openId:  'config_open_fgconfig',
    openCmd: 'fgconfig',
  },
  {
    key:     'admin',
    emoji:   '⚙️',
    label:   'Commandes Admin',
    color:   0x5865f2,
    cmd:     '.aconfig',
    aliases: ['.acfg', '.adminconfig', '.admincfg'],
    desc:    'Rôle d\'accès aux commandes admin, méthode de mute (timeout / rôle custom).',
    openId:  'config_open_aconfig',
    openCmd: 'aconfig',
  },
  {
    key:     'tempvoice',
    emoji:   '🎙️',
    label:   'Salons Vocaux Temp',
    color:   0x5865f2,
    cmd:     '.vcconfig',
    aliases: ['.vc', '.voiceconfig', '.tempvoice'],
    desc:    'Salons vocaux temporaires : hub, catégorie, limites, renommage, verrouillage.',
    openId:  'config_open_vcconfig',
    openCmd: 'vcconfig',
  },
  {
    key:     'rules',
    emoji:   '📜',
    label:   'Règlement',
    color:   0x57f287,
    cmd:     '.rconfig',
    aliases: ['.rc', '.rulesconfig', '.reglement'],
    desc:    'Système de règlement : texte éditable, rôle de restriction au join, validation par bouton.',
    openId:  'config_open_rconfig',
    openCmd: 'rconfig',
  },
  {
    key:     'minecraft',
    emoji:   '⛏️',
    label:   'Minecraft Status',
    color:   0x2ecc71,
    cmd:     '.mcconfig',
    aliases: ['.mc', '.minecraft', '.mcstatus'],
    desc:    'Suivi en temps réel d\'un serveur Minecraft : statut, joueurs, MOTD, notifications automatiques.',
    openId:  'config_open_mcconfig',
    openCmd: 'mcconfig',
  },
];

// TOTAL_PAGES = 1 sommaire + MODULES.length pages
const TOTAL_PAGES = MODULES.length + 1; // 4

// ─── Rows de navigation ───────────────────────────────────────────────────────

function buildNavRow(pageIdx) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_nav')
      .setPlaceholder('📂 Naviguer vers...')
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel('Sommaire')
          .setValue('summary')
          .setDescription('Vue d\'ensemble de tous les modules')
          .setEmoji('🏠')
          .setDefault(pageIdx === 0),
        ...MODULES.map((m, idx) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(m.label)
            .setValue(m.key)
            .setDescription(`${m.cmd} — ${m.desc.slice(0, 55)}…`)
            .setEmoji(m.emoji)
            .setDefault(pageIdx === idx + 1)
        ),
      ])
  );
}

function buildPrevNextRow(pageIdx) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_prev')
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIdx === 0),
    new ButtonBuilder()
      .setCustomId('config_summary')
      .setLabel('🏠 Sommaire')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIdx === 0),
    new ButtonBuilder()
      .setCustomId('config_next')
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIdx === TOTAL_PAGES - 1),
  );
}

// ─── Page 0 — Sommaire ────────────────────────────────────────────────────────

function buildSummary(guild, user) {
  const iconURL = guild.iconURL({ size: 64, extension: 'png' })
               ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

  const lines = MODULES.map(m => {
    let status = '';
    if (m.key === 'counters' && cdb) {
      const cfg = cdb.getGuild(guild.id);
      const n = Object.values(cfg).filter(c => c?.channelId).length;
      status = n > 0 ? `✅ ${n} compteur${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}` : '⚠️ Non configuré';
    } else if (m.key === 'logs' && logDB) {
      const cfg = logDB.getConfig(guild.id);
      status = cfg.enabled !== false ? '🟢 Activés' : '🔴 Désactivés';
    } else if (m.key === 'tickets' && ticketDB) {
      const cfg = ticketDB.getConfig(guild.id);
      status = cfg?.enabled !== false ? '🟢 Activés' : '🔴 Désactivés';
    } else if (m.key === 'freegames' && freeGamesDB) {
      const cfg = freeGamesDB.getConfig(guild.id);
      const sources = [cfg.sources?.epic && 'Epic', cfg.sources?.steam && 'Steam'].filter(Boolean).join(' · ') || 'Aucune';
      status = cfg.enabled && cfg.channelId
        ? `🟢 Actif · ${sources}`
        : cfg.channelId ? '🟡 Désactivé' : '⚠️ Non configuré';
    } else if (m.key === 'admin' && adminCfgDB) {
      const cfg = adminCfgDB.getConfig(guild.id);
      const roleStr   = cfg.adminRoleId ? `Rôle défini` : 'Accès par défaut';
      const muteStr   = cfg.muteMode === 'role' ? '🎭 Rôle custom' : '⏰ Timeout';
      status = `🔑 ${roleStr} · ${muteStr}`;
    } else if (m.key === 'tempvoice' && tempVoiceDB) {
      const cfg = tempVoiceDB.getConfig(guild.id);
      status = cfg.enabled && cfg.hubChannelId
        ? `🟢 Actif · hub <#${cfg.hubChannelId}>`
        : cfg.hubChannelId ? '🟡 Désactivé' : '⚠️ Non configuré';
    } else if (m.key === 'rules' && rulesDB) {
      const cfg = rulesDB.getConfig(guild.id);
      status = cfg.enabled && cfg.rulesChannelId && cfg.verifiedRoleId
        ? `🟢 Actif · <#${cfg.rulesChannelId}>`
        : cfg.rulesChannelId ? '🟡 Partiellement configuré' : '⚠️ Non configuré';
    } else if (m.key === 'minecraft' && mcDB) {
      const cfg = mcDB.getConfig(guild.id);
      status = cfg.enabled && cfg.serverIp && cfg.statusChannelId
        ? `🟢 Actif · \`${cfg.serverIp}:${cfg.port}\``
        : cfg.serverIp ? '🟡 Configuré mais désactivé' : '⚠️ Non configuré';
    } else {
      status = '⚫ Indisponible';
    }
    return `${m.emoji} **${m.label}** — \`${m.cmd}\`\n-# ${status} · ${m.aliases.map(a => `\`${a}\``).join(' ')}`;
  }).join('\n\n');

  const allShortcuts = MODULES.map(m =>
    new ButtonBuilder()
      .setCustomId(m.openId)
      .setLabel(m.label)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(m.emoji)
  );
  // Discord : max 5 boutons par ActionRow → splitter si nécessaire
  const shortcutRows = [];
  for (let i = 0; i < allShortcuts.length; i += 5) {
    shortcutRows.push(new ActionRowBuilder().addComponents(...allShortcuts.slice(i, i + 5)));
  }

  const c = new ContainerBuilder().setAccentColor(0x5865f2);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⚙️ Configuration — ${guild.name}\n` +
          `-# ${MODULES.length} modules disponibles · Préfixe : \`.\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(iconURL).setDescription('Icône du serveur')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '**Ouvrir un dashboard :**'
    )
  );
  shortcutRows.forEach(row => c.addActionRowComponents(row));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow(0));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 1 — Compteurs ───────────────────────────────────────────────────────

function buildCountersPage(guild, user) {
  const m = MODULES[0];
  let detailLines = '';
  let configured = 0;
  let total = 0;

  if (cdb) {
    const config = cdb.getGuild(guild.id);
    const types  = cdb.TYPES;
    total = Object.keys(types).length;
    const lines = Object.entries(types).map(([type, meta]) => {
      const cfg = config[type];
      if (!cfg?.channelId) {
        return `${meta.emoji} **${meta.label}** — ${si(false)} *Non configuré*`;
      }
      configured++;
      const ch = guild.channels.cache.get(cfg.channelId);
      const preview = cfg.template ? `\`${cfg.template}\`` : '*template par défaut*';
      const chStr = ch ? `<#${ch.id}>` : `~~\`${cfg.channelId}\`~~ *(salon supprimé)*`;
      return `${meta.emoji} **${meta.label}** — ${si(true)} ${chStr}\n-# Template : ${preview}`;
    });
    detailLines = lines.join('\n');
  } else {
    detailLines = '> *Module compteurs non disponible*';
  }

  const statusLine = configured > 0
    ? `✅ ${configured}/${total} compteur${configured > 1 ? 's' : ''} actif${configured > 1 ? 's' : ''}`
    : `⚠️ Aucun compteur configuré`;

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 1 / ${MODULES.length} · \`${m.cmd}\` · ${statusLine}`
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/0.png')
          .setDescription('Compteurs')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État des compteurs\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚙️')
    )
  );
  c.addActionRowComponents(buildNavRow(1));
  c.addActionRowComponents(buildPrevNextRow(1));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 2 — Logs ────────────────────────────────────────────────────────────

function buildLogsPage(guild, user) {
  const m = MODULES[1];
  let detailLines = '';

  if (logDB) {
    const cfg     = logDB.getConfig(guild.id);
    const enabled = cfg.enabled !== false;
    const cats    = logDB.EVENT_CATEGORIES ?? {};
    const catKeys = Object.keys(cats);
    const events  = cfg.events ?? {};
    const activeEvt = Object.values(events).filter(e => e.enabled).length;
    const totalEvt  = Object.values(events).length;

    const catLines = catKeys.map(k => {
      const cat     = cats[k];
      const catEvts   = Object.keys(cat.events ?? {});
      const catActive = catEvts.filter(ek => events[ek]?.enabled).length;
      return `${cat.label.split(' ')[0]} **${cat.label}** — ${catActive}/${catEvts.length} événements actifs`;
    }).join('\n');

    detailLines =
      `${tog(enabled)} Logs **${enabled ? 'activés' : 'désactivés'}**\n` +
      `📥 Salon global : ${cm(cfg.channelId)}\n` +
      `📊 Événements actifs : **${activeEvt}/${totalEvt}**\n\n` +
      `**Catégories :**\n${catLines || '*Aucune catégorie définie*'}`;
  } else {
    detailLines = '> *Module logs non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 2 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/1.png')
          .setDescription('Logs')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État des logs\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋')
    )
  );
  c.addActionRowComponents(buildNavRow(2));
  c.addActionRowComponents(buildPrevNextRow(2));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 3 — Tickets ─────────────────────────────────────────────────────────

function buildTicketsPage(guild, user) {
  const m = MODULES[2];
  let detailLines = '';

  if (ticketDB) {
    const cfg      = ticketDB.getConfig(guild.id);
    const enabled  = cfg?.enabled !== false;
    const tags     = cfg?.tags ?? [];
    const tagsList = tags.length
      ? tags.map(t => `\`${t}\``).join(' · ')
      : '*Aucun tag défini*';

    detailLines =
      `${tog(enabled)} Tickets **${enabled ? 'activés' : 'désactivés'}**\n` +
      `📁 Catégorie : ${cfg?.categoryId ? `<#${cfg.categoryId}>` : '*Non définie*'}\n` +
      `📋 Salon logs : ${cm(cfg?.logChannelId)}\n` +
      `📌 Salon panel : ${cm(cfg?.panelChannelId)}\n` +
      `🛡️ Rôle staff : ${cfg?.supportRoleId ? `<@&${cfg.supportRoleId}>` : '*Non défini*'}\n` +
      `🎫 Max ouvert/utilisateur : **${cfg?.maxOpen ?? 3}**\n` +
      `🏷️ Tags (${tags.length}) : ${tagsList}`;
  } else {
    detailLines = '> *Module tickets non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 3 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/4.png')
          .setDescription('Tickets')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État des tickets\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}\n\n` +
      `**Autres commandes :** \`.ticket\` \`.tpanel\` \`.tclose\` \`.tclaim\` \`.tadd\` \`.tremove\``
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    )
  );
  c.addActionRowComponents(buildNavRow(3));
  c.addActionRowComponents(buildPrevNextRow(3));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 4 — Jeux Gratuits ───────────────────────────────────────────────────

function buildFreeGamesPage(guild, user) {
  const m = MODULES[3]; // freegames
  let detailLines = '';

  if (freeGamesDB) {
    const cfg     = freeGamesDB.getConfig(guild.id);
    const sources = [cfg.sources?.epic && '🎮 Epic Games', cfg.sources?.steam && '🎮 Steam'].filter(Boolean).join(' · ') || '*Aucune source*';
    detailLines =
      `${cfg.enabled && cfg.channelId ? '🟢' : '🔴'} Système **${cfg.enabled && cfg.channelId ? 'actif' : 'inactif'}**\n` +
      `📢 Salon d'annonces : ${cfg.channelId ? `<#${cfg.channelId}>` : '*Non défini*'}\n` +
      `🔔 Rôle ping : ${cfg.pingRoleId ? `<@&${cfg.pingRoleId}>` : '*Désactivé*'}\n` +
      `🏪 Sources : ${sources}\n` +
      `⏱️ Intervalle : **${cfg.checkInterval ?? 6}h**\n` +
      `⏳ Expiration visible : ${cfg.showExpiry ? '✅' : '❌'}\n` +
      `📝 Description visible : ${cfg.showDescription ? '✅' : '❌'}\n` +
      `🗂️ IDs en mémoire : **${cfg.postedIds?.length ?? 0}**`;
  } else {
    detailLines = '> *Module Jeux Gratuits non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 4 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/3.png')
          .setDescription('Jeux Gratuits')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État du système\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎮')
    )
  );
  c.addActionRowComponents(buildNavRow(4));
  c.addActionRowComponents(buildPrevNextRow(4));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 5 — Commandes Admin ─────────────────────────────────────────────────

function buildAdminPage(guild, user) {
  const m = MODULES[4]; // admin
  let detailLines = '';

  if (adminCfgDB) {
    const cfg       = adminCfgDB.getConfig(guild.id);
    const roleStr   = cfg.adminRoleId ? `<@&${cfg.adminRoleId}>` : '*Non défini — seuls les membres avec Gérer le serveur ont accès*';
    const muteMode  = cfg.muteMode === 'role' ? '🎭 Rôle custom' : '⏰ Timeout Discord';
    const muteRole  = cfg.muteRoleId ? `<@&${cfg.muteRoleId}>` : '*Non défini*';
    detailLines =
      `**🔑 Rôle d'accès aux commandes admin**\n${roleStr}\n` +
      `-# Les membres avec ce rôle peuvent utiliser ban, kick, mute, warn, clean…\n\n` +
      `**⚖️ Méthode de mute**\n${muteMode}\n` +
      `-# *Timeout Discord* : durée native, levé automatiquement.\n` +
      `-# *Rôle custom* : attribue un rôle, retrait manuel via \`.unmute\`.\n\n` +
      `**🎭 Rôle de mute custom**\n${muteRole}\n` +
      `-# Utilisé uniquement en mode Rôle custom.`;
  } else {
    detailLines = '> *Module Config Admin non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 5 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/0.png')
          .setDescription('Commandes Admin')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État de la config admin\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚙️')
    )
  );
  c.addActionRowComponents(buildNavRow(5));
  c.addActionRowComponents(buildPrevNextRow(5));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 6 — Salons Vocaux Temporaires ──────────────────────────────────────

function buildTempVoicePage(guild, user) {
  const m = MODULES[5]; // tempvoice
  let detailLines = '';

  if (tempVoiceDB) {
    const cfg = tempVoiceDB.getConfig(guild.id);
    const hubStr = cfg.hubChannelId ? `<#${cfg.hubChannelId}>` : '*Non défini*';
    const catStr = cfg.categoryId   ? `<#${cfg.categoryId}>`   : '*Même catégorie que le hub*';
    detailLines =
      `${cfg.enabled && cfg.hubChannelId ? '🟢 Actif' : cfg.hubChannelId ? '🟡 Désactivé' : '⚠️ Non configuré'}\n\n` +
      `**🚪 Salon hub :** ${hubStr}\n` +
      `-# Les membres rejoignent ce salon pour créer leur salon perso.\n\n` +
      `**📁 Catégorie :** ${catStr}\n\n` +
      `**👥 Limite par défaut :** ${cfg.defaultLimit > 0 ? cfg.defaultLimit + ' pers.' : 'Illimitée'}\n` +
      `**✏️ Template :** \`${cfg.nameTemplate ?? '🎮 {username}'}\`\n` +
      `**✏️ Renommage :** ${cfg.allowRename ? '✅' : '❌'} · ` +
      `**👥 Limite :** ${cfg.allowLimit ? '✅' : '❌'} · ` +
      `**🔒 Verrou :** ${cfg.allowLock ? '✅' : '❌'}`;
  } else {
    detailLines = '> *Module Salons Vocaux Temp non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 6 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/2.png')
          .setDescription('Salons Vocaux Temp')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État du système\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚙️')
    )
  );
  c.addActionRowComponents(buildNavRow(6));
  c.addActionRowComponents(buildPrevNextRow(6));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 7 — Règlement ───────────────────────────────────────────────────────

function buildRulesPage(guild, user) {
  const m = MODULES[6]; // rules
  let detailLines = '';

  if (rulesDB) {
    const cfg = rulesDB.getConfig(guild.id);
    const ready = cfg.enabled && cfg.rulesChannelId && cfg.verifiedRoleId;
    detailLines =
      `${cfg.enabled && cfg.rulesChannelId ? '🟢 Actif' : cfg.rulesChannelId ? '🟡 Désactivé' : '⚠️ Non configuré'}\n\n` +
      `**📢 Salon du règlement :** ${cfg.rulesChannelId ? `<#${cfg.rulesChannelId}>` : '*Non défini*'}\n` +
      `**🔒 Rôle de restriction :** ${cfg.joinRoleId ? `<@&${cfg.joinRoleId}>` : '*Non défini*'}\n` +
      `-# Attribué au join — bloque tous les salons sauf #règlement.\n\n` +
      `**✅ Rôle vérifié :** ${cfg.verifiedRoleId ? `<@&${cfg.verifiedRoleId}>` : '*Non défini*'}\n` +
      `-# Attribué après validation du règlement.\n\n` +
      `**🏷️ Bouton :** \`${cfg.buttonLabel}\`\n` +
      `**📌 Panel :** ${cfg.panelMessageId ? `✅ Posté (ID \`${cfg.panelMessageId}\`)` : '❌ Non posté'}\n` +
      `**📝 Texte :** ${cfg.rulesText.length} caractères`;
  } else {
    detailLines = '> *Module Règlement non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 7 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/4.png')
          .setDescription('Règlement')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État du système\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📜')
    )
  );
  c.addActionRowComponents(buildNavRow(7));
  c.addActionRowComponents(buildPrevNextRow(7));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Page 8 — Minecraft Status ────────────────────────────────────────────────

function buildMCPage(guild, user) {
  const m = MODULES[7]; // minecraft
  let detailLines = '';

  if (mcDB) {
    const cfg = mcDB.getConfig(guild.id);
    detailLines =
      `${cfg.enabled && cfg.serverIp && cfg.statusChannelId ? '🟢' : cfg.serverIp ? '🟡' : '🔴'} Système **${cfg.enabled && cfg.serverIp ? 'actif' : 'inactif'}**\n` +
      `📡 Serveur : ${cfg.serverIp ? `\`${cfg.serverIp}:${cfg.port}\`` : '*Non configuré*'}\n` +
      `📢 Salon statut : ${cfg.statusChannelId ? `<#${cfg.statusChannelId}>` : '*Non défini*'}\n` +
      `🔔 Rôle notif : ${cfg.notificationRoleId ? `<@&${cfg.notificationRoleId}>` : '*Désactivé*'}\n` +
      `⏱️ Intervalle : **${cfg.checkInterval}s**\n` +
      `📨 Notif join/leave : ${cfg.notifyJoin ? '✅' : '❌'} / ${cfg.notifyLeave ? '✅' : '❌'}\n` +
      `📣 Notif en ligne/hors ligne : ${cfg.notifyOnline ? '✅' : '❌'} / ${cfg.notifyOffline ? '✅' : '❌'}`;
  } else {
    detailLines = '> *Module Minecraft non disponible*';
  }

  const c = new ContainerBuilder().setAccentColor(m.color);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ${m.emoji} ${m.label}\n` +
          `-# Page 8 / ${MODULES.length} · \`${m.cmd}\``
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/2.png')
          .setDescription('Minecraft Status')
      )
  );
  c.addSeparatorComponents(sep(true));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📡 État du système\n${detailLines}`)
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ℹ️ À propos\n${m.desc}\n\n` +
      `**Commande principale :** \`${m.cmd}\`\n` +
      `**Aliases :** ${m.aliases.map(a => `\`${a}\``).join(' · ')}`
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(m.openId)
        .setLabel(`Ouvrir ${m.cmd}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⛏️')
    )
  );
  c.addActionRowComponents(buildNavRow(8));
  c.addActionRowComponents(buildPrevNextRow(8));
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · Expire dans 5 min`)
  );
  return c;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

function getPage(idx, guild, user) {
  switch (idx) {
    case 1:  return buildCountersPage(guild, user);
    case 2:  return buildLogsPage(guild, user);
    case 3:  return buildTicketsPage(guild, user);
    case 4:  return buildFreeGamesPage(guild, user);
    case 5:  return buildAdminPage(guild, user);
    case 6:  return buildTempVoicePage(guild, user);
    case 7:  return buildRulesPage(guild, user);
    case 8:  return buildMCPage(guild, user);
    default: return buildSummary(guild, user);
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  name:        'config',
  aliases:     ['cfg', 'conf', 'configuration', 'setup', 'panel'],
  description: 'Dashboard centralisé de configuration (compteurs, logs, tickets)',
  adminOnly:   true,

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ❌ Permission insuffisante\n' +
                'Tu dois avoir **Gérer le serveur** pour accéder à cette commande.'
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // Raccourci via arg : .config sconfig | .config logs | .config tickets | .config fgconfig
    const SHORTCUTS = {
      sconfig: 1, counters: 1, compteurs: 1, statsconfig: 1,
      lconfig: 2, logs: 2,     logconfig: 2,
      tconfig: 3, tickets: 3,  ticket: 3,    ticketconfig: 3,
      fgconfig: 4, freegames: 4, jeux: 4, fg: 4, freeconfig: 4,
      aconfig: 5, admin: 5, adminconfig: 5, acfg: 5, admincfg: 5,
      vcconfig: 6, vc: 6, voiceconfig: 6, tempvoice: 6, tvc: 6, vocal: 6,
      rconfig: 7, rules: 7, reglement: 7, rc: 7, rulesconfig: 7,
      mcconfig: 8, mc: 8, minecraft: 8, mcstatus: 8, mcs: 8,
    };
    let pageIdx = SHORTCUTS[args[0]?.toLowerCase()] ?? 0;

    const reply = await message.reply({
      components: [getPage(pageIdx, message.guild, message.author)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 300_000,
    });

    collector.on('collect', async (i) => {
      try {
        // ── Select menu ──────────────────────────────────────────────────────
        if (i.customId === 'config_nav') {
          const val = i.values[0];
          const MAP = { summary: 0, counters: 1, logs: 2, tickets: 3, freegames: 4, admin: 5, tempvoice: 6, rules: 7, minecraft: 8 };
          pageIdx = MAP[val] ?? 0;
          return i.update({
            components: [getPage(pageIdx, message.guild, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // ── Sommaire ─────────────────────────────────────────────────────────
        if (i.customId === 'config_summary') {
          pageIdx = 0;
          return i.update({
            components: [getPage(0, message.guild, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // ── Précédent ────────────────────────────────────────────────────────
        if (i.customId === 'config_prev') {
          pageIdx = Math.max(0, pageIdx - 1);
          return i.update({
            components: [getPage(pageIdx, message.guild, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // ── Suivant ──────────────────────────────────────────────────────────
        if (i.customId === 'config_next') {
          pageIdx = Math.min(TOTAL_PAGES - 1, pageIdx + 1);
          return i.update({
            components: [getPage(pageIdx, message.guild, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // ── Ouvrir dashboard ─────────────────────────────────────────────────
        const OPEN_MAP = {
          config_open_sconfig:   'sconfig',
          config_open_lconfig:   'lconfig',
          config_open_tconfig:   'tconfig',
          config_open_fgconfig:  'fgconfig',
          config_open_aconfig:   'aconfig',
          config_open_vcconfig:  'vcconfig',
          config_open_rconfig:   'rconfig',
          config_open_mcconfig:  'mcconfig',
        };
        if (OPEN_MAP[i.customId]) {
          await i.deferUpdate();
          const cmd = client.commands?.get(OPEN_MAP[i.customId]);
          if (cmd) {
            cmd.execute(message, [], client).catch(err =>
              console.error(`[config] open ${OPEN_MAP[i.customId]}:`, err.message)
            );
          } else {
            console.warn(`[config] Commande ${OPEN_MAP[i.customId]} non trouvée`);
          }
          return;
        }

      } catch (err) {
        console.error('[config] Erreur collector:', err.message);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ⚙️ Configuration\n-# *Session expirée — relance \`.config\` pour continuer.*'
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
