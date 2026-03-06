'use strict';

const db = require('../tickets/ticketDB.js');

/**
 * Applique explicitement ViewChannel + SendMessages + ReadMessageHistory
 * sur tous les tickets ouverts d'un membre, pour éviter que le mute/timeout
 * ne lui retire l'accès à ses propres tickets.
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 */
async function ensureTicketAccess(guild, userId) {
  try {
    const openTickets = db.getOpenTicketsByUser(guild.id, userId);
    for (const ticket of openTickets) {
      const ch = guild.channels.cache.get(ticket.channelId);
      if (!ch) continue;
      await ch.permissionOverwrites.edit(userId, {
        ViewChannel:        true,
        SendMessages:       true,
        ReadMessageHistory: true,
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[ticketUtils] ensureTicketAccess error:', e.message);
  }
}

module.exports = { ensureTicketAccess };
