// commands/unmute.js — .unmute @user

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, canActOn } = require('./adminUtils.js');
const adminConfigDB = require('../utils/adminConfigDB.js');
const logManager    = require('../logs/logManager.js');

module.exports = {
  name: 'unmute',
  aliases: ['desilence', 'untimeout'],
  description: 'Retire le mute d\'un membre (timeout Discord ou rôle custom selon config)',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!args[0]) return message.reply(err('❌ **Usage :** `.unmute @membre`'));

    const adminCfg  = adminConfigDB.getConfig(message.guild.id);
    const isRoleMode = adminCfg.muteMode === 'role' && !!adminCfg.muteRoleId;

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (!canActOn(message.guild.members.me, target)) return message.reply(err('❌ Mon rôle est trop bas.'));

    // ── Mode Rôle custom ───────────────────────────────────────────────────
    if (isRoleMode) {
      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return message.reply(err('❌ Je n\'ai pas la permission **Gérer les rôles**.'));

      const muteRole = message.guild.roles.cache.get(adminCfg.muteRoleId);
      if (!muteRole) return message.reply(err('❌ Le rôle de mute configuré est introuvable. Reconfigure-le via `.aconfig`.'));
      if (!target.roles.cache.has(muteRole.id)) return message.reply(err(`⚠️ Ce membre ne possède pas le rôle ${muteRole}.`));

      await target.roles.remove(muteRole, `[${message.author.tag}] Unmute`);
      await target.send({ content: `Ton mute a été **retiré** sur le serveur **${message.guild.name}**.` }).catch(() => {});
      await message.reply(ok(
        `## ✅ Mute retiré *(rôle custom)*\n` +
        `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
        `🎭 **Rôle retiré :** ${muteRole}`
      ));

    // ── Mode Timeout Discord ───────────────────────────────────────────────
    } else {
      if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return message.reply(err('❌ Tu as besoin de la permission **Mettre en sourdine les membres**.'));
      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
        return message.reply(err('❌ Je n\'ai pas la permission **Mettre en sourdine les membres**.'));
      if (!target.communicationDisabledUntil)
        return message.reply(err('⚠️ Ce membre n\'est pas en timeout.'));

      await target.timeout(null, `[${message.author.tag}] Unmute`);
      await target.send({ content: `Ton timeout a été **retiré** sur le serveur **${message.guild.name}**.` }).catch(() => {});
      await message.reply(ok(
        `## ✅ Mute retiré *(timeout Discord)*\n` +
        `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)`
      ));
    }

    await logManager.onCmdUnmute(message.guild, {
      moderator: message.author,
      target: target.user,
    }).catch(() => {});
  },
};

