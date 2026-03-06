// commands/tconfig.js — .tconfig
// Dashboard interactif de configuration complète des tickets — Components V2
// Sections : overview, channels, roles, tags, messages, behavior, advanced, actions

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const db = require('../tickets/ticketDB.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ON  = '🟢';
const OFF = '🔴';
function tog(val)   { return val ? ON : OFF; }
function si(val)    { return val ? '✅' : '❌'; }
function cm(id)     { return id ? `<#${id}>` : '*Non défini*'; }
function rm(id)     { return id ? `<@&${id}>` : '*Non défini*'; }
function preview(s) { return s?.trim() ? `> ${s.replace(/\n/g, '\n> ').slice(0, 200)}` : '*Message par défaut*'; }

const VIEWS = [
  { v: 'overview',  label: 'Vue d\'ensemble',        emoji: '📊', desc: 'Statut global' },
  { v: 'channels',  label: 'Salons & Catégorie',     emoji: '📁', desc: 'Catégorie, logs, panel' },
  { v: 'roles',     label: 'Rôle & Limites',         emoji: '🛡️', desc: 'Rôle staff, max tickets' },
  { v: 'tags',      label: 'Tags / Raisons',         emoji: '🏷️', desc: 'Raisons d\'ouverture' },
  { v: 'messages',  label: 'Messages',               emoji: '💬', desc: 'Accueil, fermeture, panel' },
  { v: 'behavior',  label: 'Comportement',           emoji: '⚙️', desc: 'Ping, raison, transcript' },
  { v: 'advanced',  label: 'Avancé',                 emoji: '🔧', desc: 'Nommage, auto-close, catégories' },
  { v: 'actions',   label: 'Actions & Outils',       emoji: '🛠️', desc: 'Setup, reset, panel' },
];

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tconfig_nav')
      .setPlaceholder('📂 Naviguer...')
      .addOptions(
        VIEWS.map(({ v, label, emoji, desc }) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(label).setValue(v)
            .setDescription(desc).setEmoji(emoji)
            .setDefault(v === current)
        )
      )
  );
}

function sep() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }

// ─── Sections du dashboard ────────────────────────────────────────────────────

