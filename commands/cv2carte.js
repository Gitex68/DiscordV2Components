// commands/cv2carte.js — .cv2carte
// Carte d'information du serveur avec :
// Container (accent coloré dynamique)
//   → Section (nom serveur + icône en Thumbnail)
//   → Separator
//   → TextDisplay (stats)
//   → Separator
//   → Section (propriétaire + Thumbnail)
//   → Separator
//   → ActionRow (StringSelectMenu pour choisir une catégorie)
//   → TextDisplay (contenu dynamique selon sélection — via collecteur)

const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

function buildCard(guild, section, authorTag) {
  const iconURL = guild.iconURL({ size: 256, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  const textChannels  = guild.channels.cache.filter(c => c.type === 0).size;
  const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
  const categories    = guild.channels.cache.filter(c => c.type === 4).size;
  const roles         = guild.roles.cache.size - 1;
  const boosts        = guild.premiumSubscriptionCount ?? 0;
  const boostTier     = guild.premiumTier;

  const sectionContents = {
    general: `## ℹ️ Général\n` +
      `📛 **Nom** : ${guild.name}\n` +
      `🆔 **ID** : \`${guild.id}\`\n` +
      `📅 **Créé** : <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\n` +
      `🌍 **Région** : \`${guild.preferredLocale}\``,

    membres: `## 👥 Membres\n` +
      `👥 **Total** : \`${guild.memberCount}\`\n` +
      `🧑 **Humains** : \`${guild.members.cache.filter(m => !m.user.bot).size}\`\n` +
      `🤖 **Bots** : \`${guild.members.cache.filter(m => m.user.bot).size}\``,

    salons: `## 💬 Salons\n` +
      `📁 **Catégories** : \`${categories}\`\n` +
      `💬 **Textuels** : \`${textChannels}\`\n` +
      `🔊 **Vocaux** : \`${voiceChannels}\``,

    boosts: `## 🚀 Boosts\n` +
      `💜 **Boosts** : \`${boosts}\`\n` +
      `🏆 **Niveau** : \`${boostTier}\`\n` +
      `🎭 **Rôles** : \`${roles}\``,
  };

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('carte_section')
    .setPlaceholder('Choisir une catégorie...')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Général').setValue('general').setEmoji('ℹ️').setDefault(section === 'general'),
      new StringSelectMenuOptionBuilder().setLabel('Membres').setValue('membres').setEmoji('👥').setDefault(section === 'membres'),
      new StringSelectMenuOptionBuilder().setLabel('Salons').setValue('salons').setEmoji('💬').setDefault(section === 'salons'),
      new StringSelectMenuOptionBuilder().setLabel('Boosts & Rôles').setValue('boosts').setEmoji('🚀').setDefault(section === 'boosts'),
    );

  return new ContainerBuilder()
    .setAccentColor(guild.roles.highest.color || 0x5865f2)

    // En-tête : nom du serveur + icône
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(`# 🏠 ${guild.name}\n-# ${guild.description || 'Aucune description'}`),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(iconURL)
            .setDescription(`Icône de ${guild.name}`),
        ),
    )

    // Separator
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )

    // Contenu dynamique selon la section choisie
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(sectionContents[section]),
    )

    // Separator
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )

    // SelectMenu pour changer de catégorie
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(selectMenu),
    )

    // Footer
    .addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`-# Demandé par ${authorTag} • ${new Date().toLocaleString('fr-FR')}`),
    );
}

module.exports = {
  name: 'cv2carte',
  aliases: ['carte', 'cv2c'],
  description: 'Carte du serveur interactive avec Container + Section + SelectMenu (Components V2)',

  async execute(message, args, client) {
    const guild = message.guild;
    if (!guild) return message.reply('❌ Cette commande ne fonctionne que dans un serveur.');

    let currentSection = 'general';

    const reply = await message.reply({
      components: [buildCard(guild, currentSection, message.author.tag)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id && i.customId === 'carte_section',
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      currentSection = i.values[0];
      await i.update({
        components: [buildCard(guild, currentSection, message.author.tag)],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', async () => {
      await reply.edit({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x4f545c)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`# 🏠 ${guild.name}\n-# ⏱️ Carte expirée — utilise \`.cv2carte\` pour une nouvelle`),
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
