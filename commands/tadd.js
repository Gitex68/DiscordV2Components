// commands/tadd.js — .tadd @user
// Ajoute un utilisateur au ticket courant

const { EmbedBuilder } = require('discord.js');
const db      = require('../tickets/ticketDB.js');
const manager = require('../tickets/ticketManager.js');

module.exports = {
  name: 'tadd',
  aliases: ['ticketadd'],
  description: 'Ajoute un utilisateur au ticket (staff)',

  async execute(message, args, client) {
    if (!message.guild) return;

    const config = db.getConfig(message.guild.id);
    const ticket = db.getTicket(message.guild.id, message.channel.id);

    if (!ticket) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce salon n\'est pas un ticket.')] });
    }
    if (!manager.hasSupport(message.member, config)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Seul le staff peut ajouter des utilisateurs.')] });
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Utilisation : `.tadd @utilisateur`')] });
    }
    if (member.id === ticket.ownerId) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription('⚠️ Cet utilisateur est déjà le propriétaire du ticket.')] });
    }
    if (ticket.addedUsers.includes(member.id)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription(`⚠️ ${member} est déjà dans ce ticket.`)] });
    }

    const result = await manager.addUserToChannel(message.guild, config, ticket, member, message.author);
    if (result.error) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${result.error}`)] });
    }
  },
};
