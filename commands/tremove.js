// commands/tremove.js — .tremove @user
// Retire un utilisateur du ticket courant

const { EmbedBuilder } = require('discord.js');
const db      = require('../tickets/ticketDB.js');
const manager = require('../tickets/ticketManager.js');

module.exports = {
  name: 'tremove',
  aliases: ['ticketremove', 'tkick'],
  description: 'Retire un utilisateur du ticket (staff)',

  async execute(message, args, client) {
    if (!message.guild) return;

    const config = db.getConfig(message.guild.id);
    const ticket = db.getTicket(message.guild.id, message.channel.id);

    if (!ticket) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce salon n\'est pas un ticket.')] });
    }
    if (!manager.hasSupport(message.member, config)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Seul le staff peut retirer des utilisateurs.')] });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Utilisation : `.tremove @utilisateur`')] });
    }
    if (member.id === ticket.ownerId) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Tu ne peux pas retirer le propriétaire du ticket.')] });
    }
    if (!ticket.addedUsers.includes(member.id)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription(`⚠️ ${member} n'a pas été ajouté manuellement à ce ticket.`)] });
    }

    const result = await manager.removeUserFromChannel(message.guild, config, ticket, member, message.author);
    if (result.error) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${result.error}`)] });
    }
  },
};
