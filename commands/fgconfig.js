// commands/fgconfig.js — .fgconfig
// Dashboard interactif de configuration du système "Jeux gratuits" — Components V2
// Sections : overview, channels, sources, behavior, actions

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');

const db      = require('../freegames/freeGamesDB.js');
const manager = require('../freegames/freeGamesManager.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }
function tog(v) { return v ? '🟢' : '🔴'; }
function si(v)  { return v ? '✅' : '❌'; }
function cm(id) { return id ? `<#${id}>` : '*Non défini*'; }
function rm(id) { return id ? `<@&${id}>` : '*Non défini*'; }

const VIEWS = [
  { v: 'overview',  label: 'Vue d\'ensemble', emoji: '📊', desc: 'Statut global du système' },
  { v: 'channels',  label: 'Salons & Rôle',   emoji: '📁', desc: 'Salon d\'annonces, rôle ping' },
  { v: 'sources',   label: 'Sources',          emoji: '🏪', desc: 'Epic Games, Steam…' },
  { v: 'behavior',  label: 'Comportement',     emoji: '⚙️', desc: 'Intervalle, affichage' },
  { v: 'actions',   label: 'Actions',          emoji: '🛠️', desc: 'Test, reset, vérification' },
];

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('fgconfig_nav')
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

// ─── Vue : overview ───────────────────────────────────────────────────────────

function buildOverview(config, guildName) {
  const ready = config.enabled && config.channelId;
  const sources = [];
  if (config.sources?.epic)  sources.push('Epic Games');
  if (config.sources?.steam) sources.push('Steam');

  const c = new ContainerBuilder().setAccentColor(ready ? 0x57f287 : config.channelId ? 0xfee75c : 0xed4245);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🎮 Jeux Gratuits — ${guildName}\n` +
        `-# ${ready ? '✅ Système actif' : config.channelId ? '⚠️ Désactivé' : '❌ Non configuré'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/3.png')
        .setDescription('Jeux Gratuits'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `${tog(config.enabled)} Système **${config.enabled ? 'activé' : 'désactivé'}**\n` +
    `📢 Salon d'annonces : ${cm(config.channelId)}\n` +
    `🔔 Rôle ping : ${rm(config.pingRoleId)}\n` +
    `🔒 Rôle d'accès : ${config.accessRoleId ? rm(config.accessRoleId) : '*Public*'}\n` +
    `🏪 Sources actives : ${sources.length ? sources.join(' · ') : '*Aucune*'}\n` +
    `⏱️ Vérification toutes les : **${config.checkInterval ?? 6}h**\n` +
    `⏳ Afficher la date d'expiration : ${si(config.showExpiry)}\n` +
    `📝 Afficher la description : ${si(config.showDescription)}\n` +
    `🗂️ Jeux déjà annoncés : **${config.postedEntries?.length ?? 0}** en mémoire`
  ));

  if (!config.channelId) {
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> ⚠️ **Action requise :** Définis un salon d'annonces dans **Salons & Rôle**.`
    ));
  }

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fgconfig_toggle')
        .setLabel(config.enabled ? 'Désactiver' : 'Activer')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(config.enabled ? '🔴' : '🟢')
        .setDisabled(!config.channelId),
    )
  );
  c.addActionRowComponents(buildNavRow('overview'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : channels ───────────────────────────────────────────────────────────

function buildChannels(config, guild) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📁 Salons & Rôle\n-# Configurer le salon d'annonces et le rôle à mentionner`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/0.png').setDescription('Salons'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📢 Salon d'annonces**\n` +
    `${cm(config.channelId)}\n` +
    `-# Le bot postera les nouveaux jeux gratuits dans ce salon.\n\n` +
    `**🔔 Rôle de ping**\n` +
    `${rm(config.pingRoleId)}\n` +
    `-# Mentionné à chaque nouvelle annonce. Laisser vide pour désactiver le ping.\n\n` +
    `**🔒 Rôle d'accès au salon**\n` +
    `${rm(config.accessRoleId)}\n` +
    `-# Si défini, seuls les membres avec ce rôle pourront voir le salon. Laisser vide pour un accès public.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fgconfig_modal_set_channel')
        .setLabel('Définir le salon')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📢'),
      new ButtonBuilder()
        .setCustomId('fgconfig_create_channel')
        .setLabel('Créer le salon')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎮')
        .setDisabled(!!config.channelId),
      new ButtonBuilder()
        .setCustomId('fgconfig_modal_set_role')
        .setLabel('Définir le rôle ping')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔔'),
      new ButtonBuilder()
        .setCustomId('fgconfig_clear_role')
        .setLabel('Supprimer le ping')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔕')
        .setDisabled(!config.pingRoleId),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fgconfig_modal_set_access_role')
        .setLabel('Définir le rôle d\'accès')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('fgconfig_clear_access_role')
        .setLabel('Accès public')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔓')
        .setDisabled(!config.accessRoleId),
    )
  );
  c.addActionRowComponents(buildNavRow('channels'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : sources ────────────────────────────────────────────────────────────

function buildSources(config) {
  const s = config.sources ?? {};
  const c = new ContainerBuilder().setAccentColor(0xfee75c);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🏪 Sources\n-# Choisir les plateformes à surveiller`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/1.png').setDescription('Sources'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `${tog(s.epic)} **Epic Games**\n` +
    `-# Jeux 100% gratuits du store Epic (API officielle Epic Games Store)\n\n` +
    `${tog(s.steam)} **Steam** *(via GamerPower)*\n` +
    `-# Promotions à prix réduit à 0€ sur Steam (via l'API GamerPower)`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fgconfig_toggle_epic')
        .setLabel(s.epic ? 'Désactiver Epic' : 'Activer Epic')
        .setStyle(s.epic ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji('🎮'),
      new ButtonBuilder()
        .setCustomId('fgconfig_toggle_steam')
        .setLabel(s.steam ? 'Désactiver Steam' : 'Activer Steam')
        .setStyle(s.steam ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji('🎮'),
    )
  );
  c.addActionRowComponents(buildNavRow('sources'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : behavior ───────────────────────────────────────────────────────────

function buildBehavior(config) {
  const c = new ContainerBuilder().setAccentColor(0x57f287);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚙️ Comportement\n-# Intervalle de vérification et options d'affichage`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/2.png').setDescription('Comportement'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**⏱️ Intervalle de vérification**\n` +
    `Toutes les **${config.checkInterval ?? 6} heures**\n` +
    `-# Le bot vérifie les nouvelles offres gratuites selon cet intervalle.\n\n` +
    `**⏳ Afficher la date d'expiration**\n` +
    `${si(config.showExpiry)} ${config.showExpiry ? 'Activé — la date de fin est visible' : 'Désactivé — pas de date de fin'}\n\n` +
    `**📝 Afficher la description**\n` +
    `${si(config.showDescription)} ${config.showDescription ? 'Activé — description du jeu visible' : 'Désactivé — description masquée'}`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fgconfig_modal_interval')
        .setLabel(`Changer l'intervalle (${config.checkInterval ?? 6}h)`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏱️'),
      new ButtonBuilder()
        .setCustomId('fgconfig_toggle_expiry')
        .setLabel(config.showExpiry ? 'Masquer l\'expiration' : 'Afficher l\'expiration')
        .setStyle(config.showExpiry ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('⏳'),
      new ButtonBuilder()
        .setCustomId('fgconfig_toggle_desc')
        .setLabel(config.showDescription ? 'Masquer desc.' : 'Afficher desc.')
        .setStyle(config.showDescription ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('📝'),
    )
  );
  c.addActionRowComponents(buildNavRow('behavior'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : actions ────────────────────────────────────────────────────────────

function buildActions(config) {
  const c = new ContainerBuilder().setAccentColor(0xed4245);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🛠️ Actions & Outils\n-# Vérification forcée, réinitialisation`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/4.png').setDescription('Actions'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🔍 Vérification forcée**\n` +
    `-# Lance immédiatement une vérification des jeux gratuits et poste les nouveaux.\n\n` +
    `**🔄 Réinitialiser les IDs postés**\n` +
    `-# Efface la mémoire des jeux déjà annoncés. Tous les jeux actuels seront re-postés.\n\n` +
    `**⚠️ Réinitialiser la config**\n` +
    `-# Remet toute la configuration à zéro.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fgconfig_force_check')
        .setLabel('Vérifier maintenant')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔍')
        .setDisabled(!config.channelId),
      new ButtonBuilder()
        .setCustomId('fgconfig_reset_ids')
        .setLabel('Réinitialiser les IDs')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId('fgconfig_reset')
        .setLabel('Réinitialiser la config')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
    )
  );
  c.addActionRowComponents(buildNavRow('actions'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Dispatch vue ─────────────────────────────────────────────────────────────

function buildView(view, guild) {
  const config = db.getConfig(guild.id);
  switch (view) {
    case 'channels': return buildChannels(config, guild);
    case 'sources':  return buildSources(config);
    case 'behavior': return buildBehavior(config);
    case 'actions':  return buildActions(config);
    default:         return buildOverview(config, guild.name);
  }
}

// ─── Modals ───────────────────────────────────────────────────────────────────

const MODALS = {
  fgconfig_modal_set_channel: {
    title: '📢 Salon d\'annonces',
    inputs: [{ id: 'channel', label: 'ID ou #mention du salon', placeholder: '#jeux-gratuits ou 1234567890', required: true }],
  },
  fgconfig_modal_set_role: {
    title: '🔔 Rôle de ping',
    inputs: [{ id: 'role', label: 'ID ou @rôle', placeholder: '1234567890 ou @JeuxGratuits', required: true }],
  },
  fgconfig_modal_set_access_role: {
    title: '🔒 Rôle d\'accès au salon',
    inputs: [{ id: 'role', label: 'ID ou @rôle', placeholder: '1234567890 ou @Joueurs', required: true }],
  },
  fgconfig_modal_interval: {
    title: '⏱️ Intervalle de vérification',
    inputs: [{ id: 'interval', label: 'Intervalle en heures (1–168)', placeholder: '6', required: true }],
  },
};

function buildModal(customId) {
  const def = MODALS[customId];
  if (!def) return null;
  const modal = new ModalBuilder().setCustomId(customId).setTitle(def.title);
  const rows = def.inputs.map(inp =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(inp.id)
        .setLabel(inp.label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(inp.placeholder)
        .setRequired(inp.required ?? false)
    )
  );
  modal.addComponents(...rows);
  return modal;
}

// ─── Helpers résolution ───────────────────────────────────────────────────────

function resolveChannel(guild, str) {
  if (!str) return null;
  const id = str.replace(/[<#>]/g, '').trim();
  return guild.channels.cache.get(id) ||
         guild.channels.cache.find(c => c.name === id) || null;
}

function resolveRole(guild, str) {
  if (!str) return null;
  const id = str.replace(/[<@&>]/g, '').trim();
  return guild.roles.cache.get(id) ||
         guild.roles.cache.find(r => r.name === id) || null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  name:        'fgconfig',
  aliases:     ['freeconfig', 'freegames', 'fg', 'jeux', 'fgc'],
  description: 'Dashboard de configuration du système Jeux Gratuits (Epic, Steam)',
  adminOnly:   true,

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply('❌ Tu as besoin de **Gérer le serveur** pour accéder à cette commande.');

    const SHORTCUT_MAP = {
      channels: 'channels', channel: 'channels', salon: 'channels',
      sources:  'sources',  source:  'sources',  epic: 'sources', steam: 'sources',
      behavior: 'behavior', comportement: 'behavior', interval: 'behavior',
      actions:  'actions',  action: 'actions',
    };
    let view = SHORTCUT_MAP[args[0]?.toLowerCase()] ?? 'overview';

    const reply = await message.reply({
      components: [buildView(view, message.guild)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time:   300_000,
    });

    collector.on('collect', async (i) => {
      try {
        const guild  = message.guild;
        const config = db.getConfig(guild.id);

        // ── Navigation ───────────────────────────────────────────────────────
        if (i.customId === 'fgconfig_nav') {
          view = i.values[0];
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle activé ────────────────────────────────────────────────────
        if (i.customId === 'fgconfig_toggle') {
          db.set(guild.id, 'enabled', !config.enabled);
          manager.reload(guild.id);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle sources ───────────────────────────────────────────────────
        if (i.customId === 'fgconfig_toggle_epic') {
          db.setSource(guild.id, 'epic', !(config.sources?.epic));
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }
        if (i.customId === 'fgconfig_toggle_steam') {
          db.setSource(guild.id, 'steam', !(config.sources?.steam));
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle options d'affichage ───────────────────────────────────────
        if (i.customId === 'fgconfig_toggle_expiry') {
          db.set(guild.id, 'showExpiry', !config.showExpiry);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }
        if (i.customId === 'fgconfig_toggle_desc') {
          db.set(guild.id, 'showDescription', !config.showDescription);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Supprimer rôle ping ──────────────────────────────────────────────
        if (i.customId === 'fgconfig_clear_role') {
          db.set(guild.id, 'pingRoleId', null);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Supprimer rôle d'accès ───────────────────────────────────────────
        if (i.customId === 'fgconfig_clear_access_role') {
          db.set(guild.id, 'accessRoleId', null);
          // Retirer la restriction sur le salon si configuré
          if (config.channelId) {
            const ch = guild.channels.cache.get(config.channelId);
            if (ch) {
              try {
                await ch.permissionOverwrites.delete(guild.roles.everyone, 'Rôle d\'accès supprimé — accès public');
              } catch (e) {
                console.error('[fgconfig] Impossible de retirer la restriction:', e.message);
              }
            }
          }
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Créer le salon automatiquement ──────────────────────────────────
        if (i.customId === 'fgconfig_create_channel') {
          await i.deferUpdate();
          try {
            const accessRole = config.accessRoleId
              ? guild.roles.cache.get(config.accessRoleId)
              : null;

            const permissionOverwrites = [{ id: guild.roles.everyone, deny: ['ViewChannel'] }];
            if (accessRole) {
              permissionOverwrites.push({ id: accessRole.id, allow: ['ViewChannel'] });
            }

            const newCh = await guild.channels.create({
              name: '🎮-jeux-gratuits',
              type: 0, // GuildText
              topic: 'Jeux gratuits Epic Games & Steam 🎮',
              permissionOverwrites: accessRole ? permissionOverwrites : [],
            });
            db.set(guild.id, 'channelId', newCh.id);
            manager.reload(guild.id);
          } catch (e) {
            console.error('[fgconfig] Impossible de créer le salon:', e.message);
          }
          return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Ouvrir modals + traitement immédiat ──────────────────────────────
        if (MODALS[i.customId]) {
          const modal = buildModal(i.customId);
          if (!modal) return;
          await i.showModal(modal);

          // Attendre la soumission du modal (max 5 min)
          let mi;
          try {
            mi = await i.awaitModalSubmit({ filter: m => m.customId === i.customId, time: 300_000 });
          } catch {
            return; // timeout ou annulation
          }

          try {
            await mi.deferUpdate();
            if (mi.customId === 'fgconfig_modal_set_channel') {
              const raw = mi.fields.getTextInputValue('channel');
              const ch  = resolveChannel(guild, raw);
              if (ch && ch.isTextBased()) {
                db.set(guild.id, 'channelId', ch.id);
                manager.reload(guild.id);
              }
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            if (mi.customId === 'fgconfig_modal_set_role') {
              const raw  = mi.fields.getTextInputValue('role');
              const role = resolveRole(guild, raw);
              if (role) db.set(guild.id, 'pingRoleId', role.id);
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            if (mi.customId === 'fgconfig_modal_set_access_role') {
              const raw  = mi.fields.getTextInputValue('role');
              const role = resolveRole(guild, raw);
              if (role) {
                db.set(guild.id, 'accessRoleId', role.id);
                // Appliquer les permissions sur le salon si défini
                const freshCfg = db.getConfig(guild.id);
                if (freshCfg.channelId) {
                  const ch = guild.channels.cache.get(freshCfg.channelId);
                  if (ch) {
                    try {
                      await ch.permissionOverwrites.set([
                        { id: guild.roles.everyone, deny: ['ViewChannel'] },
                        { id: role.id,              allow: ['ViewChannel'] },
                      ], `Rôle d'accès défini via .fgconfig`);
                    } catch (e) {
                      console.error('[fgconfig] Impossible d\'appliquer les permissions:', e.message);
                    }
                  }
                }
              }
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            if (mi.customId === 'fgconfig_modal_interval') {
              const raw = mi.fields.getTextInputValue('interval');
              const val = parseInt(raw, 10);
              if (!isNaN(val) && val >= 1 && val <= 168) {
                db.set(guild.id, 'checkInterval', val);
                manager.reload(guild.id);
              }
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            if (mi.customId === 'fgconfig_modal_interval') {
              const raw = mi.fields.getTextInputValue('interval');
              const val = parseInt(raw, 10);
              if (!isNaN(val) && val >= 1 && val <= 168) {
                db.set(guild.id, 'checkInterval', val);
                manager.reload(guild.id);
              }
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }
          } catch (err) {
            console.error('[fgconfig] Modal submit error:', err.message);
          }
          return;
        }

        // ── Vérification forcée ──────────────────────────────────────────────
        if (i.customId === 'fgconfig_force_check') {
          await i.deferUpdate();
          const count = await manager.forceCheck(guild);
          const freshConfig = db.getConfig(guild.id);
          const notif = new ContainerBuilder().setAccentColor(count > 0 ? 0x57f287 : 0xfee75c)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              count > 0
                ? `## ✅ ${count} nouveau(x) jeu(x) posté(s) !`
                : `## ℹ️ Aucun nouveau jeu trouvé pour l'instant.`
            ));
          await reply.edit({ components: [notif], flags: MessageFlags.IsComponentsV2 });
          await new Promise(r => setTimeout(r, 3_000));
          return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Réinit IDs ───────────────────────────────────────────────────────
        if (i.customId === 'fgconfig_reset_ids') {
          db.resetPostedIds(guild.id);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Réinit config ────────────────────────────────────────────────────
        if (i.customId === 'fgconfig_reset') {
          db.reset(guild.id);
          manager.stopGuild(guild.id);
          view = 'overview';
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

      } catch (err) {
        console.error('[fgconfig] Erreur collector:', err.message);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              '# 🎮 Jeux Gratuits\n-# *Session expirée — relance `.fgconfig` pour continuer.*'
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
