// commands/clean.js — .clean <nombre|all>
// Supprime N messages du salon (max 1000 via boucle bulk) ou vide entièrement
// le salon via clone+delete lorsque "all" est utilisé.
// Génère un transcript HTML des messages supprimés, envoyé dans les logs mod.

'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { ok, err } = require('./adminUtils.js');
const logManager  = require('../logs/logManager.js');

// ─── Helpers HTML ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function roleColor(member) {
  const color = member?.roles?.color?.color;
  if (!color) return '#b9bbbe';
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Génère un fichier HTML style transcript Discord pour une collection de messages.
 * @param {import('discord.js').Collection<string, import('discord.js').Message>} messages
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildChannel} channel
 * @param {import('discord.js').User} moderator
 * @param {string|number} count
 * @returns {string} HTML
 */
function buildCleanHtml(messages, guild, channel, moderator, count) {
  const sortedMessages = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const generatedAt = new Date().toLocaleString('fr-FR');

  const msgLines = sortedMessages.map(m => {
    const time   = new Date(m.createdTimestamp).toLocaleString('fr-FR');
    const avatar = m.author.displayAvatarURL({ size: 64, extension: 'png' });
    const member = guild.members.cache.get(m.author.id);
    const name   = member?.displayName || m.author.username;
    const color  = roleColor(member);
    const bot    = m.author.bot ? '<span class="badge">BOT</span>' : '';

    let body = '';

    if (m.content) {
      body += `<div class="content">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>`;
    }

    for (const e of m.embeds) {
      const ec = e.color ? `#${e.color.toString(16).padStart(6, '0')}` : '#4f545c';
      body += `<div class="embed" style="border-left:4px solid ${ec}">`;
      if (e.title)       body += `<div class="embed-title">${escapeHtml(e.title)}</div>`;
      if (e.description) body += `<div class="embed-desc">${escapeHtml(e.description).replace(/\n/g, '<br>')}</div>`;
      if (e.fields?.length) {
        body += `<div class="embed-fields">`;
        for (const f of e.fields) {
          body += `<div class="embed-field ${f.inline ? 'inline' : ''}">` +
            `<div class="field-name">${escapeHtml(f.name)}</div>` +
            `<div class="field-value">${escapeHtml(f.value)}</div></div>`;
        }
        body += `</div>`;
      }
      if (e.footer?.text) body += `<div class="embed-footer">${escapeHtml(e.footer.text)}</div>`;
      body += `</div>`;
    }

    for (const att of m.attachments.values()) {
      const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name || '');
      if (isImg) {
        body += `<div class="attachment"><img src="${att.url}" alt="${escapeHtml(att.name || 'image')}" loading="lazy" style="max-width:400px;max-height:300px;border-radius:4px;margin-top:4px"></div>`;
      } else {
        body += `<div class="attachment">📎 <a href="${att.url}" target="_blank">${escapeHtml(att.name || att.url)}</a>` +
          (att.size ? ` <span class="att-size">(${formatBytes(att.size)})</span>` : '') + `</div>`;
      }
    }

    if (!body) body = `<div class="content muted">[Message vide ou non pris en charge]</div>`;

    return `
    <div class="message">
      <img class="avatar" src="${avatar}" alt="${escapeHtml(name)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
      <div class="msg-body">
        <span class="username" style="color:${color}">${escapeHtml(name)}</span>${bot}
        <span class="timestamp">${time}</span>
        ${body}
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Clean — #${escapeHtml(channel.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #313338; color: #dcddde; font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; }
    .header { background: #1e1f22; padding: 24px 32px; border-bottom: 1px solid #232428; }
    .header h1 { font-size: 22px; color: #fff; }
    .header .meta { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 18px; color: #b5bac1; font-size: 13px; }
    .header .meta span { display: flex; align-items: center; gap: 6px; }
    .messages { padding: 16px 32px; max-width: 900px; margin: 0 auto; }
    .message { display: flex; gap: 16px; padding: 6px 0; }
    .message:hover { background: #2e3035; border-radius: 4px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
    .msg-body { flex: 1; min-width: 0; }
    .username { font-weight: 600; font-size: 15px; }
    .timestamp { color: #72767d; font-size: 11px; margin-left: 8px; }
    .badge { background: #5865f2; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 5px; text-transform: uppercase; vertical-align: middle; }
    .content { margin-top: 2px; white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
    .content.muted { color: #72767d; font-style: italic; }
    .embed { background: #2b2d31; border-radius: 4px; padding: 10px 14px; margin-top: 6px; max-width: 520px; }
    .embed-title { font-weight: 700; color: #fff; margin-bottom: 4px; }
    .embed-desc { font-size: 14px; color: #dcddde; line-height: 1.4; }
    .embed-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .embed-field { flex: 1 1 30%; min-width: 120px; }
    .embed-field.inline { flex: 0 0 auto; }
    .field-name { font-size: 12px; font-weight: 700; color: #b9bbbe; text-transform: uppercase; margin-bottom: 2px; }
    .field-value { font-size: 13px; color: #dcddde; }
    .embed-footer { font-size: 12px; color: #72767d; margin-top: 8px; }
    .attachment { margin-top: 4px; font-size: 13px; }
    .attachment a { color: #00b0f4; }
    .att-size { color: #72767d; font-size: 11px; }
    .footer { text-align: center; padding: 32px; color: #72767d; font-size: 12px; border-top: 1px solid #232428; margin-top: 16px; }
    .mod-banner { background: #ed4245; color: #fff; padding: 10px 32px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="mod-banner">🗑️ Transcript de suppression — commande .clean</div>
  <div class="header">
    <h1>🗑️ Messages supprimés — #${escapeHtml(channel.name)}</h1>
    <div class="meta">
      <span>🏠 Serveur : <strong>${escapeHtml(guild.name)}</strong></span>
      <span>📍 Salon : <strong>#${escapeHtml(channel.name)}</strong></span>
      <span>🛠️ Modérateur : <strong>${escapeHtml(moderator.tag || moderator.username)} (${moderator.id})</strong></span>
      <span>💬 Messages supprimés : <strong>${sortedMessages.length}</strong></span>
      <span>📅 Généré le : <strong>${generatedAt}</strong></span>
    </div>
  </div>
  <div class="messages">
${msgLines || '<div style="padding:32px;color:#72767d;font-style:italic">Aucun message récupéré (trop anciens ou déjà supprimés).</div>'}
  </div>
  <div class="footer">Transcript de suppression généré le ${generatedAt} • Serveur : ${escapeHtml(guild.name)} • Salon : #${escapeHtml(channel.name)}</div>
</body>
</html>`;
}

module.exports = {
  name: 'clean',
  aliases: ['clear'],
  description: 'Supprime N messages ou vide entièrement un salon (all)',
  adminOnly: true,

  async execute(message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply(err('❌ Tu as besoin de la permission **Gérer les messages**.'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply(err('❌ Je n\'ai pas la permission **Gérer les messages**.'));

    const arg = args[0]?.toLowerCase();
    if (!arg) {
      return message.reply(err(
        '❌ **Usage :** `.clean <nombre|all>`\n' +
        '-# Ex : `.clean 50` · `.clean all`\n' +
        '-# `all` vide entièrement le salon (clone + suppression)'
      ));
    }

    const channel = message.channel;

    // ── Mode ALL : clone le salon puis supprime l'original ─────────────────
    if (arg === 'all') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return message.reply(err('❌ **Mode `all`** : tu as besoin de la permission **Gérer les salons**.'));
      if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return message.reply(err('❌ **Mode `all`** : je n\'ai pas la permission **Gérer les salons**.'));

      const notice = await message.reply(ok(
        '## 🧹 Nettoyage complet en cours…\n-# Le salon va être recréé, ne t\'inquiète pas !'
      ));

      try {
        // ── Collecter tous les messages AVANT la suppression (pour le transcript) ──
        let allMessages = [];
        let lastId;
        for (let i = 0; i < 50; i++) {
          const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
          if (!batch || batch.size === 0) break;
          allMessages = allMessages.concat([...batch.values()]);
          lastId = batch.last().id;
          if (batch.size < 100) break;
        }
        const { Collection } = require('discord.js');
        const msgCollection = new Collection(allMessages.map(m => [m.id, m]));

        // Cloner le salon (garde perms, position, topic, slowmode, etc.)
        const newChannel = await channel.clone({
          reason: `[${message.author.tag}] .clean all`,
        });

        // Repositionner exactement au même endroit
        await newChannel.setPosition(channel.position).catch(() => {});

        // Envoyer la confirmation dans le nouveau salon
        await newChannel.send(ok(
          `## ✅ Salon vidé\n` +
          `👤 **Par :** ${message.author} (\`${message.author.tag}\`)\n` +
          `-# Tout le contenu précédent a été supprimé via clone.`
        ));

        // Supprimer l'ancien salon
        await channel.delete(`[${message.author.tag}] .clean all`);

        // ── Générer le transcript HTML ──
        const html     = buildCleanHtml(msgCollection, message.guild, channel, message.author, '(all)');
        const filename = `clean-${channel.id}-${Date.now()}.html`;

        await logManager.onCmdClean(message.guild, {
          moderator:    message.author,
          channel:      newChannel,
          count:        allMessages.length,
          mode:         'all',
          htmlTranscript: html,
          filename,
        }).catch(() => {});

      } catch (e) {
        console.error('[clean] Erreur mode all:', e.message);
        // Si le salon original existe encore (clone raté), tenter de notifier
        notice.edit(err(`❌ Erreur lors du nettoyage complet :\n\`${e.message.slice(0, 200)}\``)).catch(() => {});
      }
      return;
    }

    // ── Mode N : suppression en masse via bulkDelete (boucle si > 100) ──────
    const n = parseInt(arg, 10);
    if (isNaN(n) || n < 1 || n > 5000) {
      return message.reply(err(
        '❌ Nombre invalide. Donne un chiffre entre **1** et **5000**, ou `all`.'
      ));
    }

    // Supprimer le message de commande d'abord
    await message.delete().catch(() => {});

    const notice = await channel.send(ok(`## ⏳ Suppression de **${n}** message(s) en cours…`));

    const MAX_AGE_MS = 14 * 24 * 3600 * 1000; // 14 jours — limite Discord bulkDelete
    const now        = Date.now();

    let totalDeleted = 0;
    let remaining    = n;

    // ── Collecter les messages à supprimer AVANT de les effacer ──────────────
    const { Collection } = require('discord.js');
    const collectedMessages = new Collection();

    try {
      // Phase 1 : fetch + collecte des messages à supprimer
      let fetchRemaining = n;
      let beforeId;
      while (fetchRemaining > 0) {
        const fetchLimit = Math.min(fetchRemaining + 1, 100);
        const fetched = await channel.messages.fetch({ limit: fetchLimit, before: beforeId });
        const eligible = fetched.filter(m => m.id !== notice.id && (now - m.createdTimestamp) < MAX_AGE_MS);
        const batch    = [...eligible.values()].slice(0, Math.min(fetchRemaining, 100));
        if (!batch.length) break;
        for (const m of batch) collectedMessages.set(m.id, m);
        fetchRemaining -= batch.length;
        beforeId = batch[batch.length - 1].id;
        if (fetched.size < fetchLimit) break;
      }

      // Phase 2 : suppression par lots de 100
      const toDeleteAll = [...collectedMessages.values()];
      let idx = 0;
      while (idx < toDeleteAll.length) {
        const batch   = toDeleteAll.slice(idx, idx + 100);
        const deleted = await channel.bulkDelete(batch.map(m => m.id), true).catch(() => null);
        const count   = deleted?.size ?? batch.length;
        totalDeleted += count;
        idx          += batch.length;
        if (count === 0) break;
        if (idx < toDeleteAll.length) await new Promise(r => setTimeout(r, 1_000));
      }
    } catch (e) {
      console.error('[clean] Erreur suppression:', e.message);
    }

    await notice.edit(ok(
      `## ✅ ${totalDeleted} message(s) supprimé(s)\n` +
      `👤 **Par :** ${message.author}\n` +
      (totalDeleted < n
        ? `-# ⚠️ ${n - totalDeleted} message(s) ignoré(s) — trop anciens (> 14 jours)\n`
        : '') +
      `-# Salon : <#${channel.id}>`
    ));

    setTimeout(() => notice.delete().catch(() => {}), 6_000);

    // ── Générer le transcript HTML et envoyer dans les logs ──────────────────
    const html     = buildCleanHtml(collectedMessages, message.guild, channel, message.author, totalDeleted);
    const filename = `clean-${channel.id}-${Date.now()}.html`;

    await logManager.onCmdClean(message.guild, {
      moderator:    message.author,
      channel,
      count:        totalDeleted,
      mode:         'n',
      htmlTranscript: html,
      filename,
    }).catch(() => {});
  },
};
