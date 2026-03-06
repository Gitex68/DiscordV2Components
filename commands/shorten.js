// commands/shorten.js — .shorten <url>
// Raccourcisseur de liens via TinyURL (sans clé API)

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'shorten',
  aliases: ['short', 'tinyurl', 'raccourcir', 'url'],
  description: 'Raccourcit un lien via TinyURL',

  async execute(message, args) {
    if (!args[0]) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ **Usage :** `.shorten <url>`')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    let raw = args[0];
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

    let url;
    try { url = new URL(raw); }
    catch {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ URL invalide.')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // Envoi d'un message d'attente
    const waiting = await message.reply({
      components: [
        new ContainerBuilder().setAccentColor(0x4f545c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('🔗 Raccourcissement en cours...')
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    let short;
    try {
      const res  = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url.href)}`);
      const text = await res.text();
      if (!text.startsWith('https://tinyurl.com/')) throw new Error('Réponse inattendue');
      short = text.trim();
    } catch (e) {
      return waiting.edit({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`❌ Impossible de raccourcir l'URL.\n-# ${e.message}`)
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🔗 Lien raccourci\n` +
              `-# via TinyURL\n\n` +
              `**Original** — \`${url.href.slice(0, 80)}${url.href.length > 80 ? '…' : ''}\`\n` +
              `**Court** — ${short}`
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(`https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`)
              .setDescription('Favicon')
          )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Ouvrir le lien court')
            .setStyle(ButtonStyle.Link)
            .setURL(short)
            .setEmoji('🔗'),
          new ButtonBuilder()
            .setLabel('Lien original')
            .setStyle(ButtonStyle.Link)
            .setURL(url.href)
            .setEmoji('🌐')
        )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
      );

    await waiting.edit({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
