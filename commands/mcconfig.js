// commands/mcconfig.js — .mcconfig
// Dashboard interactif de configuration du système de statut Minecraft.
// Vues : overview (statut en direct), setup (IP, port, salon, rôle, intervalle)
'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  ChannelType,
} = require('discord.js');

const db      = require('../utils/mcDB.js');
const manager = require('../utils/mcManager.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep(large = false) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}
function si(v) { return v ? '✅' : '❌'; }
function tog(v) { return v ? '🟢 Activé' : '🔴 Désactivé'; }
function cm(id) { return id ? `<#${id}>` : '*Non défini*'; }
function rm(id) { return id ? `<@&${id}>` : '*Désactivé*'; }

const INTERVALS = [
  { value: '15',  label: '15 secondes' },
  { value: '30',  label: '30 secondes' },
  { value: '60',  label: '1 minute'    },
  { value: '120', label: '2 minutes'   },
  { value: '300', label: '5 minutes'   },
];

// ─── Vue OVERVIEW ─────────────────────────────────────────────────────────────

function buildOverview(guild, config) {
  const c = new ContainerBuilder().setAccentColor(0x2ecc71);

  const iconUrl = guild.iconURL({ size: 64, extension: 'png' })
               ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

  const statusStr = config.enabled && config.serverIp && config.statusChannelId
    ? '🟢 Actif'
    : config.serverIp
      ? '🟡 Configuré mais désactivé'
      : '⚠️ Non configuré';

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎮 Minecraft Status\n` +
          `-# Dashboard de suivi de serveur Minecraft · ${statusStr}`
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(iconUrl).setDescription('Icône du serveur')
      )
  );
  c.addSeparatorComponents(sep(true));

  // ── Infos configuration ─────────────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚙️ Configuration actuelle\n` +
      `**Système :** ${tog(config.enabled)}\n` +
      `**Serveur :** ${config.serverIp ? `\`${config.serverIp}:${config.port}\`` : '*Non configuré*'}\n` +
      `**Salon statut :** ${cm(config.statusChannelId)}\n` +
      `**Rôle notifications :** ${rm(config.notificationRoleId)}\n` +
      `**Intervalle :** ${config.checkInterval}s\n` +
      `**Message panel :** ${config.statusMessageId ? `✅ ID \`${config.statusMessageId}\`` : '❌ Non posté'}`
    )
  );
  c.addSeparatorComponents(sep());

  // ── Notifications ───────────────────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🔔 Notifications\n` +
      `${si(config.notifyOnline)} Serveur **en ligne**\n` +
      `${si(config.notifyOffline)} Serveur **hors ligne**\n` +
      `${si(config.notifyJoin)} Joueur **connecté** *(supprimé après ${config.joinNotifDuration}s)*\n` +
      `${si(config.notifyLeave)} Joueur **déconnecté** *(supprimé après ${config.leaveNotifDuration}s)*`
    )
  );
  c.addSeparatorComponents(sep());

  // ── Boutons d'action ────────────────────────────────────────────────────
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mcconfig_toggle')
        .setLabel(config.enabled ? 'Désactiver' : 'Activer')
        .setEmoji(config.enabled ? '🔴' : '🟢')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mcconfig_force_refresh')
        .setLabel('Rafraîchir le panel')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!config.enabled || !config.serverIp || !config.statusChannelId),
      new ButtonBuilder()
        .setCustomId('mcconfig_clear_panel')
        .setLabel('Supprimer le panel')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!config.statusMessageId),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Nav ─────────────────────────────────────────────────────────────────
  c.addActionRowComponents(buildNavRow('overview'));
  return c;
}

// ─── Vue SETUP ───────────────────────────────────────────────────────────────

