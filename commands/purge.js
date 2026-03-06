// commands/purge.js — .purge [n] [@user]
// Supprime les n derniers messages du salon (max 100, max 14 jours).
// Option: .purge 20 @user → purge seulement les messages de ce user.

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'purge',
  aliases: ['prune', 'clr'],
  description: 'Supprime des messages en masse',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply(err('❌ Tu as besoin de la permission **Gérer les messages**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply(err('❌ Je n\'ai pas la permission **Gérer les messages**.'));

    const n = parseInt(args[0]);
    if (!n || n < 1 || n > 100)
      return message.reply(err('❌ **Usage :** `.purge <1-100> [@user]`\n-# Ex: `.purge 20` ou `.purge 10 @user`'));

    // Supprimer le message de commande d'abord
    await message.delete().catch(() => {});

    // Fetch les messages (n+1 pour compenser le message de commande déjà supprimé)
    let messages = await message.channel.messages.fetch({ limit: 100 });

    // Filtrer par user si précisé
    if (args[1]) {
      const target = await resolveMember(message.guild, args[1]);
      if (target) messages = messages.filter(m => m.author.id === target.id);
    }

    // Garder seulement les n premiers + exclure les > 14 jours
    const now       = Date.now();
    const limit14d  = 14 * 24 * 3600 * 1000;
    const toDelete  = messages
      .filter(m => now - m.createdTimestamp < limit14d)
      .first(n);

    if (!toDelete.length) {
      const notice = await message.channel.send({ content: '⚠️ Aucun message récent à supprimer (max 14 jours).' });
      setTimeout(() => notice.delete().catch(() => {}), 5000);
      return;
    }

    const deleted = await message.channel.bulkDelete(toDelete, true).catch(() => null);
    const count   = deleted?.size ?? toDelete.length;

    const notice = await message.channel.send({
      content: `🧹 **${count}** message(s) supprimé(s).`,
    });
    setTimeout(() => notice.delete().catch(() => {}), 4000);

    await logManager.onCmdPurge(message.guild, {
      moderator: message.author,
      channel:   message.channel,
      count,
    }).catch(() => {});
  },
};
