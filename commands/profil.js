// commands/profil.js — .profil [@user]
// Profil complet avec 4 onglets : Identité / Activité & Jeu / Serveur / Avatar
// Navigation par boutons Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'profil',
  aliases: ['p', 'user', 'membre', 'whois', 'userinfo', 'ui'],
  description: 'Affiche le profil complet d\'un membre (4 onglets)',

  async execute(message, args) {
    // ── Résolution de la cible ──────────────────────────────────────────────
    const target = message.mentions.users.first()
      || (args[0] ? message.guild?.members.cache.find(m =>
          m.user.username.toLowerCase().includes(args[0].toLowerCase()) ||
          m.displayName.toLowerCase().includes(args[0].toLowerCase())
        )?.user : null)
      || message.author;

    const member      = message.guild?.members.cache.get(target.id);
    const avatarURL   = member?.displayAvatarURL({ size: 512, extension: 'png' })
                        ?? target.displayAvatarURL({ size: 512, extension: 'png' });
    const globalAvURL = target.displayAvatarURL({ size: 512, extension: 'png' });
    const accentColor = member?.displayColor || 0x5865f2;

    // ── Données communes ────────────────────────────────────────────────────
    const createdTs = Math.floor(target.createdTimestamp / 1000);
    const joinedTs  = member ? Math.floor(member.joinedTimestamp / 1000) : null;

    const statusEmoji = { online: '🟢', idle: '🟡', dnd: '🔴', offline: '⚫' };
    const statusLabel = { online: 'En ligne', idle: 'Inactif', dnd: 'Ne pas déranger', offline: 'Hors ligne' };
    const presence    = member?.presence?.status ?? 'offline';

    const flags = target.flags?.toArray() ?? [];
    const badgeMap = {
      HypeSquadOnlineHouse1:  '🏠 HypeSquad Bravery',
      HypeSquadOnlineHouse2:  '🏠 HypeSquad Brilliance',
      HypeSquadOnlineHouse3:  '🏠 HypeSquad Balance',
      ActiveDeveloper:        '🛠️ Développeur actif',
      VerifiedDeveloper:      '✅ Développeur vérifié',
      Staff:                  '👑 Staff Discord',
      Partner:                '🤝 Partenaire',
      BugHunterLevel1:        '🐛 Bug Hunter Lv1',
      BugHunterLevel2:        '🐛 Bug Hunter Lv2',
      PremiumEarlySupporter:  '💜 Early Supporter',
    };
    const badgesStr = flags.map(f => badgeMap[f]).filter(Boolean).join(' · ') || '*Aucun*';

    // Rôles
    const memberRoles   = member?.roles.cache.filter(r => r.id !== message.guild?.id) ?? new Map();
    const totalRoles    = memberRoles.size;
    const topRolesStr   = [...memberRoles.values()]
      .sort((a, b) => b.position - a.position)
      .slice(0, 12)
      .map(r => r.toString()).join(' ')
      || '*Aucun*';
    const topRoleColor  = member?.roles.highest?.hexColor ?? '#5865f2';
    const topRoleName   = member?.roles.highest?.name ?? 'Aucun';
    const isOwner       = message.guild?.ownerId === target.id;
    const isBoosting    = !!(member?.premiumSince);
    const boostSince    = isBoosting ? Math.floor(member.premiumSinceTimestamp / 1000) : null;
    const nickname      = member?.nickname ?? '*Aucun*';

    // Permissions notables
    const permFlags = {
      Administrator:       '👑 Administrateur',
      ManageGuild:         '⚙️ Gérer le serveur',
      ManageChannels:      '📁 Gérer les salons',
      ManageMessages:      '✉️ Gérer les messages',
      ManageRoles:         '🎭 Gérer les rôles',
      KickMembers:         '👢 Expulser',
      BanMembers:          '🔨 Bannir',
      MuteMembers:         '🔇 Muter',
      ModerateMembers:     '⏱️ Timeout',
    };
    const { PermissionFlagsBits } = require('discord.js');
    const permsStr = member
      ? Object.entries(permFlags)
          .filter(([key]) => member.permissions.has(PermissionFlagsBits[key]))
          .map(([, label]) => label)
          .join('\n') || '*Aucune permission notable*'
      : '*Non membre*';

    // Activités & jeu
    const activities = member?.presence?.activities ?? [];
    const game       = activities.find(a => a.type === 0); // Playing
    const streaming  = activities.find(a => a.type === 1); // Streaming
    const listening  = activities.find(a => a.type === 2); // Listening (Spotify)
    const watching   = activities.find(a => a.type === 3); // Watching
    const competing  = activities.find(a => a.type === 5); // Competing
    const customStat = activities.find(a => a.type === 4); // Custom status

    function buildActivityText() {
      const lines = [];
      if (customStat) lines.push(`💬 **Statut perso** — ${customStat.state ?? customStat.name ?? '?'}`);
      if (game)       lines.push(`🎮 **Joue à** — **${game.name}**${game.details ? `\n-# ↳ ${game.details}` : ''}${game.state ? `\n-# ${game.state}` : ''}`);
      if (streaming)  lines.push(`🟣 **Stream** — ${streaming.name}${streaming.url ? `\n-# ↳ [Voir le stream](${streaming.url})` : ''}`);
      if (listening)  lines.push(`🎵 **Écoute** — **${listening.details ?? '?'}**\n-# par ${listening.state ?? '?'} · ${listening.name}`);
      if (watching)   lines.push(`📺 **Regarde** — ${watching.name}`);
      if (competing)  lines.push(`🏆 **Compétition** — ${competing.name}`);
      if (!lines.length) lines.push('*Aucune activité détectée*\n-# L\'intent GUILD_PRESENCES est requis');
      return lines.join('\n\n');
    }

    // Appareils
    const clientStatus = member?.presence?.clientStatus ?? {};
    const devices = [];
    if (clientStatus.desktop) devices.push(`🖥️ Desktop (${clientStatus.desktop})`);
    if (clientStatus.mobile)  devices.push(`📱 Mobile (${clientStatus.mobile})`);
    if (clientStatus.web)     devices.push(`🌐 Web (${clientStatus.web})`);
    const devicesStr = devices.join(' · ') || '*Non détecté*';

    // ── Constructeur d'onglet navigation ────────────────────────────────────
    const TABS = ['identity', 'activity', 'server', 'avatar'];
    const TAB_LABELS = {
      identity: { emoji: '🪪',  label: 'Identité' },
      activity: { emoji: '🎮',  label: 'Activité' },
      server:   { emoji: '🏠',  label: 'Serveur' },
      avatar:   { emoji: '🖼️', label: 'Avatar' },
    };

    function navRow(active) {
      return new ActionRowBuilder().addComponents(
        TABS.map(t =>
          new ButtonBuilder()
            .setCustomId('profil_tab_' + t)
            .setLabel(TAB_LABELS[t].label)
            .setEmoji(TAB_LABELS[t].emoji)
            .setStyle(t === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(t === active)
        )
      );
    }

    function header(active) {
      return new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# ${target.bot ? '🤖 ' : ''}${target.displayName ?? target.username}\n` +
            `-# ${target.tag}  ·  ${statusEmoji[presence]} ${statusLabel[presence] ?? presence}`
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarURL).setDescription('Avatar de ' + target.username)
        );
    }

    function sep() {
      return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
    }

    // ── Onglet Identité ──────────────────────────────────────────────────────
    function buildIdentity() {
      return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addSectionComponents(header('identity'))
        .addSeparatorComponents(sep())
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**🆔 ID** — \`${target.id}\`\n` +
                `**📅 Compte créé** — <t:${createdTs}:D> (<t:${createdTs}:R>)\n` +
                (joinedTs ? `**📥 Rejoint** — <t:${joinedTs}:D> (<t:${joinedTs}:R>)\n` : '') +
                `**🤖 Bot** — ${target.bot ? 'Oui' : 'Non'}\n` +
                `**🏅 Badges** — ${badgesStr}`
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**🖥️ Appareils** — ${devicesStr}`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder()
                .setURL(message.guild?.iconURL({ size: 128, extension: 'png' }) ?? avatarURL)
                .setDescription('Serveur')
            )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(navRow('identity'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Activité ──────────────────────────────────────────────────────
    function buildActivity() {
      return new ContainerBuilder()
        .setAccentColor(game ? 0x57f287 : streaming ? 0x9b59b6 : listening ? 0x1db954 : accentColor)
        .addSectionComponents(header('activity'))
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🎮 Activités en cours\n${buildActivityText()}`
          )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(navRow('activity'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Serveur ───────────────────────────────────────────────────────
    function buildServer() {
      return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addSectionComponents(header('server'))
        .addSeparatorComponents(sep())
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**👑 Propriétaire** — ${isOwner ? 'Oui' : 'Non'}\n` +
                `**🏷️ Pseudo** — ${nickname}\n` +
                (isBoosting ? `**🚀 Boost depuis** — <t:${boostSince}:D> (<t:${boostSince}:R>)\n` : '') +
                `**🎨 Couleur rôle** — \`${topRoleColor}\`\n` +
                `**🥇 Rôle principal** — ${topRoleName}`
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**🎭 Rôles (${totalRoles})**\n${topRolesStr}` +
                (totalRoles > 12 ? `\n-# ... et ${totalRoles - 12} autres` : '')
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder()
                .setURL(message.guild?.iconURL({ size: 128, extension: 'png' }) ?? avatarURL)
                .setDescription('Serveur')
            )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🔑 Permissions notables\n${permsStr}`
          )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(navRow('server'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    // ── Onglet Avatar ────────────────────────────────────────────────────────
    function buildAvatar() {
      const galleryItems = [
        new MediaGalleryItemBuilder().setURL(avatarURL).setDescription('Avatar'),
      ];
      if (avatarURL !== globalAvURL) {
        galleryItems.push(
          new MediaGalleryItemBuilder().setURL(globalAvURL).setDescription('Avatar global')
        );
      }

      const dlBtns = [
        new ButtonBuilder()
          .setLabel('PNG 512px')
          .setStyle(ButtonStyle.Link)
          .setURL(globalAvURL)
          .setEmoji('🖼️'),
      ];
      if (avatarURL !== globalAvURL) {
        dlBtns.push(
          new ButtonBuilder()
            .setLabel('Avatar serveur')
            .setStyle(ButtonStyle.Link)
            .setURL(avatarURL)
            .setEmoji('🏠')
        );
      }

      return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addSectionComponents(header('avatar'))
        .addSeparatorComponents(sep())
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(...galleryItems)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(...dlBtns)
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(navRow('avatar'))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    const BUILDERS = { identity: buildIdentity, activity: buildActivity, server: buildServer, avatar: buildAvatar };
    let activeTab = 'identity';

    const reply = await message.reply({
      components: [buildIdentity()],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id && i.customId.startsWith('profil_tab_'),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      activeTab = i.customId.replace('profil_tab_', '');
      await i.update({
        components: [BUILDERS[activeTab]()],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  },
};
