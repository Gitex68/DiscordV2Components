// commands/tpanel.js — .tpanel [#salon]
// Envoie le panneau d'ouverture de tickets dans un salon

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const db = require('../tickets/ticketDB.js');

module.exports = {
  name: 'tpanel',
  aliases: ['panel', 'ticketpanel', 'tp'],
  description: 'Envoie le panneau de tickets dans un salon',

  async execute(message, args, client) {
    // Permission : ManageGuild
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Permission insuffisante')
            .setDescription('Tu dois avoir la permission **Gérer le serveur** pour utiliser cette commande.'),
        ],
      });
    }

    if (!message.guild) {
      return message.reply('❌ Cette commande doit être utilisée dans un serveur.');
    }

    const config = db.getConfig(message.guild.id);

    // Déterminer le salon cible
    let targetChannel = message.mentions.channels.first();
    if (!targetChannel) {
      // Chercher un ID mentionné en argument
      if (args[0] && /^\d{17,19}$/.test(args[0])) {
        targetChannel = message.guild.channels.cache.get(args[0]);
      }
    }
    if (!targetChannel) {
      targetChannel = message.channel;
    }

    // Vérifier que c'est un salon textuel
    if (targetChannel.type !== ChannelType.GuildText) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Salon invalide')
            .setDescription('Le salon cible doit être un salon textuel.'),
        ],
      });
    }

    // Vérifier que le bot peut y envoyer des messages
    const botMember = message.guild.members.me;
    if (!targetChannel.permissionsFor(botMember).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Permissions manquantes')
            .setDescription(`Je n'ai pas la permission d'envoyer des messages dans ${targetChannel}.`),
        ],
      });
    }

    // Avertissement si catégorie non configurée
    if (!config.categoryId) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('⚠️ Configuration incomplète')
            .setDescription(
              'Aucune catégorie n\'est configurée pour les tickets.\n' +
              'Le panel sera envoyé mais les tickets ne pourront pas être créés tant que tu n\'auras pas configuré la catégorie avec `.tconfig category #salon` ou `.tconfig setup`.'
            ),
        ],
      });
    }

    // Construire l'embed du panel
    const tags = config.tags?.length ? config.tags : ['Support', 'Bug', 'Commande', 'Autre'];
    const tagList = tags.map(t => `> 🏷️ **${t}**`).join('\n');

    const panelTitle = config.panelTitle?.trim() || '🎫 Ouvrir un ticket';
    const panelDesc  = config.panelDescription?.trim() ||
      `Bienvenue sur le support de **${message.guild.name}** !\n\n` +
      `Clique sur le bouton ci-dessous pour ouvrir un ticket.\n` +
      `Un membre du staff vous répondra dès que possible.\n\n` +
      `**Catégories disponibles :**\n${tagList}\n\n` +
      `📌 *Merci de décrire votre problème clairement lors de l'ouverture.*`;

    const panelEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(panelTitle)
      .setDescription(panelDesc)
      .setThumbnail(message.guild.iconURL({ size: 256, extension: 'png' }) || null)
      .setFooter({ text: `${message.guild.name} • Support`, iconURL: message.guild.iconURL({ size: 64 }) || undefined })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel('Ouvrir un ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫'),
    );

    // Envoyer le panel dans le salon cible
    const panelMsg = await targetChannel.send({ embeds: [panelEmbed], components: [row] });

    // Sauvegarder l'info panel dans la config
    db.setConfig(message.guild.id, 'panelChannelId', targetChannel.id);
    db.setConfig(message.guild.id, 'panelMsgId', panelMsg.id);

    // Confirmation
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Panel envoyé')
      .setDescription(`Le panneau de tickets a été envoyé dans ${targetChannel}.`)
      .addFields(
        { name: '📌 Salon', value: `${targetChannel} (\`${targetChannel.id}\`)`, inline: true },
        { name: '🔗 Message', value: `[Aller au panel](${panelMsg.url})`, inline: true },
      )
      .setTimestamp();

    return message.reply({ embeds: [confirmEmbed] });
  },
};
