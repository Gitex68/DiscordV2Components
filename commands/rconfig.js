// commands/rconfig.js — .rconfig
// Dashboard interactif de configuration du système de règlement.
// Sections : overview (statut + toggle), setup (salon + rôles + création),
//            rules (texte éditable + label bouton + poster le panel)

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');

const db = require('../utils/rulesDB.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }
function tog(v) { return v ? '🟢' : '🔴'; }
function si(v)  { return v ? '✅' : '❌'; }
function cm(id) { return id ? `<#${id}>` : '*Non défini*'; }
function rm(id) { return id ? `<@&${id}>` : '*Non défini*'; }

const VIEWS = [
  { v: 'overview', label: 'Vue d\'ensemble', emoji: '📊', desc: 'Statut global du système'            },
  { v: 'setup',    label: 'Configuration',   emoji: '🔧', desc: 'Salon, rôles, configuration'        },
  { v: 'rules',    label: 'Règlement',       emoji: '📝', desc: 'Texte du règlement et panel Discord' },
];

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rconfig_nav')
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
  const ready = config.enabled && config.rulesChannelId && config.verifiedRoleId;
  const c = new ContainerBuilder().setAccentColor(ready ? 0x57f287 : config.rulesChannelId ? 0xfee75c : 0xed4245);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📜 Règlement — ${guildName}\n` +
        `-# ${ready ? '✅ Système actif' : config.rulesChannelId ? '⚠️ Partiellement configuré' : '❌ Non configuré'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/4.png')
        .setDescription('Règlement'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `${tog(config.enabled)} Système **${config.enabled ? 'activé' : 'désactivé'}**\n\n` +
    `**📢 Salon du règlement :** ${cm(config.rulesChannelId)}\n` +
    `-# Salon où le panel de validation est posté.\n\n` +
    `**🔒 Rôle de restriction (join) :** ${rm(config.joinRoleId)}\n` +
    `-# Attribué automatiquement à l'arrivée. Masque tous les salons sauf #règlement.\n\n` +
    `**✅ Rôle vérifié :** ${rm(config.verifiedRoleId)}\n` +
    `-# Attribué après validation du règlement. Le rôle de restriction est retiré.\n\n` +
    `**🏷️ Bouton de validation :** \`${config.buttonLabel}\`\n` +
    `**📌 Panel posté :** ${config.panelMessageId ? `ID \`${config.panelMessageId}\`` : '*Non posté*'}`
  ));

  if (!config.rulesChannelId || !config.verifiedRoleId) {
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> ⚠️ **Action requise :** Configure le salon et les rôles dans **Configuration**.`
    ));
  }

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_toggle')
        .setLabel(config.enabled ? 'Désactiver' : 'Activer')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(config.enabled ? '🔴' : '🟢')
        .setDisabled(!config.rulesChannelId || !config.verifiedRoleId),
    )
  );
  c.addActionRowComponents(buildNavRow('overview'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : setup ─────────────────────────────────────────────────────────────

function buildSetup(config) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🔧 Configuration\n-# Salon du règlement et rôles`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/0.png').setDescription('Setup'))
  );
  c.addSeparatorComponents(sep());

  // ── Salon du règlement ──
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📢 Salon du règlement**\n` +
    `${cm(config.rulesChannelId)}\n` +
    `-# Salon textuel où le panel de validation sera posté.\n` +
    `-# Idéalement en lecture seule pour les membres non vérifiés.`
  ));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_modal_set_channel')
        .setLabel('Définir le salon')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📢'),
      new ButtonBuilder()
        .setCustomId('rconfig_create_channel')
        .setLabel('Créer le salon')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨')
        .setDisabled(!!config.rulesChannelId),
      new ButtonBuilder()
        .setCustomId('rconfig_clear_channel')
        .setLabel('Retirer')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.rulesChannelId),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Rôle de restriction ──
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🔒 Rôle de restriction (join)**\n` +
    `${rm(config.joinRoleId)}\n` +
    `-# Attribué au join. Ce rôle doit bloquer l'accès à tous les salons sauf #règlement.\n` +
    `-# Configure les permissions du rôle manuellement, ou utilise **Créer le rôle**.`
  ));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_modal_set_join_role')
        .setLabel('Assigner le rôle')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('rconfig_create_join_role')
        .setLabel('Créer le rôle')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨')
        .setDisabled(!!config.joinRoleId),
      new ButtonBuilder()
        .setCustomId('rconfig_clear_join_role')
        .setLabel('Retirer')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.joinRoleId),
    )
  );
  c.addSeparatorComponents(sep());

  // ── Rôle vérifié ──
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**✅ Rôle vérifié**\n` +
    `${rm(config.verifiedRoleId)}\n` +
    `-# Attribué après validation. Donne accès à tous les salons du serveur.\n` +
    `-# Peut être le rôle **@everyone** si tu utilises le rôle de restriction uniquement.`
  ));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_modal_set_verified_role')
        .setLabel('Assigner le rôle')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('rconfig_create_verified_role')
        .setLabel('Créer le rôle')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨')
        .setDisabled(!!config.verifiedRoleId),
      new ButtonBuilder()
        .setCustomId('rconfig_clear_verified_role')
        .setLabel('Retirer')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.verifiedRoleId),
    )
  );

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('setup'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : rules ─────────────────────────────────────────────────────────────

function buildRulesView(config) {
  const preview = config.rulesText.slice(0, 300) + (config.rulesText.length > 300 ? '…' : '');
  const c = new ContainerBuilder().setAccentColor(0xfee75c);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📝 Texte du règlement\n-# Édite le règlement et poste le panel de validation`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/1.png').setDescription('Règlement'))
  );
  c.addSeparatorComponents(sep());

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📄 Texte actuel :** (${config.rulesText.length} caractères)\n` +
    `\`\`\`\n${preview}\n\`\`\``
  ));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_modal_edit_rules')
        .setLabel('Éditer le règlement')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️'),
      new ButtonBuilder()
        .setCustomId('rconfig_reset_rules')
        .setLabel('Texte par défaut')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId('rconfig_variables')
        .setLabel('Variables disponibles')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📖'),
    )
  );
  c.addSeparatorComponents(sep());

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🏷️ Label du bouton de validation**\n` +
    `\`${config.buttonLabel}\``
  ));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_modal_edit_button_label')
        .setLabel('Modifier le label')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏷️'),
    )
  );
  c.addSeparatorComponents(sep());

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**📌 Panel de validation**\n` +
    `-# Salon cible : ${cm(config.rulesChannelId)}\n` +
    `-# État : ${config.panelMessageId ? `✅ Posté (ID \`${config.panelMessageId}\`)` : '❌ Non posté'}`
  ));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_post_panel')
        .setLabel(config.panelMessageId ? 'Mettre à jour le panel' : 'Poster le panel')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📌')
        .setDisabled(!config.rulesChannelId),
      new ButtonBuilder()
        .setCustomId('rconfig_clear_panel')
        .setLabel('Supprimer le panel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.panelMessageId),
    )
  );

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('rules'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Poster / Mettre à jour le panel de règlement ─────────────────────────────

async function postRulesPanel(guild, config) {
  const channel = guild.channels.cache.get(config.rulesChannelId);
  if (!channel?.isTextBased()) return null;

  // Supprimer l'ancien panel si existant
  if (config.panelMessageId) {
    const old = await channel.messages.fetch(config.panelMessageId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  // Construire le panel règlement (Components V2)
  const panel = new ContainerBuilder().setAccentColor(0x57f287);
  panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.rulesText));
  panel.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
  panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `-# En cliquant sur le bouton ci-dessous, tu confirmes avoir lu et accepté le règlement.`
  ));
  panel.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rules_validate')
        .setLabel(config.buttonLabel)
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    )
  );

  const msg = await channel.send({
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
  });
  return msg.id;
}

