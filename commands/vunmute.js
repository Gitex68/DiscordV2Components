// commands/vunmute.js — .vunmute @user
// Retire le mute vocal d'un membre.

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, canActOn } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'vunmute',
  aliases: ['voiceunmute', 'vdesilence'],
  description: 'Rend la parole à un membre muté en vocal',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Rendre muet les membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MuteMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Rendre muet les membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.vunmute @membre`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (!target.voice.channel) return message.reply(err('❌ Ce membre n\'est pas dans un salon vocal.'));
    if (!target.voice.serverMute) return message.reply(err('⚠️ Ce membre n\'est pas muté en vocal.'));
    if (!canActOn(message.guild.members.me, target)) return message.reply(err('❌ Mon rôle est trop bas.'));

    await target.voice.setMute(false, `[${message.author.tag}] Vunmute`);

    await message.reply(ok(
      `## 🔊 Mute vocal retiré\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `🔊 **Salon :** <#${target.voice.channel.id}>`
    ));

    await logManager.onCmdVunmute(message.guild, {
      moderator: message.author,
      target: target.user,
    }).catch(() => {});
  },
};
