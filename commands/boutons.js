// commands/boutons.js — .boutons
// Démo de tous les styles de boutons Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'boutons',
  aliases: ['buttons', 'btn', 'demo'],
  description: 'Démo de tous les styles de boutons (Components V2)',

  async execute(message, args, client) {
    const botAvatar = message.client.user.displayAvatarURL({ size: 128, extension: 'png' });

    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🎛️ Démo — Styles de boutons\n` +
              `-# Components V2 · discord.js v14`
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(botAvatar).setDescription('Bot icon')
          )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**💙 Primary** — Action principale, couleur Bleu Discord\n` +
          `**🩶 Secondary** — Action secondaire, couleur neutre gris\n` +
          `**✅ Success** — Confirmation / succès, couleur verte\n` +
          `🚫 **Danger** — Action risquée / destructive, couleur rouge\n\n` +
          `Cliquer sur un bouton envoie une réponse éphémère V2.`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_primary').setLabel('Primary').setStyle(ButtonStyle.Primary).setEmoji('💙'),
          new ButtonBuilder().setCustomId('btn_secondary').setLabel('Secondary').setStyle(ButtonStyle.Secondary).setEmoji('🩶'),
          new ButtonBuilder().setCustomId('btn_success').setLabel('Success').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('btn_danger').setLabel('Danger').setStyle(ButtonStyle.Danger).setEmoji('🚫'),
        )
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('discord.js.org')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.js.org')
            .setEmoji('🔗'),
          new ButtonBuilder()
            .setCustomId('btn_off')
            .setLabel('Désactivé')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
            .setEmoji('🔒'),
        )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# Les boutons Link ouvrent une URL · Les boutons disabled ne sont pas cliquables`
        )
      );

    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};

