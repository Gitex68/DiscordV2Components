// commands/mute.js — .mute @user <durée> [raison]
// Applique un timeout Discord OU attribue un rôle de mute custom (selon config .aconfig).
// Mode timeout : durée obligatoire (max 28j). Mode rôle : durée optionnelle (info seulement).

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, canActOn, modCanActOn, parseDuration, fmtDuration } = require('./adminUtils.js');
const adminConfigDB = require('../utils/adminConfigDB.js');
const logManager    = require('../logs/logManager.js');

const MAX_TIMEOUT_SEC = 28 * 24 * 3600; // 28 jours (limite Discord)

module.exports = {
  name: 'mute',
  aliases: ['silence', 'timeout'],
  description: 'Applique un mute à un membre (timeout Discord ou rôle custom selon config)',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;

    const adminCfg  = adminConfigDB.getConfig(message.guild.id);
    const isRoleMode = adminCfg.muteMode === 'role' && !!adminCfg.muteRoleId;

    // En mode timeout, le bot a besoin de ModerateMembers
    if (!isRoleMode) {
      if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return message.reply(err('❌ Tu as besoin de la permission **Mettre en sourdine les membres**.'));
      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
        return message.reply(err('❌ Je n\'ai pas la permission **Mettre en sourdine les membres**.'));
    } else {
      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return message.reply(err('❌ Je n\'ai pas la permission **Gérer les rôles** pour attribuer le rôle de mute.'));
    }

    if (!args[0]) {
      const usage = isRoleMode
        ? '❌ **Usage :** `.mute @membre [durée] [raison]`\n-# Mode : 🎭 Rôle custom — durée optionnelle'
        : '❌ **Usage :** `.mute @membre <durée> [raison]`\n-# Mode : ⏰ Timeout Discord — durée obligatoire (`10s` `5m` `2h` `1d` max 28d)';
      return message.reply(err(usage));
    }

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (target.id === message.author.id) return message.reply(err('❌ Tu ne peux pas te muter toi-même.'));
    if (target.id === message.client.user.id) return message.reply(err('❌ Je ne peux pas me muter moi-même.'));
    if (!canActOn(message.guild.members.me, target)) return message.reply(err('❌ Mon rôle est trop bas pour muter ce membre.'));
    if (!modCanActOn(message.member, target)) return message.reply(err('❌ Ton rôle est trop bas pour muter ce membre.'));

    // ── Parsing durée + raison ─────────────────────────────────────────────
    const maybeDur   = parseDuration(args[1]);
    const durationSec = maybeDur || null;
    const reasonStart = maybeDur ? 2 : 1;
    const reason      = args.slice(reasonStart).join(' ') || null;
    const durStr      = durationSec ? fmtDuration(durationSec) : null;

    // ── Mode Timeout Discord ───────────────────────────────────────────────
    if (!isRoleMode) {
      if (!durationSec) return message.reply(err('❌ Durée obligatoire en mode timeout.\n-# Format: `10s` `5m` `2h` `1d` `7d`'));
      if (durationSec > MAX_TIMEOUT_SEC) return message.reply(err('❌ La durée maximale est **28 jours**.'));

      const until = new Date(Date.now() + durationSec * 1000);
      await target.timeout(durationSec * 1000, `[${message.author.tag}] ${reason || 'Aucune raison'}`);

      await target.send({
        content: `Tu as été **muté** sur le serveur **${message.guild.name}**.\n` +
                 `**Durée :** ${durStr}\n**Raison :** ${reason || '*Non précisée*'}\n` +
                 `**Expire :** <t:${Math.floor(until.getTime() / 1000)}:F>`,
      }).catch(() => {});

      await message.reply(ok(
        `## ⏰ Mute appliqué *(timeout Discord)*\n` +
        `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
        `⏱️ **Durée :** ${durStr}\n` +
        `🕐 **Expire :** <t:${Math.floor(until.getTime() / 1000)}:F>\n` +
        `📝 **Raison :** ${reason || '*Non précisée*'}`
      ));

    // ── Mode Rôle custom ───────────────────────────────────────────────────
    } else {
      const muteRole = message.guild.roles.cache.get(adminCfg.muteRoleId);
      if (!muteRole) return message.reply(err('❌ Le rôle de mute configuré est introuvable. Reconfigure-le via `.aconfig`.'));
      if (target.roles.cache.has(muteRole.id)) return message.reply(err(`❌ Ce membre a déjà le rôle ${muteRole}.`));

      await target.roles.add(muteRole, `[${message.author.tag}] ${reason || 'Aucune raison'}`);

      const expiryLine = durStr ? `\n**Durée indicative :** ${durStr} *(à retirer manuellement via \`.unmute\`)*` : '';
      await target.send({
        content: `Tu as été **muté** sur le serveur **${message.guild.name}**.\n` +
                 `**Raison :** ${reason || '*Non précisée*'}${expiryLine}`,
      }).catch(() => {});

      await message.reply(ok(
        `## 🎭 Mute appliqué *(rôle custom)*\n` +
        `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
        `🎭 **Rôle attribué :** ${muteRole}\n` +
        (durStr ? `⏱️ **Durée indicative :** ${durStr} *(retrait manuel via \`.unmute\`)*\n` : '') +
        `📝 **Raison :** ${reason || '*Non précisée*'}`
      ));
    }

    await logManager.onCmdMute(message.guild, {
      moderator: message.author,
      target:    target.user,
      reason,
      duration:  durStr ?? 'Indéfini',
    }).catch(() => {});
  },
};

