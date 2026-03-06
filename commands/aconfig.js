// commands/aconfig.js — .aconfig
// Dashboard de configuration des commandes admin — Components V2
// Sections : overview, access (rôle admin), moderation (mute custom)

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const adminCfgDB = require('../utils/adminConfigDB.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }
function si(v)  { return v ? '✅' : '❌'; }
function rm(id) { return id ? `<@&${id}>` : '*Non défini*'; }

const VIEWS = [
  { v: 'overview',    label: 'Vue d\'ensemble', emoji: '📊', desc: 'Statut global de la config admin' },
  { v: 'access',      label: 'Accès admin',      emoji: '🔑', desc: 'Rôle d\'accès aux commandes admin' },
  { v: 'moderation',  label: 'Modération',        emoji: '⚖️', desc: 'Mute custom, rôle mute, etc.' },
];

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('aconfig_nav')
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
  const c = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚙️ Config Admin — ${guildName}\n` +
        `-# Rôle d'accès et paramètres de modération`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/0.png')
        .setDescription('Admin Config'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🔑 Rôle d'accès aux commandes admin**\n` +
    `${rm(config.adminRoleId)}\n` +
    `-# Les membres avec ce rôle peuvent utiliser les commandes admin du bot (ban, mute, kick, warn…).\n` +
    `-# Les membres avec **Gérer le serveur** ont toujours accès, quel que soit ce rôle.\n\n` +
    `**⚖️ Méthode de mute**\n` +
    `Mode actuel : **${config.muteMode === 'role' ? '🎭 Rôle custom' : '⏰ Timeout Discord'}**\n` +
    `-# *Timeout Discord* : utilise le système natif Discord (durée limitée, visible).\n` +
    `-# *Rôle custom* : attribue un rôle configuré (durable, contrôle manuel).\n\n` +
    `**🎭 Rôle de mute custom**\n` +
    `${rm(config.muteRoleId)}\n` +
    `-# Utilisé uniquement si la méthode est **Rôle custom**.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('overview'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : access ─────────────────────────────────────────────────────────────

function buildAccess(config) {
  const c = new ContainerBuilder().setAccentColor(0xfee75c);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🔑 Accès aux commandes admin\n` +
        `-# Configurer qui peut utiliser les commandes de modération du bot`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/1.png')
        .setDescription('Accès'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🔑 Rôle d'accès admin**\n` +
    `${rm(config.adminRoleId)}\n\n` +
    `-# Les membres possédant ce rôle pourront utiliser toutes les commandes marquées **admin** :\n` +
    `-# \`.ban\` \`.kick\` \`.mute\` \`.warn\` \`.clean\` \`.lock\` \`.slowmode\` \`.move\` et plus.\n\n` +
    `> ⚠️ Les membres avec la permission **Gérer le serveur** ont **toujours** accès, même sans ce rôle.\n` +
    `> Ce rôle permet d'étendre l'accès à des modérateurs sans permission Discord élevée.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aconfig_modal_set_admin_role')
        .setLabel('Définir le rôle admin')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔑'),
      new ButtonBuilder()
        .setCustomId('aconfig_clear_admin_role')
        .setLabel('Supprimer le rôle')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.adminRoleId),
    )
  );
  c.addActionRowComponents(buildNavRow('access'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : moderation ─────────────────────────────────────────────────────────

function buildModeration(config) {
  const isRoleMode = config.muteMode === 'role';
  const c = new ContainerBuilder().setAccentColor(0xed4245);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚖️ Paramètres de modération\n` +
        `-# Configurer la méthode de mute et le rôle associé`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/4.png')
        .setDescription('Modération'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**⏰ Timeout Discord** ${!isRoleMode ? '← *méthode actuelle*' : ''}\n` +
    `-# Utilise le système natif Discord. Durée obligatoire (max 28j). Le membre ne peut pas écrire/parler.\n` +
    `-# Automatiquement levé à l'expiration. Visible dans le profil Discord.\n\n` +
    `**🎭 Rôle custom** ${isRoleMode ? '← *méthode actuelle*' : ''}\n` +
    `-# Attribue le rôle configuré ci-dessous. Pas de durée native → tu gères le retrait du rôle.\n` +
    `-# Utile pour des mutes persistants entre sessions, ou des restrictions partielles (lecture seule, etc.).\n\n` +
    `**🎭 Rôle de mute custom**\n` +
    `${rm(config.muteRoleId)}\n` +
    `-# Ce rôle sera attribué au membre lors d'un \`.mute\` si la méthode *Rôle custom* est active.\n` +
    `-# Configure ses permissions dans les salons pour l'empêcher d'écrire/parler.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aconfig_mute_mode_timeout')
        .setLabel('⏰ Méthode : Timeout Discord')
        .setStyle(!isRoleMode ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!isRoleMode),
      new ButtonBuilder()
        .setCustomId('aconfig_mute_mode_role')
        .setLabel('🎭 Méthode : Rôle custom')
        .setStyle(isRoleMode ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isRoleMode),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aconfig_modal_set_mute_role')
        .setLabel('Définir le rôle de mute')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎭'),
      new ButtonBuilder()
        .setCustomId('aconfig_clear_mute_role')
        .setLabel('Supprimer le rôle')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.muteRoleId),
    )
  );
  c.addActionRowComponents(buildNavRow('moderation'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Dispatch vue ─────────────────────────────────────────────────────────────

function buildView(view, guild) {
  const config = adminCfgDB.getConfig(guild.id);
  switch (view) {
    case 'access':     return buildAccess(config);
    case 'moderation': return buildModeration(config);
    default:           return buildOverview(config, guild.name);
  }
}

// ─── Helpers résolution ───────────────────────────────────────────────────────

function resolveRole(guild, str) {
  if (!str) return null;
  const id = str.replace(/[<@&>]/g, '').trim();
  return guild.roles.cache.get(id) || guild.roles.cache.find(r => r.name === id) || null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  name:        'aconfig',
  aliases:     ['adminconfig', 'acfg', 'admincfg', 'adminconf'],
  description: 'Dashboard de configuration des commandes admin (accès, mute, modération)',
  adminOnly:   true,

  async execute(message, args) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply('❌ Tu as besoin de **Gérer le serveur** pour accéder à cette commande.');

    const SHORTCUT_MAP = {
      access: 'access', acces: 'access', role: 'access', rôle: 'access',
      moderation: 'moderation', mod: 'moderation', mute: 'moderation',
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
        const guild = message.guild;

        // ── Navigation ───────────────────────────────────────────────────────
        if (i.customId === 'aconfig_nav') {
          view = i.values[0];
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle méthode de mute ───────────────────────────────────────────
        if (i.customId === 'aconfig_mute_mode_timeout') {
          adminCfgDB.set(guild.id, 'muteMode', 'timeout');
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }
        if (i.customId === 'aconfig_mute_mode_role') {
          adminCfgDB.set(guild.id, 'muteMode', 'role');
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Supprimer rôles ──────────────────────────────────────────────────
        if (i.customId === 'aconfig_clear_admin_role') {
          adminCfgDB.set(guild.id, 'adminRoleId', null);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }
        if (i.customId === 'aconfig_clear_mute_role') {
          adminCfgDB.set(guild.id, 'muteRoleId', null);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modals ───────────────────────────────────────────────────────────
        if (i.customId === 'aconfig_modal_set_admin_role') {
          const modal = new ModalBuilder()
            .setCustomId('aconfig_modal_set_admin_role')
            .setTitle('🔑 Rôle d\'accès admin')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('role')
                  .setLabel('ID ou nom du rôle')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('1234567890 ou Modérateur')
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          let mi;
          try { mi = await i.awaitModalSubmit({ filter: m => m.customId === 'aconfig_modal_set_admin_role', time: 300_000 }); }
          catch { return; }
          await mi.deferUpdate();
          const role = resolveRole(guild, mi.fields.getTextInputValue('role'));
          if (role) adminCfgDB.set(guild.id, 'adminRoleId', role.id);
          return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === 'aconfig_modal_set_mute_role') {
          const modal = new ModalBuilder()
            .setCustomId('aconfig_modal_set_mute_role')
            .setTitle('🎭 Rôle de mute custom')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('role')
                  .setLabel('ID ou nom du rôle')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('1234567890 ou Muted')
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          let mi;
          try { mi = await i.awaitModalSubmit({ filter: m => m.customId === 'aconfig_modal_set_mute_role', time: 300_000 }); }
          catch { return; }
          await mi.deferUpdate();
          const role = resolveRole(guild, mi.fields.getTextInputValue('role'));
          if (role) adminCfgDB.set(guild.id, 'muteRoleId', role.id);
          return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

      } catch (err) {
        console.error('[aconfig] Erreur collector:', err.message);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              '# ⚙️ Config Admin\n-# *Session expirée — relance `.aconfig` pour continuer.*'
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
