// commands/warn.js — .warn @user [raison]
// Ajoute un avertissement persistant à un membre.
// Auto-sanction : 3 warns en 7j → mute 1h | 5 warns en 7j → kick | 7 warns en 30j → ban 7j

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember } = require('./adminUtils.js');
const warnDB     = require('../logs/warningDB.js');
const logManager = require('../logs/logManager.js');

// ── Configuration des paliers ──────────────────────────────────────────────
const THRESHOLDS = [
  { count: 3, window: 7 * 24 * 3600_000, action: 'mute',  duration: 3600_000,              label: 'Mute 1h (3 warns / 7j)'   },
  { count: 5, window: 7 * 24 * 3600_000, action: 'kick',  duration: null,                  label: 'Kick (5 warns / 7j)'       },
  { count: 7, window: 30 * 24 * 3600_000, action: 'ban',  duration: 7 * 24 * 3600_000,     label: 'Ban 7j (7 warns / 30j)'   },
];
// ──────────────────────────────────────────────────────────────────────────

module.exports = {
  name: 'warn',
  aliases: ['avertir', 'avertissement'],
  description: 'Ajoute un avertissement à un membre',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Mettre en sourdine les membres**.'));

    if (!args[0]) return message.reply(err('❌ **Usage :** `.warn @membre [raison]`'));

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply(err('❌ Membre introuvable.'));
    if (target.id === message.author.id) return message.reply(err('❌ Tu ne peux pas t\'avertir toi-même.'));
    if (target.user.bot) return message.reply(err('❌ Impossible d\'avertir un bot.'));

    const reason = args.slice(1).join(' ') || null;
    const total  = warnDB.addWarn(message.guild.id, target.id, message.author.id, reason || 'Aucune raison');

    // DM au membre
    await target.send({
      content: `⚠️ Tu as reçu un **avertissement** sur le serveur **${message.guild.name}**.\n` +
               `**Raison :** ${reason || '*Non précisée*'}\n**Total :** ${total} avertissement(s)`,
    }).catch(() => {});

    // ── Vérifier les paliers d'auto-sanction ──────────────────────────────
    let autoSanction = null;
    for (const t of THRESHOLDS) {
      const recent = warnDB.getWarnsInWindow(message.guild.id, target.id, t.window);
      if (recent.length >= t.count) {
        autoSanction = t; // prend le palier le plus élevé qui correspond
      }
    }

    let sanctionText = '';
    if (autoSanction) {
      try {
        const botMember = message.guild.members.me;
        const sanLabel  = `[AUTO] ${autoSanction.label}`;

        if (autoSanction.action === 'mute' && target.moderatable) {
          await target.timeout(autoSanction.duration, sanLabel);
          sanctionText = `\n⚡ **Sanction automatique :** ${autoSanction.label}`;
          await target.send({
            content: `🔇 Tu as été automatiquement **muté 1h** sur **${message.guild.name}** (${autoSanction.label}).`,
          }).catch(() => {});
          await logManager.onCmdMute(message.guild, {
            moderator: message.client.user,
            target: target.user,
            duration: autoSanction.duration / 1000,
            reason: sanLabel,
          }).catch(() => {});

        } else if (autoSanction.action === 'kick' && target.kickable) {
          await target.send({
            content: `👢 Tu as été automatiquement **expulsé** de **${message.guild.name}** (${autoSanction.label}).`,
          }).catch(() => {});
          await target.kick(sanLabel);
          sanctionText = `\n⚡ **Sanction automatique :** ${autoSanction.label}`;
          await logManager.onCmdKick(message.guild, {
            moderator: message.client.user,
            target: target.user,
            reason: sanLabel,
          }).catch(() => {});

        } else if (autoSanction.action === 'ban' && target.bannable) {
          await target.send({
            content: `🔨 Tu as été automatiquement **banni 7j** de **${message.guild.name}** (${autoSanction.label}).`,
          }).catch(() => {});
          await message.guild.members.ban(target.id, {
            deleteMessageSeconds: 0,
            reason: sanLabel,
          });
          sanctionText = `\n⚡ **Sanction automatique :** ${autoSanction.label}`;
          await logManager.onCmdBan(message.guild, {
            moderator: message.client.user,
            target: target.user,
            duration: autoSanction.duration / 1000,
            reason: sanLabel,
          }).catch(() => {});
        }
      } catch (e) {
        sanctionText = `\n⚠️ Sanction auto échouée : ${e.message}`;
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    await message.reply(ok(
      `## ⚠️ Avertissement enregistré\n` +
      `👤 **Membre :** ${target.user.tag} (\`${target.id}\`)\n` +
      `📝 **Raison :** ${reason || '*Non précisée*'}\n` +
      `🔢 **Total :** ${total} avertissement(s)` +
      sanctionText
    ));

    await logManager.onCmdWarn(message.guild, {
      moderator: message.author,
      target: target.user,
      reason,
      count: total,
    }).catch(() => {});
  },
};