function buildOverview(config, guildName) {
  const ready = config.categoryId && config.logChannelId;
  const c = new ContainerBuilder().setAccentColor(ready ? 0x57f287 : 0xfee75c);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚙️ Config Tickets — ${guildName}\n` +
        `-# ${ready ? '✅ Système opérationnel' : '⚠️ Configuration incomplète'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/4.png').setDescription('Config'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📁 Catégorie**          ${si(config.categoryId)} ${cm(config.categoryId)}\n` +
    `**📁 Catég. fermés**      ${si(config.closedCategoryId)} ${cm(config.closedCategoryId)}\n` +
    `**📋 Logs & Transcripts** ${si(config.logChannelId)} ${cm(config.logChannelId)}\n` +
    `-# Chaque ticket = 1 thread (résumé + transcript HTML à la fermeture)\n` +
    `**🛡️ Staff**              ${si(config.supportRoleId)} ${rm(config.supportRoleId)}\n` +
    `**👁️ Viewer**             ${si(config.viewerRoleId)} ${rm(config.viewerRoleId)}\n` +
    `**⚔️ Claim**              ${si(config.claimRoleId)} ${rm(config.claimRoleId)}\n` +
    `**🔢 Max tickets**        **${config.maxOpen}** par user\n` +
    `**🏷️ Tags**               ${config.tags.length ? config.tags.map(t => `\`${t}\``).join(' · ') : '*Aucun*'}\n` +
    `**📣 Ping staff**         ${tog(config.pingOnOpen)}\n` +
    `**❓ Raison obligatoire** ${tog(config.requireReason)}\n` +
    `**📄 Transcript auto**    ${tog(config.transcriptOnClose)} *(thread HTML)*\n` +
    `**⏱️ Auto-close**         ${config.autoCloseHours > 0 ? `**${config.autoCloseHours}h** d'inactivité` : '*Désactivé*'}\n` +
    `**🗑️ Suppression auto**   ${(config.closedDeleteHours ?? 24) > 0 ? `**${config.closedDeleteHours ?? 24}h** après fermeture` : '*Désactivée*'}\n` +
    `**✏️ Nommage salon**      \`${config.ticketNaming}\``
  ));

  if (!ready) {
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> ⚠️ **Actions requises :**\n` +
      (!config.categoryId   ? `> • Définis la catégorie tickets (**Salons & Catégorie** → Setup auto)\n` : '') +
      (!config.logChannelId ? `> • Définis un salon de logs (**Salons & Catégorie**)\n` : '') +
      (!config.supportRoleId ? `> • Définis le rôle support (**Rôle & Limites**)\n` : '')
    ));
  }

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('overview'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

function buildChannels(config) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📁 Salons & Catégories\n-# Configuration des salons Discord pour les tickets`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/1.png').setDescription('Salons'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📁 Catégorie (tickets ouverts)**\n${si(config.categoryId)} ${cm(config.categoryId)}\n` +
    `-# Nom actuel : \`${config.categoryName || '📋 Tickets'}\`\n\n` +
    `**📁 Catégorie (tickets fermés)**\n${si(config.closedCategoryId)} ${cm(config.closedCategoryId)}\n` +
    `-# Nom actuel : \`${config.closedCategoryName || '📁 Tickets Fermés'}\`\n\n` +
    `**📋 Salon logs & transcripts**\n${si(config.logChannelId)} ${cm(config.logChannelId)}\n` +
    `-# Nom actuel : \`${config.logChannelName || '📋-ticket-logs'}\`\n\n` +
    `**📌 Salon du panel**\n${si(config.panelChannelId)} ${cm(config.panelChannelId)}\n` +
    `-# Nom actuel : \`${config.panelChannelName || '🎫-tickets'}\``
  ));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `> 💡 **Commandes rapides :**\n` +
    `> \`.tconfig category #salon\` · \`.tconfig logs #salon\`\n` +
    `> Ou utilise les boutons ci-dessous pour définir chaque salon directement.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('channels'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_setup_go').setLabel('Setup automatique').setStyle(ButtonStyle.Success).setEmoji('✨'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Modifier salons :**'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_set_category').setLabel('Catégorie ouverts').setStyle(ButtonStyle.Secondary).setEmoji('📁'),
    new ButtonBuilder().setCustomId('tconfig_set_closedcat').setLabel('Catégorie fermés').setStyle(ButtonStyle.Secondary).setEmoji('📂'),
    new ButtonBuilder().setCustomId('tconfig_set_logs').setLabel('Salon logs/transcripts').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('tconfig_set_panel').setLabel('Salon panel').setStyle(ButtonStyle.Secondary).setEmoji('📌'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Renommer les salons et catégories :**'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_rename_cat').setLabel('Catég. ouverts').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('tconfig_rename_closedcat').setLabel('Catég. fermés').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('tconfig_rename_logs').setLabel('Salon logs').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('tconfig_rename_panel').setLabel('Salon panel').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildRoles(config) {
  const mentionList = config.mentionRoles?.length
    ? config.mentionRoles.map(r => `<@&${r}>`).join(' ')
    : '*Aucun*';

  const c = new ContainerBuilder().setAccentColor(0xfee75c);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🛡️ Rôles & Accès\n-# Contrôle qui voit et gère les tickets`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/2.png').setDescription('Rôles'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🛡️ Rôle staff (gestion complète)**\n${si(config.supportRoleId)} ${rm(config.supportRoleId)}\n` +
    `-# Peut voir, claim, fermer et gérer tous les tickets\n\n` +
    `**👁️ Rôle viewer (lecture seule)**\n${si(config.viewerRoleId)} ${rm(config.viewerRoleId)}\n` +
    `-# Peut lire les tickets sans pouvoir écrire ni les gérer\n\n` +
    `**⚔️ Rôle claim** *(optionnel)*\n${si(config.claimRoleId)} ${rm(config.claimRoleId)}\n` +
    `-# Peut claim les tickets (si différent du staff)\n\n` +
    `**📣 Rôles mentionnés à l'ouverture**\n${mentionList}\n` +
    `-# Pingués en plus du rôle staff quand un ticket est ouvert\n\n` +
    `**🔢 Max tickets ouverts par utilisateur**\n📊 Valeur actuelle : **${config.maxOpen}**`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('roles'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_max_1').setLabel('Max: 1').setStyle(config.maxOpen === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_max_3').setLabel('Max: 3').setStyle(config.maxOpen === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_max_5').setLabel('Max: 5').setStyle(config.maxOpen === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_max_10').setLabel('Max: 10').setStyle(config.maxOpen === 10 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Modifier les rôles :**'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_set_support').setLabel('Rôle staff').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('tconfig_set_viewer').setLabel('Rôle viewer').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
    new ButtonBuilder().setCustomId('tconfig_set_claim').setLabel('Rôle claim').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
    new ButtonBuilder().setCustomId('tconfig_set_mention').setLabel('Rôles ping').setStyle(ButtonStyle.Secondary).setEmoji('📣'),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_clear_viewer').setLabel('Retirer viewer').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('tconfig_clear_claim').setLabel('Retirer claim').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('tconfig_clear_mention').setLabel('Vider pings').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildTags(config) {
  const c = new ContainerBuilder().setAccentColor(0xeb459e);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🏷️ Tags / Raisons d'ouverture\n-# ${config.tags.length}/25 tags configurés`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/3.png').setDescription('Tags'))
  );
  c.addSeparatorComponents(sep());

  if (config.tags.length) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      config.tags.map((t, i) => `**${i + 1}.** \`${t}\``).join('\n')
    ));

    // Boutons de suppression individuels (max 5 par ActionRow, plusieurs lignes si besoin)
    const tagChunks = [];
    for (let i = 0; i < config.tags.length; i += 5) tagChunks.push(config.tags.slice(i, i + 5));
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Supprimer un tag :**'));
    for (const chunk of tagChunks) {
      c.addActionRowComponents(new ActionRowBuilder().addComponents(
        ...chunk.map(t =>
          new ButtonBuilder()
            .setCustomId(`tconfig_deltag_${Buffer.from(t).toString('base64').slice(0, 80)}`)
            .setLabel(t.length > 20 ? t.slice(0, 19) + '…' : t)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
        )
      ));
    }
  } else {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '> *Aucun tag configuré — les tickets s\'ouvriront avec le tag "Général" par défaut.*'
    ));
  }

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('tags'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_tags_add').setLabel('Ajouter des tags').setStyle(ButtonStyle.Success).setEmoji('➕'),
    new ButtonBuilder().setCustomId('tconfig_tags_reset').setLabel('Restaurer défaut').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId('tconfig_tags_clear').setLabel('Tout supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildMessages(config) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 💬 Messages personnalisables\n-# Modifie tous les messages envoyés par le bot dans les tickets`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/0.png').setDescription('Messages'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📩 Embed d'accueil** *(affiché dans le ticket à l'ouverture)*\n` +
    `Variables : \`{user}\` \`{tag}\` \`{reason}\` \`{num}\`\n` +
    preview(config.welcomeMessage)
  ));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**💬 Message textuel d'ouverture** *(envoyé après l'embed, en texte brut)*\n` +
    `Variables : \`{user}\` \`{tag}\` \`{reason}\` \`{num}\`\n` +
    preview(config.openMessage)
  ));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🔒 Message de fermeture** *(affiché lors de la fermeture)*\n` +
    `Variables : \`{user}\` \`{staff}\` \`{num}\` \`{tag}\`\n` +
    preview(config.closeMessage)
  ));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📌 Panel — Titre & Description**\n` +
    `Titre : ${config.panelTitle?.trim() ? `\`${config.panelTitle}\`` : '*Titre par défaut*'}\n` +
    `Description :\n${preview(config.panelDescription)}`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('messages'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_msg_welcome').setLabel('Éditer accueil').setStyle(ButtonStyle.Primary).setEmoji('📩'),
    new ButtonBuilder().setCustomId('tconfig_msg_open').setLabel('Éditer msg ouverture').setStyle(ButtonStyle.Primary).setEmoji('💬'),
    new ButtonBuilder().setCustomId('tconfig_msg_close').setLabel('Éditer fermeture').setStyle(ButtonStyle.Primary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('tconfig_msg_panel').setLabel('Éditer panel').setStyle(ButtonStyle.Secondary).setEmoji('📌'),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_msg_welcome_reset').setLabel('Reset accueil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('tconfig_msg_open_reset').setLabel('Reset ouverture').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('tconfig_msg_close_reset').setLabel('Reset fermeture').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('tconfig_msg_panel_reset').setLabel('Reset panel').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildBehavior(config) {
  const c = new ContainerBuilder().setAccentColor(0xfee75c);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚙️ Comportement du système\n-# Fonctionnalités automatiques et options`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/2.png').setDescription('Comportement'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `${tog(config.pingOnOpen)} **Ping rôle support à l'ouverture**\n` +
    `-# Mentionne le rôle staff quand un ticket est ouvert\n\n` +
    `${tog(config.requireReason)} **Raison obligatoire**\n` +
    `-# Oblige l'utilisateur à saisir une raison via un modal avant l'ouverture\n\n` +
    `${tog(config.transcriptOnClose)} **Transcript automatique à la fermeture**\n` +
    `-# Crée un thread dans le salon logs avec le résumé et le fichier HTML`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('behavior'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tconfig_toggle_ping')
      .setLabel(config.pingOnOpen ? 'Désactiver ping staff' : 'Activer ping staff')
      .setStyle(config.pingOnOpen ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(config.pingOnOpen ? '🔕' : '🔔'),
    new ButtonBuilder()
      .setCustomId('tconfig_toggle_reason')
      .setLabel(config.requireReason ? 'Désactiver raison obligatoire' : 'Activer raison obligatoire')
      .setStyle(config.requireReason ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(config.requireReason ? '✖️' : '✅'),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tconfig_toggle_transcript')
      .setLabel(config.transcriptOnClose ? 'Désactiver transcript auto' : 'Activer transcript auto')
      .setStyle(config.transcriptOnClose ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(config.transcriptOnClose ? '📄' : '📋'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildAdvanced(config) {
  const autoClose = config.autoCloseHours > 0 ? `**${config.autoCloseHours}h** d'inactivité` : '*Désactivé*';
  const autoDelete = (config.closedDeleteHours ?? 24) > 0 ? `**${config.closedDeleteHours ?? 24}h** après fermeture` : '*Désactivé*';
  const c = new ContainerBuilder().setAccentColor(0x99aab5);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🔧 Paramètres avancés\n-# Nommage, auto-close, suppression auto, catégories`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/5.png').setDescription('Avancé'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**✏️ Schéma de nommage des salons**\n` +
    `Valeur actuelle : \`${config.ticketNaming}\`\n` +
    `-# Variables : \`{num}\` \`{username}\` \`{tag}\`\n` +
    `-# Exemples : \`ticket-{num}-{username}\`, \`{tag}-{num}\`\n\n` +
    `**⏱️ Fermeture automatique** *(inactivité)*\n` +
    `${autoClose}\n` +
    `-# Ferme les tickets sans activité pendant N heures (0 = désactivé)\n\n` +
    `**🗑️ Suppression automatique des tickets fermés**\n` +
    `${autoDelete}\n` +
    `-# Supprime définitivement le salon N heures après fermeture (0 = désactivé, défaut : 24h)\n\n` +
    `**📁 Catégorie tickets fermés**\n${si(config.closedCategoryId)} ${cm(config.closedCategoryId)}\n` +
    `-# Les tickets fermés y sont déplacés automatiquement`
  ));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `> 💡 **Commandes :**\n` +
    `> \`.tconfig naming <schéma>\` — changer le schéma de nommage\n` +
    `> \`.tconfig autoclose <heures>\` — fermeture auto (0 = désactiver)\n` +
    `> \`.tconfig closedcat #salon\` — catégorie des tickets fermés`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('advanced'));
  // Boutons auto-close rapides
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**⏱️ Fermeture auto (inactivité) :**'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_ac_0').setLabel('OFF').setStyle(config.autoCloseHours === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_ac_24').setLabel('24h').setStyle(config.autoCloseHours === 24 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_ac_48').setLabel('48h').setStyle(config.autoCloseHours === 48 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_ac_72').setLabel('72h').setStyle(config.autoCloseHours === 72 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_ac_168').setLabel('7j').setStyle(config.autoCloseHours === 168 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_ac_custom').setLabel('Valeur personnalisée…').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
  ));
  // Boutons suppression auto des tickets fermés
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**🗑️ Suppression auto (après fermeture) :**'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_cd_0').setLabel('OFF').setStyle((config.closedDeleteHours ?? 24) === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_cd_12').setLabel('12h').setStyle((config.closedDeleteHours ?? 24) === 12 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_cd_24').setLabel('24h').setStyle((config.closedDeleteHours ?? 24) === 24 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_cd_72').setLabel('72h').setStyle((config.closedDeleteHours ?? 24) === 72 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tconfig_cd_168').setLabel('7j').setStyle((config.closedDeleteHours ?? 24) === 168 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_cd_custom').setLabel('Valeur personnalisée…').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_set_naming').setLabel('Modifier schéma nommage').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('tconfig_set_closedcat').setLabel('Catégorie fermés').setStyle(ButtonStyle.Secondary).setEmoji('📂'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildActions(config) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🛠️ Actions & Outils\n-# Opérations globales sur le système`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/0.png').setDescription('Actions'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**✨ Setup complet automatique**\n` +
    `-# Crée catégorie, logs, transcripts, panel et configure le tout en un clic\n\n` +
    `**📌 Envoyer le panel**\n` +
    `-# Utilise \`.tpanel [#salon]\` pour afficher le bouton d'ouverture\n\n` +
    `**♻️ Réinitialiser la configuration**\n` +
    `-# Remet tous les paramètres à zéro (tickets existants conservés)`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('actions'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tconfig_setup_go').setLabel('Setup complet').setStyle(ButtonStyle.Success).setEmoji('✨'),
    new ButtonBuilder().setCustomId('tconfig_reset_go').setLabel('Réinitialiser tout').setStyle(ButtonStyle.Danger).setEmoji('♻️'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildConfirm(title, desc, confirmId, cancelId, danger = true) {
  return new ContainerBuilder().setAccentColor(danger ? 0xed4245 : 0xfee75c)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${desc}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('Confirmer').setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Annuler').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
    ));
}

function buildInfo(msg, color = 0x5865f2) {
  return new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(msg));
}

