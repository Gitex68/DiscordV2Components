// commands/vkick.js — .vkick @user
// Déconnecte un membre d'un salon vocal.

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'vkick',
  aliases: ['voicekick', 'deco', 'disconnect'],
  description: 'Déconnecte un membre de son salon vocal',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Déplacer les membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Déplacer les membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.vkick @membre`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));

    const voiceChannel = target.voice.channel;
    if (!voiceChannel) return message.reply(err('❌ Ce membre n\'est pas dans un salon vocal.'));

    await target.voice.disconnect(`[${message.author.tag}] Vkick`);

    await message.reply(ok(
      `## 🚪 Membre déconnecté\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `🔊 **Salon :** <#${voiceChannel.id}>`
    ));

    await logManager.onCmdVkick(message.guild, {
      moderator: message.author,
      target: target.user,
      channel: voiceChannel,
    }).catch(() => {});
  },
};
