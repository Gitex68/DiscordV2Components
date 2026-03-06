// logs/logManager.js
// Fonctions d'envoi de logs serveur.
// Chaque log est envoyé dans un THREAD du salon de logs.
// Nom du thread : "[emoji catégorie] [Catégorie] · YYYY-MM-DD"
// Ex : "💬 Messages · 2026-03-01"
// → 1 thread par catégorie par jour, réutilisé automatiquement.

const { EmbedBuilder, AuditLogEvent, ChannelType, AttachmentBuilder } = require('discord.js');
const logDB = require('./logDB.js');

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const C = {
  add:    0x57f287,
  remove: 0xed4245,
  update: 0xfee75c,
  info:   0x5865f2,
  warn:   0xffa500,
  voice:  0x5865f2,
  mod:    0xed4245,
};

// ─── Cache des threads (clé = `guildId:catName:YYYY-MM-DD`) ──────────────────
const threadCache = new Map();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Renvoie { emoji, name, catLabel } pour un eventKey donné
function getCatMeta(eventKey) {
  for (const cat of Object.values(logDB.EVENT_CATEGORIES)) {
    if (cat.events[eventKey]) {
      const parts = cat.label.split(' ');
      return { emoji: parts[0], name: parts.slice(1).join(' '), catLabel: cat.label };
    }
  }
  return { emoji: '📋', name: 'Logs', catLabel: '📋 Logs' };
}

// ─── Récupère ou crée le thread du jour pour une catégorie ───────────────────
async function getOrCreateThread(channel, eventKey) {
  const { emoji, name, catLabel } = getCatMeta(eventKey);
  const date       = todayStr();
  const threadName = `${emoji} ${name} · ${date}`;
  const threadKey  = `${channel.guild.id}:${name}:${date}`;

  // Vérifier le cache
  if (threadCache.has(threadKey)) {
    const cachedId = threadCache.get(threadKey);
    const cached   = channel.threads.cache.get(cachedId) ||
                     await channel.threads.fetch(cachedId).catch(() => null);
    if (cached) {
      if (cached.archived) await cached.setArchived(false).catch(() => {});
      return cached;
    }
  }

  // Chercher dans les threads actifs
  let thread = null;
  try {
    const active = await channel.threads.fetchActive();
    thread = active.threads.find(t => t.name === threadName) || null;
  } catch {}

  // Chercher dans les threads archivés
  if (!thread) {
    try {
      const archived = await channel.threads.fetchArchived({ limit: 50 });
      thread = archived.threads.find(t => t.name === threadName) || null;
      if (thread?.archived) await thread.setArchived(false).catch(() => {});
    } catch {}
  }

  // Créer si introuvable
  if (!thread) {
    thread = await channel.threads.create({
      name:                threadName,
      autoArchiveDuration: 1440,
      type:                ChannelType.PublicThread,
      reason:              `Fil de logs automatique — ${catLabel}`,
    });
  }

  threadCache.set(threadKey, thread.id);
  return thread;
}

// ─── Helper principal : envoyer dans le thread du jour ───────────────────────
async function send(guild, eventKey, embed) {
  if (!logDB.shouldLog(guild.id, eventKey)) return;
  const channelId = logDB.getChannelId(guild.id, eventKey);
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.isThread()) return;
  const thread = await getOrCreateThread(channel, eventKey).catch(() => null);
  if (!thread) return;
  await thread.send({ embeds: [embed] }).catch(() => {});
}

