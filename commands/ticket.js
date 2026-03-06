// commands/ticket.js — .ticket [raison]
// Ouvre un ticket (via modal si pas de raison, sinon directement)

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db      = require('../tickets/ticketDB.js');
const manager = require('../tickets/ticketManager.js');

module.exports = {
  name: 'ticket',
  aliases: ['t', 'open'],
  description: 'Ouvre un nouveau ticket',

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Cette commande ne fonctionne que dans un serveur.');

    const config = db.getConfig(message.guild.id);

    if (!config.categoryId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Système de tickets non configuré')
            .setDescription('Un administrateur doit d\'abord configurer le système avec `.tconfig setup`.')
            .setTimestamp(),
        ],
      });
    }

    // Vérification des tickets ouverts
    const open = db.getOpenTicketsByUser(message.guild.id, message.author.id);
    if (open.length >= config.maxOpen) {
      const channels = open.map(t => `<#${t.channelId}>`).join(', ');
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Limite de tickets atteinte')
            .setDescription(
              `Tu as déjà **${open.length}** ticket(s) ouvert(s) (maximum : **${config.maxOpen}**).\n\n` +
              `**Tes tickets ouverts :** ${channels}\n\n` +
              `Ferme un ticket existant avant d'en ouvrir un nouveau.`
            )
            .setTimestamp(),
        ],
      });
    }

    const raison = args.join(' ').trim();

    // S'il y a une raison en argument et au moins 1 tag configuré → sélection du tag
    if (config.tags.length > 0) {
      // Proposer un select menu de catégorie + bouton pour ouvrir avec raison
      const embed = new EmbedBuilder()
        .setColor(manager.COLORS.info)
        .setTitle('🎫 Ouvrir un ticket')
        .setDescription(
          `Sélectionne la **catégorie** correspondant à ta demande.\n\n` +
          (raison ? `**Raison indiquée :** ${raison}` : `> 💡 Tu peux aussi utiliser \`.ticket <raison>\` pour préciser directement.`)
        )
        .setFooter({ text: `${open.length}/${config.maxOpen} tickets ouverts` })
        .setTimestamp();

      const select = new StringSelectMenuBuilder()
        .setCustomId(`ticket_tag_${message.author.id}_${encodeURIComponent(raison)}`)
        .setPlaceholder('Choisir une catégorie...')
        .addOptions(
          config.tags.map(tag =>
            new StringSelectMenuOptionBuilder()
              .setLabel(tag)
              .setValue(tag)
              .setDescription(`Ouvrir un ticket : ${tag}`)
          )
        );

      const row = new ActionRowBuilder().addComponents(select);
      return message.reply({ embeds: [embed], components: [row] });
    }

    // Aucun tag : ouvrir directement avec raison ou "Général"
    const tag = 'Général';
    const result = await manager.createTicketChannel(message.guild, config, message.author, tag, raison || 'Non précisée');

    if (result.error) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Erreur').setDescription(result.error).setTimestamp()],
      });
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(manager.COLORS.open)
          .setTitle('✅ Ticket ouvert')
          .setDescription(`Ton ticket a été créé : ${result.channel}\n\nRendez-vous dans le salon !`)
          .setTimestamp(),
      ],
    });
  },
};
