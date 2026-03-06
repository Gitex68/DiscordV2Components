// commands/qrcode.js — .qrcode <texte/url>
// Génère un QR Code via api.qrserver.com (sans clé API)

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'qrcode',
  aliases: ['qr', 'genqr', 'qrgen'],
  description: 'Génère un QR Code à partir d\'un texte ou d\'une URL',

  async execute(message, args) {
    if (!args.length) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ **Usage :** `.qrcode <texte ou url>`')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const text = args.join(' ');
    if (text.length > 500) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ Le texte est trop long (max 500 caractères).')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // QR server : renvoie directement une image PNG
    const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=${encodeURIComponent(text)}`;

    const container = new ContainerBuilder()
      .setAccentColor(0x000000)

      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🔲 QR Code généré\n` +
              `-# Scannez avec votre appareil photo\n\n` +
              `**Contenu :** \`${text.slice(0, 80)}${text.length > 80 ? '…' : ''}\``
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(qrURL).setDescription('QR Code miniature')
          )
      )

      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )

      // QR Code en grand
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(qrURL).setDescription('QR Code')
        )
      )

      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Télécharger le QR Code')
            .setStyle(ButtonStyle.Link)
            .setURL(qrURL)
            .setEmoji('🔲')
        )
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
      );

    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
