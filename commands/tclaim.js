// commands/tclaim.js — .tclaim
// Prend en charge (claim) ou libère (unclaim) le ticket courant

const { EmbedBuilder } = require('discord.js');
const db      = require('../tickets/ticketDB.js');
const manager = require('../tickets/ticketManager.js');

module.exports = {
  name: 'tclaim',
  aliases: ['claim'],
  description: 'Prend en charge le ticket courant (staff)',

  async execute(message, args, client) {
    if (!message.guild) return;

    const config = db.getConfig(message.guild.id);
    const ticket = db.getTicket(message.guild.id, message.channel.id);

    if (!ticket) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce salon n\'est pas un ticket.')] });
    }
    if (ticket.status !== 'open') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription('⚠️ Le ticket n\'est pas ouvert.')] });
    }
    if (!manager.hasSupport(message.member, config)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Seul le staff peut prendre en charge un ticket.')] });
    }

    // Si déjà claim par quelqu'un d'autre
    if (ticket.claimedBy && ticket.claimedBy !== message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setDescription(`⚠️ Ce ticket est déjà pris en charge par <@${ticket.claimedBy}>.\nUtilise \`.tunclaim\` d'abord.`),
        ],
      });
    }

    // Unclaim si déjà claim par soi-même
    if (ticket.claimedBy === message.author.id) {
      await manager.unclaimTicketChannel(message.guild, config, ticket, message.author);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription('🔄 Tu n\'es plus responsable de ce ticket.')] });
    }

    await manager.claimTicketChannel(message.guild, config, ticket, message.author);
  },
};
