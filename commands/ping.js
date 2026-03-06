// commands/ping.js — .ping
// Latence bot — Components V2 : Container + Section + Separator + ActionRow

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
} = require('discord.js');

module.exports = {
  name: 'ping',
  aliases: ['latence', 'p'],
  description: 'Affiche la latence du bot',

  async execute(message, args, client) {
    // Premier envoi pour mesurer
    const sent = await message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x4f545c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('📡 Calcul de la latence...'),
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const latency    = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);
    const color = latency < 100 ? 0x57f287 : latency < 200 ? 0xfee75c : 0xed4245;
    const icon  = latency < 100 ? '🟢' : latency < 200 ? '🟡' : '🔴';
    const bar   = '█'.repeat(Math.min(10, Math.round(latency / 30))) + '░'.repeat(Math.max(0, 10 - Math.round(latency / 30)));

    const container = new ContainerBuilder()
      .setAccentColor(color)
      // Section : texte latence + thumbnail bot
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(
                `# ${icon} Pong !\n` +
                `-# ${client.user.tag}`,
              ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(client.user.displayAvatarURL({ size: 128 }))
              .setDescription('Avatar du bot'),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      // Stats en TextDisplay
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            `📨 **Latence message** : \`${latency}ms\`\n` +
            `💓 **Latence API**    : \`${apiLatency}ms\`\n` +
            `\`${bar}\``,
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
      )
      // ActionRow
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ping_reroll')
            .setLabel('Rafraîchir')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄'),
          new ButtonBuilder()
            .setLabel('Status Discord')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discordstatus.com')
            .setEmoji('🌐'),
        ),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`-# Demandé par ${message.author.tag} • <t:${Math.floor(Date.now() / 1000)}:T>`),
      );

    await sent.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
