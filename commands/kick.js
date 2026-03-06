// commands/kick.js — .kick @user [raison]

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, canActOn, modCanActOn } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'kick',
  aliases: ['expulser'],
  description: 'Expulse un membre du serveur',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Expulser des membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Expulser des membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.kick @membre [raison]`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (target.id === message.author.id) return message.reply(err('❌ Tu ne peux pas te kicker toi-même.'));
    if (target.id === message.client.user.id) return message.reply(err('❌ Je ne peux pas me kicker moi-même.'));
    if (!target.kickable) return message.reply(err('❌ Ce membre ne peut pas être expulsé (rôle supérieur ou bot).'));
    if (!canActOn(message.guild.members.me, target)) return message.reply(err('❌ Mon rôle est trop bas pour kicker ce membre.'));
    if (!modCanActOn(message.member, target)) return message.reply(err('❌ Ton rôle est trop bas pour kicker ce membre.'));

    const reason = args.slice(1).join(' ') || null;

    await target.send({
      content: `Tu as été **expulsé** du serveur **${message.guild.name}**.\n**Raison :** ${reason || '*Non précisée*'}`,
    }).catch(() => {});

    await target.kick(`[${message.author.tag}] ${reason || 'Aucune raison'}`);

    await message.reply(ok(
      `## 👢 Kick appliqué\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `📝 **Raison :** ${reason || '*Non précisée*'}`
    ));

    await logManager.onCmdKick(message.guild, {
      moderator: message.author,
      target: target.user,
      reason,
    }).catch(() => {});
  },
};
