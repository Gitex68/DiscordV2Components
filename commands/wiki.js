// commands/wiki.js — .wiki <recherche>
// Recherche rapide Wikipedia FR via l'API REST

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'wiki',
  aliases: ['wikipedia', 'w', 'recherche', 'search'],
  description: 'Recherche rapide sur Wikipédia',

  async execute(message, args) {
    if (!args.length) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ **Usage :** `.wiki <recherche>`')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const query = args.join(' ');

    const waiting = await message.reply({
      components: [
        new ContainerBuilder().setAccentColor(0x4f545c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`🔍 Recherche de **${query}** sur Wikipedia...`)
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    try {
      // 1. Recherche de l'article
      const searchRes = await fetch(
        `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=1`
      );
      const searchData = await searchRes.json();
      const results = searchData.query?.search;

      if (!results?.length) {
        return waiting.edit({
          components: [
            new ContainerBuilder().setAccentColor(0xfee75c)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`⚠️ Aucun résultat pour **${query}** sur Wikipédia.`)
              ),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const title = results[0].title;

      // 2. Extrait de l'article
      const summaryRes = await fetch(
        `https://fr.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json&utf8=1&piprop=thumbnail&pithumbsize=300`
      );
      const summaryData = await summaryRes.json();
      const pages = summaryData.query?.pages ?? {};
      const page  = Object.values(pages)[0];

      const extract   = (page?.extract ?? '').replace(/\n+/g, ' ').trim();
      const summary   = extract.length > 600 ? extract.slice(0, 600) + '…' : extract;
      const thumbURL  = page?.thumbnail?.source ?? null;
      const pageURL   = `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

      const container = new ContainerBuilder()
        .setAccentColor(0xffffff)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# 📖 ${title}\n` +
                `-# Wikipédia · Recherche : ${query}`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder()
                .setURL(thumbURL ?? 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Wikipedia-logo-v2.svg/240px-Wikipedia-logo-v2.svg.png')
                .setDescription('Image Wikipedia')
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(summary || '*Aucun extrait disponible.*')
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('Lire sur Wikipédia')
              .setStyle(ButtonStyle.Link)
              .setURL(pageURL)
              .setEmoji('📖')
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );

      await waiting.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

    } catch (e) {
      await waiting.edit({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`❌ Erreur lors de la recherche.\n-# ${e.message}`)
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },
};
