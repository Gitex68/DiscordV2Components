// commands/info.js — .info
// Affiche les infos du serveur en Components V2 avec navigation par boutons (collecteur local)

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'info',
  aliases: ['serveur', 'server', 'i'],
  description: 'Affiche les informations du serveur',

  async execute(message, args, client) {
    const guild = message.guild;
    if (!guild) return message.reply('❌ Cette commande ne fonctionne que dans un serveur.');

    // Données statiques (pas de members.fetch pour éviter le timeout)
    const totalMembers  = guild.memberCount;
    const textChannels  = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    const categories    = guild.channels.cache.filter(c => c.type === 4).size;
    const roles         = guild.roles.cache.size - 1;
    const boosts        = guild.premiumSubscriptionCount ?? 0;
    const boostTier     = guild.premiumTier ?? 0;
    const verif         = ['Aucune', 'Faible', 'Moyenne', 'Haute', 'Très haute'][guild.verificationLevel] ?? '?';
    const createdAt     = Math.floor(guild.createdTimestamp / 1000);
    const iconURL       = guild.iconURL({ size: 256, extension: 'png' }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    const tabs = {
      general: `# 🏠 ${guild.name}\n` +
        `-# Serveur Discord\n\n` +
        `**🆔 ID** — \`${guild.id}\`\n` +
        `**👑 Propriétaire** — <@${guild.ownerId}>\n` +
        `**📅 Créé le** — <t:${createdAt}:D> (<t:${createdAt}:R>)\n` +
        `**🌍 Région** — \`${guild.preferredLocale}\`\n` +
        `**🔒 Vérification** — ${verif}\n` +
        `**🚀 Boosts** — ${boosts} (Niveau ${boostTier})`,

      membres: `# 👥 Membres — ${guild.name}\n` +
        `-# Statistiques des membres\n\n` +
        `**� Total** — \`${totalMembers}\`\n` +
        `**🎭 Rôles** — \`${roles}\`\n\n` +
        `-# Les comptages précis (humains/bots/en ligne) nécessitent l'intent GUILD_MEMBERS.`,

      salons: `# 💬 Salons — ${guild.name}\n` +
        `-# Organisation du serveur\n\n` +
        `**� Catégories** — \`${categories}\`\n` +
        `**💬 Salons textuels** — \`${textChannels}\`\n` +
        `**🔊 Salons vocaux** — \`${voiceChannels}\`\n` +
        `**� Total salons** — \`${textChannels + voiceChannels}\``,

      roles: `# 🎭 Rôles — ${guild.name}\n` +
        `-# Liste des rôles (top 15)\n\n` +
        guild.roles.cache
          .filter(r => r.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .first(15)
          .map(r => `${r.toString()}`)
          .join('  ') +
        (roles > 15 ? `\n-# ... et ${roles - 15} autres rôles` : ''),
    };

    function buildContainer(active) {
      return new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(tabs[active])
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône de ${guild.name}`)
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('info_tab_general')
              .setLabel('Général')
              .setEmoji('🏠')
              .setStyle(active === 'general' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(active === 'general'),
            new ButtonBuilder()
              .setCustomId('info_tab_membres')
              .setLabel('Membres')
              .setEmoji('👥')
              .setStyle(active === 'membres' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(active === 'membres'),
            new ButtonBuilder()
              .setCustomId('info_tab_salons')
              .setLabel('Salons')
              .setEmoji('💬')
              .setStyle(active === 'salons' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(active === 'salons'),
            new ButtonBuilder()
              .setCustomId('info_tab_roles')
              .setLabel('Rôles')
              .setEmoji('🎭')
              .setStyle(active === 'roles' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(active === 'roles'),
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag} • expire dans 60s`)
        );
    }

    function buildExpired(active) {
      return new ContainerBuilder()
        .setAccentColor(0x99aab5)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(tabs[active])
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône de ${guild.name}`)
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ⏱️ Interaction expirée • Demandé par ${message.author.tag}`)
        );
    }

    let current = 'general';
    const reply = await message.reply({
      components: [buildContainer('general')],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 60_000,
    });

    collector.on('collect', async (i) => {
      current = i.customId.replace('info_tab_', '');
      await i.update({
        components: [buildContainer(current)],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', () => {
      reply.edit({
        components: [buildExpired(current)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
