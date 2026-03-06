// commands/wouaf.js — .wouaf [@u1 @u2 ...] [durée]
// Force une ou plusieurs cibles à suivre le salon vocal de l'auteur pendant une durée.
// Durée : 10s min · 5min max · défaut 1min
// Syntaxe : .wouaf @alice @bob 2min  OU  .wouaf @alice  (durée optionnelle, avant ou après les mentions)

const { PermissionFlagsBits } = require('discord.js');
const { ok, err, resolveMember, parseDuration, fmtDuration } = require('./adminUtils.js');
const logManager = require('../logs/logManager.js');

const DURATION_MIN_S  = 10;
const DURATION_MAX_S  = 5 * 60;   // 5 min
const DURATION_DEF_S  = 60;       // 1 min
const POLL_INTERVAL   = 2_000;    // vérifier toutes les 2s

// Sessions actives : clé `${guildId}:${userId}` → true (pour éviter les doublons)
const activeSessions = new Map();

module.exports = {
  name: 'wouaf',
  aliases: ['summon', 'rappatrier', 'vsum'],
  description: 'Force des membres à suivre ton salon vocal pendant une durée',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers))
      return message.reply(err('❌ Tu as besoin de la permission **Déplacer les membres**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers))
      return message.reply(err('❌ Je n\'ai pas la permission **Déplacer les membres**.'));

    const authorVoice = message.member.voice.channel;
    if (!authorVoice)
      return message.reply(err('❌ Tu dois être dans un **salon vocal** pour utiliser cette commande.'));

    if (!args[0])
      return message.reply(err(
        `❌ **Usage :** \`.wouaf @membre1 [@membre2 ...] [durée]\`\n` +
        `-# Durée : \`10s\` → \`5min\` · défaut \`1min\`\n-# Exemple : \`.wouaf @alice @bob 2min\``
      ));

    // ── Séparer mentions et durée ──────────────────────────────────────────
    let durationSec = DURATION_DEF_S;
    const memberArgs = [];

    for (const arg of args) {
      const parsed = parseDuration(arg);
      if (parsed !== null && !arg.startsWith('<@')) {
        // C'est une durée
        if (parsed < DURATION_MIN_S)
          return message.reply(err(`❌ Durée minimum : **${fmtDuration(DURATION_MIN_S)}**.`));
        if (parsed > DURATION_MAX_S)
          return message.reply(err(`❌ Durée maximum : **${fmtDuration(DURATION_MAX_S)}**.`));
        durationSec = parsed;
      } else {
        memberArgs.push(arg);
      }
    }

    if (memberArgs.length === 0)
      return message.reply(err('❌ Aucun membre valide trouvé.'));

    // ── Résoudre les membres ───────────────────────────────────────────────
    const targets = [];
    const notFound = [];

    for (const arg of memberArgs) {
      const member = await resolveMember(message.guild, arg);
      if (!member || member.id === message.author.id) { notFound.push(arg); continue; }
      targets.push(member);
    }

    if (targets.length === 0)
      return message.reply(err('❌ Aucun membre valide trouvé.'));

    // ── Déplacement initial ────────────────────────────────────────────────
    const sessionKey = `${message.guild.id}:${message.author.id}`;
    if (activeSessions.has(sessionKey))
      return message.reply(err('⚠️ Tu as déjà une session `.wouaf` en cours. Attends qu\'elle se termine.'));

    activeSessions.set(sessionKey, true);

    const initialMoved = [];
    for (const target of targets) {
      if (!target.voice.channel) continue; // pas en vocal → impossible
      if (target.voice.channel.id === authorVoice.id) continue; // déjà là
      try {
        await target.voice.setChannel(authorVoice, `[${message.author.tag}] Wouaf`);
        initialMoved.push(target);
      } catch {}
    }

    const expireTs = Math.floor(Date.now() / 1000) + durationSec;
    const mentionList = targets.map(t => `<@${t.id}>`).join(' ');

    const reply = await message.reply(ok(
      `## 🐾 Wouaf ! — Suivi actif\n` +
      `🎯 **Cible(s) :** ${mentionList}\n` +
      `🔊 **Salon :** <#${authorVoice.id}>\n` +
      `⏱️ **Expire :** <t:${expireTs}:R>\n` +
      `-# Les cibles seront ramenées dès qu'elles quittent ton salon.`
    ));

    // ── Boucle de suivi ───────────────────────────────────────────────────
    const interval = setInterval(async () => {
      // Vérifier si l'auteur est encore en vocal
      const authorMember = await message.guild.members.fetch(message.author.id).catch(() => null);
      const authorCurrent = authorMember?.voice.channel;

      if (!authorCurrent) {
        // Auteur a quitté le vocal → arrêter
        clearInterval(interval);
        activeSessions.delete(sessionKey);
        reply.edit(ok(
          `## 🐾 Wouaf ! — Arrêté\n` +
          `⛔ Suivi annulé : tu as quitté le salon vocal.\n` +
          `-# Cibles : ${mentionList}`
        )).catch(() => {});
        // Log d'annulation
        await logManager.onCmdWouaf(message.guild, {
          moderator: message.author,
          targets:   targets.map(t => t.user),
          channel:   authorVoice,
          duration:  `${fmtDuration(durationSec)} (annulé tôt)`,
        }).catch(() => {});
        return;
      }

      // Ramener chaque cible si elle a bougé
      for (const target of targets) {
        const fresh = await message.guild.members.fetch(target.id).catch(() => null);
        if (!fresh?.voice.channel) continue;                        // pas en vocal
        if (fresh.voice.channel.id === authorCurrent.id) continue; // déjà dans le bon salon
        fresh.voice.setChannel(authorCurrent, `[${message.author.tag}] Wouaf suivi`).catch(() => {});
      }
    }, POLL_INTERVAL);

    // ── Arrêt à expiration ────────────────────────────────────────────────
    setTimeout(async () => {
      clearInterval(interval);
      activeSessions.delete(sessionKey);

      reply.edit(ok(
        `## 🐾 Wouaf ! — Terminé\n` +
        `✅ Suivi de **${fmtDuration(durationSec)}** terminé.\n` +
        `🎯 **Cibles :** ${mentionList}`
      )).catch(() => {});

      // Log unique récapitulatif dans le fil ⚖️ Sanctions
      await logManager.onCmdWouaf(message.guild, {
        moderator: message.author,
        targets:   targets.map(t => t.user),
        channel:   authorVoice,
        duration:  fmtDuration(durationSec),
      }).catch(() => {});
    }, durationSec * 1000);
  },
};
