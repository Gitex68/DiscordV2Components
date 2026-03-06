// commands/modal.js — .modal
// Ouvre un formulaire modal via un bouton — Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'modal',
  aliases: ['form', 'formulaire', 'modaldemo'],
  description: 'Démo de formulaire modal Components V2',

  async execute(message, args, client) {
    const botAvatar = message.client.user.displayAvatarURL({ size: 128, extension: 'png' });

    const container = new ContainerBuilder()
      .setAccentColor(0x57f287)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 📝 Démo — Formulaire Modal\n` +
              `-# Components V2 · TextInput`
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(botAvatar).setDescription('Icône du bot')
          )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Clique sur le bouton ci-dessous pour ouvrir un formulaire.\n\n` +
          `**Champs du formulaire :**\n` +
          `📌 **Nom / pseudo** — texte court, requis\n` +
          `💬 **Message** — paragraphe, requis\n` +
          `⭐ **Note sur 10** — texte court, optionnel`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('open_modal')
            .setLabel('Ouvrir le formulaire')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
        )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# Les réponses seront affichées en V2 · handler dans index.js`
        )
      );

    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};

