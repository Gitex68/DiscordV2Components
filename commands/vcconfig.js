// commands/vcconfig.js — .vcconfig
// Dashboard interactif de configuration du système de salons vocaux temporaires.
// Sections : overview, setup (hub + catégorie), options (limite, template, toggles)

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');

const db      = require('../utils/tempVoiceDB.js');
const manager = require('../utils/tempVoiceManager.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sep() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }
function tog(v) { return v ? '🟢' : '🔴'; }
function si(v)  { return v ? '✅' : '❌'; }
function cm(id) { return id ? `<#${id}>` : '*Non défini*'; }

const VIEWS = [
  { v: 'overview', label: 'Vue d\'ensemble', emoji: '📊', desc: 'Statut global du système'        },
  { v: 'setup',    label: 'Configuration',   emoji: '🔧', desc: 'Hub vocal, catégorie, création' },
  { v: 'options',  label: 'Options',          emoji: '⚙️', desc: 'Limite, template, permissions' },
];

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('vcconfig_nav')
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
  const ready = config.enabled && config.hubChannelId;
  const c = new ContainerBuilder().setAccentColor(ready ? 0x5865f2 : config.hubChannelId ? 0xfee75c : 0xed4245);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🎙️ Salons Vocaux Temp — ${guildName}\n` +
        `-# ${ready ? '✅ Système actif' : config.hubChannelId ? '⚠️ Désactivé' : '❌ Non configuré'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/2.png')
        .setDescription('Salons vocaux temporaires'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `${tog(config.enabled)} Système **${config.enabled ? 'activé' : 'désactivé'}**\n` +
    `🚪 Salon hub : ${cm(config.hubChannelId)}\n` +
    `📁 Catégorie : ${config.categoryId ? cm(config.categoryId) : '*Même catégorie que le hub*'}\n` +
    `👥 Limite par défaut : **${config.defaultLimit > 0 ? config.defaultLimit + ' pers.' : 'Illimitée'}**\n` +
    `✏️ Template de nom : \`${config.nameTemplate ?? '🎮 {username}'}\`\n` +
    `${si(config.allowRename)} Renommage par l\'owner\n` +
    `${si(config.allowLimit)} Modification de limite\n` +
    `${si(config.allowLock)} Verrouillage du salon`
  ));

  if (!config.hubChannelId) {
    c.addSeparatorComponents(sep());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> ⚠️ **Action requise :** Définis un salon hub dans **Configuration**.`
    ));
  }

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vcconfig_toggle')
        .setLabel(config.enabled ? 'Désactiver' : 'Activer')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(config.enabled ? '🔴' : '🟢')
        .setDisabled(!config.hubChannelId),
    )
  );
  c.addActionRowComponents(buildNavRow('overview'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : setup ─────────────────────────────────────────────────────────────

function buildSetup(config, guild) {
  const c = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🔧 Configuration\n-# Salon hub et catégorie des salons temporaires`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/0.png').setDescription('Setup'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**🚪 Salon hub**\n` +
    `${cm(config.hubChannelId)}\n` +
    `-# Salon vocal que les membres rejoignent pour créer leur salon perso.\n` +
    `-# Idéalement nommé **"+ Créer un salon"** ou similaire.\n\n` +
    `**📁 Catégorie des salons temp**\n` +
    `${config.categoryId ? cm(config.categoryId) : '*Même catégorie que le hub*'}\n` +
    `-# Les salons temporaires créés y seront placés. Si vide, utilise la catégorie du hub.`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vcconfig_modal_set_hub')
        .setLabel('Définir le hub')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚪'),
      new ButtonBuilder()
        .setCustomId('vcconfig_create_hub')
        .setLabel('Créer le hub')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨')
        .setDisabled(!!config.hubChannelId),
      new ButtonBuilder()
        .setCustomId('vcconfig_clear_hub')
        .setLabel('Supprimer le hub')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!config.hubChannelId),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vcconfig_modal_set_category')
        .setLabel('Définir la catégorie')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📁'),
      new ButtonBuilder()
        .setCustomId('vcconfig_clear_category')
        .setLabel('Utiliser catégorie du hub')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('♻️')
        .setDisabled(!config.categoryId),
    )
  );
  c.addActionRowComponents(buildNavRow('setup'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Vue : options ────────────────────────────────────────────────────────────

function buildOptions(config) {
  const c = new ContainerBuilder().setAccentColor(0x57f287);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚙️ Options\n-# Comportement et permissions des salons temporaires`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder()
        .setURL('https://cdn.discordapp.com/embed/avatars/1.png').setDescription('Options'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**👥 Limite par défaut**\n` +
    `${config.defaultLimit > 0 ? `**${config.defaultLimit}** personnes` : '**Illimitée** (0)'}\n` +
    `-# Limite de membres pour les nouveaux salons temporaires.\n\n` +
    `**✏️ Template de nom**\n` +
    `\`${config.nameTemplate ?? '🎮 {username}'}\`\n` +
    `-# Variables : \`{username}\` \`{displayname}\` \`{tag}\`\n\n` +
    `**🔒 Permissions des owners**\n` +
    `${si(config.allowRename)} Renommer le salon\n` +
    `${si(config.allowLimit)} Modifier la limite\n` +
    `${si(config.allowLock)} Verrouiller/déverrouiller`
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vcconfig_modal_limit')
        .setLabel(`Limite (${config.defaultLimit ?? 0})`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('vcconfig_modal_template')
        .setLabel('Template de nom')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️'),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vcconfig_toggle_rename')
        .setLabel(config.allowRename ? 'Désactiver renommage' : 'Activer renommage')
        .setStyle(config.allowRename ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji('✏️'),
      new ButtonBuilder()
        .setCustomId('vcconfig_toggle_limit')
        .setLabel(config.allowLimit ? 'Désactiver limite' : 'Activer limite')
        .setStyle(config.allowLimit ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('vcconfig_toggle_lock')
        .setLabel(config.allowLock ? 'Désactiver verrou' : 'Activer verrou')
        .setStyle(config.allowLock ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji('🔒'),
    )
  );
  c.addActionRowComponents(buildNavRow('options'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer · expire dans 5 min'));
  return c;
}

// ─── Dispatch vue ─────────────────────────────────────────────────────────────

function buildView(view, guild) {
  const config = db.getConfig(guild.id);
  switch (view) {
    case 'setup':   return buildSetup(config, guild);
    case 'options': return buildOptions(config);
    default:        return buildOverview(config, guild.name);
  }
}

// ─── Modals ───────────────────────────────────────────────────────────────────

const MODALS = {
  vcconfig_modal_set_hub: {
    title: '🚪 Salon hub vocal',
    inputs: [{ id: 'hub', label: 'ID ou #mention du salon vocal', placeholder: '1234567890', required: true }],
  },
  vcconfig_modal_set_category: {
    title: '📁 Catégorie des salons temp',
    inputs: [{ id: 'category', label: 'ID de la catégorie', placeholder: '1234567890', required: true }],
  },
  vcconfig_modal_limit: {
    title: '👥 Limite par défaut',
    inputs: [{ id: 'limit', label: 'Limite (0 = illimitée, max 99)', placeholder: '0', required: true }],
  },
  vcconfig_modal_template: {
    title: '✏️ Template de nom',
    inputs: [{ id: 'template', label: 'Template (max 50 car.)', placeholder: '🎮 {username}', required: true }],
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

function resolveChannel(guild, str, type) {
  if (!str) return null;
  const id = str.replace(/[<#>]/g, '').trim();
  const ch = guild.channels.cache.get(id) || guild.channels.cache.find(c => c.name === id);
  if (!ch) return null;
  if (type && ch.type !== type) return null;
  return ch;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  name:        'vcconfig',
  aliases:     ['voiceconfig', 'vc', 'tempvoice', 'tvconfig', 'tvc'],
  description: 'Dashboard de configuration du système de salons vocaux temporaires',
  adminOnly:   true,

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply('❌ Tu as besoin de **Gérer le serveur** pour accéder à cette commande.');

    const SHORTCUT_MAP = {
      setup:    'setup',   config: 'setup',   hub: 'setup',
      options:  'options', option: 'options', opt: 'options',
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

        // ── Navigation ────────────────────────────────────────────────────────
        if (i.customId === 'vcconfig_nav') {
          view = i.values[0];
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggle activé ─────────────────────────────────────────────────────
        if (i.customId === 'vcconfig_toggle') {
          db.set(guild.id, 'enabled', !config.enabled);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Clear hub ─────────────────────────────────────────────────────────
        if (i.customId === 'vcconfig_clear_hub') {
          db.set(guild.id, 'hubChannelId', null);
          db.set(guild.id, 'enabled', false);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Clear catégorie ───────────────────────────────────────────────────
        if (i.customId === 'vcconfig_clear_category') {
          db.set(guild.id, 'categoryId', null);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Créer hub automatiquement ─────────────────────────────────────────
        if (i.customId === 'vcconfig_create_hub') {
          await i.deferUpdate();
          try {
            const hub = await guild.channels.create({
              name: '➕ Créer un salon',
              type: ChannelType.GuildVoice,
            });
            db.set(guild.id, 'hubChannelId', hub.id);
          } catch (e) {
            console.error('[vcconfig] Impossible de créer le hub:', e.message);
          }
          return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Toggles options ───────────────────────────────────────────────────
        if (i.customId === 'vcconfig_toggle_rename') {
          db.set(guild.id, 'allowRename', !config.allowRename);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }
        if (i.customId === 'vcconfig_toggle_limit') {
          db.set(guild.id, 'allowLimit', !config.allowLimit);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }
        if (i.customId === 'vcconfig_toggle_lock') {
          db.set(guild.id, 'allowLock', !config.allowLock);
          return i.update({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
        }

        // ── Modals ────────────────────────────────────────────────────────────
        if (MODALS[i.customId]) {
          const modal = buildModal(i.customId);
          if (!modal) return;
          await i.showModal(modal);

          let mi;
          try {
            mi = await i.awaitModalSubmit({ filter: m => m.customId === i.customId, time: 300_000 });
          } catch {
            return;
          }

          try {
            await mi.deferUpdate();
            // ── Set hub ───────────────────────────────────────────────────────
            if (mi.customId === 'vcconfig_modal_set_hub') {
              const raw = mi.fields.getTextInputValue('hub');
              const ch  = resolveChannel(guild, raw, ChannelType.GuildVoice);
              if (ch) db.set(guild.id, 'hubChannelId', ch.id);
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            // ── Set catégorie ─────────────────────────────────────────────────
            if (mi.customId === 'vcconfig_modal_set_category') {
              const raw = mi.fields.getTextInputValue('category');
              const ch  = resolveChannel(guild, raw, ChannelType.GuildCategory);
              if (ch) db.set(guild.id, 'categoryId', ch.id);
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            // ── Limite ────────────────────────────────────────────────────────
            if (mi.customId === 'vcconfig_modal_limit') {
              const raw = mi.fields.getTextInputValue('limit');
              const val = parseInt(raw, 10);
              if (!isNaN(val) && val >= 0 && val <= 99) db.set(guild.id, 'defaultLimit', val);
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

            // ── Template ──────────────────────────────────────────────────────
            if (mi.customId === 'vcconfig_modal_template') {
              const raw = mi.fields.getTextInputValue('template').trim();
              if (raw && raw.length <= 50 && (raw.includes('{username}') || raw.includes('{displayname}') || raw.includes('{tag}'))) {
                db.set(guild.id, 'nameTemplate', raw);
              }
              return reply.edit({ components: [buildView(view, guild)], flags: MessageFlags.IsComponentsV2 });
            }

          } catch (err) {
            console.error('[vcconfig] Modal submit error:', err.message);
          }
          return;
        }

      } catch (err) {
        console.error('[vcconfig] Erreur collector:', err.message);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              '# 🎙️ Salons Vocaux Temp\n-# *Session expirée — relance `.vcconfig` pour continuer.*'
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
