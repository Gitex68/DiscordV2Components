// commands/sconfig.js — .sconfig
// Dashboard interactif de configuration des salons compteurs dynamiques.
// Components V2 — discord.js v14
//
// Règles importantes :
//   - Ne JAMAIS modifier channel.name manuellement (source de vérité = JSON via counterDB)
//   - forceRenameChannel() est toujours appelé en fire-and-forget (.catch) depuis les handlers
//     boutons (pas de await) pour éviter de bloquer l'update UI
//   - Les modals (create/set/tpl) font await forceRenameChannel car ils utilisent mi.editReply
//   - modalOpen empêche le collector de traiter d'autres clics pendant qu'un modal est ouvert

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');

const cdb     = require('../utils/counterDB.js');
const manager = require('../utils/counterManager.js');

// ─── Données statiques ────────────────────────────────────────────────────────

const VIEWS = [
  { v: 'overview', label: "Vue d'ensemble", emoji: '📊', desc: 'Statut global des compteurs' },
  { v: 'members',  label: 'Membres',        emoji: '👥', desc: 'Total membres (bots exclus)' },
  { v: 'online',   label: 'En ligne',       emoji: '🟢', desc: 'Membres connectés (bots exclus)' },
  { v: 'voice',    label: 'En vocal',       emoji: '🔊', desc: 'Membres en salon vocal (bots exclus)' },
  { v: 'bots',     label: 'Bots',           emoji: '🤖', desc: 'Nombre de bots du serveur' },
  { v: 'boosts',   label: 'Boosts',         emoji: '✨', desc: 'Boosts actifs du serveur' },
];

const PRESETS = {
  members: ['👥 Membres : {count}', '🌍 {count} membres', '👤 {count} humains'],
  online:  ['🟢 En ligne : {count}', '✅ {count} connectés', '💚 {count} en ligne'],
  voice:   ['�� En vocal : {count}', '🎙️ {count} en vocal', '📢 {count} parlent'],
  bots:    ['🤖 Bots : {count}', '⚙️ {count} bots'],
  boosts:  ['✨ Boosts : {count}', '🚀 {count} boosts', '💎 {count} Nitro'],
};

const COLORS = { members: 0x5865f2, online: 0x57f287, voice: 0xfee75c, bots: 0x99aab5, boosts: 0xeb459e };
const ICONS  = {
  members: 'https://cdn.discordapp.com/embed/avatars/0.png',
  online:  'https://cdn.discordapp.com/embed/avatars/2.png',
  voice:   'https://cdn.discordapp.com/embed/avatars/1.png',
  bots:    'https://cdn.discordapp.com/embed/avatars/3.png',
  boosts:  'https://cdn.discordapp.com/embed/avatars/4.png',
};
const NOTES = {
  members: '-# Les bots ne sont **pas comptés**',
  online:  '-# Les bots ne sont **pas comptés** · inclut : en ligne, occupé, ne pas déranger',
  voice:   '-# Les bots ne sont **pas comptés**',
  bots:    '-# Seuls les bots sont comptés',
  boosts:  '-# Nombre de boosts Nitro actifs sur le serveur',
};

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}
function si(v) { return v ? '✅' : '❌'; }

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sconfig_nav')
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

// ─── Builders de vues ─────────────────────────────────────────────────────────

