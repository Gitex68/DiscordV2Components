// commands/avatar.js — .avatar [@user]
// Components V2 : Container + Section (TextDisplay + Thumbnail) + Separator + MediaGallery + ActionRow

const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pp'],
  description: 'Affiche l\'avatar d\'un utilisateur',

  async execute(message, args, client) {
    const target = message.mentions.users.first() || message.author;
    const member = message.guild?.members.cache.get(target.id);

    const globalAvatarPng  = target.displayAvatarURL({ size: 1024, extension: 'png' });
    const globalAvatarWebp = target.displayAvatarURL({ size: 1024, extension: 'webp' });
    const serverAvatar     = member?.displayAvatarURL({ size: 1024, extension: 'png' });
    const accentColor      = member?.displayColor || 0x5865f2;
    const hasServerAvatar  = serverAvatar && serverAvatar !== globalAvatarPng;

    // MediaGallery : global + serveur si différent
    const galleryItems = [
      new MediaGalleryItemBuilder().setURL(globalAvatarPng).setDescription('Avatar global'),
    ];
    if (hasServerAvatar) {
      galleryItems.push(
        new MediaGalleryItemBuilder().setURL(serverAvatar).setDescription('Avatar du serveur'),
      );
    }

    // Boutons de téléchargement
    const dlButtons = [
      new ButtonBuilder()
        .setLabel('PNG 1024px')
        .setStyle(ButtonStyle.Link)
        .setURL(globalAvatarPng)
        .setEmoji('🖼️'),
      new ButtonBuilder()
        .setLabel('WebP 1024px')
        .setStyle(ButtonStyle.Link)
        .setURL(globalAvatarWebp)
        .setEmoji('�'),
    ];
    if (hasServerAvatar) {
      dlButtons.push(
        new ButtonBuilder()
          .setLabel('Avatar serveur')
          .setStyle(ButtonStyle.Link)
          .setURL(serverAvatar)
          .setEmoji('🏠'),
      );
    }

    const container = new ContainerBuilder()
      .setAccentColor(accentColor)
      // Section : infos utilisateur + miniature avatar
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(
                `# 🖼️ Avatar de ${target.username}\n` +
                `-# ID : \`${target.id}\`${target.bot ? ' · 🤖 Bot' : ''}`,
              ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(globalAvatarPng)
              .setDescription(`Avatar de ${target.username}`),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      // Galerie pleine résolution
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`## Aperçu${hasServerAvatar ? ' — global & serveur' : ''}`),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(...galleryItems),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
      )
      // Boutons de téléchargement
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(...dlButtons),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`-# Demandé par ${message.author.tag} • <t:${Math.floor(Date.now() / 1000)}:T>`),
      );

    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