// ─── Mise à jour des messages de tickets ouverts après changement de tags ────
// Édite le controlMsgId de tous les tickets ouverts pour refléter le nouvel état.
async function refreshOpenTicketMessages(guild) {
  try {
    const manager = require('../tickets/ticketManager.js');
    const config  = db.getConfig(guild.id);
    const openTickets = db.getAllTickets(guild.id, { status: 'open' });
    for (const ticket of openTickets) {
      await manager.refreshTicketMessage(guild, ticket).catch(() => {});
    }
  } catch (_) {}
}

// ─── Mise à jour automatique du panel après changement de tags ───────────────
// Édite le message panel existant avec la nouvelle liste de tags.
async function refreshPanel(guild, config) {
  try {
    if (!config.panelChannelId || !config.panelMsgId) return;
    const ch = guild.channels.cache.get(config.panelChannelId);
    if (!ch) return;
    const msg = await ch.messages.fetch(config.panelMsgId).catch(() => null);
    if (!msg || !msg.editable) return;

    const { EmbedBuilder } = require('discord.js');
    const tags = config.tags?.length ? config.tags : ['Support', 'Bug', 'Commande', 'Autre'];
    const tagList = tags.map(t => `> 🏷️ **${t}**`).join('\n');
    const panelTitle = config.panelTitle?.trim() || '🎫 Ouvrir un ticket';
    const panelDesc  = config.panelDescription?.trim() ||
      `Bienvenue sur le support de **${guild.name}** !\n\n` +
      `Clique sur le bouton ci-dessous pour ouvrir un ticket.\n` +
      `Un membre du staff vous répondra dès que possible.\n\n` +
      `**Catégories disponibles :**\n${tagList}\n\n` +
      `📌 *Merci de décrire votre problème clairement lors de l'ouverture.*`;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(panelTitle)
      .setDescription(panelDesc)
      .setThumbnail(guild.iconURL({ size: 256, extension: 'png' }) || null)
      .setFooter({ text: `${guild.name} • Support`, iconURL: guild.iconURL({ size: 64 }) || undefined })
      .setTimestamp(msg.embeds[0]?.createdTimestamp ?? null);

    await msg.edit({ embeds: [embed] });
  } catch (_) {} // silencieux si panel introuvable
}

