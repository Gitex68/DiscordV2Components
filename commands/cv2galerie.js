// commands/cv2galerie.js — .cv2galerie
// Affiche une galerie d'images paginée avec :
// Container → TextDisplay (titre)
//           → Separator
//           → MediaGallery (4 images par page)
//           → Separator
//           → ActionRow (boutons prev/next + compteur)

const {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

// 12 avatars Discord par défaut — remplace par tes propres URLs
const IMAGES = [
  { url: 'https://cdn.discordapp.com/embed/avatars/0.png', desc: 'Blurple 1' },
  { url: 'https://cdn.discordapp.com/embed/avatars/1.png', desc: 'Blurple 2' },
  { url: 'https://cdn.discordapp.com/embed/avatars/2.png', desc: 'Vert' },
  { url: 'https://cdn.discordapp.com/embed/avatars/3.png', desc: 'Jaune' },
  { url: 'https://cdn.discordapp.com/embed/avatars/4.png', desc: 'Rose' },
  { url: 'https://cdn.discordapp.com/embed/avatars/5.png', desc: 'Rouge' },
  { url: 'https://cdn.discordapp.com/embed/avatars/6.png', desc: 'Cyan' },
  { url: 'https://cdn.discordapp.com/embed/avatars/7.png', desc: 'Orange' },
];

const PER_PAGE = 4;

function buildContainer(page, authorTag) {
  const totalPages = Math.ceil(IMAGES.length / PER_PAGE);
  const start = page * PER_PAGE;
  const pageImages = IMAGES.slice(start, start + PER_PAGE);

  const gallery = new MediaGalleryBuilder()
    .addItems(...pageImages.map(img =>
      new MediaGalleryItemBuilder()
        .setURL(img.url)
        .setDescription(img.desc),
    ));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gal_prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('gal_info')
      .setLabel(`Page ${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('gal_next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );

  return new ContainerBuilder()
    .setAccentColor(0xeb459e)
    .addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`# 🖼️ Galerie — Page ${page + 1} / ${totalPages}\n-# ${pageImages.length} image${pageImages.length > 1 ? 's' : ''} affichée${pageImages.length > 1 ? 's' : ''}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )
    .addActionRowComponents(row)
    .addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`-# Demandé par ${authorTag} • ${IMAGES.length} images au total`),
    );
}

module.exports = {
  name: 'cv2galerie',
  aliases: ['galerie', 'cv2g'],
  description: 'Galerie d\'images paginée avec MediaGallery (Components V2)',

  async execute(message, args, client) {
    let page = 0;

    const reply = await message.reply({
      components: [buildContainer(page, message.author.tag)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id && ['gal_prev', 'gal_next'].includes(i.customId),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'gal_prev') page = Math.max(0, page - 1);
      if (i.customId === 'gal_next') page = Math.min(Math.ceil(IMAGES.length / PER_PAGE) - 1, page + 1);

      await i.update({
        components: [buildContainer(page, message.author.tag)],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', async () => {
      const totalPages = Math.ceil(IMAGES.length / PER_PAGE);
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gal_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('gal_info').setLabel(`Page ${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('gal_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );

      // Reconstruire le container avec les boutons désactivés
      const finalContainer = buildContainer(page, message.author.tag);
      // On ne peut pas éditer facilement les composants imbriqués, on édite le message entier
      await reply.edit({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x4f545c)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🖼️ Galerie — expirée\n-# La galerie n\'est plus interactive'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(disabledRow),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
