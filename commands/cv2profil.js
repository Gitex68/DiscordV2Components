// commands/cv2profil.js — .cv2profil [@user]
// Affiche le profil d'un utilisateur avec :
// Container → Section (TextDisplay + Thumbnail avatar)
//           → Separator
//           → TextDisplay (stats)
//           → ActionRow (bouton modal "Note" + bouton link avatar)

const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

module.exports = {
  name: 'cv2profil',
  aliases: ['cv2p', 'cardprofil'],
  description: 'Affiche le profil d\'un utilisateur (Components V2)',

  async execute(message, args, client) {
    const target = message.mentions.users.first() || message.author;
    const member = message.guild?.members.cache.get(target.id);

    const avatarURL  = target.displayAvatarURL({ size: 256, extension: 'png' });
    const joinedAt   = member?.joinedAt ? `<t:${Math.floor(member.joinedAt / 1000)}:D>` : 'Inconnu';
    const createdAt  = `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`;
    const roles      = member?.roles.cache.filter(r => r.id !== message.guild?.id).map(r => `<@&${r.id}>`).slice(0, 5).join(' ') || '*Aucun*';
    const accentColor = member?.displayColor || 0x5865f2;

    const container = new ContainerBuilder()
      .setAccentColor(accentColor)

      // Section : info texte + avatar en Thumbnail
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(
                `# ${target.username}\n` +
                `-# ID : \`${target.id}\`\n` +
                (target.bot ? '> 🤖 Compte bot\n' : ''),
              ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(avatarURL)
              .setDescription(`Avatar de ${target.username}`),
          ),
      )

      // Separator
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )

      // Stats en TextDisplay
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            `📅 **Compte créé** : ${createdAt}\n` +
            `📥 **Rejoint le serveur** : ${joinedAt}\n` +
            `🎭 **Rôles** : ${roles}`,
          ),
      )

      // Separator
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )

      // ActionRow : bouton pour laisser une note + lien avatar
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`profil_note_${target.id}`)
            .setLabel('Laisser une note')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setLabel('Voir l\'avatar')
            .setStyle(ButtonStyle.Link)
            .setURL(avatarURL)
            .setEmoji('🖼️'),
        ),
      )

      // Footer
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`-# Demandé par ${message.author.tag} • ${new Date().toLocaleString('fr-FR')}`),
      );

    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
