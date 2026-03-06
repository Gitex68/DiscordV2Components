// commands/cv2demo.js — .cv2demo
// Démo COMPLÈTE des vrais composants V2 :
// Container → TextDisplay, Section (TextDisplay + Thumbnail), Separator,
//             MediaGallery, ActionRow (Buttons + StringSelect)
//
// ⚠️  DOIT utiliser MessageFlags.IsComponentsV2 (4096) pour les messages V2

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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'cv2demo',
  aliases: ['v2', 'components'],
  description: 'Démo complète des Components V2 (Container, Section, TextDisplay, Thumbnail, MediaGallery, Separator)',

  async execute(message, args, client) {
    // ── Container principal (couleur d'accent bleue) ──────────────────────────
    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)

      // 1. Titre en TextDisplay (supporte le markdown complet)
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent('# 🧩 Composants V2 — Démonstration complète\n-# Tous les nouveaux types de composants Discord en action'),
      )

      // 2. Separator (ligne de séparation visible)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )

      // 3. Section : TextDisplay (gauche) + Thumbnail (droite)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent('## 📦 Section\nUne **Section** combine du texte et une image miniature côte à côte.\n> Jusqu\'à **3 TextDisplay** + 1 accessoire (Thumbnail ou Button)'),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL('https://cdn.discordapp.com/embed/avatars/0.png')
              .setDescription('Avatar par défaut Discord'),
          ),
      )

      // 4. Separator (large)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )

      // 5. TextDisplay avec markdown riche
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            '## 📝 TextDisplay\n' +
            'Supporte **tout le markdown** Discord :\n' +
            '- `code inline`\n' +
            '- **gras**, *italique*, ~~barré~~\n' +
            '- [liens](https://discord.js.org)\n' +
            '- > Citations\n' +
            '- Jusqu\'à **4 000 caractères**',
          ),
      )

      // 6. Separator
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )

      // 7. TextDisplay pour la galerie
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## 🖼️ MediaGallery\nJusqu\'à **10 images** affichées en grille :'),
      )

      // 8. MediaGallery (jusqu'à 10 images)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder()
          .addItems(
            new MediaGalleryItemBuilder()
              .setURL('https://cdn.discordapp.com/embed/avatars/0.png')
              .setDescription('Avatar 0'),
            new MediaGalleryItemBuilder()
              .setURL('https://cdn.discordapp.com/embed/avatars/1.png')
              .setDescription('Avatar 1'),
            new MediaGalleryItemBuilder()
              .setURL('https://cdn.discordapp.com/embed/avatars/2.png')
              .setDescription('Avatar 2'),
            new MediaGalleryItemBuilder()
              .setURL('https://cdn.discordapp.com/embed/avatars/3.png')
              .setDescription('Avatar 3'),
          ),
      )

      // 9. Separator
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
      )

      // 10. TextDisplay intro ActionRow
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## 🎛️ ActionRow\nLes **ActionRow** restent identiques (Buttons, SelectMenu) :'),
      )

      // 11. ActionRow avec boutons
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('cv2_btn_primary')
            .setLabel('Primary')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💙'),
          new ButtonBuilder()
            .setCustomId('cv2_btn_success')
            .setLabel('Success')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('cv2_btn_danger')
            .setLabel('Danger')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🚫'),
          new ButtonBuilder()
            .setLabel('docs')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.js.org')
            .setEmoji('🔗'),
        ),
      )

      // 12. ActionRow avec StringSelectMenu
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cv2_select_demo')
            .setPlaceholder('Choisir un composant V2...')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('Container').setValue('container').setEmoji('📦').setDescription('Groupe de composants avec couleur'),
              new StringSelectMenuOptionBuilder().setLabel('Section').setValue('section').setEmoji('📋').setDescription('Texte + Thumbnail côte à côte'),
              new StringSelectMenuOptionBuilder().setLabel('TextDisplay').setValue('textdisplay').setEmoji('📝').setDescription('Texte markdown pur'),
              new StringSelectMenuOptionBuilder().setLabel('MediaGallery').setValue('mediagallery').setEmoji('🖼️').setDescription('Grille d\'images'),
              new StringSelectMenuOptionBuilder().setLabel('Separator').setValue('separator').setEmoji('➖').setDescription('Séparateur vertical'),
            ),
        ),
      )

      // 13. Footer en TextDisplay
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