function buildSetup(guild, config) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# 🔧 Configuration · Minecraft Status\n` +
      `-# Configurer le serveur à surveiller et les paramètres de notification`
    )
  );
  c.addSeparatorComponents(sep(true));

  // ── Serveur ─────────────────────────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📡 Serveur\n` +
      `**Adresse IP :** ${config.serverIp ? `\`${config.serverIp}\`` : '*Non définie*'}\n` +
      `**Port :** \`${config.port}\``
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mcconfig_modal_set_server')
        .setLabel('Définir l\'adresse')
        .setEmoji('📡')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mcconfig_clear_server')
        .setLabel('Effacer')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!config.serverIp),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Salon statut ────────────────────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📢 Salon de statut\n` +
      `**Salon actuel :** ${cm(config.statusChannelId)}`
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mcconfig_modal_set_channel')
        .setLabel('Définir le salon')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mcconfig_create_channel')
        .setLabel('Créer automatiquement')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mcconfig_clear_channel')
        .setLabel('Effacer')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!config.statusChannelId),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Rôle de notification ─────────────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🔔 Rôle de notification\n` +
      `**Rôle actuel :** ${rm(config.notificationRoleId)}`
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mcconfig_modal_set_role')
        .setLabel('Définir le rôle')
        .setEmoji('🔔')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mcconfig_create_role')
        .setLabel('Créer automatiquement')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mcconfig_clear_role')
        .setLabel('Effacer')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!config.notificationRoleId),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Intervalle de vérification ───────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⏱️ Intervalle de vérification\n` +
      `**Actuel :** ${config.checkInterval}s`
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('mcconfig_interval')
        .setPlaceholder(`⏱️ Intervalle actuel : ${config.checkInterval}s`)
        .addOptions(
          INTERVALS.map(opt =>
            new StringSelectMenuOptionBuilder()
              .setLabel(opt.label)
              .setValue(opt.value)
              .setDefault(String(config.checkInterval) === opt.value)
          )
        )
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mcconfig_modal_custom_interval')
        .setLabel('Intervalle personnalisé')
        .setEmoji('⌨️')
        .setStyle(ButtonStyle.Secondary),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Toggles notifications ─────────────────────────────────────────────────
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 🔔 Activer/désactiver les notifications`)
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mcconfig_toggle_notify_online')
        .setLabel('En ligne')
        .setEmoji(config.notifyOnline ? '🟢' : '⚫')
        .setStyle(config.notifyOnline ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mcconfig_toggle_notify_offline')
        .setLabel('Hors ligne')
        .setEmoji(config.notifyOffline ? '🔴' : '⚫')
        .setStyle(config.notifyOffline ? ButtonStyle.Danger : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mcconfig_toggle_notify_join')
        .setLabel('Joueur join')
        .setEmoji(config.notifyJoin ? '✅' : '⚫')
        .setStyle(config.notifyJoin ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mcconfig_toggle_notify_leave')
        .setLabel('Joueur leave')
        .setEmoji(config.notifyLeave ? '✅' : '⚫')
        .setStyle(config.notifyLeave ? ButtonStyle.Secondary : ButtonStyle.Secondary),
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('setup'));
  return c;
}

// ─── Nav row ──────────────────────────────────────────────────────────────────

function buildNavRow(currentView) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('mcconfig_nav')
      .setPlaceholder('📂 Naviguer...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Aperçu')
          .setValue('overview')
          .setDescription('Statut et configuration actuelle')
          .setEmoji('🎮')
          .setDefault(currentView === 'overview'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Configuration')
          .setValue('setup')
          .setDescription('Serveur, salon, rôle, intervalle')
          .setEmoji('🔧')
          .setDefault(currentView === 'setup'),
      )
  );
}

function getView(viewName, guild, config) {
  if (viewName === 'setup')    return buildSetup(guild, config);
  return buildOverview(guild, config);
}

// ─── Commande ─────────────────────────────────────────────────────────────────

