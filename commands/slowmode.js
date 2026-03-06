// commands/slowmode.js — .slowmode <secondes|off> [#salon]
// Définit le slowmode d'un salon. "off" ou 0 pour désactiver.

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveChannel } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'slowmode',
  aliases: ['slow', 'ratelimit'],
  description: 'Définit le slowmode d\'un salon',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply(err('❌ Tu as besoin de la permission **Gérer les salons**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply(err('❌ Je n\'ai pas la permission **Gérer les salons**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.slowmode <secondes|off> [#salon]`\n-# Ex: `.slowmode 5` `.slowmode 0` `.slowmode off`'));

    let channel = null;
    if (args[1] && args[1].startsWith('<#')) channel = resolveChannel(message.guild, args[1]);
    if (!channel) channel = message.channel;

    if (!channel.isTextBased() || channel.isThread())
      return message.reply(err('❌ Ce salon ne supporte pas le slowmode.'));

    const raw     = args[0].toLowerCase();
    const seconds = raw === 'off' || raw === '0' ? 0 : parseInt(raw);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600)
      return message.reply(err('❌ Valeur invalide. Doit être entre **0** et **21600** secondes (6h).'));

    await channel.setRateLimitPerUser(seconds, `[${message.author.tag}] Slowmode`);

    const label = seconds === 0 ? '**Désactivé**' : `**${seconds}s**`;
    await message.reply(ok(
      `## 🐢 Slowmode mis à jour\n` +
      `📍 **Salon :** ${channel}\n` +
      `⏱️ **Délai :** ${label}`
    ));

    await logManager.onCmdSlowmode(message.guild, {
      moderator: message.author,
      channel,
      seconds,
    }).catch(() => {});
  },
};