function buildOverview(guild) {
  const config   = cdb.getGuild(guild.id);
  const values   = manager.computeValues(guild);
  const iconURL  = guild.iconURL({ size: 64, extension: 'png' }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
  const actifs   = Object.keys(cdb.TYPES).filter(t => config[t]?.channelId);
  const total    = Object.keys(cdb.TYPES).length;
  const ready    = actifs.length > 0;

  const lines = Object.entries(cdb.TYPES).map(([type, meta]) => {
    const cfg = config[type];
    if (!cfg?.channelId) return `${meta.emoji} **${meta.label}** — ${si(false)} *Non configuré*`;
    const ch = guild.channels.cache.get(cfg.channelId);
    return `${meta.emoji} **${meta.label}** — ${si(true)} ${ch ? `<#${ch.id}>` : `~~\`${cfg.channelId}\`~~ *(supprimé)*`}`;
  }).join('\n');

  const statsLine =
    `👥 **${values.members}** membres · 🟢 **${values.online}** en ligne · ` +
    `🤖 **${values.bots}** bots · 🔊 **${values.voice}** en vocal · ✨ **${values.boosts}** boosts`;

  const c = new ContainerBuilder().setAccentColor(ready ? 0x57f287 : 0xfee75c);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📊 Compteurs dynamiques — ${guild.name}\n` +
        `-# ${ready ? `✅ ${actifs.length}/${total} compteur${actifs.length > 1 ? 's actifs' : ' actif'}` : '⚠️ Aucun compteur configuré'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL).setDescription('Icône'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## 📡 Valeurs actuelles\n${statsLine}\n-# Bots exclus des compteurs membres, en ligne et vocal`
  ));
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔧 État des compteurs\n\n${lines}`));
  if (!ready) {
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> ⚠️ **Aucun compteur actif**\n> Sélectionne un type dans le menu pour assigner un salon vocal.`
    ));
  }
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('overview'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sconfig_refresh').setLabel('Forcer la mise à jour').setStyle(ButtonStyle.Success).setEmoji('🔄'),
    new ButtonBuilder().setCustomId('sconfig_reset_ask').setLabel('Réinitialiser tout').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  ));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '-# Utilise le menu pour configurer chaque compteur · expire dans 5 min'
  ));
  return c;
}

function buildTypeView(guild, type) {
  const meta   = cdb.TYPES[type];
  const config = cdb.getGuild(guild.id);
  const cfg    = config[type];
  const values = manager.computeValues(guild);

  const isSet      = !!cfg?.channelId;
  const currentVal = values[type] ?? 0;
  const template   = cfg?.template ?? meta.defaultTemplate;
  const preview    = template.replace(/\{count\}/g, currentVal);

  const c = new ContainerBuilder().setAccentColor(COLORS[type] ?? 0x5865f2);
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ${meta.emoji} Compteur — ${meta.label}\n` +
        `-# ${isSet ? `✅ Actif · valeur actuelle : **${currentVal}**` : '⚠️ Non configuré'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(ICONS[type]).setDescription(meta.label))
  );
  c.addSeparatorComponents(sep());

  // ── Bloc config ─────────────────────────────────────────────────────────────
  let chLine;
  if (!isSet) {
    chLine = '*Aucun*';
  } else {
    const ch = guild.channels.cache.get(cfg.channelId);
    chLine   = ch ? `<#${ch.id}> \`${preview}\`` : `~~\`${cfg.channelId}\`~~ *(supprimé)*`;
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## ⚙️ Configuration\n\n` +
    `**Salon vocal assigné**\n${si(isSet)} ${chLine}\n\n` +
    `**Template du nom**\n\`${template}\`\n` +
    `-# Rendu actuel : **${preview}**\n` +
    NOTES[type]
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow(type));

  // ── Boutons principal : créer / changer ──────────────────────────────────
  if (isSet) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sconfig_set_${type}`).setLabel('Changer de salon').setStyle(ButtonStyle.Primary).setEmoji('📌'),
    ));
  } else {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sconfig_create_${type}`).setLabel('Créer le salon auto').setStyle(ButtonStyle.Success).setEmoji('✨'),
      new ButtonBuilder().setCustomId(`sconfig_set_${type}`).setLabel('Assigner un salon existant').setStyle(ButtonStyle.Primary).setEmoji('📌'),
    ));
  }

  // ── Boutons secondaires : template + retirer ─────────────────────────────
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sconfig_tpl_${type}`).setLabel('Modifier le template').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
    ...(isSet ? [
      new ButtonBuilder().setCustomId(`sconfig_remove_${type}`).setLabel('Retirer ce compteur').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    ] : []),
  ));

  // ── Presets de templates (tags) ──────────────────────────────────────────
  const presets = PRESETS[type] ?? [];
  if (presets.length) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Templates rapides :**'));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      presets.map((p, idx) =>
        new ButtonBuilder()
          .setCustomId(`sconfig_preset_${type}_${idx}`)
          .setLabel(p.length > 40 ? p.slice(0, 39) + '…' : p)
          .setStyle(template === p ? ButtonStyle.Primary : ButtonStyle.Secondary)
      )
    ));
  }

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# expire dans 5 min'));
  return c;
}

function buildConfirm(title, desc, confirmId, cancelId) {
  return new ContainerBuilder().setAccentColor(0xed4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n${desc}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('Confirmer').setStyle(ButtonStyle.Danger).setEmoji('✅'),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Annuler').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
    ));
}

function buildError(msg, backType) {
  return new ContainerBuilder().setAccentColor(0xed4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(msg))
    .addSeparatorComponents(sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sconfig_back_${backType ?? 'overview'}`)
        .setLabel('← Retour')
        .setStyle(ButtonStyle.Secondary),
    ));
}

