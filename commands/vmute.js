// commands/vmute.js — .vmute @user
// Mute vocal d'un membre (serverMute).

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, canActOn } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'vmute',
  aliases: ['voicemute', 'vsilence'],
  description: 'Coupe le micro d\'un membre en vocal (server mute)',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Rendre muet les membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MuteMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Rendre muet les membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.vmute @membre`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (!target.voice.channel) return message.reply(err('❌ Ce membre n\'est pas dans un salon vocal.'));
    if (target.voice.serverMute) return message.reply(err('⚠️ Ce membre est déjà muté en vocal.'));
    if (!canActOn(message.guild.members.me, target)) return message.reply(err('❌ Mon rôle est trop bas.'));

    await target.voice.setMute(true, `[${message.author.tag}] Vmute`);

    await message.reply(ok(
      `## 🔇 Mute vocal appliqué\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `🔊 **Salon :** <#${target.voice.channel.id}>`
    ));

    await logManager.onCmdVmute(message.guild, {
      moderator: message.author,
      target: target.user,
    }).catch(() => {});
  },
};
