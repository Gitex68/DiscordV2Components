// commands/ban.js — .ban @user [durée] [raison]
// Bannit un membre. Durée optionnelle (ex: 7d = bannissement temporaire via deleteMessageSeconds).

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, canActOn, modCanActOn, parseDuration, fmtDuration } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'ban',
  aliases: ['bannir'],
  description: 'Bannit un membre du serveur',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;

    // Permission
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Bannir des membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Bannir des membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.ban @membre [durée] [raison]`\n-# Ex: `.ban @user 7d Spam répété`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (target.id === message.author.id) return message.reply(err('❌ Tu ne peux pas te bannir toi-même.'));
    if (target.id === message.client.user.id) return message.reply(err('❌ Je ne peux pas me bannir moi-même.'));
    if (!canActOn(message.guild.members.me, target)) return message.reply(err('❌ Mon rôle est trop bas pour bannir ce membre.'));
    if (!modCanActOn(message.member, target)) return message.reply(err('❌ Ton rôle est trop bas pour bannir ce membre.'));

    // Parsing durée + raison
    let durStr = null, durationSec = null;
    let reasonStart = 1;
    const maybeDur = parseDuration(args[1]);
    if (maybeDur) { durationSec = maybeDur; durStr = fmtDuration(durationSec); reasonStart = 2; }
    const reason = args.slice(reasonStart).join(' ') || null;

    // DM avant le ban
    await target.send({
      content: `Tu as été **banni** du serveur **${message.guild.name}**.\n**Durée :** ${durStr || '*Permanente*'}\n**Raison :** ${reason || '*Non précisée*'}`,
    }).catch(() => {});

    await message.guild.members.ban(target, {
      reason: `[${message.author.tag}] ${reason || 'Aucune raison'}`,
      deleteMessageSeconds: durationSec ? Math.min(durationSec, 604800) : 0,
    });

    await message.reply(ok(
      `## 🔨 Ban appliqué\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `⏱️ **Durée :** ${durStr || '*Permanente*'}\n` +
      `📝 **Raison :** ${reason || '*Non précisée*'}`
    ));

    await logManager.onCmdBan(message.guild, {
      moderator: message.author,
      target: target.user,
      reason,
      duration: durStr,
    }).catch(() => {});
  },
};
