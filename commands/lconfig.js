// commands/lconfig.js — .lconfig
// Dashboard de configuration des logs serveur
// Permet d'activer/désactiver les logs, définir un salon global, et configurer par catégorie/event.

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const logDB = require('../logs/logDB.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ON  = '🟢';
const OFF = '🔴';
function tog(v)   { return v ? ON  : OFF; }
function cm(id)   { return id ? `<#${id}>` : '*Non défini*'; }
function sep()    { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }

const { EVENT_CATEGORIES } = logDB;
const CAT_KEYS = Object.keys(EVENT_CATEGORIES);

// ─── Navigation ──────────────────────────────────────────────────────────────
const VIEWS = [
  { v: 'overview',  label: 'Vue d\'ensemble', emoji: '📊', desc: 'Statut global des logs' },
  ...CAT_KEYS.map(k => ({
    v:     `cat_${k}`,
    label: EVENT_CATEGORIES[k].label,
    emoji: EVENT_CATEGORIES[k].label.split(' ')[0],
    desc:  `Configurer les logs "${EVENT_CATEGORIES[k].label}"`,
  })),
];

function buildNavRow(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lconfig_nav')
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

// ─── Vue d'ensemble ────────────────────────────────────────────────────────────
function buildOverview(cfg, guildName) {
  const c = new ContainerBuilder().setAccentColor(cfg.enabled ? 0x57f287 : 0x99aab5);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📋 Logs Serveur — ${guildName}\n` +
        `-# ${cfg.enabled ? '🟢 Actif' : '🔴 Inactif'}`
      ))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/4.png').setDescription('Logs'))
  );
  c.addSeparatorComponents(sep());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**État général** : ${tog(cfg.enabled)}\n` +
    `**Salon par défaut** : ${cm(cfg.channelId)}\n\n` +
    `**Catégories actives :**\n` +
    CAT_KEYS.map(k => {
      const cat = EVENT_CATEGORIES[k];
      const events = Object.keys(cat.events);
      const active = events.filter(e => cfg.events[e]?.enabled).length;
      return `${cat.label} — ${active}/${events.length} events actifs`;
    }).join('\n')
  ));
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lconfig_toggle_global')
        .setLabel(cfg.enabled ? 'Désactiver les logs' : 'Activer les logs')
        .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(cfg.enabled ? '🔴' : '🟢'),
      new ButtonBuilder()
        .setCustomId('lconfig_set_channel')
        .setLabel('Salon par défaut')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📍'),
      new ButtonBuilder()
        .setCustomId('lconfig_enable_all')
        .setLabel('Tout activer')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('lconfig_disable_all')
        .setLabel('Tout désactiver')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lconfig_create_log_ch')
        .setLabel(cfg.channelId ? 'Recréer le salon logs' : 'Créer le salon logs')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛠️'),
    )
  );
  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow('overview'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Utilise le menu pour naviguer par catégorie · expire dans 5 min'));
  return c;
}

// ─── Vue catégorie ─────────────────────────────────────────────────────────────
function buildCategory(cfg, catKey) {
  const cat    = EVENT_CATEGORIES[catKey];
  const events = cat.events;
  const c      = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `# ${cat.label}\n` +
    `-# Salon par défaut : ${cm(cfg.channelId)}`
  ));
  c.addSeparatorComponents(sep());

  // Tableau des events
  const lines = Object.entries(events).map(([key, meta]) => {
    const ev   = cfg.events[key] ?? { enabled: false, channelId: null };
    const icon = ev.enabled ? '🟢' : '🔴';
    const ch   = ev.channelId ? `→ <#${ev.channelId}>` : '→ *salon défaut*';
    return `${icon} **${meta.label}** ${ch}`;
  });
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  c.addSeparatorComponents(sep());

  // Bouton activer/désactiver toute la catégorie
  const allOn  = Object.keys(events).every(k => cfg.events[k]?.enabled);
  const allOff = Object.keys(events).every(k => !cfg.events[k]?.enabled);
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lconfig_cat_on_${catKey}`)
        .setLabel('Tout activer')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(allOn),
      new ButtonBuilder()
        .setCustomId(`lconfig_cat_off_${catKey}`)
        .setLabel('Tout désactiver')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
        .setDisabled(allOff),
    )
  );

  // Boutons individuels (toggle + salon spécifique)
  const eventKeys = Object.keys(events);
  // Limiter à 5 boutons par row — max 5 rows par message → max 25 events (ok ici)
  const rows = [];
  for (let i = 0; i < eventKeys.length; i += 4) {
    const chunk = eventKeys.slice(i, i + 4);
    const row = new ActionRowBuilder().addComponents(
      ...chunk.map(key => {
        const ev   = cfg.events[key] ?? { enabled: false, channelId: null };
        const meta = events[key];
        return new ButtonBuilder()
          .setCustomId(`lconfig_ev_toggle_${key}`)
          .setLabel(meta.label.replace(/^[^\s]+\s/, '').slice(0, 50)) // retirer l'emoji du label
          .setStyle(ev.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(meta.emoji);
      })
    );
    rows.push(row);
  }
  // Ajouter les rows (max 3 supplémentaires pour laisser de la place à nav)
  for (const row of rows.slice(0, 3)) c.addActionRowComponents(row);

  c.addSeparatorComponents(sep());
  c.addActionRowComponents(buildNavRow(`cat_${catKey}`));
  return c;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
function getView(v, cfg, guildName) {
  if (v === 'overview') return buildOverview(cfg, guildName);
  if (v.startsWith('cat_')) {
    const catKey = v.replace('cat_', '');
    if (EVENT_CATEGORIES[catKey]) return buildCategory(cfg, catKey);
  }
  return buildOverview(cfg, guildName);
}

// ─── Export ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'lconfig',
  aliases: ['logconfig', 'lc'],
  description: 'Configure les logs serveur',

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Serveur uniquement.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              '# ❌ Permission insuffisante\nTu dois avoir **Gérer le serveur** pour configurer les logs.'
            ))
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    let view = 'overview';
    const VIEW_SHORTCUTS = { overview: 'overview' };
    for (const k of CAT_KEYS) VIEW_SHORTCUTS[k] = `cat_${k}`;
    if (args[0] && VIEW_SHORTCUTS[args[0].toLowerCase()]) view = VIEW_SHORTCUTS[args[0].toLowerCase()];

    const freshCfg  = () => logDB.getConfig(message.guild.id);
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

      // ── Navigation ──────────────────────────────────────────────────────────
      if (i.isStringSelectMenu() && i.customId === 'lconfig_nav') {
        view = i.values[0];
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Toggle global ────────────────────────────────────────────────────────
      if (i.customId === 'lconfig_toggle_global') {
        logDB.setEnabled(message.guild.id, !freshCfg().enabled);
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Tout activer / désactiver ────────────────────────────────────────────
      if (i.customId === 'lconfig_enable_all') {
        logDB.enableAll(message.guild.id);
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId === 'lconfig_disable_all') {
        logDB.disableAll(message.guild.id);
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Salon par défaut ─────────────────────────────────────────────────────
      if (i.customId === 'lconfig_set_channel') {
        const modal = new ModalBuilder().setCustomId('lconfig_modal_set_channel').setTitle('Salon de logs par défaut');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id')
              .setLabel('ID ou mention du salon (#logs)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex: 1234567890123456789')
              .setValue(freshCfg().channelId || '')
              .setRequired(true)
              .setMaxLength(100),
          )
        );
        return i.showModal(modal);
      }

      // ── Activer / désactiver catégorie entière ───────────────────────────────
      if (i.customId.startsWith('lconfig_cat_on_')) {
        const catKey = i.customId.replace('lconfig_cat_on_', '');
        logDB.setCategoryEnabled(message.guild.id, catKey, true);
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }
      if (i.customId.startsWith('lconfig_cat_off_')) {
        const catKey = i.customId.replace('lconfig_cat_off_', '');
        logDB.setCategoryEnabled(message.guild.id, catKey, false);
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Toggle event individuel ──────────────────────────────────────────────
      if (i.customId.startsWith('lconfig_ev_toggle_')) {
        const eventKey = i.customId.replace('lconfig_ev_toggle_', '');
        const current  = freshCfg().events[eventKey]?.enabled ?? false;
        logDB.setEventEnabled(message.guild.id, eventKey, !current);
        return i.update({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Créer salon logs ─────────────────────────────────────────────────────
      if (i.customId === 'lconfig_create_log_ch') {
        await i.deferUpdate();
        try {
          const cfg2   = freshCfg();
          const chName = '📋-server-logs';
          const existing = message.guild.channels.cache;

          // Anti-redondance : réutiliser si l'ID sauvegardé existe encore
          let logCh = (cfg2.channelId && existing.get(cfg2.channelId)) ||
                      existing.find(c => c.isTextBased() && !c.isThread() && c.name === chName);

          if (!logCh) {
            logCh = await message.guild.channels.create({
              name: chName,
              type: 0, // GuildText
              permissionOverwrites: [
                { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              ],
            });
          }

          logDB.setChannel(message.guild.id, logCh.id);
          return i.editReply({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
          return i.editReply({ components: [freshView(view)], flags: MessageFlags.IsComponentsV2 });
        }
      }

    });

    collector.on('end', () => {
      reply.edit({
        components: [
          new ContainerBuilder().setAccentColor(0x99aab5)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('*Configuration expirée — relance `.lconfig` pour continuer.*'))
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
