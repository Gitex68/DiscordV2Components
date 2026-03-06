// commands/sprofil.js — .sprofil
// Profil serveur avec 6 onglets : Général / Membres / Salons & Emojis / Rôles / Médias / Activité
// Navigation par boutons Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

const activityDB = require('../activity/activityDB.js');

module.exports = {
  name: 'sprofil',
  aliases: ['serverinfo', 'si', 'servinfo', 'guild', 'guildinfo'],
  description: 'Affiche les informations complètes du serveur (5 onglets)',

  async execute(message) {
    const guild = message.guild;
    if (!guild) return message.reply('❌ Cette commande ne fonctionne que dans un serveur.');

    // ── Données ─────────────────────────────────────────────────────────────
    const iconURL   = guild.iconURL({ size: 512, extension: 'png' })
                      ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
    const bannerURL = guild.bannerURL({ size: 1024, extension: 'png' });
    const splashURL = guild.splashURL?.({ size: 1024, extension: 'png' }) ?? null;

    const createdTs      = Math.floor(guild.createdTimestamp / 1000);
    const textChannels   = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels  = guild.channels.cache.filter(c => c.type === 2).size;
    const stageChannels  = guild.channels.cache.filter(c => c.type === 13).size;
    const forumChannels  = guild.channels.cache.filter(c => c.type === 15).size;
    const announceCh     = guild.channels.cache.filter(c => c.type === 5).size;
    const categories     = guild.channels.cache.filter(c => c.type === 4).size;
    const totalChannels  = guild.channels.cache.size;
    const totalRoles     = guild.roles.cache.size - 1;
    const boosts         = guild.premiumSubscriptionCount ?? 0;
    const boostTier      = guild.premiumTier ?? 0;
    const verif          = ['Aucune', 'Faible', 'Moyenne', 'Haute', 'Très haute'][guild.verificationLevel] ?? '?';
    const boostEmoji     = ['⬛', '🥉', '🥈', '🥇'][boostTier] ?? '🥇';
    const contentFilter  = ['Désactivé', 'Membres sans rôle', 'Tous les membres'][guild.explicitContentFilter] ?? '?';
    const mfaLevel       = guild.mfaLevel === 1 ? 'Obligatoire' : 'Non requis';

    // Emojis & stickers
    const totalEmojis    = guild.emojis.cache.size;
    const animEmojis     = guild.emojis.cache.filter(e => e.animated).size;
    const staticEmojis   = totalEmojis - animEmojis;
    const totalStickers  = guild.stickers?.cache.size ?? 0;

    // Features
    const featureLabels = {
      COMMUNITY:              '🏘️ Communauté',
      PARTNERED:              '🤝 Partenaire',
      VERIFIED:               '✅ Vérifié',
      DISCOVERABLE:           '🔍 Découverte',
      VANITY_URL:             '🔗 URL personnalisée',
      INVITE_SPLASH:          '🖼️ Splash d\'invitation',
      BANNER:                 '🎨 Bannière',
      NEWS:                   '📰 Salons d\'annonces',
      ANIMATED_ICON:          '✨ Icône animée',
      MONETIZATION_ENABLED:   '💰 Monétisation',
      ROLE_SUBSCRIPTIONS_ENABLED: '💎 Abonnements rôles',
    };
    const features = guild.features
      .map(f => featureLabels[f])
      .filter(Boolean)
      .join('\n') || '*Aucune fonctionnalité particulière*';

    // Rôles
    const topRoles = guild.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .first(20)
      .map(r => r.toString())
      .join(' ');

    // ── Helpers ──────────────────────────────────────────────────────────────
    function sep() {
      return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
    }
    function guildHeader() {
      return new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🏠 ${guild.name}\n` +
            `-# ID : \`${guild.id}\``
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône de ${guild.name}`)
        );
    }

    const TABS = ['general', 'members', 'channels', 'roles', 'media', 'activite'];
    const TAB_META = {
      general:  { emoji: '🏠',  label: 'Général'   },
      members:  { emoji: '👥',  label: 'Membres'   },
      channels: { emoji: '💬',  label: 'Salons'    },
      roles:    { emoji: '🎭',  label: 'Rôles'     },
      media:    { emoji: '🖼️', label: 'Médias'    },
      activite: { emoji: '📊',  label: 'Activité'  },
    };
    function navRow(active) {
      // 6 boutons → 2 rangées de 3
      const btns = TABS.map(t =>
        new ButtonBuilder()
          .setCustomId('sprofil_tab_' + t)
          .setLabel(TAB_META[t].label)
          .setEmoji(TAB_META[t].emoji)
          .setStyle(t === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(t === active)
      );
      return [
        new ActionRowBuilder().addComponents(...btns.slice(0, 3)),
        new ActionRowBuilder().addComponents(...btns.slice(3)),
      ];
    }

    // ── Onglet Général ───────────────────────────────────────────────────────
    function buildGeneral() {
      return new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(guildHeader())
        .addSeparatorComponents(sep())
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**👑 Propriétaire** — <@${guild.ownerId}>\n` +
                `**📅 Créé le** — <t:${createdTs}:D> (<t:${createdTs}:R>)\n` +
                `**🌍 Locale** — \`${guild.preferredLocale}\`\n` +
                `**🔒 Vérification** — ${verif}\n` +
                `**🛡️ 2FA modération** — ${mfaLevel}\n` +
                `**🔞 Filtre contenu** — ${contentFilter}`
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**${boostEmoji} Boosts** — ${boosts} (Niveau ${boostTier})\n` +
                `**👥 Membres** — \`${guild.memberCount}\`\n` +
                `**💬 Salons** — \`${totalChannels}\`\n` +
                `**🎭 Rôles** — \`${totalRoles}\`\n` +
                `**😀 Emojis** — \`${totalEmojis}\` (${animEmojis} animés)`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(iconURL).setDescription('Serveur')
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ✨ Fonctionnalités\n${features}`)
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(...navRow('general'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Membres ───────────────────────────────────────────────────────
    function buildMembers() {
      // Comptage via cache (sans fetch complet)
      const bots   = guild.members.cache.filter(m => m.user.bot).size;
      const humans = guild.members.cache.filter(m => !m.user.bot).size;
      const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
      const idle   = guild.members.cache.filter(m => m.presence?.status === 'idle').size;
      const dnd    = guild.members.cache.filter(m => m.presence?.status === 'dnd').size;
      const off    = guild.memberCount - online - idle - dnd;
      const boosters = guild.members.cache.filter(m => m.premiumSince).size;

      return new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addSectionComponents(guildHeader())
        .addSeparatorComponents(sep())
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 👥 Membres (${guild.memberCount})\n` +
                `**👤 Humains** — \`${humans}\`\n` +
                `**🤖 Bots** — \`${bots}\`\n` +
                `**🚀 Boosters** — \`${boosters}\``
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 🔵 Statuts (cache)\n` +
                `🟢 En ligne — \`${online}\`\n` +
                `🟡 Inactif — \`${idle}\`\n` +
                `🔴 Ne pas déranger — \`${dnd}\`\n` +
                `⚫ Hors ligne — \`${off}\`\n` +
                `-# Les statuts nécessitent l'intent GUILD_PRESENCES`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(iconURL).setDescription('Serveur')
            )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(...navRow('members'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Salons & Emojis ────────────────────────────────────────────────
    function buildChannels() {
      return new ContainerBuilder()
        .setAccentColor(0xfee75c)
        .addSectionComponents(guildHeader())
        .addSeparatorComponents(sep())
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 💬 Salons (${totalChannels})\n` +
                `**📂 Catégories** — \`${categories}\`\n` +
                `**💬 Textuels** — \`${textChannels}\`\n` +
                `**🔊 Vocaux** — \`${voiceChannels}\`\n` +
                `**📺 Stages** — \`${stageChannels}\`\n` +
                `**📰 Annonces** — \`${announceCh}\`\n` +
                `**🗣️ Forums** — \`${forumChannels}\``
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 😀 Emojis & Stickers\n` +
                `**😀 Emojis statiques** — \`${staticEmojis}\`\n` +
                `**✨ Emojis animés** — \`${animEmojis}\`\n` +
                `**🎨 Total emojis** — \`${totalEmojis}\`\n` +
                `**🗂️ Stickers** — \`${totalStickers}\``
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(iconURL).setDescription('Serveur')
            )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(...navRow('channels'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Rôles ─────────────────────────────────────────────────────────
    function buildRoles() {
      return new ContainerBuilder()
        .setAccentColor(0xeb459e)
        .addSectionComponents(guildHeader())
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🎭 Rôles (${totalRoles})\n` +
            topRoles +
            (totalRoles > 20 ? `\n-# ... et ${totalRoles - 20} autres rôles` : '')
          )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(...navRow('roles'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Médias ─────────────────────────────────────────────────────────
    function buildMedia() {
      const galleryItems = [
        new MediaGalleryItemBuilder().setURL(iconURL).setDescription('Icône du serveur'),
      ];
      if (bannerURL) galleryItems.push(new MediaGalleryItemBuilder().setURL(bannerURL).setDescription('Bannière'));
      if (splashURL) galleryItems.push(new MediaGalleryItemBuilder().setURL(splashURL).setDescription('Splash invitation'));

      const linkBtns = [
        new ButtonBuilder().setLabel('Icône PNG').setStyle(ButtonStyle.Link).setURL(iconURL).setEmoji('🖼️'),
      ];
      if (bannerURL) linkBtns.push(new ButtonBuilder().setLabel('Bannière').setStyle(ButtonStyle.Link).setURL(bannerURL).setEmoji('🎨'));
      if (splashURL) linkBtns.push(new ButtonBuilder().setLabel('Splash').setStyle(ButtonStyle.Link).setURL(splashURL).setEmoji('✨'));

      return new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(guildHeader())
        .addSeparatorComponents(sep())
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(...galleryItems)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(...linkBtns)
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(...navRow('media'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Activité ────────────────────────────────────────────────────────
    function buildActivite() {
      const gid = guild.id;

      // Membres en vocal en ce moment
      const inVoice = guild.channels.cache
        .filter(c => c.isVoiceBased?.() || c.type === 2 || c.type === 13)
        .reduce((acc, c) => acc + (c.members?.size ?? 0), 0);

      // Jeux en cours (présences)
      const playingNow = new Map();
      guild.members.cache.forEach(m => {
        const game = m.presence?.activities?.find(a => a.type === 0)?.name;
        if (game) playingNow.set(game, (playingNow.get(game) || 0) + 1);
      });
      const topNowGames = [...playingNow.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g, n]) => `🕹️ **${g}** × ${n}`)
        .join('\n') || '*Aucun membre ne joue en ce moment.*';

      // Classements depuis activityDB
      const voiceRank   = activityDB.topN(activityDB.getVoiceRanking(gid), 3);
      const msgRank     = activityDB.topN(activityDB.getMessageRanking(gid), 3);
      const gameRankSrv = activityDB.topN(activityDB.getGameRankingServer(gid), 3);

      const voiceLines = voiceRank.length
        ? voiceRank.map(([uid, ms], i) => `${['🥇','🥈','🥉'][i]} <@${uid}> — ${activityDB.fmtMs(ms)}`).join('\n')
        : '*Aucune donnée encore.*';
      const msgLines = msgRank.length
        ? msgRank.map(([uid, n], i) => `${['🥇','🥈','🥉'][i]} <@${uid}> — ${n} msg`).join('\n')
        : '*Aucune donnée encore.*';
      const gameServerLines = gameRankSrv.length
        ? gameRankSrv.map(([g, ms], i) => `${['🥇','🥈','🥉'][i]} **${g}** — ${activityDB.fmtMs(ms)}`).join('\n')
        : '*Aucune donnée encore.*';

      // Graphique messages 7j (serveur)
      const history = activityDB.getMessageHistory(gid, 7);
      const maxDay  = Math.max(...history.map(d => d.count), 1);
      const barLine = history.map(d => activityDB.asciiBar(d.count, maxDay, 1)).join('');
      const labels  = history.map(d => d.date.slice(8)).join(' ');
      const total7  = history.reduce((a, d) => a + d.count, 0);

      return new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(guildHeader())
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 📡 En direct\n` +
            `🎙️ **En vocal** — ${inVoice} membre${inVoice > 1 ? 's' : ''}\n\n` +
            `**🕹️ Jeux en cours**\n${topNowGames}`
          )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 📨 Messages (7 derniers jours)\n` +
            `\`${barLine}\`\n` +
            `-# ${labels}\n` +
            `-# Total : ${total7} message${total7 > 1 ? 's' : ''}`
          )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🏆 Top Vocal\n${voiceLines}\n\n` +
            `## 💬 Top Messages\n${msgLines}\n\n` +
            `## 🎮 Top Jeux\n${gameServerLines}`
          )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(...navRow('activite'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    const BUILDERS = { general: buildGeneral, members: buildMembers, channels: buildChannels, roles: buildRoles, media: buildMedia, activite: buildActivite };

    const reply = await message.reply({
      components: [buildGeneral()],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id && i.customId.startsWith('sprofil_tab_'),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      const tab = i.customId.replace('sprofil_tab_', '');
      await i.update({
        components: [BUILDERS[tab]()],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  },
};