function getView(v, guild) {
  if (v === 'overview' || !cdb.TYPES[v]) return buildOverview(guild);
  return buildTypeView(guild, v);
}

// ─── Commande principale ──────────────────────────────────────────────────────

module.exports = {
  name:        'sconfig',
  aliases:     ['statsconfig', 'counters', 'scfg'],
  description: 'Configure les salons compteurs dynamiques du serveur',
  adminOnly:   true,

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '# ❌ Permission insuffisante\nTu dois avoir **Gérer le serveur** pour configurer les compteurs.'
          ))],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // Raccourci vue initiale via arg (ex: .sconfig members)
    const SHORTCUT = {
      members: 'members', membre: 'members', membres: 'members',
      online:  'online',  ligne:  'online',
      voice:   'voice',   vocal:  'voice',
      bots:    'bots',    bot:    'bots',
      boosts:  'boosts',  boost:  'boosts',
    };
    let view = SHORTCUT[args[0]?.toLowerCase()] ?? 'overview';

    const freshView = () => getView(view, message.guild);

    const reply = await message.reply({
      components: [freshView()],
      flags: MessageFlags.IsComponentsV2,
    });

    // Flag : un modal est actuellement ouvert — on ignore les autres clics
    let modalOpen = false;

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time:   300_000,
    });

    // ─── Helper update message ──────────────────────────────────────────────
    // Après i.deferUpdate() → editReply ; sinon → i.update() direct
    const upd = async (i, components) => {
      if (i.deferred || i.replied) {
        return i.editReply({ components, flags: MessageFlags.IsComponentsV2 }).catch(console.error);
      }
      return i.update({ components, flags: MessageFlags.IsComponentsV2 }).catch(console.error);
    };

    // ─── Collector ────────────────────────────────────────────────────────
    collector.on('collect', async (i) => {
      // Si modal ouvert → acquitter silencieusement
      if (modalOpen) {
        await i.deferUpdate().catch(() => {});
        return;
      }

      try {
        const id = i.customId;

        // ── Navigation ──────────────────────────────────────────────────────
        if (i.isStringSelectMenu() && id === 'sconfig_nav') {
          view = i.values[0];
          return upd(i, [freshView()]);
        }

        // ── Retour ──────────────────────────────────────────────────────────
        if (id.startsWith('sconfig_back_')) {
          const target = id.replace('sconfig_back_', '');
          view = cdb.TYPES[target] ? target : 'overview';
          return upd(i, [freshView()]);
        }

        // ── Refresh forcé ──────────────────────────────────────────────────
        // C'est une opération longue → deferUpdate d'abord
        if (id === 'sconfig_refresh') {
          await i.deferUpdate().catch(() => {});
          await manager.forceRefresh(message.guild);
          return upd(i, [freshView()]);
        }

        // ── Réinitialiser (demande confirmation) ───────────────────────────
        if (id === 'sconfig_reset_ask') {
          const config = cdb.getGuild(message.guild.id);
          const count  = Object.values(config).filter(c => c?.channelId).length;
          return upd(i, [buildConfirm(
            '🗑️ Réinitialiser tous les compteurs',
            `> **${count} salon${count !== 1 ? 's' : ''} vocal${count !== 1 ? 'aux' : ''}** seront **supprimés définitivement**.\n> Cette action est irréversible.`,
            'sconfig_reset_ok', 'sconfig_reset_cancel'
          )]);
        }
        if (id === 'sconfig_reset_cancel') {
          return upd(i, [freshView()]);
        }
        if (id === 'sconfig_reset_ok') {
          await i.deferUpdate().catch(() => {});
          await manager.resetGuild(message.guild);
          view = 'overview';
          return upd(i, [freshView()]);
        }

        // ── Retirer un compteur ────────────────────────────────────────────
        if (id.startsWith('sconfig_remove_ok_')) {
          const type = id.replace('sconfig_remove_ok_', '');
          if (!cdb.TYPES[type]) return upd(i, [freshView()]);
          const oldCfg = cdb.getGuild(message.guild.id)[type];
          if (oldCfg?.channelId) {
            manager.unregisterChannel(oldCfg.channelId);
            const ch = message.guild.channels.cache.get(oldCfg.channelId);
            if (ch) await ch.delete('Compteur retiré via .sconfig').catch(() => {});
          }
          cdb.removeCounter(message.guild.id, type);
          return upd(i, [freshView()]);
        }
        if (id.startsWith('sconfig_remove_')) {
          const type = id.replace('sconfig_remove_', '');
          if (!cdb.TYPES[type]) return upd(i, [freshView()]);
          const meta  = cdb.TYPES[type];
          const cfg   = cdb.getGuild(message.guild.id)[type];
          const ch    = cfg?.channelId ? message.guild.channels.cache.get(cfg.channelId) : null;
          const chStr = ch ? `<#${ch.id}>` : `\`${cfg?.channelId}\``;
          return upd(i, [buildConfirm(
            `🗑️ Retirer le compteur ${meta.label}`,
            `> Le salon ${chStr} sera **supprimé définitivement**.\n> Cette action est irréversible.`,
            `sconfig_remove_ok_${type}`,
            `sconfig_back_${type}`,
          )]);
        }

        // ── Preset (tag rapide) ────────────────────────────────────────────
        // Pattern : sconfig_preset_{type}_{idx}
        if (id.startsWith('sconfig_preset_')) {
          const rest   = id.replace('sconfig_preset_', '');
          const lastUs = rest.lastIndexOf('_');
          const type   = rest.slice(0, lastUs);
          const idx    = parseInt(rest.slice(lastUs + 1), 10);

          if (!cdb.TYPES[type] || isNaN(idx)) return upd(i, [freshView()]);
          const presets = PRESETS[type];
          if (!presets || idx >= presets.length) return upd(i, [freshView()]);

          // Lire l'état courant depuis le JSON (pas channel.name)
          const cfg = cdb.getGuild(message.guild.id)[type];
          if (!cfg?.channelId) {
            return upd(i, [buildError("❌ Assigne d'abord un **salon vocal** à ce compteur.", type)]);
          }

          const newTpl  = presets[idx];
          const channel = message.guild.channels.cache.get(cfg.channelId);
          const values  = manager.computeValues(message.guild);
          const newName = newTpl.replace(/\{count\}/g, values[type] ?? 0);

          // 1. Persister le nouveau template dans le JSON
          cdb.setCounter(message.guild.id, type, cfg.channelId, newTpl);
          // 2. S'assurer que l'index est à jour
          manager.registerChannel(cfg.channelId, message.guild.id, type);
          // 3. Lancer le rename en arrière-plan (fire-and-forget)
          if (channel) {
            manager.forceRenameChannel(channel, newName, `Preset "${newTpl}" via .sconfig`).catch(console.error);
          }
          // 4. Mettre à jour l'UI immédiatement (pas d'await sur le rename)
          return upd(i, [getView(type, message.guild)]);
        }

        // ── Modal : créer salon auto ───────────────────────────────────────
        if (id.startsWith('sconfig_create_')) {
          const type = id.replace('sconfig_create_', '');
          if (!cdb.TYPES[type]) return i.deferUpdate().catch(() => {});
          const meta        = cdb.TYPES[type];
          const defaultName = meta.defaultTemplate.replace(/\{count\}/g, '0');

          const modal = new ModalBuilder()
            .setCustomId(`sconfig_modal_create_${type}`)
            .setTitle(`${meta.emoji} Créer le salon — ${meta.label}`)
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('channel_name')
                  .setLabel('Nom initial du salon vocal')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder(defaultName)
                  .setValue(defaultName)
                  .setRequired(true)
                  .setMinLength(1)
                  .setMaxLength(50),
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('category_id')
                  .setLabel('ID de catégorie parente (optionnel)')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Laisser vide = pas de catégorie')
                  .setRequired(false)
                  .setMinLength(0)
                  .setMaxLength(20),
              ),
            );
          modalOpen = true;
          await i.showModal(modal);

          let mi;
          try {
            mi = await i.awaitModalSubmit({ time: 120_000, filter: m => m.user.id === message.author.id });
          } catch { modalOpen = false; return; }
          await mi.deferUpdate();
          modalOpen = false;

          const channelName = mi.fields.getTextInputValue('channel_name').trim();
          const categoryRaw = mi.fields.getTextInputValue('category_id').trim().replace(/[<#>]/g, '');

          let parent = null;
          if (categoryRaw) {
            const cat = message.guild.channels.cache.get(categoryRaw);
            if (!cat || cat.type !== ChannelType.GuildCategory) {
              return mi.editReply({
                components: [buildError(
                  `# ❌ Catégorie introuvable\nL'ID \`${categoryRaw}\` ne correspond à aucune catégorie.\n-# Laisse le champ vide pour créer le salon sans catégorie.`,
                  type
                )],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            parent = cat;
          }

          let channel;
          try {
            channel = await message.guild.channels.create({
              name:   channelName,
              type:   ChannelType.GuildVoice,
              parent: parent?.id ?? null,
              reason: `Compteur dynamique "${type}" créé via .sconfig`,
              permissionOverwrites: [
                { id: message.guild.roles.everyone.id, deny: ['Connect'] },
              ],
            });
          } catch (err) {
            return mi.editReply({
              components: [buildError(
                `# ❌ Impossible de créer le salon\n\`${err.message}\`\n-# Vérifie que le bot a la permission **Gérer les salons**.`,
                type
              )],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          // Calculer le bon nom avec la vraie valeur actuelle
          const existingCfg = cdb.getGuild(message.guild.id);
          const tpl         = existingCfg[type]?.template ?? cdb.TYPES[type].defaultTemplate;
          const values      = manager.computeValues(message.guild);
          const initialName = tpl.replace(/\{count\}/g, values[type] ?? 0);

          // Persister d'abord dans le JSON, puis renommer
          cdb.setCounter(message.guild.id, type, channel.id, tpl);
          manager.registerChannel(channel.id, message.guild.id, type);
          // Ici on peut await car on est dans le flux modal (mi.editReply après)
          await manager.forceRenameChannel(channel, initialName, `Compteur "${type}" — init`);

          return mi.editReply({ components: [getView(type, message.guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modal : assigner salon existant ───────────────────────────────
        if (id.startsWith('sconfig_set_')) {
          const type = id.replace('sconfig_set_', '');
          if (!cdb.TYPES[type]) return i.deferUpdate().catch(() => {});
          const meta = cdb.TYPES[type];
          const cfg  = cdb.getGuild(message.guild.id);

          const modal = new ModalBuilder()
            .setCustomId(`sconfig_modal_set_${type}`)
            .setTitle(`${meta.emoji} ${meta.label} — Assigner un salon`)
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('channel_id')
                  .setLabel('ID du salon vocal')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Ex: 1234567890123456789')
                  .setValue(cfg[type]?.channelId ?? '')
                  .setRequired(true)
                  .setMinLength(15)
                  .setMaxLength(20),
              )
            );
          modalOpen = true;
          await i.showModal(modal);

          let mi;
          try {
            mi = await i.awaitModalSubmit({ time: 120_000, filter: m => m.user.id === message.author.id });
          } catch { modalOpen = false; return; }
          await mi.deferUpdate();
          modalOpen = false;

          const rawId   = mi.fields.getTextInputValue('channel_id').trim().replace(/[<#>]/g, '');
          const channel = message.guild.channels.cache.get(rawId);

          if (!channel) {
            return mi.editReply({
              components: [buildError(
                `# ❌ Salon introuvable\nL'ID \`${rawId}\` ne correspond à aucun salon de ce serveur.\n-# Vérifie l'ID et réessaie.`,
                type
              )],
              flags: MessageFlags.IsComponentsV2,
            });
          }
          if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
            return mi.editReply({
              components: [buildError(
                `# ❌ Mauvais type de salon\n<#${channel.id}> n'est pas un **salon vocal**.\n-# Le bot modifie le nom du salon → il doit être vocal.`,
                type
              )],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          const existingCfg = cdb.getGuild(message.guild.id);
          // Désinscrire l'ancien salon si différent
          if (existingCfg[type]?.channelId && existingCfg[type].channelId !== channel.id) {
            manager.unregisterChannel(existingCfg[type].channelId);
          }

          const template = existingCfg[type]?.template ?? cdb.TYPES[type].defaultTemplate;
          const values   = manager.computeValues(message.guild);
          const newName  = template.replace(/\{count\}/g, values[type] ?? 0);

          // Persister d'abord, puis renommer
          cdb.setCounter(message.guild.id, type, channel.id, template);
          manager.registerChannel(channel.id, message.guild.id, type);
          await manager.forceRenameChannel(channel, newName, `Compteur "${type}" — assignation`);

          return mi.editReply({ components: [getView(type, message.guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modal : modifier template ─────────────────────────────────────
        if (id.startsWith('sconfig_tpl_')) {
          const type = id.replace('sconfig_tpl_', '');
          if (!cdb.TYPES[type]) return i.deferUpdate().catch(() => {});
          const meta = cdb.TYPES[type];
          const cfg  = cdb.getGuild(message.guild.id);

          const modal = new ModalBuilder()
            .setCustomId(`sconfig_modal_tpl_${type}`)
            .setTitle(`${meta.emoji} ${meta.label} — Template`)
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('template')
                  .setLabel('Template (doit contenir {count})')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder(meta.defaultTemplate)
                  .setValue(cfg[type]?.template ?? meta.defaultTemplate)
                  .setRequired(true)
                  .setMinLength(3)
                  .setMaxLength(50),
              )
            );
          modalOpen = true;
          await i.showModal(modal);

          let mi;
          try {
            mi = await i.awaitModalSubmit({ time: 120_000, filter: m => m.user.id === message.author.id });
          } catch { modalOpen = false; return; }
          await mi.deferUpdate();
          modalOpen = false;

          const template = mi.fields.getTextInputValue('template').trim();
          if (!template.includes('{count}')) {
            return mi.editReply({
              components: [buildError(
                `# ❌ Template invalide\nLe template doit contenir \`{count}\`.\n-# Exemple : \`${meta.defaultTemplate}\``,
                type
              )],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          const currentCfg = cdb.getGuild(message.guild.id);
          if (!currentCfg[type]?.channelId) {
            return mi.editReply({
              components: [buildError("# ❌ Aucun salon assigné\nAssigne d'abord un salon vocal à ce compteur.", type)],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          const channel = message.guild.channels.cache.get(currentCfg[type].channelId);
          const values  = manager.computeValues(message.guild);
          const newName = template.replace(/\{count\}/g, values[type] ?? 0);

          // Persister d'abord, puis renommer
          cdb.setCounter(message.guild.id, type, currentCfg[type].channelId, template);
          manager.registerChannel(currentCfg[type].channelId, message.guild.id, type);
          // Ici on peut await car on est dans le flux modal (mi.editReply après)
          if (channel) await manager.forceRenameChannel(channel, newName, `Template "${template}" via .sconfig`);

          return mi.editReply({ components: [getView(type, message.guild)], flags: MessageFlags.IsComponentsV2 });
        }

      } catch (err) {
        console.error('[sconfig] Erreur collector:', err.message);
        if (!i.replied && !i.deferred) await i.deferUpdate().catch(() => {});
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  },
};
