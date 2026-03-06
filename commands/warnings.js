// commands/warnings.js — .warnings @user
// Affiche les avertissements d'un membre.

const { PermissionFlagsBits } = require('discord.js');
const { info, err, resolveMember } = require('./adminUtils.js');
const warnDB = require('../logs/warningDB.js');

module.exports = {
  name: 'warnings',
  aliases: ['warns', 'infractions'],
  description: 'Affiche les avertissements d\'un membre',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Mettre en sourdine les membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.warnings @membre`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));

    const warns = warnDB.getWarns(message.guild.id, target.id);
    if (!warns.length) return message.reply(info(`## ✅ Aucun avertissement\n${target.user.tag} n'a aucun avertissement enregistré.`, 0x57f287));

    const lines = warns.map(w => {
      const date = `<t:${Math.floor(w.date / 1000)}:d>`;
      return `**#${w.id}** — ${date} par <@${w.moderatorId}> — ${w.reason}`;
    }).join('\n');

    await message.reply(info(
      `## ⚠️ Avertissements de ${target.user.tag}\n` +
      `🔢 **Total :** ${warns.length}\n\n` +
      lines.slice(0, 1800),
      0xffa500
    ));
  },
};