// ─── Dispatch de vue ─────────────────────────────────────────────────────────

function getView(v, config, guildName) {
  switch (v) {
    case 'channels': return buildChannels(config);
    case 'roles':    return buildRoles(config);
    case 'tags':     return buildTags(config);
    case 'messages': return buildMessages(config);
    case 'behavior': return buildBehavior(config);
    case 'advanced': return buildAdvanced(config);
    case 'actions':  return buildActions(config);
    default:         return buildOverview(config, guildName);
  }
}

// ─── Export commande ──────────────────────────────────────────────────────────

module.exports = {
  name: 'tconfig',
  aliases: ['ticketconfig', 'tc'],
  description: 'Configure le système de tickets (admin)',
  refreshPanel,
  refreshOpenTicketMessages,

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Serveur uniquement.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({
        components: [buildInfo('# ❌ Permission insuffisante\nTu dois avoir **Gérer le serveur** pour configurer les tickets.', 0xed4245)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const sub = args[0]?.toLowerCase();
    const TEXT_SUBS = ['category', 'closedcat', 'logs', 'transcripts', 'support', 'maxopen', 'addtag', 'deltag', 'naming', 'autoclose'];

    if (sub && TEXT_SUBS.includes(sub)) {
      return handleTextSub(message, args, sub);
    }

    // Vue initiale selon argument optionnel
    const VIEW_SHORTCUTS = { channels: 'channels', channel: 'channels', roles: 'roles', role: 'roles', tags: 'tags', tag: 'tags', messages: 'messages', message: 'messages', msg: 'messages', behavior: 'behavior', behaviour: 'behavior', advanced: 'advanced', avance: 'advanced', actions: 'actions', setup: 'actions', reset: 'actions' };
    let view = VIEW_SHORTCUTS[sub] || 'overview';

    const freshCfg  = () => db.getConfig(message.guild.id);
    const freshView = (v) => getView(v, freshCfg(), message.guild.name);

    const reply = await message.reply({
      components: [freshView(view)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 300_000,
    });

    collector.on('collect', async (i) => {

      // ── Navigation ────────────────────────────────────────────────────────
      if (i.isStringSelectMenu() && i.customId === 'tconfig_nav') {
        view = i.values[0];
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Max open rapide ───────────────────────────────────────────────────
      if (i.customId.startsWith('tconfig_max_')) {
        db.setConfig(message.guild.id, 'maxOpen', parseInt(i.customId.replace('tconfig_max_', '')));
        return i.update({ components: [freshView('roles')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Auto-close rapide ─────────────────────────────────────────────────
      if (i.customId.startsWith('tconfig_ac_')) {
        db.setConfig(message.guild.id, 'autoCloseHours', parseInt(i.customId.replace('tconfig_ac_', '')));
        return i.update({ components: [freshView('advanced')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Suppression auto tickets fermés (closedDeleteHours) ───────────────
      if (i.customId.startsWith('tconfig_cd_') && i.customId !== 'tconfig_cd_custom') {
        db.setConfig(message.guild.id, 'closedDeleteHours', parseInt(i.customId.replace('tconfig_cd_', '')));
        return i.update({ components: [freshView('advanced')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Valeurs personnalisées auto-close / suppression (modals) ──────────
      if (i.customId === 'tconfig_ac_custom') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_ac_custom').setTitle('Fermeture auto — valeur personnalisée');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ac_hours')
              .setLabel('Nombre d\'heures (0 = désactiver, max 8760)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 6, 12, 36, 96…')
              .setValue(cfg.autoCloseHours > 0 ? String(cfg.autoCloseHours) : '')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(4),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_cd_custom') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_cd_custom').setTitle('Suppression auto — valeur personnalisée');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('cd_hours')
              .setLabel('Nombre d\'heures (0 = désactiver, max 8760)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 6, 12, 36, 96…')
              .setValue((cfg.closedDeleteHours ?? 24) > 0 ? String(cfg.closedDeleteHours ?? 24) : '')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(4),
          )
        );
        return i.showModal(modal);
      }

      // ── Toggles comportement ──────────────────────────────────────────────
      if (i.customId === 'tconfig_toggle_ping') {
        db.setConfig(message.guild.id, 'pingOnOpen', !freshCfg().pingOnOpen);
        return i.update({ components: [freshView('behavior')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_toggle_reason') {
        db.setConfig(message.guild.id, 'requireReason', !freshCfg().requireReason);
        return i.update({ components: [freshView('behavior')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_toggle_transcript') {
        db.setConfig(message.guild.id, 'transcriptOnClose', !freshCfg().transcriptOnClose);
        return i.update({ components: [freshView('behavior')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Modals messages ───────────────────────────────────────────────────
      if (i.customId === 'tconfig_msg_open') {
        const modal = new ModalBuilder().setCustomId('tconfig_modal_open').setTitle('Message textuel d\'ouverture');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('open_text')
              .setLabel('Message textuel (laisser vide = désactivé)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Exemple : Bonjour {user} ! Ticket {tag} ouvert.')
              .setValue(freshCfg().openMessage || '')
              .setRequired(false)
              .setMaxLength(1500),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_msg_welcome') {
        const modal = new ModalBuilder().setCustomId('tconfig_modal_welcome').setTitle('Message d\'accueil du ticket');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('welcome_text')
              .setLabel('Message d\'accueil (laisser vide = défaut)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Bienvenue {user} dans ton ticket {tag} !\nRaison : {reason}')
              .setValue(freshCfg().welcomeMessage || '')
              .setRequired(false)
              .setMaxLength(1500),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_msg_close') {
        const modal = new ModalBuilder().setCustomId('tconfig_modal_close').setTitle('Message de fermeture du ticket');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('close_text')
              .setLabel('Message de fermeture (laisser vide = défaut)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Ticket #{num} fermé par {staff}.')
              .setValue(freshCfg().closeMessage || '')
              .setRequired(false)
              .setMaxLength(1000),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_msg_panel') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_panel').setTitle('Personnaliser le panel');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('panel_title')
              .setLabel('Titre du panel (laisser vide = défaut)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('🎫 Ouvrir un ticket')
              .setValue(cfg.panelTitle || '')
              .setRequired(false)
              .setMaxLength(100),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('panel_desc')
              .setLabel('Description du panel (laisser vide = défaut)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Clique sur le bouton pour ouvrir un ticket...')
              .setValue(cfg.panelDescription || '')
              .setRequired(false)
              .setMaxLength(2000),
          ),
        );
        return i.showModal(modal);
      }

      // ── Reset messages ────────────────────────────────────────────────────
      if (i.customId === 'tconfig_msg_welcome_reset') {
        db.setConfig(message.guild.id, 'welcomeMessage', '');
        return i.update({ components: [freshView('messages')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_msg_open_reset') {
        db.setConfig(message.guild.id, 'openMessage', '');
        return i.update({ components: [freshView('messages')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_msg_close_reset') {
        db.setConfig(message.guild.id, 'closeMessage', '');
        return i.update({ components: [freshView('messages')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_msg_panel_reset') {
        db.setConfig(message.guild.id, 'panelTitle', '');
        db.setConfig(message.guild.id, 'panelDescription', '');
        return i.update({ components: [freshView('messages')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Tags reset/clear/add ──────────────────────────────────────────────
      if (i.customId === 'tconfig_tags_add') {
        const cfg = freshCfg();
        const remaining = 25 - cfg.tags.length;
        if (remaining <= 0) {
          return i.reply({ components: [buildInfo(`# ❌ Maximum atteint\nTu as déjà **25 tags** (limite Discord des menus de sélection).`, 0xed4245)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        const modal = new ModalBuilder().setCustomId('tconfig_modal_addtags').setTitle('Ajouter des tags');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('tags_text')
              .setLabel(`Noms des tags (1 par ligne, max ${remaining} tags)`)
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Support\nBug\nCommande\nAutre')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(500),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_tags_reset') {
        db.setConfig(message.guild.id, 'tags', ['Support', 'Bug', 'Commande', 'Autre']);
        await refreshPanel(message.guild, freshCfg());
        await refreshOpenTicketMessages(message.guild);
        return i.update({ components: [freshView('tags')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_tags_clear') {
        return i.update({ components: [buildConfirm('🗑️ Supprimer tous les tags', '> Tous les tags seront effacés.', 'tconfig_tags_clear_ok', 'tconfig_tags_clear_cancel', true)], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_tags_clear_ok') {
        db.setConfig(message.guild.id, 'tags', []);
        await refreshPanel(message.guild, freshCfg());
        await refreshOpenTicketMessages(message.guild);
        return i.update({ components: [freshView('tags')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_tags_clear_cancel') {
        return i.update({ components: [freshView('tags')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Suppression tag individuel ────────────────────────────────────────
      if (i.customId.startsWith('tconfig_deltag_')) {
        const b64 = i.customId.replace('tconfig_deltag_', '');
        let tagName;
        try { tagName = Buffer.from(b64, 'base64').toString('utf8'); } catch { return; }
        const cfg = freshCfg();
        if (!cfg.tags.includes(tagName)) {
          return i.update({ components: [freshView('tags')], flags: MessageFlags.IsComponentsV2 });
        }
        db.removeTag(message.guild.id, tagName);
        await refreshPanel(message.guild, freshCfg());
        await refreshOpenTicketMessages(message.guild);
        return i.update({ components: [freshView('tags')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Boutons "Modifier" par paramètre → ouvrent un modal ──────────────────
      const SET_MODALS = {
        tconfig_set_category:    { id: 'tconfig_modal_set_category',   title: 'Catégorie tickets ouverts',  label: 'ID de la catégorie',                ph: 'Ex: 1234567890123456789',     key: 'categoryId' },
        tconfig_set_closedcat:   { id: 'tconfig_modal_set_closedcat',  title: 'Catégorie tickets fermés',   label: 'ID de la catégorie',                ph: 'Ex: 1234567890123456789',     key: 'closedCategoryId' },
        tconfig_set_logs:        { id: 'tconfig_modal_set_logs',       title: 'Salon logs & transcripts',   label: 'ID ou mention du salon (#logs)',     ph: 'Ex: 1234567890123456789',     key: 'logChannelId' },
        tconfig_set_panel:       { id: 'tconfig_modal_set_panel',      title: 'Salon du panel',             label: 'ID ou mention du salon panel',      ph: 'Ex: 1234567890123456789',     key: 'panelChannelId' },
        tconfig_set_support:     { id: 'tconfig_modal_set_support',    title: 'Rôle staff',                 label: 'ID du rôle staff',                  ph: 'Ex: 1234567890123456789',     key: 'supportRoleId' },
        tconfig_set_viewer:      { id: 'tconfig_modal_set_viewer',     title: 'Rôle viewer (lecture seule)','label': 'ID du rôle viewer',               ph: 'Ex: 1234567890123456789',     key: 'viewerRoleId' },
        tconfig_set_claim:       { id: 'tconfig_modal_set_claim',      title: 'Rôle claim',                 label: 'ID du rôle claim',                  ph: 'Ex: 1234567890123456789',     key: 'claimRoleId' },
        tconfig_set_mention:     { id: 'tconfig_modal_set_mention',    title: 'Rôles mentionnés à l\'ouverture', label: 'IDs séparés par des virgules', ph: 'Ex: 123456789, 987654321',   key: 'mentionRoles' },
        tconfig_set_naming:      { id: 'tconfig_modal_set_naming',     title: 'Schéma de nommage',          label: 'Schéma ({num}, {username}, {tag})', ph: 'Ex: ticket-{num}-{username}', key: 'ticketNaming' },
      };
      if (SET_MODALS[i.customId]) {
        const m = SET_MODALS[i.customId];
        const modal = new ModalBuilder().setCustomId(m.id).setTitle(m.title);
        const isMulti = i.customId === 'tconfig_set_mention';
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('set_value')
              .setLabel(m.label)
              .setStyle(isMulti ? TextInputStyle.Paragraph : TextInputStyle.Short)
              .setPlaceholder(m.ph)
              .setRequired(true)
              .setMaxLength(isMulti ? 500 : 100),
          )
        );
        return i.showModal(modal);
      }

      // ── Clear rôles optionnels ────────────────────────────────────────────
      if (i.customId === 'tconfig_clear_viewer') {
        db.setConfig(message.guild.id, 'viewerRoleId', null);
        return i.update({ components: [freshView('roles')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_clear_claim') {
        db.setConfig(message.guild.id, 'claimRoleId', null);
        return i.update({ components: [freshView('roles')], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'tconfig_clear_mention') {
        db.setConfig(message.guild.id, 'mentionRoles', []);
        return i.update({ components: [freshView('roles')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Renommer les catégories ───────────────────────────────────────────
      if (i.customId === 'tconfig_rename_cat') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_rename_cat').setTitle('Renommer la catégorie tickets ouverts');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('cat_name')
              .setLabel('Nouveau nom de la catégorie')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 📋 Tickets Support')
              .setValue(cfg.categoryName || '📋 Tickets')
              .setRequired(true)
              .setMaxLength(100),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_rename_closedcat') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_rename_closedcat').setTitle('Renommer la catégorie tickets fermés');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('closedcat_name')
              .setLabel('Nouveau nom de la catégorie')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 📁 Archives Tickets')
              .setValue(cfg.closedCategoryName || '📁 Tickets Fermés')
              .setRequired(true)
              .setMaxLength(100),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_rename_logs') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_rename_logs').setTitle('Renommer le salon logs');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('logs_name')
              .setLabel('Nouveau nom du salon logs')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 📋-ticket-logs')
              .setValue(cfg.logChannelName || '📋-ticket-logs')
              .setRequired(true)
              .setMaxLength(100),
          )
        );
        return i.showModal(modal);
      }

      if (i.customId === 'tconfig_rename_panel') {
        const cfg = freshCfg();
        const modal = new ModalBuilder().setCustomId('tconfig_modal_rename_panel_ch').setTitle('Renommer le salon panel');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('panel_ch_name')
              .setLabel('Nouveau nom du salon panel')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 🎫-tickets')
              .setValue(cfg.panelChannelName || '🎫-tickets')
              .setRequired(true)
              .setMaxLength(100),
          )
        );
        return i.showModal(modal);
      }

      // ── Setup complet ─────────────────────────────────────────────────────
      if (i.customId === 'tconfig_setup_go') {
        return i.update({
          components: [buildConfirm(
            '✨ Setup complet automatique',
            '> Je vais créer :\n> • Catégorie **📋 Tickets** (tickets ouverts)\n> • Catégorie **📁 Tickets Fermés**\n> • Salon **📋-ticket-logs** (logs + threads transcripts, staff seulement)\n> • Salon **🎫-tickets** (panel visible par tous) + bouton d\'ouverture\n\nContinuer ?',
            'tconfig_setup_confirm', 'tconfig_setup_cancel', false
          )],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (i.customId === 'tconfig_setup_confirm') {
        await i.deferUpdate();
        try {
          const cfg0          = freshCfg();
          const catName       = cfg0.categoryName       || '📋 Tickets';
          const catClosedName = cfg0.closedCategoryName || '📁 Tickets Fermés';
          const logChanName   = cfg0.logChannelName     || '📋-ticket-logs';
          const panelChanName = cfg0.panelChannelName   || '🎫-tickets';
          const existing      = message.guild.channels.cache;

          // ── Anti-redondance : réutiliser les salons/catégories déjà existants ─
          let cat = (cfg0.categoryId && existing.get(cfg0.categoryId)) ||
                    existing.find(c => c.type === ChannelType.GuildCategory && c.name === catName) ||
                    await message.guild.channels.create({ name: catName, type: ChannelType.GuildCategory, permissionOverwrites: [{ id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] }] });

          let catClosed = (cfg0.closedCategoryId && existing.get(cfg0.closedCategoryId)) ||
                          existing.find(c => c.type === ChannelType.GuildCategory && c.name === catClosedName) ||
                          await message.guild.channels.create({ name: catClosedName, type: ChannelType.GuildCategory, permissionOverwrites: [{ id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] }] });

          let logs = (cfg0.logChannelId && existing.get(cfg0.logChannelId)) ||
                     existing.find(c => c.type === ChannelType.GuildText && c.name === logChanName) ||
                     await message.guild.channels.create({ name: logChanName, type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: [{ id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] }] });

          let panelCh = (cfg0.panelChannelId && existing.get(cfg0.panelChannelId)) ||
                        existing.find(c => c.type === ChannelType.GuildText && c.name === panelChanName) ||
                        await message.guild.channels.create({
                          name: panelChanName,
                          type: ChannelType.GuildText,
                          parent: cat.id,
                          permissionOverwrites: [{ id: message.guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }],
                        });

          // Envoyer/mettre à jour le panel
          const cfg = freshCfg();
          const tags = cfg.tags?.length ? cfg.tags : ['Support', 'Bug', 'Commande', 'Autre'];
          const tagList = tags.map(t => `> 🏷️ **${t}**`).join('\n');
          const panelTitle = cfg.panelTitle?.trim() || '🎫 Ouvrir un ticket';
          const panelDesc  = cfg.panelDescription?.trim() ||
            `Bienvenue sur le support de **${message.guild.name}** !\n\nClique sur le bouton ci-dessous pour ouvrir un ticket.\nUn membre du staff vous répondra dès que possible.\n\n**Catégories disponibles :**\n${tagList}\n\n📌 *Merci de décrire votre problème clairement lors de l'ouverture.*`;

          const { EmbedBuilder: Embed, ButtonBuilder: Btn, ActionRowBuilder: Row, ButtonStyle: BS } = require('discord.js');
          const panelEmbed = new Embed().setColor(0x5865f2).setTitle(panelTitle).setDescription(panelDesc)
            .setThumbnail(message.guild.iconURL({ size: 256, extension: 'png' }) || null)
            .setFooter({ text: `${message.guild.name} • Support`, iconURL: message.guild.iconURL({ size: 64 }) || undefined })
            .setTimestamp();
          const panelRow = new Row().addComponents(new Btn().setCustomId('ticket_open').setLabel('Ouvrir un ticket').setStyle(BS.Primary).setEmoji('🎫'));

          // Réutiliser le panel existant ou en créer un nouveau
          let panelMsg = null;
          if (cfg.panelMsgId) {
            panelMsg = await panelCh.messages.fetch(cfg.panelMsgId).catch(() => null);
            if (panelMsg) await panelMsg.edit({ embeds: [panelEmbed], components: [panelRow] }).catch(() => { panelMsg = null; });
          }
          if (!panelMsg) panelMsg = await panelCh.send({ embeds: [panelEmbed], components: [panelRow] });

          // Sauvegarder la config
          db.setConfig(message.guild.id, 'categoryId',        cat.id);
          db.setConfig(message.guild.id, 'closedCategoryId',  catClosed.id);
          db.setConfig(message.guild.id, 'logChannelId',      logs.id);
          db.setConfig(message.guild.id, 'panelChannelId',    panelCh.id);
          db.setConfig(message.guild.id, 'panelMsgId',        panelMsg.id);
          db.setConfig(message.guild.id, 'transcriptOnClose', true);
          db.setConfig(message.guild.id, 'categoryName',      catName);
          db.setConfig(message.guild.id, 'closedCategoryName', catClosedName);
          db.setConfig(message.guild.id, 'logChannelName',    logChanName);
          db.setConfig(message.guild.id, 'panelChannelName',  panelChanName);

          return reply.edit({
            components: [new ContainerBuilder().setAccentColor(0x57f287)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ✅ Setup complet terminé !\n\n` +
                `📋 Catégorie ouverts : **${cat.name}**\n` +
                `📁 Catégorie fermés  : **${catClosed.name}**\n` +
                `📋 Logs & Transcripts : ${logs}\n` +
                `-# Chaque ticket crée un thread dans ce salon\n` +
                `🎫 Panel : ${panelCh} *(bouton d'ouverture envoyé !)*\n\n` +
                `-# Prochaine étape : configure le rôle support dans **Rôle & Limites**`
              ))
              .addSeparatorComponents(sep())
              .addActionRowComponents(buildNavRow('channels'))
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (e) {
          return reply.edit({ components: [buildInfo(`# ❌ Erreur\n\`${e.message}\``, 0xed4245)], flags: MessageFlags.IsComponentsV2 });
        }
      }

      if (i.customId === 'tconfig_setup_cancel') {
        return i.update({ components: [freshView('actions')], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Reset total ───────────────────────────────────────────────────────
      if (i.customId === 'tconfig_reset_go') {
        return i.update({
          components: [buildConfirm(
            '♻️ Réinitialiser toute la configuration',
            '> **Tout** sera remis à zéro :\n> • Salons, rôles, tags, messages custom\n> • Comportement, nommage, auto-close\n\n**Les tickets existants ne seront PAS supprimés.**',
            'tconfig_reset_confirm', 'tconfig_reset_cancel', true
          )],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (i.customId === 'tconfig_reset_confirm') {
        const { DEFAULT_CONFIG } = require('../tickets/ticketDB.js');
        for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
          db.setConfig(message.guild.id, k, v);
        }
        return i.update({ components: [freshView('overview')], flags: MessageFlags.IsComponentsV2 });
      }

      if (i.customId === 'tconfig_reset_cancel') {
        return i.update({ components: [freshView('actions')], flags: MessageFlags.IsComponentsV2 });
      }
    });

    // Résoudre les modaux (après showModal, l'interaction sort du collector → on gère dans index.js)

    collector.on('end', () => {
      reply.edit({
        components: [new ContainerBuilder().setAccentColor(0x99aab5)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚙️ Config Tickets — expiré\n-# Relance avec \`.tconfig\``))
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};

// ─── Sous-commandes texte rapides ─────────────────────────────────────────────

async function handleTextSub(message, args, sub) {
  const config = db.getConfig(message.guild.id);

  function ok(msg)  { return message.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ Mis à jour\n${msg}`))], flags: MessageFlags.IsComponentsV2 }); }
  function err(msg) { return message.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Erreur\n${msg}`))], flags: MessageFlags.IsComponentsV2 }); }

  if (sub === 'category') {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch || ch.type !== ChannelType.GuildCategory) return err('Mentionne une **catégorie** Discord.');
    db.setConfig(message.guild.id, 'categoryId', ch.id);
    return ok(`Catégorie tickets ouverts → **${ch.name}**`);
  }

  if (sub === 'closedcat') {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch || ch.type !== ChannelType.GuildCategory) return err('Mentionne une **catégorie** Discord.');
    db.setConfig(message.guild.id, 'closedCategoryId', ch.id);
    return ok(`Catégorie tickets fermés → **${ch.name}**`);
  }

  if (sub === 'logs') {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch || ch.type !== ChannelType.GuildText) return err('Mentionne un salon **textuel**.');
    db.setConfig(message.guild.id, 'logChannelId', ch.id);
    return ok(`Salon de logs → ${ch}`);
  }

  if (sub === 'transcripts') {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch || ch.type !== ChannelType.GuildText) return err('Mentionne un salon **textuel**.');
    db.setConfig(message.guild.id, 'transcriptChannelId', ch.id);
    return ok(`Salon de transcripts → ${ch}`);
  }

  if (sub === 'support') {
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
    if (!role) return err('Mentionne ou donne l\'ID d\'un rôle.');
    db.setConfig(message.guild.id, 'supportRoleId', role.id);
    return ok(`Rôle support → ${role}`);
  }

  if (sub === 'maxopen') {
    const n = parseInt(args[1]);
    if (isNaN(n) || n < 1 || n > 10) return err('Valeur entre **1** et **10**.');
    db.setConfig(message.guild.id, 'maxOpen', n);
    return ok(`Maximum de tickets ouverts → **${n}** par utilisateur`);
  }

  if (sub === 'naming') {
    const pattern = args.slice(1).join(' ').trim();
    if (!pattern || pattern.length > 80) return err('Schéma invalide (1-80 caractères). Variables: `{num}` `{username}` `{tag}`');
    if (!pattern.includes('{num}') && !pattern.includes('{username}') && !pattern.includes('{tag}')) {
      return err('Le schéma doit contenir au moins une variable : `{num}`, `{username}` ou `{tag}`');
    }
    db.setConfig(message.guild.id, 'ticketNaming', pattern);
    return ok(`Schéma de nommage → \`${pattern}\``);
  }

  if (sub === 'autoclose') {
    const n = parseInt(args[1]);
    if (isNaN(n) || n < 0 || n > 720) return err('Valeur entre **0** (désactivé) et **720** heures.');
    db.setConfig(message.guild.id, 'autoCloseHours', n);
    return ok(n === 0 ? 'Auto-close **désactivé**.' : `Auto-close → **${n}h** d'inactivité`);
  }

  if (sub === 'addtag') {
    const tag = args.slice(1).join(' ').trim();
    if (!tag || tag.length > 50) return err('Nom invalide (1-50 caractères).');
    if (config.tags.includes(tag)) return err(`Le tag \`${tag}\` existe déjà.`);
    if (config.tags.length >= 25) return err('Maximum **25 tags** (limite Discord).');
    db.addTag(message.guild.id, tag);
    const fresh = db.getConfig(message.guild.id);
    await refreshPanel(message.guild, fresh).catch(() => {});
    await refreshOpenTicketMessages(message.guild).catch(() => {});
    return ok(`Tag \`${tag}\` ajouté. (${fresh.tags.length}/25)`);
  }

  if (sub === 'deltag') {
    const tag = args.slice(1).join(' ').trim();
    if (!config.tags.includes(tag)) return err(`Tag \`${tag}\` introuvable.`);
    db.removeTag(message.guild.id, tag);
    const fresh = db.getConfig(message.guild.id);
    await refreshPanel(message.guild, fresh).catch(() => {});
    await refreshOpenTicketMessages(message.guild).catch(() => {});
    return ok(`Tag \`${tag}\` supprimé.`);
  }
}
