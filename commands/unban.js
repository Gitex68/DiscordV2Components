// commands/unban.js — .unban <id|@mention> [raison]
// Débanni un membre. La cible peut ne plus être sur le serveur, on accepte un ID brut.

const { PermissionFlagsBits } = require('discord.js');
const { ok, err } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'unban',
  aliases: ['debannir', 'pardon'],
  description: 'Débanni un membre par son ID ou sa mention',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Bannir des membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Bannir des membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.unban <ID> [raison]`'));

    const rawId = args[0].replace(/[<@!>]/g, '');
    if (!/^\d{17,20}$/.test(rawId))
      return message.reply(err('❌ ID invalide. Fournis l\'ID numérique de l\'utilisateur.'));

    const reason = args.slice(1).join(' ') || null;

    // Vérifier que cet ID est bien dans la banlist
    let ban;
    try {
      ban = await message.guild.bans.fetch(rawId);
    } catch {
      return message.reply(err('❌ Cet utilisateur n\'est pas banni sur ce serveur.'));
    }

    await message.guild.members.unban(rawId, `[${message.author.tag}] ${reason || 'Unban'}`);

    await message.reply(ok(
      `## 🔓 Membre débanni\n` +
      `👤 **Membre :** ${ban.user.tag} (\`${rawId}\`)\n` +
      `📝 **Raison :** ${reason || '*Non précisée*'}`
    ));

    await logManager.onCmdUnban(message.guild, {
      moderator: message.author,
      target:    ban.user,
      reason,
    }).catch(() => {});
  },
};
