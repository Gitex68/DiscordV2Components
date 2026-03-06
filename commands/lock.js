// commands/lock.js — .lock [#salon|all] [raison]
// Modes :
//   .lock            → verrouille le salon courant (texte ou vocal)
//   .lock #salon     → verrouille le salon mentionné
//   .lock all        → verrouille TOUS les salons texte+vocal du serveur
// Le verrou bloque même les membres avec des permissions admin grâce
// à un override explicite deny sur @everyone (ViewChannel+SendMessages / Connect).

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { ok, err, resolveChannel } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

// Perms à retirer selon le type de salon
function getDenyPerms(channel) {
  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
    return { Connect: false, Speak: false };
  }
  return { SendMessages: false, AddReactions: false, CreatePublicThreads: false, CreatePrivateThreads: false };
}

// Verrouille un seul salon
async function lockOne(channel, executor, reason) {
  const deny = getDenyPerms(channel);
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    deny,
    { reason: `[${executor.tag}] ${reason || 'Lock'}` }
  );
}

module.exports = {
  name: 'lock',
  aliases: ['verrouiller', 'lockdown'],
  description: 'Verrouille un ou tous les salons (même pour les admins)',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply(err('❌ Tu as besoin de la permission **Gérer les salons**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply(err('❌ Je n\'ai pas la permission **Gérer les salons**.'));

    const isAll = args[0] === 'all' || args[0] === 'tous';
    let reasonStart = isAll || (args[0] && args[0].startsWith('<#')) ? 1 : 0;
    const reason = args.slice(reasonStart).join(' ') || null;

    // ── Mode ALL ─────────────────────────────────────────────────────────
    if (isAll) {
      const channels = message.guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildText ||
        c.type === ChannelType.GuildAnnouncement ||
        c.type === ChannelType.GuildVoice ||
        c.type === ChannelType.GuildStageVoice
      );

      const reply = await message.reply(ok(`## ⏳ Verrouillage en cours...\n${channels.size} salon(s) à traiter.`));
      let done = 0, failed = 0;
      for (const [, ch] of channels) {
        try { await lockOne(ch, message.author, reason); done++; } catch { failed++; }
      }

      await reply.edit(ok(
        `## 🔒 Serveur verrouillé\n` +
        `✅ **Salons verrouillés :** ${done}\n` +
        (failed ? `⚠️ **Échecs :** ${failed}\n` : '') +
        `📝 **Raison :** ${reason || '*Non précisée*'}`
      ));

      await logManager.onCmdLock(message.guild, {
        moderator: message.author,
        channel: message.channel,
        reason: `[ALL] ${reason || 'Lockdown serveur'}`,
      }).catch(() => {});
      return;
    }

    // ── Mode salon unique ─────────────────────────────────────────────────
    let channel = null;
    if (args[0] && args[0].startsWith('<#')) channel = resolveChannel(message.guild, args[0]);
    if (!channel) channel = message.channel;

    const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
    const isText  = channel.isTextBased() && !channel.isThread();

    if (!isText && !isVoice)
      return message.reply(err('❌ Ce salon ne peut pas être verrouillé (threads non supportés).'));

    await lockOne(channel, message.author, reason);

    // Message dans le salon verrouillé (uniquement texte)
    if (isText) {
      await channel.send({
        content: `🔒 **Ce salon a été verrouillé** par ${message.author}.\n${reason ? `**Raison :** ${reason}` : ''}`,
      }).catch(() => {});
    }

    if (channel.id !== message.channel.id) {
      await message.reply(ok(
        `## 🔒 Salon verrouillé\n` +
        `📍 ${channel} (${isVoice ? 'vocal' : 'textuel'})\n` +
        `📝 **Raison :** ${reason || '*Non précisée*'}`
      ));
    }

    await logManager.onCmdLock(message.guild, {
      moderator: message.author,
      channel,
      reason,
    }).catch(() => {});
  },
};