// ─── Panel des variables disponibles (persistant — géré dans index.js) ────────

function buildVariablesPanel() {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📖 Variables disponibles\n` +
        `-# Utilisables dans le **texte du règlement** et le **label du bouton**`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/0.png')
        .setDescription('Variables'))
  );
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## 👤 Membres\n` +
    `\`{username}\` — Nom d'utilisateur Discord du membre\n` +
    `-# Ex : \`mathysien\`\n\n` +
    `\`{displayname}\` — Surnom du membre sur le serveur (ou username si absent)\n` +
    `-# Ex : \`Mathysien le Magnifique\`\n\n` +
    `\`{tag}\` — Tag complet Discord du membre\n` +
    `-# Ex : \`mathysien#0001\`\n\n` +
    `\`{mention}\` — Mention cliquable du membre\n` +
    `-# Ex : \`@Mathysien\`\n\n` +
    `\`{id}\` — ID Discord du membre\n` +
    `-# Ex : \`123456789012345678\``
  ));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## 🏠 Serveur\n` +
    `\`{server}\` — Nom du serveur\n` +
    `-# Ex : \`Confrérie Mathysienne\`\n\n` +
    `\`{membercount}\` — Nombre total de membres\n` +
    `-# Ex : \`52\`\n\n` +
    `\`{serverid}\` — ID du serveur\n` +
    `-# Ex : \`128821632832154546\``
  ));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## 📅 Date & Heure\n` +
    `\`{date}\` — Date du jour (format FR)\n` +
    `-# Ex : \`06/03/2026\`\n\n` +
    `\`{time}\` — Heure actuelle (format FR)\n` +
    `-# Ex : \`14:32\`\n\n` +
    `\`{datetime}\` — Date et heure complètes\n` +
    `-# Ex : \`06/03/2026 14:32\``
  ));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## ℹ️ Notes\n` +
    `-# Ces variables sont **remplacées dynamiquement** lors de la validation du règlement par un membre.\n` +
    `-# Elles peuvent être utilisées dans le **texte du règlement** (affiché dans le panel) et dans le **label du bouton**.\n` +
    `-# Les variables non reconnues sont laissées telles quelles.`
  ));
  c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rconfig_variables_close')
        .setLabel('Fermer')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✖️')
    )
  );
  return c;
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = {
  name:        'rconfig',
  aliases:     ['rulesconfig', 'reglement', 'rules', 'rc'],
  description: 'Dashboard de configuration du système de règlement',
  adminOnly:   true,
  buildVariablesPanel,

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

    const guildId   = message.guild.id;
    let   view      = 'overview';
    let   config    = db.getConfig(guildId);

    function getContainer() {
      config = db.getConfig(guildId);
      if (view === 'setup')  return buildSetup(config);
      if (view === 'rules')  return buildRulesView(config);
      return buildOverview(config, message.guild.name);
    }

    const reply = await message.reply({
      components: [getContainer()],
      flags:      MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time:   300_000,
    });

    collector.on('collect', async (i) => {
      try {
        // ── Navigation ────────────────────────────────────────────────────────
        if (i.customId === 'rconfig_nav') {
          view = i.values[0];
          return i.update({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle enable/disable ─────────────────────────────────────────────
        if (i.customId === 'rconfig_toggle') {
          db.set(guildId, 'enabled', !db.getConfig(guildId).enabled);
          return i.update({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ─────────────────────────────────────────────────────────────────────
        //  VUE SETUP — Salon
        // ─────────────────────────────────────────────────────────────────────

        if (i.customId === 'rconfig_modal_set_channel') {
          const modal = new ModalBuilder()
            .setCustomId('rconfig_modal_set_channel')
            .setTitle('Salon du règlement')
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
          if (!ch || !ch.isTextBased()) {
            return reply.edit({
              components: [new ContainerBuilder().setAccentColor(0xed4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Salon introuvable ou invalide.\n-# Reviens en arrière et réessaie.'))],
              flags: MessageFlags.IsComponentsV2,
            });
          }
          db.set(guildId, 'rulesChannelId', ch.id);
          return reply.edit({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_create_channel') {
          await i.deferUpdate();
          config = db.getConfig(guildId);
          // Cherche/crée une catégorie "Info" ou "Règlement"
          let category = message.guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory &&
                 /r[eè]glement|info|règles/i.test(c.name)
          );
          const perms = [];
          if (config.joinRoleId) {
            // Le rôle de restriction peut voir ce salon
            perms.push({ id: config.joinRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
          }
          // @everyone ne peut pas envoyer de messages
          perms.push({ id: message.guild.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] });
          const ch = await message.guild.channels.create({
            name:   '📜-règlement',
            type:   ChannelType.GuildText,
            parent: category ?? null,
            topic:  'Lis et accepte le règlement pour accéder au serveur.',
            permissionOverwrites: perms,
            reason: '[rconfig] Création automatique du salon règlement',
          });
          db.set(guildId, 'rulesChannelId', ch.id);
          return i.editReply({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_clear_channel') {
          db.setMany(guildId, { rulesChannelId: null, panelMessageId: null });
          return i.update({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ─────────────────────────────────────────────────────────────────────
        //  VUE SETUP — Rôle join
        // ─────────────────────────────────────────────────────────────────────

        if (i.customId === 'rconfig_modal_set_join_role') {
          const modal = new ModalBuilder()
            .setCustomId('rconfig_modal_set_join_role')
            .setTitle('Rôle de restriction (join)')
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
          if (!role) {
            return reply.edit({
              components: [new ContainerBuilder().setAccentColor(0xed4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Rôle introuvable.\n-# Reviens en arrière et réessaie.'))],
              flags: MessageFlags.IsComponentsV2,
            });
          }
          db.set(guildId, 'joinRoleId', role.id);
          return reply.edit({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_create_join_role') {
          await i.deferUpdate();
          const role = await message.guild.roles.create({
            name:        '🔒 Non vérifié',
            color:       0x99aab5,
            hoist:       false,
            mentionable: false,
            reason:      '[rconfig] Rôle de restriction automatique',
          });
          db.set(guildId, 'joinRoleId', role.id);
          return i.editReply({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_clear_join_role') {
          db.set(guildId, 'joinRoleId', null);
          return i.update({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ─────────────────────────────────────────────────────────────────────
        //  VUE SETUP — Rôle vérifié
        // ─────────────────────────────────────────────────────────────────────

        if (i.customId === 'rconfig_modal_set_verified_role') {
          const modal = new ModalBuilder()
            .setCustomId('rconfig_modal_set_verified_role')
            .setTitle('Rôle vérifié')
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
          if (!role) {
            return reply.edit({
              components: [new ContainerBuilder().setAccentColor(0xed4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Rôle introuvable.\n-# Reviens en arrière et réessaie.'))],
              flags: MessageFlags.IsComponentsV2,
            });
          }
          db.set(guildId, 'verifiedRoleId', role.id);
          return reply.edit({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_create_verified_role') {
          await i.deferUpdate();
          const role = await message.guild.roles.create({
            name:        '✅ Membre vérifié',
            color:       0x57f287,
            hoist:       false,
            mentionable: false,
            reason:      '[rconfig] Rôle vérifié automatique',
          });
          db.set(guildId, 'verifiedRoleId', role.id);
          return i.editReply({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_clear_verified_role') {
          db.set(guildId, 'verifiedRoleId', null);
          return i.update({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ─────────────────────────────────────────────────────────────────────
        //  VUE RULES — Texte du règlement
        // ─────────────────────────────────────────────────────────────────────

        if (i.customId === 'rconfig_modal_edit_rules') {
          config = db.getConfig(guildId);
          const modal = new ModalBuilder()
            .setCustomId('rconfig_modal_edit_rules')
            .setTitle('Texte du règlement')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('rules_text')
                  .setLabel('Contenu du règlement (Markdown supporté)')
                  .setStyle(TextInputStyle.Paragraph)
                  .setValue(config.rulesText.slice(0, 4000))
                  .setMaxLength(4000)
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const mi = await i.awaitModalSubmit({ time: 120_000 }).catch(() => null);
          if (!mi) return;
          await mi.deferUpdate();
          const text = mi.fields.getTextInputValue('rules_text').trim();
          db.set(guildId, 'rulesText', text);
          return reply.edit({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_reset_rules') {
          db.set(guildId, 'rulesText', db.DEFAULT_CONFIG.rulesText);
          return i.update({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Panneau variables disponibles ─────────────────────────────────────
        if (i.customId === 'rconfig_variables') {
          return i.reply({
            components: [buildVariablesPanel()],
            flags:      MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }

        // ── Label du bouton ──────────────────────────────────────────────────

        if (i.customId === 'rconfig_modal_edit_button_label') {
          config = db.getConfig(guildId);
          const modal = new ModalBuilder()
            .setCustomId('rconfig_modal_edit_button_label')
            .setTitle('Label du bouton de validation')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('button_label')
                  .setLabel('Texte du bouton (max 80 caractères)')
                  .setStyle(TextInputStyle.Short)
                  .setValue(config.buttonLabel)
                  .setMaxLength(80)
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          const mi = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!mi) return;
          await mi.deferUpdate();
          const label = mi.fields.getTextInputValue('button_label').trim();
          db.set(guildId, 'buttonLabel', label);
          return reply.edit({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Panel de validation ──────────────────────────────────────────────

        if (i.customId === 'rconfig_post_panel') {
          await i.deferUpdate();
          config = db.getConfig(guildId);
          const msgId = await postRulesPanel(message.guild, config);
          if (msgId) {
            db.set(guildId, 'panelMessageId', msgId);
          } else {
            // Salon introuvable — nettoyer l'ID
            db.setMany(guildId, { rulesChannelId: null, panelMessageId: null });
          }
          return i.editReply({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'rconfig_clear_panel') {
          await i.deferUpdate();
          config = db.getConfig(guildId);
          if (config.panelMessageId && config.rulesChannelId) {
            const ch = message.guild.channels.cache.get(config.rulesChannelId);
            if (ch?.isTextBased()) {
              const msg = await ch.messages.fetch(config.panelMessageId).catch(() => null);
              if (msg) await msg.delete().catch(() => {});
            }
          }
          db.set(guildId, 'panelMessageId', null);
          return i.editReply({ components: [getContainer()], flags: MessageFlags.IsComponentsV2 });
        }

      } catch (err) {
        console.error('[rconfig] Erreur collector:', err.message);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# 📜 Règlement\n-# *Session expirée — relance \`.rconfig\` pour continuer.*'
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