// ─── Helpers timestamps ───────────────────────────────────────────────────────
function ts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `<t:${Math.floor(d.getTime() / 1000)}:F>`;
}
function tsR(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

// ─── Diff de champs ───────────────────────────────────────────────────────────
function diffFields(before, after, keys) {
  const fields = [];
  for (const [key, label] of Object.entries(keys)) {
    const a = before[key], b = after[key];
    if (a !== b) fields.push({ name: label, value: `**Avant :** ${a ?? '*aucun*'}\n**Après :** ${b ?? '*aucun*'}`, inline: true });
  }
  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🗑️ Message supprimé')
    .addFields(
      { name: '👤 Auteur',  value: `${message.author ?? 'Inconnu'} (\`${message.author?.id ?? '?'}\`)`, inline: true },
      { name: '📍 Salon',   value: `<#${message.channelId}>`, inline: true },
      { name: '⏱️ Envoyé',  value: ts(message.createdAt), inline: true },
    )
    .setDescription(message.content ? `>>> ${message.content.slice(0, 1000)}` : '*Contenu non disponible*')
    .setFooter({ text: `ID : ${message.id}` }).setTimestamp();
  if (message.attachments.size)
    embed.addFields({ name: `📎 Pièces jointes (${message.attachments.size})`, value: message.attachments.map(a => a.url).join('\n').slice(0, 1024) });
  await send(message.guild, 'messageDelete', embed);
}

async function onMessageUpdate(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('✏️ Message modifié').setURL(newMessage.url)
    .addFields(
      { name: '👤 Auteur',  value: `${newMessage.author} (\`${newMessage.author.id}\`)`, inline: true },
      { name: '📍 Salon',   value: `<#${newMessage.channelId}>`, inline: true },
      { name: '🕐 Modifié', value: tsR(), inline: true },
      { name: '📄 Avant',   value: `>>> ${oldMessage.content?.slice(0, 450) || '*vide*'}`, inline: false },
      { name: '📝 Après',   value: `>>> ${newMessage.content?.slice(0, 450) || '*vide*'}`, inline: false },
    )
    .setFooter({ text: `ID : ${newMessage.id}` }).setTimestamp();
  await send(newMessage.guild, 'messageUpdate', embed);
}

async function onMessageBulkDelete(messages, channel) {
  if (!channel.guild) return;
  const authors = new Set(messages.map(m => m.author?.id).filter(Boolean));
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🧹 Purge de messages')
    .addFields(
      { name: '📍 Salon',     value: `<#${channel.id}>`, inline: true },
      { name: '🔢 Supprimés', value: `**${messages.size}** messages`, inline: true },
      { name: '👥 Auteurs',   value: `${authors.size} utilisateur(s)`, inline: true },
    ).setTimestamp();
  await send(channel.guild, 'messageBulkDelete', embed);
}

async function onMessageReactionAdd(reaction, user) {
  if (!reaction.message.guild || user.bot) return;
  const embed = new EmbedBuilder()
    .setColor(C.info).setTitle('👍 Réaction ajoutée')
    .addFields(
      { name: '👤 Utilisateur', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: '😀 Réaction',    value: reaction.emoji.toString(), inline: true },
      { name: '📍 Message',     value: `[Voir](${reaction.message.url}) dans <#${reaction.message.channelId}>`, inline: true },
    ).setTimestamp();
  await send(reaction.message.guild, 'messageReactionAdd', embed);
}

async function onMessageReactionRemove(reaction, user) {
  if (!reaction.message.guild || user.bot) return;
  const embed = new EmbedBuilder()
    .setColor(C.warn).setTitle('👎 Réaction retirée')
    .addFields(
      { name: '👤 Utilisateur', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: '😀 Réaction',    value: reaction.emoji.toString(), inline: true },
      { name: '📍 Message',     value: `[Voir](${reaction.message.url}) dans <#${reaction.message.channelId}>`, inline: true },
    ).setTimestamp();
  await send(reaction.message.guild, 'messageReactionRemove', embed);
}

async function onMessagePin(channel, pinnedMsgId) {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.info).setTitle('📌 Message épinglé')
    .addFields(
      { name: '📍 Salon', value: `<#${channel.id}>`, inline: true },
      { name: '🆔 ID',    value: `\`${pinnedMsgId ?? 'inconnu'}\``, inline: true },
    ).setTimestamp();
  await send(channel.guild, 'messagePin', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MEMBRES
// ─────────────────────────────────────────────────────────────────────────────

async function onGuildMemberAdd(member) {
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('📥 Membre rejoint')
    .setThumbnail(member.user.displayAvatarURL({ size: 128, extension: 'png' }))
    .addFields(
      { name: '👤 Utilisateur',  value: `${member.user} (\`${member.id}\`)`, inline: true },
      { name: '📅 Compte créé',  value: `${ts(member.user.createdAt)} (${tsR(member.user.createdAt)})`, inline: false },
      { name: '👥 Total membres', value: `${member.guild.memberCount}`, inline: true },
    )
    .setFooter({ text: `ID : ${member.id}` }).setTimestamp();
  await send(member.guild, 'guildMemberAdd', embed);
}

async function onGuildMemberRemove(member) {
  const roles = member.roles.cache.filter(r => !r.managed && r.id !== member.guild.id);
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('📤 Membre parti')
    .setThumbnail(member.user.displayAvatarURL({ size: 128, extension: 'png' }))
    .addFields(
      { name: '👤 Utilisateur',    value: `${member.user} (\`${member.id}\`)`, inline: true },
      { name: '📅 Rejoint le',     value: member.joinedAt ? ts(member.joinedAt) : '*inconnu*', inline: true },
      { name: `🏷️ Rôles (${roles.size})`, value: roles.map(r => `<@&${r.id}>`).join(' ').slice(0, 800) || '*Aucun*', inline: false },
    )
    .setFooter({ text: `ID : ${member.id}` }).setTimestamp();
  await send(member.guild, 'guildMemberRemove', embed);
}

async function onGuildMemberUpdate(oldMember, newMember) {
  // Timeout appliqué
  const wasTimeout = oldMember.communicationDisabledUntil;
  const isTimeout  = newMember.communicationDisabledUntil;
  if (!wasTimeout && isTimeout) {
    let mod = '*Inconnu*', reason = '*Non précisée*';
    try {
      const audit = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 3 });
      const entry = audit.entries.find(e => e.target?.id === newMember.id);
      if (entry) { mod = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : mod; reason = entry.reason || reason; }
    } catch {}
    await send(newMember.guild, 'timeout', new EmbedBuilder()
      .setColor(C.mod).setTitle('⏰ Timeout appliqué')
      .setThumbnail(newMember.user.displayAvatarURL({ size: 64 }))
      .addFields(
        { name: '👤 Membre',     value: `${newMember.user} (\`${newMember.id}\`)`, inline: true },
        { name: '🛠️ Modérateur', value: mod, inline: true },
        { name: '⏱️ Expire',     value: ts(new Date(isTimeout)), inline: true },
        { name: '📝 Raison',     value: reason, inline: false },
      ).setFooter({ text: `ID : ${newMember.id}` }).setTimestamp());
    return;
  }
  // Timeout retiré
  if (wasTimeout && !isTimeout) {
    await send(newMember.guild, 'timeoutRemove', new EmbedBuilder()
      .setColor(C.add).setTitle('✅ Timeout retiré')
      .setThumbnail(newMember.user.displayAvatarURL({ size: 64 }))
      .addFields({ name: '👤 Membre', value: `${newMember.user} (\`${newMember.id}\`)`, inline: true })
      .setFooter({ text: `ID : ${newMember.id}` }).setTimestamp());
    return;
  }

  const changes = [];
  if (oldMember.nickname !== newMember.nickname)
    changes.push({ name: '📝 Pseudo', value: `**Avant :** ${oldMember.nickname || '*aucun*'}\n**Après :** ${newMember.nickname || '*aucun*'}`, inline: true });

  const added   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
  if (added.size)   changes.push({ name: '➕ Rôles ajoutés',  value: added.map(r => `<@&${r.id}>`).join(' ').slice(0, 500), inline: true });
  if (removed.size) changes.push({ name: '➖ Rôles retirés',  value: removed.map(r => `<@&${r.id}>`).join(' ').slice(0, 500), inline: true });

  if (!oldMember.premiumSince && newMember.premiumSince)
    changes.push({ name: '💎 Boost', value: 'A commencé à booster le serveur !', inline: true });
  if (oldMember.premiumSince && !newMember.premiumSince)
    changes.push({ name: '💎 Boost retiré', value: 'A arrêté de booster le serveur.', inline: true });

  if (!changes.length) return;
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('📝 Membre modifié')
    .setThumbnail(newMember.user.displayAvatarURL({ size: 64 }))
    .addFields({ name: '👤 Membre', value: `${newMember.user} (\`${newMember.id}\`)`, inline: false })
    .addFields(...changes)
    .setFooter({ text: `ID : ${newMember.id}` }).setTimestamp();
  await send(newMember.guild, 'guildMemberUpdate', embed);
}

async function onGuildBanAdd(ban) {
  let reason = ban.reason || '*Non précisée*', moderator = '*Inconnu*';
  try {
    const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const entry = audit.entries.first();
    if (entry?.target?.id === ban.user.id) {
      reason    = entry.reason || reason;
      moderator = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : moderator;
    }
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(C.mod).setTitle('🔨 Membre banni')
    .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '👤 Membre',     value: `${ban.user} (\`${ban.user.id}\`)`, inline: true },
      { name: '🛠️ Modérateur', value: moderator, inline: true },
      { name: '📝 Raison',     value: reason, inline: false },
    )
    .setFooter({ text: `ID : ${ban.user.id}` }).setTimestamp();
  await send(ban.guild, 'guildBanAdd', embed);
}

