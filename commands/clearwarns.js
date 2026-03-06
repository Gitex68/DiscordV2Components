// commands/clearwarns.js — .clearwarns @user [id]
// Efface tous les avertissements d'un membre, ou un seul par son ID.

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember } = require('./adminUtils.js');
const warnDB = require('../logs/warningDB.js');
const logManager = require('../logs/logManager.js');

module.exports = {
  name: 'clearwarns',
  aliases: ['delwarn', 'rmwarn'],
  description: 'Efface les avertissements d\'un membre',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Mettre en sourdine les membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.clearwarns @membre [id_warn]`\n-# Omets l\'ID pour tout effacer'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));

    if (args[1]) {
      // Supprimer un warn spécifique
      const id = parseInt(args[1]);
      if (isNaN(id)) return message.reply(err('❌ ID invalide.'));
      const removed = warnDB.removeWarn(message.guild.id, target.id, id);
      if (!removed) return message.reply(err(`❌ Aucun avertissement #${id} trouvé pour ce membre.`));
      await logManager.onCmdRemovewarn(message.guild, {
        moderator: message.author,
        target:    target.user,
        warnId:    id,
      }).catch(() => {});
      return message.reply(ok(`## ✅ Avertissement #${id} supprimé\n👤 **Membre :** ${target.user.tag}`));
    }

    // Tout effacer
    const warns = warnDB.getWarns(message.guild.id, target.id);
    if (!warns.length) return message.reply(err('⚠️ Ce membre n\'a aucun avertissement.'));
    warnDB.clearWarns(message.guild.id, target.id);

    await logManager.onCmdClearwarns(message.guild, {
      moderator: message.author,
      target:    target.user,
      count:     warns.length,
    }).catch(() => {});

    await message.reply(ok(
      `## 🗑️ Avertissements effacés\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `🔢 **Supprimés :** ${warns.length}`
    ));
  },
};
