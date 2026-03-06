// commands/unlock.js — .unlock [#salon|all]
// Déverrouille un ou tous les salons (remet les overrides à null).

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { ok, err, resolveChannel } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

function getResetPerms(channel) {
  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
    return { Connect: null, Speak: null };
  }
  return { SendMessages: null, AddReactions: null, CreatePublicThreads: null, CreatePrivateThreads: null };
}

async function unlockOne(channel, executor) {
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    getResetPerms(channel),
    { reason: `[${executor.tag}] Unlock` }
  );
}

module.exports = {
  name: 'unlock',
  aliases: ['deverrouiller', 'unlockdown'],
  description: 'Déverrouille un ou tous les salons',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply(err('❌ Tu as besoin de la permission **Gérer les salons**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply(err('❌ Je n\'ai pas la permission **Gérer les salons**.'));

    const isAll = args[0] === 'all' || args[0] === 'tous';

    // ── Mode ALL ─────────────────────────────────────────────────────────
    if (isAll) {
      const channels = message.guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildText ||
        c.type === ChannelType.GuildAnnouncement ||
        c.type === ChannelType.GuildVoice ||
        c.type === ChannelType.GuildStageVoice
      );

      const reply = await message.reply(ok(`## ⏳ Déverrouillage en cours...\n${channels.size} salon(s) à traiter.`));
      let done = 0, failed = 0;
      for (const [, ch] of channels) {
        try { await unlockOne(ch, message.author); done++; } catch { failed++; }
      }

      await reply.edit(ok(
        `## 🔓 Serveur déverrouillé\n` +
        `✅ **Salons déverrouillés :** ${done}\n` +
        (failed ? `⚠️ **Échecs :** ${failed}\n` : '')
      ));

      await logManager.onCmdUnlock(message.guild, {
        moderator: message.author,
        channel: message.channel,
      }).catch(() => {});
      return;
    }

    // ── Mode salon unique ─────────────────────────────────────────────────
    let channel = null;
    if (args[0] && args[0].startsWith('<#')) channel = resolveChannel(message.guild, args[0]);
    if (!channel) channel = message.channel;

    const isVoice = channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
    const isText  = channel.isTextBased && channel.isTextBased() && !channel.isThread();

    if (!isText && !isVoice)
      return message.reply(err('❌ Ce salon ne peut pas être déverrouillé.'));

    await unlockOne(channel, message.author);

    if (isText) {
      await channel.send({ content: `🔓 **Ce salon a été déverrouillé** par ${message.author}.` }).catch(() => {});
    }

    if (channel.id !== message.channel.id) {
      await message.reply(ok(
        `## 🔓 Salon déverrouillé\n` +
        `📍 ${channel} (${isVoice ? 'vocal' : 'textuel'})`
      ));
    }

    await logManager.onCmdUnlock(message.guild, {
      moderator: message.author,
      channel,
    }).catch(() => {});
  },
};
