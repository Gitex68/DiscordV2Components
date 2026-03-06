// commands/tclose.js — .tclose [raison]
// Ferme le ticket dans le salon courant

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db      = require('../tickets/ticketDB.js');
const manager = require('../tickets/ticketManager.js');

module.exports = {
  name: 'tclose',
  aliases: ['fermer', 'close'],
  description: 'Ferme le ticket courant',

  async execute(message, args, client) {
    if (!message.guild) return;

    const config = db.getConfig(message.guild.id);
    const ticket = db.getTicket(message.guild.id, message.channel.id);

    if (!ticket) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce salon n\'est pas un ticket.')],
      });
    }
    if (ticket.status === 'closed') {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription('⚠️ Ce ticket est déjà fermé.')],
      });
    }

    // Seul le propriétaire, le staff ou un admin peut fermer
    const isOwner   = message.author.id === ticket.ownerId;
    const isSupport = manager.hasSupport(message.member, config);
    if (!isOwner && !isSupport) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Tu n\'as pas la permission de fermer ce ticket.')],
      });
    }

    const result = await manager.closeTicketChannel(message.guild, config, ticket, message.author);
    if (result.error) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${result.error}`)] });
    }
  },
};