module.exports = {
  name:      'mcconfig',
  aliases:   ['mc', 'minecraft', 'mcstatus', 'mcs'],
  adminOnly: true,

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');

    const guildId = message.guild.id;
    let config    = db.getConfig(guildId);
    let view      = args[0]?.toLowerCase() === 'setup' ? 'setup' : 'overview';

    const reply = await message.reply({
      components: [getView(view, message.guild, config)],
      flags:      MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time:   300_000,
    });

    collector.on('collect', async (i) => {
      try {
        config = db.getConfig(guildId); // recharger à chaque interaction

        // ── Navigation ───────────────────────────────────────────────────────
        if (i.customId === 'mcconfig_nav') {
          view = i.values[0];
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle activer/désactiver ────────────────────────────────────────
        if (i.customId === 'mcconfig_toggle') {
          db.set(guildId, 'enabled', !config.enabled);
          config = db.getConfig(guildId);
          if (config.enabled) manager.startTracker(guildId);
          else                 manager.stopTracker(guildId);
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Force refresh panel ──────────────────────────────────────────────
        if (i.customId === 'mcconfig_force_refresh') {
          await i.deferUpdate();
          await manager.forceRefresh(guildId);
          config = db.getConfig(guildId);
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Supprimer le panel ───────────────────────────────────────────────
        if (i.customId === 'mcconfig_clear_panel') {
          await i.deferUpdate();
          if (config.statusMessageId && config.statusChannelId) {
            const ch = message.guild.channels.cache.get(config.statusChannelId);
            if (ch?.isTextBased()) {
              const msg = await ch.messages.fetch(config.statusMessageId).catch(() => null);
              if (msg) await msg.delete().catch(() => {});
            }
          }
          db.set(guildId, 'statusMessageId', null);
          config = db.getConfig(guildId);
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Intervalle ───────────────────────────────────────────────────────
        if (i.customId === 'mcconfig_interval') {
          const val = parseInt(i.values[0], 10);
          db.set(guildId, 'checkInterval', val);
          config = db.getConfig(guildId);
          if (config.enabled) manager.startTracker(guildId); // redémarre avec le nouvel intervalle
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Effacer serveur ──────────────────────────────────────────────────
        if (i.customId === 'mcconfig_clear_server') {
          db.setMany(guildId, { serverIp: '', statusMessageId: null });
          manager.stopTracker(guildId);
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Effacer salon ────────────────────────────────────────────────────
        if (i.customId === 'mcconfig_clear_channel') {
          db.setMany(guildId, { statusChannelId: null, statusMessageId: null });
          manager.stopTracker(guildId);
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Effacer rôle ─────────────────────────────────────────────────────
        if (i.customId === 'mcconfig_clear_role') {
          db.set(guildId, 'notificationRoleId', null);
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggles notifications ─────────────────────────────────────────────
        const TOGGLES = {
          mcconfig_toggle_notify_online:  'notifyOnline',
          mcconfig_toggle_notify_offline: 'notifyOffline',
          mcconfig_toggle_notify_join:    'notifyJoin',
          mcconfig_toggle_notify_leave:   'notifyLeave',
        };
        if (TOGGLES[i.customId]) {
          const key = TOGGLES[i.customId];
          db.set(guildId, key, !config[key]);
          return i.update({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modal : adresse serveur ──────────────────────────────────────────
        if (i.customId === 'mcconfig_modal_set_server') {
          const modal = new ModalBuilder()
            .setCustomId('mcconfig_modal_set_server')
            .setTitle('Adresse du serveur Minecraft')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('server_address')
                  .setLabel('Adresse IP (ex: mc.hypixel.net ou IP:port)')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('mc.example.com  ou  192.168.1.1:25565')
                  .setValue(config.serverIp ? `${config.serverIp}:${config.port}` : '')
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const mi = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!mi) return;
          await mi.deferUpdate();
          const raw   = mi.fields.getTextInputValue('server_address').trim();
          let ip = raw, port = 25565;
          if (raw.includes(':')) {
            const parts = raw.split(':');
            ip   = parts[0].trim();
            port = parseInt(parts[1], 10) || 25565;
          }
          db.setMany(guildId, { serverIp: ip, port, statusMessageId: null });
          config = db.getConfig(guildId);
          if (config.enabled && config.statusChannelId) manager.startTracker(guildId);
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modal : salon ────────────────────────────────────────────────────
        if (i.customId === 'mcconfig_modal_set_channel') {
          const modal = new ModalBuilder()
            .setCustomId('mcconfig_modal_set_channel')
            .setTitle('Salon de statut Minecraft')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('channel_id')
                  .setLabel('ID ou nom du salon textuel')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('ID, #nom ou nom exact du salon')
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const mi = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!mi) return;
          await mi.deferUpdate();
          const val = mi.fields.getTextInputValue('channel_id').trim();
          const ch  = message.guild.channels.cache.find(
            c => (c.id === val || c.name === val.replace(/^#/, '')) && c.isTextBased()
          ) ?? message.guild.channels.cache.get(val);
          if (ch?.isTextBased()) {
            db.setMany(guildId, { statusChannelId: ch.id, statusMessageId: null });
            config = db.getConfig(guildId);
            if (config.enabled && config.serverIp) manager.startTracker(guildId);
          }
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modal : rôle ─────────────────────────────────────────────────────
        if (i.customId === 'mcconfig_modal_set_role') {
          const modal = new ModalBuilder()
            .setCustomId('mcconfig_modal_set_role')
            .setTitle('Rôle de notification')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('role_id')
                  .setLabel('ID ou nom du rôle')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('ID ou nom exact du rôle')
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const mi = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!mi) return;
          await mi.deferUpdate();
          const val  = mi.fields.getTextInputValue('role_id').trim();
          const role = message.guild.roles.cache.find(r => r.id === val || r.name === val)
                    ?? message.guild.roles.cache.get(val);
          if (role) db.set(guildId, 'notificationRoleId', role.id);
          config = db.getConfig(guildId);
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Créer salon automatiquement ──────────────────────────────────────
        if (i.customId === 'mcconfig_create_channel') {
          await i.deferUpdate();
          const ch = await message.guild.channels.create({
            name: '🎮-minecraft-status',
            type: ChannelType.GuildText,
            topic: 'Statut du serveur Minecraft en temps réel.',
            permissionOverwrites: [
              {
                id: message.guild.id,
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
              },
            ],
            reason: '[mcconfig] Création automatique du salon Minecraft Status',
          });
          db.setMany(guildId, { statusChannelId: ch.id, statusMessageId: null });
          config = db.getConfig(guildId);
          if (config.enabled && config.serverIp) manager.startTracker(guildId);
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Créer rôle automatiquement ───────────────────────────────────────
        if (i.customId === 'mcconfig_create_role') {
          await i.deferUpdate();
          const role = await message.guild.roles.create({
            name: '🎮 Minecraft',
            color: 0x2ecc71,
            hoist: false,
            mentionable: true,
            reason: '[mcconfig] Rôle de notification Minecraft (création automatique)',
          });
          // Si un salon statut existe, autoriser ce rôle à voir le salon
          if (config.statusChannelId) {
            const ch = message.guild.channels.cache.get(config.statusChannelId);
            if (ch) await ch.permissionOverwrites.edit(role, { ViewChannel: true }).catch(() => {});
          }
          db.set(guildId, 'notificationRoleId', role.id);
          config = db.getConfig(guildId);
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modal : intervalle personnalisé ──────────────────────────────────
        if (i.customId === 'mcconfig_modal_custom_interval') {
          const modal = new ModalBuilder()
            .setCustomId('mcconfig_modal_custom_interval')
            .setTitle('Intervalle personnalisé')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('interval_value')
                  .setLabel('Intervalle en secondes (min 10, max 3600)')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Ex : 45')
                  .setValue(String(config.checkInterval))
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const mi = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!mi) return;
          await mi.deferUpdate();
          const val = parseInt(mi.fields.getTextInputValue('interval_value'), 10);
          if (!isNaN(val) && val >= 10 && val <= 3600) {
            db.set(guildId, 'checkInterval', val);
            config = db.getConfig(guildId);
            if (config.enabled) manager.startTracker(guildId);
          }
          return reply.edit({ components: [getView(view, message.guild, config)], flags: MessageFlags.IsComponentsV2 });
        }

      } catch (err) {
        console.error('[mcconfig] Erreur collector:', err.message);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# 🎮 Minecraft Status\n-# *Session expirée — relance \`.mcconfig\` pour continuer.*'
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
