// commands/move.js — .move @u1 [@u2 ...] #vocal-cible
// Déplace un ou plusieurs membres vers un salon vocal.
// Le DERNIER argument doit être la mention ou l'ID du salon cible.
// Tous les arguments précédents sont des membres à déplacer.

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { ok, err, resolveMember, resolveChannel } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'move',
  aliases: ['deplacer', 'vmove'],
  description: 'Déplace un ou plusieurs membres vers un salon vocal',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Déplacer les membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Déplacer les membres**.'));

    if (args.length < 2)
      return message.reply(err('❌ **Usage :** `.move @membre1 [@membre2 ...] #vocal-cible`'));

    // Dernier arg = salon cible
    const toChannel = resolveChannel(message.guild, args[args.length - 1]);
    if (!toChannel)
      return message.reply(err('❌ Salon vocal cible introuvable. Place le **#vocal-cible en dernier** argument.'));
    if (toChannel.type !== ChannelType.GuildVoice && toChannel.type !== ChannelType.GuildStageVoice)
      return message.reply(err('❌ Le salon cible doit être un **salon vocal**.'));

    // Tous les args avant le dernier = membres
    const memberArgs = args.slice(0, -1);
    if (memberArgs.length === 0)
      return message.reply(err('❌ **Usage :** `.move @membre1 [@membre2 ...] #vocal-cible`'));

    const results = { moved: [], notInVoice: [], notFound: [], alreadyThere: [], failed: [] };

    for (const arg of memberArgs) {
      const target = await resolveMember(message.guild, arg);
      if (!target) { results.notFound.push(arg); continue; }

      const fromChannel = target.voice.channel;
      if (!fromChannel) { results.notInVoice.push(target.user.tag); continue; }
      if (fromChannel.id === toChannel.id) { results.alreadyThere.push(target.user.tag); continue; }

      try {
        await target.voice.setChannel(toChannel, `[${message.author.tag}] Move`);
        results.moved.push({ user: target.user, from: fromChannel });
        await logManager.onCmdMove(message.guild, {
          moderator: message.author,
          target: target.user,
          from: fromChannel,
          to: toChannel,
        }).catch(() => {});
      } catch { results.failed.push(target.user.tag); }
    }

    // Résumé
    let lines = `## 🔀 Déplacement vers <#${toChannel.id}>\n`;
    if (results.moved.length)
      lines += `✅ **Déplacés (${results.moved.length}) :**\n` + results.moved.map(r => `• ${r.user.tag} ← <#${r.from.id}>`).join('\n') + '\n';
    if (results.alreadyThere.length)
      lines += `⚠️ **Déjà dans le salon :** ${results.alreadyThere.join(', ')}\n`;
    if (results.notInVoice.length)
      lines += `🔇 **Pas en vocal :** ${results.notInVoice.join(', ')}\n`;
    if (results.notFound.length)
      lines += `❓ **Introuvables :** ${results.notFound.join(', ')}\n`;
    if (results.failed.length)
      lines += `❌ **Échecs :** ${results.failed.join(', ')}\n`;

    await message.reply(ok(lines.trim()));
  },
};