async function onGuildBanRemove(ban) {
  let moderator = '*Inconnu*';
  try {
    const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
    const entry = audit.entries.first();
    if (entry?.target?.id === ban.user.id) moderator = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : moderator;
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('🔓 Membre débanni')
    .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '👤 Membre',     value: `${ban.user} (\`${ban.user.id}\`)`, inline: true },
      { name: '🛠️ Modérateur', value: moderator, inline: true },
    )
    .setFooter({ text: `ID : ${ban.user.id}` }).setTimestamp();
  await send(ban.guild, 'guildBanRemove', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SALONS
// ─────────────────────────────────────────────────────────────────────────────

const CHANNEL_TYPE_NAMES = {
  0: 'Textuel', 2: 'Vocal', 4: 'Catégorie', 5: 'Annonces',
  10: 'Thread annonces', 11: 'Thread public', 12: 'Thread privé',
  13: 'Stage', 15: 'Forum', 16: 'Média',
};

// ─── HTML transcript pour suppression de salon ────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function buildDeletedChannelHtml(messages, guild, channel, deletor) {
  const sorted      = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const generatedAt = new Date().toLocaleString('fr-FR');

  const msgLines = [...sorted.values()].map(m => {
    const time   = new Date(m.createdTimestamp).toLocaleString('fr-FR');
    const avatar = m.author?.displayAvatarURL({ size: 64, extension: 'png' }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
    const member = guild.members.cache.get(m.author?.id);
    const name   = member?.displayName || m.author?.username || 'Inconnu';
    const color  = member?.roles?.color?.color
      ? `#${member.roles.color.color.toString(16).padStart(6, '0')}`
      : '#b9bbbe';
    const bot    = m.author?.bot ? '<span class="badge">BOT</span>' : '';

    let body = '';
    if (m.content) body += `<div class="content">${escHtml(m.content).replace(/\n/g, '<br>')}</div>`;
    for (const e of m.embeds ?? []) {
      const ec = e.color ? `#${e.color.toString(16).padStart(6, '0')}` : '#4f545c';
      body += `<div class="embed" style="border-left:4px solid ${ec}">`;
      if (e.title)       body += `<div class="embed-title">${escHtml(e.title)}</div>`;
      if (e.description) body += `<div class="embed-desc">${escHtml(e.description).replace(/\n/g, '<br>')}</div>`;
      if (e.footer?.text) body += `<div class="embed-footer">${escHtml(e.footer.text)}</div>`;
      body += `</div>`;
    }
    for (const att of m.attachments?.values() ?? []) {
      const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name || '');
      if (isImg) {
        body += `<div class="attachment"><img src="${att.url}" alt="${escHtml(att.name || 'image')}" loading="lazy" style="max-width:400px;max-height:300px;border-radius:4px;margin-top:4px"></div>`;
      } else {
        body += `<div class="attachment">📎 <a href="${att.url}" target="_blank">${escHtml(att.name || att.url)}</a>${att.size ? ` <span class="att-size">(${fmtBytes(att.size)})</span>` : ''}</div>`;
      }
    }
    if (!body) body = `<div class="content muted">[Message vide ou non pris en charge]</div>`;

    return `
    <div class="message">
      <img class="avatar" src="${avatar}" alt="${escHtml(name)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
      <div class="msg-body">
        <span class="username" style="color:${color}">${escHtml(name)}</span>${bot}
        <span class="timestamp">${time}</span>
        ${body}
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Salon supprimé — #${escHtml(channel.name)}</title>
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
    .embed-footer { font-size: 12px; color: #72767d; margin-top: 8px; }
    .attachment { margin-top: 4px; font-size: 13px; }
    .attachment a { color: #00b0f4; }
    .att-size { color: #72767d; font-size: 11px; }
    .footer { text-align: center; padding: 32px; color: #72767d; font-size: 12px; border-top: 1px solid #232428; margin-top: 16px; }
    .banner { background: #ed4245; color: #fff; padding: 10px 32px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="banner">🗑️ Transcript de suppression de salon — Log automatique</div>
  <div class="header">
    <h1>🗑️ Salon supprimé — #${escHtml(channel.name)}</h1>
    <div class="meta">
      <span>🏠 Serveur : <strong>${escHtml(guild.name)}</strong></span>
      <span>📍 Salon : <strong>#${escHtml(channel.name)}</strong> (ID : ${channel.id})</span>
      <span>🛠️ Supprimé par : <strong>${escHtml(deletor)}</strong></span>
      <span>💬 Messages dans le cache : <strong>${sorted.size}</strong></span>
      <span>📅 Généré le : <strong>${generatedAt}</strong></span>
    </div>
  </div>
  <div class="messages">
${msgLines || '<div style="padding:32px;color:#72767d;font-style:italic">Aucun message récupéré depuis le cache.</div>'}
  </div>
  <div class="footer">Transcript automatique — Suppression du salon #${escHtml(channel.name)} · Serveur : ${escHtml(guild.name)} · ${generatedAt}</div>
</body>
</html>`;
}

async function onChannelCreate(channel) {
  if (!channel.guild) return;
  let creator = '*Inconnu*';
  try {
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
    const entry = audit.entries.first();
    if (entry) creator = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : creator;
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('➕ Salon créé')
    .addFields(
      { name: '📍 Salon',     value: channel.type !== 4 ? `<#${channel.id}> (\`${channel.name}\`)` : `\`${channel.name}\``, inline: true },
      { name: '📂 Type',      value: CHANNEL_TYPE_NAMES[channel.type] ?? `Type ${channel.type}`, inline: true },
      { name: '📁 Catégorie', value: channel.parent ? channel.parent.name : '*Aucune*', inline: true },
      { name: '🛠️ Créé par',  value: creator, inline: true },
    )
    .setFooter({ text: `ID : ${channel.id}` }).setTimestamp();
  await send(channel.guild, 'channelCreate', embed);
}

async function onChannelDelete(channel) {
  if (!channel.guild) return;
  let deletor      = '*Inconnu*';
  let deletorTag   = 'Inconnu';
  try {
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
    const entry = audit.entries.first();
    if (entry && entry.executor) {
      deletor    = `${entry.executor} (\`${entry.executor.id}\`)`;
      deletorTag = entry.executor.tag || entry.executor.username || 'Inconnu';
    }
  } catch {}

  // ── Transcript HTML si le salon avait des messages en cache ───────────────
  const isText = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
  if (isText && channel.messages?.cache?.size > 0) {
    try {
      const cachedMessages = channel.messages.cache;
      const html           = buildDeletedChannelHtml(cachedMessages, channel.guild, channel, deletorTag);
      const filename       = `channel-delete-${channel.id}-${Date.now()}.html`;
      const attachment     = { attachment: Buffer.from(html, 'utf8'), name: filename };

      if (logDB.shouldLog(channel.guild.id, 'channelDelete')) {
        const channelId = logDB.getChannelId(channel.guild.id, 'channelDelete');
        if (channelId) {
          const logCh = channel.guild.channels.cache.get(channelId);
          if (logCh?.isTextBased() && !logCh.isThread()) {
            const thread = await getOrCreateThread(logCh, 'channelDelete').catch(() => null);
            if (thread) {
              await thread.send({
                content: `📄 **Transcript** du salon supprimé \`#${channel.name}\` (${cachedMessages.size} message${cachedMessages.size > 1 ? 's' : ''} en cache)`,
                files:   [attachment],
              }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      console.error('[logManager] Erreur transcript channelDelete:', e.message);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('➖ Salon supprimé')
    .addFields(
      { name: '📍 Nom',           value: `\`${channel.name}\``, inline: true },
      { name: '📂 Type',          value: CHANNEL_TYPE_NAMES[channel.type] ?? `Type ${channel.type}`, inline: true },
      { name: '📁 Catégorie',     value: channel.parent ? channel.parent.name : '*Aucune*', inline: true },
      { name: '🛠️ Supprimé par',  value: deletor, inline: true },
    )
    .setFooter({ text: `ID : ${channel.id}` }).setTimestamp();
  if (isText && channel.messages?.cache?.size > 0)
    embed.addFields({ name: '📄 Transcript', value: `${channel.messages.cache.size} message${channel.messages.cache.size > 1 ? 's' : ''} archivé${channel.messages.cache.size > 1 ? 's' : ''} en pièce jointe`, inline: true });
  await send(channel.guild, 'channelDelete', embed);
}

async function onChannelUpdate(oldChannel, newChannel) {
  if (!newChannel.guild) return;
  const changes = diffFields(oldChannel, newChannel, {
    name:             '📍 Nom',
    topic:            '📝 Description',
    nsfw:             '🔞 NSFW',
    rateLimitPerUser: '🐢 Slowmode (s)',
    bitrate:          '🎙️ Bitrate',
    userLimit:        '👥 Limite utilisateurs',
  });
  if (oldChannel.parentId !== newChannel.parentId)
    changes.push({ name: '📁 Catégorie', value: `**Avant :** ${oldChannel.parent?.name ?? '*Aucune*'}\n**Après :** ${newChannel.parent?.name ?? '*Aucune*'}`, inline: true });
  if (!changes.length) return;
  let editor = '*Inconnu*';
  try {
    const audit = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 });
    const entry = audit.entries.first();
    if (entry?.target?.id === newChannel.id) editor = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : editor;
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('🔧 Salon modifié')
    .addFields(
      { name: '📍 Salon', value: `<#${newChannel.id}>`, inline: true },
      { name: '🛠️ Par',   value: editor, inline: true },
    )
    .addFields(...changes)
    .setFooter({ text: `ID : ${newChannel.id}` }).setTimestamp();
  await send(newChannel.guild, 'channelUpdate', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  FILS DE DISCUSSION
// ─────────────────────────────────────────────────────────────────────────────

async function onThreadCreate(thread) {
  if (!thread.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('🧵 Fil de discussion créé')
    .addFields(
      { name: '🧵 Fil',          value: `<#${thread.id}> (\`${thread.name}\`)`, inline: true },
      { name: '📍 Salon parent', value: thread.parentId ? `<#${thread.parentId}>` : '*Inconnu*', inline: true },
      { name: '📂 Type',         value: CHANNEL_TYPE_NAMES[thread.type] ?? `Type ${thread.type}`, inline: true },
      { name: '📌 Auto-archive', value: `${thread.autoArchiveDuration ?? '?'} min`, inline: true },
    )
    .setFooter({ text: `ID : ${thread.id}` }).setTimestamp();
  await send(thread.guild, 'threadCreate', embed);
}

async function onThreadDelete(thread) {
  if (!thread.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🗑️ Fil de discussion supprimé')
    .addFields(
      { name: '🧵 Nom',          value: `\`${thread.name}\``, inline: true },
      { name: '📍 Salon parent', value: thread.parentId ? `<#${thread.parentId}>` : '*Inconnu*', inline: true },
    )
    .setFooter({ text: `ID : ${thread.id}` }).setTimestamp();
  await send(thread.guild, 'threadDelete', embed);
}

async function onThreadUpdate(oldThread, newThread) {
  if (!newThread.guild) return;
  const changes = diffFields(oldThread, newThread, { name: '🧵 Nom', archived: '📦 Archivé', locked: '🔒 Verrouillé' });
  if (!changes.length) return;
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('🔧 Fil de discussion modifié')
    .addFields({ name: '🧵 Fil', value: `<#${newThread.id}>`, inline: true })
    .addFields(...changes)
    .setFooter({ text: `ID : ${newThread.id}` }).setTimestamp();
  await send(newThread.guild, 'threadUpdate', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  RÔLES
// ─────────────────────────────────────────────────────────────────────────────

async function onRoleCreate(role) {
  let creator = '*Inconnu*';
  try {
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
    const entry = audit.entries.first();
    if (entry) creator = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : creator;
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(role.color || C.add).setTitle('✨ Rôle créé')
    .addFields(
      { name: '🏷️ Rôle',        value: `<@&${role.id}> (\`${role.name}\`)`, inline: true },
      { name: '🎨 Couleur',      value: role.hexColor, inline: true },
      { name: '📌 Hoistable',    value: role.hoist       ? 'Oui' : 'Non', inline: true },
      { name: '🔔 Mentionnable', value: role.mentionable ? 'Oui' : 'Non', inline: true },
      { name: '🛠️ Créé par',     value: creator, inline: true },
    )
    .setFooter({ text: `ID : ${role.id}` }).setTimestamp();
  await send(role.guild, 'roleCreate', embed);
}

async function onRoleDelete(role) {
  let deletor = '*Inconnu*';
  try {
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
    const entry = audit.entries.first();
    if (entry) deletor = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : deletor;
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🗑️ Rôle supprimé')
    .addFields(
      { name: '🏷️ Nom',          value: `\`${role.name}\``, inline: true },
      { name: '🎨 Couleur',       value: role.hexColor, inline: true },
      { name: '👥 Membres',       value: `${role.members?.size ?? '?'}`, inline: true },
      { name: '🛠️ Supprimé par',  value: deletor, inline: true },
    )
    .setFooter({ text: `ID : ${role.id}` }).setTimestamp();
  await send(role.guild, 'roleDelete', embed);
}

async function onRoleUpdate(oldRole, newRole) {
  const changes = diffFields(oldRole, newRole, {
    name:        '🏷️ Nom',
    hexColor:    '🎨 Couleur',
    hoist:       '📌 Hoistable',
    mentionable: '🔔 Mentionnable',
  });
  if (!changes.length) return;
  let editor = '*Inconnu*';
  try {
    const audit = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
    const entry = audit.entries.first();
    if (entry?.target?.id === newRole.id) editor = entry.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : editor;
  } catch {}
  const embed = new EmbedBuilder()
    .setColor(newRole.color || C.update).setTitle('🔧 Rôle modifié')
    .addFields(
      { name: '🏷️ Rôle', value: `<@&${newRole.id}>`, inline: true },
      { name: '🛠️ Par',   value: editor, inline: true },
    )
    .addFields(...changes)
    .setFooter({ text: `ID : ${newRole.id}` }).setTimestamp();
  await send(newRole.guild, 'roleUpdate', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  VOCAL
// ─────────────────────────────────────────────────────────────────────────────

async function onVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const join  = !oldState.channelId &&  newState.channelId;
  const leave =  oldState.channelId && !newState.channelId;
  const move  =  oldState.channelId &&  newState.channelId && oldState.channelId !== newState.channelId;

  if (join) {
    return await send(member.guild, 'voiceJoin', new EmbedBuilder()
      .setColor(C.voice).setTitle('🔊 Rejoint un vocal')
      .addFields(
        { name: '👤 Membre', value: `${member.user} (\`${member.id}\`)`, inline: true },
        { name: '🔊 Salon',  value: `<#${newState.channelId}>`, inline: true },
      )
      .setFooter({ text: `ID : ${member.id}` }).setTimestamp());
  }
  if (leave) {
    return await send(member.guild, 'voiceLeave', new EmbedBuilder()
      .setColor(C.remove).setTitle('🔇 Quitté un vocal')
      .addFields(
        { name: '👤 Membre', value: `${member.user} (\`${member.id}\`)`, inline: true },
        { name: '🔇 Salon',  value: `<#${oldState.channelId}>`, inline: true },
      )
      .setFooter({ text: `ID : ${member.id}` }).setTimestamp());
  }
  if (move) {
    return await send(member.guild, 'voiceMove', new EmbedBuilder()
      .setColor(C.info).setTitle('🔀 Changé de vocal')
      .addFields(
        { name: '👤 Membre',  value: `${member.user} (\`${member.id}\`)`, inline: true },
        { name: '🔇 Quitté', value: `<#${oldState.channelId}>`, inline: true },
        { name: '🔊 Rejoint', value: `<#${newState.channelId}>`, inline: true },
      )
      .setFooter({ text: `ID : ${member.id}` }).setTimestamp());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SERVEUR
// ─────────────────────────────────────────────────────────────────────────────

async function onGuildUpdate(oldGuild, newGuild) {
  const changes = diffFields(oldGuild, newGuild, {
    name:                  '🏠 Nom',
    description:           '📝 Description',
    preferredLocale:       '🌍 Langue',
    verificationLevel:     '🔒 Vérification',
    explicitContentFilter: '🔞 Filtre contenu',
    systemChannelId:       '📢 Salon système',
    rulesChannelId:        '📋 Règles',
  });
  if (!changes.length) return;
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('🔧 Serveur modifié')
    .setThumbnail(newGuild.iconURL({ size: 128 }))
    .addFields({ name: '🏠 Serveur', value: newGuild.name, inline: true })
    .addFields(...changes)
    .setFooter({ text: `ID : ${newGuild.id}` }).setTimestamp();
  await send(newGuild, 'guildUpdate', embed);
}

async function onEmojiCreate(emoji) {
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('😄 Emoji créé')
    .setThumbnail(emoji.imageURL())
    .addFields(
      { name: '😄 Nom',    value: `\`${emoji.name}\``, inline: true },
      { name: '🖼️ Aperçu', value: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`, inline: true },
      { name: '🎭 Animé',  value: emoji.animated ? 'Oui' : 'Non', inline: true },
    )
    .setFooter({ text: `ID : ${emoji.id}` }).setTimestamp();
  await send(emoji.guild, 'emojiCreate', embed);
}

async function onEmojiDelete(emoji) {
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('😶 Emoji supprimé')
    .addFields(
      { name: '😶 Nom',   value: `\`${emoji.name}\``, inline: true },
      { name: '🎭 Animé', value: emoji.animated ? 'Oui' : 'Non', inline: true },
    )
    .setFooter({ text: `ID : ${emoji.id}` }).setTimestamp();
  await send(emoji.guild, 'emojiDelete', embed);
}

async function onStickerCreate(sticker) {
  if (!sticker.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('📌 Sticker créé')
    .addFields(
      { name: '📌 Nom',         value: `\`${sticker.name}\``, inline: true },
      { name: '📝 Description', value: sticker.description || '*Aucune*', inline: true },
    )
    .setFooter({ text: `ID : ${sticker.id}` }).setTimestamp();
  await send(sticker.guild, 'stickerCreate', embed);
}

async function onStickerDelete(sticker) {
  if (!sticker.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('📌 Sticker supprimé')
    .addFields({ name: '📌 Nom', value: `\`${sticker.name}\``, inline: true })
    .setFooter({ text: `ID : ${sticker.id}` }).setTimestamp();
  await send(sticker.guild, 'stickerDelete', embed);
}

async function onInviteCreate(invite) {
  if (!invite.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.info).setTitle('📨 Invitation créée')
    .addFields(
      { name: '🔗 Code',             value: `\`${invite.code}\` — [discord.gg/${invite.code}](https://discord.gg/${invite.code})`, inline: false },
      { name: '👤 Créée par',        value: invite.inviter ? `${invite.inviter} (\`${invite.inviter.id}\`)` : '*Inconnu*', inline: true },
      { name: '📍 Salon',            value: invite.channel ? `<#${invite.channel.id}>` : '*Inconnu*', inline: true },
      { name: '⏱️ Expire',           value: invite.expiresAt ? `${ts(invite.expiresAt)} (${tsR(invite.expiresAt)})` : '*Jamais*', inline: true },
      { name: '🔢 Utilisations max', value: invite.maxUses ? `${invite.maxUses}` : '*Illimité*', inline: true },
      { name: '⏳ Durée max',        value: invite.maxAge   ? `${invite.maxAge}s` : '*Permanente*', inline: true },
    ).setTimestamp();
  await send(invite.guild, 'inviteCreate', embed);
}

async function onInviteDelete(invite) {
  if (!invite.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('📨 Invitation supprimée')
    .addFields(
      { name: '🔗 Code',  value: `\`${invite.code}\``, inline: true },
      { name: '📍 Salon', value: invite.channel ? `<#${invite.channel.id}>` : '*Inconnu*', inline: true },
    ).setTimestamp();
  await send(invite.guild, 'inviteDelete', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ÉVÉNEMENTS PLANIFIÉS
// ─────────────────────────────────────────────────────────────────────────────

async function onScheduledEventCreate(event) {
  if (!event.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('📅 Événement planifié créé')
    .addFields(
      { name: '📅 Nom',         value: event.name, inline: true },
      { name: '👤 Créé par',    value: event.creator ? `${event.creator} (\`${event.creatorId}\`)` : '*Inconnu*', inline: true },
      { name: '📍 Lieu',        value: event.entityMetadata?.location || (event.channelId ? `<#${event.channelId}>` : '*Inconnu*'), inline: true },
      { name: '🕐 Début',       value: event.scheduledStartAt ? ts(event.scheduledStartAt) : '*Non défini*', inline: true },
      { name: '🕐 Fin',         value: event.scheduledEndAt   ? ts(event.scheduledEndAt)   : '*Non défini*', inline: true },
    )
    .setFooter({ text: `ID : ${event.id}` }).setTimestamp();
  if (event.coverImageURL) {
    const img = event.coverImageURL({ size: 256 });
    if (img) embed.setThumbnail(img);
  }
  await send(event.guild, 'scheduledEventCreate', embed);
}

async function onScheduledEventDelete(event) {
  if (!event.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🗑️ Événement planifié supprimé')
    .addFields(
      { name: '📅 Nom',        value: event.name, inline: true },
      { name: '🔢 Intéressés', value: `${event.subscriberCount ?? 0}`, inline: true },
    )
    .setFooter({ text: `ID : ${event.id}` }).setTimestamp();
  await send(event.guild, 'scheduledEventDelete', embed);
}

async function onScheduledEventUpdate(oldEvent, newEvent) {
  if (!newEvent.guild) return;
  const changes = diffFields(oldEvent, newEvent, { name: '📅 Nom', status: '📊 Statut' });
  if (!changes.length) return;
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('🔧 Événement planifié modifié')
    .addFields({ name: '📅 Événement', value: newEvent.name, inline: true })
    .addFields(...changes)
    .setFooter({ text: `ID : ${newEvent.id}` }).setTimestamp();
  await send(newEvent.guild, 'scheduledEventUpdate', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUTOMOD
// ─────────────────────────────────────────────────────────────────────────────

async function onAutoModerationRuleCreate(rule) {
  if (!rule.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('🤖 Règle AutoMod créée')
    .addFields(
      { name: '📛 Nom',     value: rule.name, inline: true },
      { name: '✅ Activée', value: rule.enabled ? 'Oui' : 'Non', inline: true },
    )
    .setFooter({ text: `ID : ${rule.id}` }).setTimestamp();
  await send(rule.guild, 'automodRuleCreate', embed);
}

async function onAutoModerationRuleDelete(rule) {
  if (!rule.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🗑️ Règle AutoMod supprimée')
    .addFields({ name: '📛 Nom', value: rule.name, inline: true })
    .setFooter({ text: `ID : ${rule.id}` }).setTimestamp();
  await send(rule.guild, 'automodRuleDelete', embed);
}

async function onAutoModerationActionExecution(execution) {
  if (!execution.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.warn).setTitle('⚡ AutoMod déclenché')
    .addFields(
      { name: '👤 Membre',  value: `<@${execution.userId}> (\`${execution.userId}\`)`, inline: true },
      { name: '📍 Salon',   value: execution.channelId ? `<#${execution.channelId}>` : '*Inconnu*', inline: true },
      { name: '📛 Règle',   value: execution.ruleName || `\`${execution.ruleId}\``, inline: true },
      { name: '💬 Contenu', value: execution.content ? `>>> ${execution.content.slice(0, 500)}` : '*Non disponible*', inline: false },
    ).setTimestamp();
  await send(execution.guild, 'automodAction', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  AVANCÉ
// ─────────────────────────────────────────────────────────────────────────────

async function onWebhookUpdate(channel) {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.warn).setTitle('🔗 Webhook modifié')
    .addFields({ name: '📍 Salon', value: `<#${channel.id}>`, inline: true })
    .setFooter({ text: `ID salon : ${channel.id}` }).setTimestamp();
  await send(channel.guild, 'webhookUpdate', embed);
}

async function onUserUpdate(oldUser, newUser) {
  const changes = [];
  if (oldUser.username !== newUser.username)
    changes.push({ name: '👤 Pseudo', value: `**Avant :** \`${oldUser.username}\`\n**Après :** \`${newUser.username}\``, inline: true });
  if (oldUser.discriminator !== newUser.discriminator)
    changes.push({ name: '#️⃣ Tag', value: `**Avant :** ${oldUser.discriminator}\n**Après :** ${newUser.discriminator}`, inline: true });
  if (oldUser.avatar !== newUser.avatar)
    changes.push({ name: '🖼️ Avatar', value: `[Nouvel avatar](${newUser.displayAvatarURL({ size: 256 })})`, inline: true });
  if (!changes.length) return;

  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('👤 Profil utilisateur modifié')
    .setThumbnail(newUser.displayAvatarURL({ size: 128 }))
    .addFields({ name: '👤 Utilisateur', value: `${newUser} (\`${newUser.id}\`)`, inline: false })
    .addFields(...changes)
    .setFooter({ text: `ID : ${newUser.id}` }).setTimestamp();

  if (newUser.client) {
    for (const guild of newUser.client.guilds.cache.values()) {
      if (guild.members.cache.has(newUser.id)) {
        await send(guild, 'userUpdate', embed).catch(() => {});
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SANCTIONS (commandes admin — fil dédié ⚖️ Sanctions)
// ─────────────────────────────────────────────────────────────────────────────

async function logSanction(guild, eventKey, fields, color, title) {
  const embed = new EmbedBuilder()
    .setColor(color).setTitle(title)
    .addFields(...fields)
    .setTimestamp();
  await send(guild, eventKey, embed);
}

async function onCmdBan(guild, { moderator, target, reason, duration }) {
  await logSanction(guild, 'cmdBan', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Banni',      value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '⏱️ Durée',      value: duration || '*Permanent*',             inline: true },
    { name: '📝 Raison',     value: reason || '*Non précisée*',            inline: false },
  ], 0xed4245, '🔨 Ban');
}

async function onCmdUnban(guild, { moderator, target, reason }) {
  await logSanction(guild, 'cmdUnban', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Débanni',    value: `${target.tag || target} (\`${target.id}\`)`, inline: true },
    { name: '📝 Raison',     value: reason || '*Non précisée*',            inline: false },
  ], 0x57f287, '🔓 Unban');
}

async function onCmdKick(guild, { moderator, target, reason }) {
  await logSanction(guild, 'cmdKick', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Kiqué',      value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '📝 Raison',     value: reason || '*Non précisée*',            inline: false },
  ], 0xffa500, '👢 Kick');
}

async function onCmdMute(guild, { moderator, target, reason, duration }) {
  await logSanction(guild, 'cmdMute', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Muté',       value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '⏱️ Durée',      value: duration,                              inline: true },
    { name: '📝 Raison',     value: reason || '*Non précisée*',            inline: false },
  ], 0xfee75c, '⏰ Mute (Timeout)');
}

async function onCmdUnmute(guild, { moderator, target }) {
  await logSanction(guild, 'cmdUnmute', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Démuté',     value: `${target} (\`${target.id}\`)`,       inline: true },
  ], 0x57f287, '✅ Unmute');
}

async function onCmdWarn(guild, { moderator, target, reason, count }) {
  await logSanction(guild, 'cmdWarn', [
    { name: '🛠️ Modérateur',    value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Averti',         value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '🔢 Total warns',    value: `${count}`,                            inline: true },
    { name: '📝 Raison',         value: reason || '*Non précisée*',            inline: false },
  ], 0xffa500, '⚠️ Avertissement');
}

async function onCmdClearwarns(guild, { moderator, target, count }) {
  await logSanction(guild, 'cmdClearwarns', [
    { name: '🛠️ Modérateur',  value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Membre',       value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '🗑️ Supprimés',   value: `${count} avertissement(s)`,           inline: true },
  ], 0x57f287, '🗑️ Warns effacés');
}

async function onCmdRemovewarn(guild, { moderator, target, warnId }) {
  await logSanction(guild, 'cmdRemovewarn', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Membre',      value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '➖ Warn #',      value: `${warnId}`,                           inline: true },
  ], 0x57f287, '➖ Warn supprimé');
}

async function onCmdPurge(guild, { moderator, channel, count }) {
  await logSanction(guild, 'cmdPurge', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '📍 Salon',      value: `<#${channel.id}>`,                   inline: true },
    { name: '🔢 Supprimés', value: `${count} messages`,                   inline: true },
  ], 0xed4245, '🧹 Purge');
}

async function onCmdLock(guild, { moderator, channel, reason }) {
  await logSanction(guild, 'cmdLock', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '📍 Salon',      value: `<#${channel.id}>`,                   inline: true },
    { name: '📝 Raison',     value: reason || '*Non précisée*',            inline: false },
  ], 0xed4245, '🔒 Lock');
}

async function onCmdUnlock(guild, { moderator, channel }) {
  await logSanction(guild, 'cmdUnlock', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '📍 Salon',      value: `<#${channel.id}>`,                   inline: true },
  ], 0x57f287, '🔓 Unlock');
}

async function onCmdSlowmode(guild, { moderator, channel, seconds }) {
  await logSanction(guild, 'cmdSlowmode', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`,                      inline: true },
    { name: '📍 Salon',      value: `<#${channel.id}>`,                                         inline: true },
    { name: '⏱️ Délai',      value: seconds === 0 ? 'Désactivé' : `${seconds}s`,                inline: true },
  ], 0xfee75c, '🐢 Slowmode');
}

async function onCmdVmute(guild, { moderator, target }) {
  await logSanction(guild, 'cmdVmute', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Muté vocal',  value: `${target} (\`${target.id}\`)`,       inline: true },
  ], 0xed4245, '🔇 Mute vocal');
}

async function onCmdVunmute(guild, { moderator, target }) {
  await logSanction(guild, 'cmdVunmute', [
    { name: '🛠️ Modérateur',  value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Démuté vocal', value: `${target} (\`${target.id}\`)`,       inline: true },
  ], 0x57f287, '🔈 Unmute vocal');
}

async function onCmdVkick(guild, { moderator, target, channel }) {
  await logSanction(guild, 'cmdVkick', [
    { name: '🛠️ Modérateur',    value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Expulsé vocal', value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '🔊 Salon',         value: `<#${channel.id}>`,                   inline: true },
  ], 0xffa500, '👢 Expulsion vocal');
}

async function onCmdMove(guild, { moderator, target, from, to }) {
  await logSanction(guild, 'cmdMove', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '👤 Déplacé',    value: `${target} (\`${target.id}\`)`,       inline: true },
    { name: '🔀 De → Vers',  value: `<#${from.id}> → <#${to.id}>`,        inline: false },
  ], 0x5865f2, '🔀 Déplacement vocal');
}

async function onCmdWouaf(guild, { moderator, targets, channel, duration }) {
  const targetList = targets.map(t => `${t} (\`${t.id}\`)`).join('\n').slice(0, 1024) || '*Aucun*';
  await logSanction(guild, 'cmdWouaf', [
    { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
    { name: '📍 Salon suivi', value: `<#${channel.id}>`,                  inline: true },
    { name: '⏱️ Durée',      value: duration || '*N/A*',                  inline: true },
    { name: '🎯 Cibles',     value: targetList,                           inline: false },
  ], 0xffa500, '🐾 Wouaf (suivi vocal forcé)');
}

/**
 * Log d'un .clean avec transcript HTML optionnel des messages supprimés.
 * @param {import('discord.js').Guild} guild
 * @param {{ moderator, channel, count: number|string, mode: 'n'|'all', htmlTranscript?: string|null, filename?: string }}
 */
async function onCmdClean(guild, { moderator, channel, count, mode, htmlTranscript = null, filename = null }) {
  if (!logDB.shouldLog(guild.id, 'cmdClean')) return;
  const channelId = logDB.getChannelId(guild.id, 'cmdClean');
  if (!channelId) return;
  const logChannel = guild.channels.cache.get(channelId);
  if (!logChannel?.isTextBased() || logChannel.isThread()) return;

  const thread = await getOrCreateThread(logChannel, 'cmdClean').catch(() => null);
  if (!thread) return;

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🗑️ Clean (commande)')
    .addFields(
      { name: '🛠️ Modérateur', value: `${moderator} (\`${moderator.id}\`)`,                    inline: true },
      { name: '📍 Salon',      value: `<#${channel.id}>`,                                       inline: true },
      { name: '📋 Mode',       value: mode === 'all' ? '`all` — salon vidé (clone)' : `\`${count}\` messages`, inline: true },
    )
    .setTimestamp();

  const payload = { embeds: [embed] };

  // Joindre le transcript HTML si fourni
  if (htmlTranscript) {
    payload.files = [{
      attachment: Buffer.from(htmlTranscript, 'utf8'),
      name: filename || `clean-transcript-${channel.id}-${Date.now()}.html`,
    }];
  }

  await thread.send(payload).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMMANDES UTILISATEUR
// ─────────────────────────────────────────────────────────────────────────────

async function onCmdUsed(guild, { user, channel, commandName, args }) {
  const argStr = args?.length ? `\`${args.slice(0, 8).join(' ').slice(0, 200)}\`` : '*aucun*';
  const embed = new EmbedBuilder()
    .setColor(C.info).setTitle('📟 Commande utilisée')
    .addFields(
      { name: '👤 Utilisateur', value: `${user} (\`${user.id}\`)`,  inline: true },
      { name: '📍 Salon',       value: `<#${channel.id}>`,           inline: true },
      { name: '⌨️ Commande',    value: `\`${commandName}\``,         inline: true },
      { name: '📝 Arguments',   value: argStr,                        inline: false },
    ).setTimestamp();
  await send(guild, 'cmdUsed', embed);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MULTIMÉDIA
// ─────────────────────────────────────────────────────────────────────────────

async function onMusicPlay(guild, { track, requestedBy, queueSize }) {
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('▶️ Piste lancée')
    .addFields(
      { name: '🎵 Titre',        value: (track?.title || '*Inconnu*').slice(0, 256),            inline: false },
      { name: '👤 Demandé par',  value: requestedBy ? `<@${requestedBy}>` : '*Inconnu*',        inline: true },
      { name: '📋 File',         value: `${queueSize ?? 0} piste(s) en attente`,                inline: true },
    ).setTimestamp();
  await send(guild, 'musicPlay', embed);
}

async function onMusicAdd(guild, { track, addedBy, queueSize }) {
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.add).setTitle('➕ Ajout à la file')
    .addFields(
      { name: '🎵 Titre',       value: (track?.title || '*Inconnu*').slice(0, 256),  inline: false },
      { name: '👤 Ajouté par',  value: addedBy ? `<@${addedBy}>` : '*Inconnu*',      inline: true },
      { name: '📋 File',        value: `${queueSize ?? 0} piste(s) au total`,         inline: true },
    ).setTimestamp();
  await send(guild, 'musicAdd', embed);
}

async function onMusicRemove(guild, { track, removedBy }) {
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('🗑️ Piste retirée')
    .addFields(
      { name: '🎵 Titre',        value: (track?.title || '*Inconnu*').slice(0, 256),   inline: false },
      { name: '👤 Retiré par',   value: removedBy ? `<@${removedBy}>` : '*Inconnu*',   inline: true },
    ).setTimestamp();
  await send(guild, 'musicRemove', embed);
}

async function onMusicClear(guild, { clearedBy, count }) {
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.warn).setTitle('🧹 File vidée')
    .addFields(
      { name: '👤 Par',         value: clearedBy ? `<@${clearedBy}>` : '*Inconnu*',  inline: true },
      { name: '🔢 Pistes',      value: `${count ?? 0} supprimée(s)`,                  inline: true },
    ).setTimestamp();
  await send(guild, 'musicClear', embed);
}

async function onMusicSkip(guild, { track, skippedBy }) {
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.update).setTitle('⏭️ Piste passée')
    .addFields(
      { name: '🎵 Titre',       value: (track?.title || '*Inconnu*').slice(0, 256),   inline: false },
      { name: '👤 Par',         value: skippedBy ? `<@${skippedBy}>` : '*Auto*',       inline: true },
    ).setTimestamp();
  await send(guild, 'musicSkip', embed);
}

async function onMusicStop(guild, { stoppedBy }) {
  if (!guild) return;
  const embed = new EmbedBuilder()
    .setColor(C.remove).setTitle('⏹️ Lecteur arrêté')
    .addFields(
      { name: '👤 Par', value: stoppedBy ? `<@${stoppedBy}>` : '*Inconnu*', inline: true },
    ).setTimestamp();
  await send(guild, 'musicStop', embed);
}

async function onYtdlDownload(guild, { user, channel, title, format, size, url }) {
  const embed = new EmbedBuilder()
    .setColor(C.info).setTitle('⬇️ Téléchargement (.ytdl)')
    .addFields(
      { name: '👤 Utilisateur', value: `${user} (\`${user.id}\`)`,          inline: true },
      { name: '📍 Salon',       value: `<#${channel.id}>`,                   inline: true },
      { name: '🎵 Titre',       value: (title || '*Inconnu*').slice(0, 256), inline: false },
      { name: '📦 Format',      value: format || '*N/A*',                    inline: true },
      { name: '💾 Taille',      value: size   || '*N/A*',                    inline: true },
    ).setTimestamp();
  await send(guild, 'ytdlDownload', embed);
}



module.exports = {
  onMessageDelete, onMessageUpdate, onMessageBulkDelete,
  onMessageReactionAdd, onMessageReactionRemove, onMessagePin,
  onGuildMemberAdd, onGuildMemberRemove, onGuildMemberUpdate,
  onGuildBanAdd, onGuildBanRemove,
  onChannelCreate, onChannelDelete, onChannelUpdate,
  onThreadCreate, onThreadDelete, onThreadUpdate,
  onRoleCreate, onRoleDelete, onRoleUpdate,
  onVoiceStateUpdate,
  onGuildUpdate,
  onEmojiCreate, onEmojiDelete,
  onStickerCreate, onStickerDelete,
  onInviteCreate, onInviteDelete,
  onScheduledEventCreate, onScheduledEventDelete, onScheduledEventUpdate,
  onAutoModerationRuleCreate, onAutoModerationRuleDelete, onAutoModerationActionExecution,
  onWebhookUpdate, onUserUpdate,
  // Sanctions
  onCmdBan, onCmdUnban, onCmdKick, onCmdMute, onCmdUnmute,
  onCmdWarn, onCmdClearwarns, onCmdRemovewarn,
  onCmdPurge, onCmdLock, onCmdUnlock, onCmdSlowmode,
  onCmdVmute, onCmdVunmute, onCmdVkick, onCmdMove, onCmdWouaf,
  onCmdClean,
  // Commandes utilisateur
  onCmdUsed,
  // Multimédia
  onMusicPlay, onMusicAdd, onMusicRemove, onMusicClear, onMusicSkip, onMusicStop,
  onYtdlDownload,
};
