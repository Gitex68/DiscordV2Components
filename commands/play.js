// commands/play.js — .play
// Dashboard musical interactif — Components V2 — discord.js v14
// Phase 1 (IDLE) : écran de bienvenue minimaliste
// Phase 2 (PLAYER) : dashboard complet — vue En cours / File / Favoris / Recherche

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

const music = require('../utils/musicManager.js');

let _log = null;
try { _log = require('../logs/logManager.js'); } catch { _log = null; }
// ═══════════════════════════════════════════════════════════════════════════════
//  Utilitaires
// ═══════════════════════════════════════════════════════════════════════════════

const trunc = (str, max = 45) => {
  if (!str) return '(inconnu)';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
};

function progressBar(current, total, len = 16) {
  if (!total || total <= 0) return '▱'.repeat(len);
  const filled = Math.max(0, Math.min(len, Math.round((current / total) * len)));
  return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

function elapsedSecs(q) {
  return Math.floor((q?.player?.state?.playbackDuration ?? 0) / 1000);
}

function fmtDuration(secs) {
  if (!secs || isNaN(secs)) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function volumeBar(vol) {
  const filled = Math.max(0, Math.min(10, Math.round((vol / 150) * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Phase 1 — Écran IDLE
// ═══════════════════════════════════════════════════════════════════════════════

function buildIdleDashboard() {
  const c = new ContainerBuilder();

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '## 🎵  Lecteur Musical\n-# Prêt à jouer — rejoins un salon vocal et clique sur **Rechercher**'
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/2.png')
      )
  );

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '### 🎧  Comment démarrer ?',
        '> **1.** Rejoins un salon vocal',
        '> **2.** Tape `.play [titre ou URL YouTube]`  *— ou —*  clique sur le bouton ci-dessous',
        '> **3.** Profite !',
        '',
        '-# Astuce : tu peux coller un lien YouTube directement dans la recherche.',
      ].join('\n')
    )
  );

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_search')
        .setLabel('Rechercher / Coller une URL')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Primary),
    )
  );

  return [c];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Phase 2 — Dashboard PLAYER
// ═══════════════════════════════════════════════════════════════════════════════

function buildDashboard(q, view = 'player', searchResults = [], userId = null, member = null) {
  const c = new ContainerBuilder();

  // ── En-tête ──────────────────────────────────────────────────────────────────
  const stateIcon  = !q?.current ? '⏹' : q.paused ? '⏸' : '▶';
  const stateLabel = !q?.current ? 'Inactif' : q.paused ? 'En pause' : 'Lecture';

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🎵  Lecteur Musical\n-# ${stateIcon} ${stateLabel}` +
          (q?.queue?.length ? `  •  📋 ${q.queue.length} en file` : '')
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
          q?.current?.thumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png'
        )
      )
  );

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // ── Corps ────────────────────────────────────────────────────────────────────
  if (view === 'player')         _buildPlayerView(c, q);
  else if (view === 'queue')     _buildQueueView(c, q, member);
  else if (view === 'favorites') _buildFavoritesView(c, q, userId);
  else if (view === 'search')    _buildSearchView(c, searchResults);

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  // ── Rangée 1 : Transport ─────────────────────────────────────────────────────
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_back')
        .setLabel('Préc.')
        .setEmoji('⏮')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!q?.history?.length),
      new ButtonBuilder()
        .setCustomId('play_pause')
        .setLabel(q?.paused ? 'Reprendre' : 'Pause')
        .setEmoji(q?.paused ? '▶' : '⏸')
        .setStyle(q?.paused ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(!q?.current),
      new ButtonBuilder()
        .setCustomId('play_skip')
        .setLabel('Suiv.')
        .setEmoji('⏭')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!q?.current),
      new ButtonBuilder()
        .setCustomId('play_stop')
        .setLabel('Stop')
        .setEmoji('⏹')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!q),
      new ButtonBuilder()
        .setCustomId('play_loop')
        .setLabel(q?.loop ? 'Piste' : q?.loopQueue ? 'File' : 'Loop')
        .setEmoji(q?.loop ? '🔂' : q?.loopQueue ? '🔁' : '↩')
        .setStyle(q?.loop ? ButtonStyle.Success : q?.loopQueue ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(!q),
    )
  );

  // ── Rangée 2 : Volume + actions ──────────────────────────────────────────────
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_vol_down')
        .setEmoji('🔉')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!q),
      new ButtonBuilder()
        .setCustomId('play_vol_up')
        .setEmoji('🔊')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!q),
      new ButtonBuilder()
        .setCustomId('play_fav')
        .setLabel('Favoris')
        .setEmoji('⭐')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!q?.current),
      new ButtonBuilder()
        .setCustomId('play_search')
        .setLabel('Ajouter')
        .setEmoji('🔍')
        .setStyle(ButtonStyle.Secondary),
    )
  );

  // ── Rangée 3 : Navigation vues ───────────────────────────────────────────────
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_view_player')
        .setLabel('En cours')
        .setEmoji('🎵')
        .setStyle(view === 'player' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('play_view_queue')
        .setLabel('File')
        .setEmoji('📋')
        .setStyle(view === 'queue' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('play_view_favs')
        .setLabel('Favoris')
        .setEmoji('⭐')
        .setStyle(view === 'favorites' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    )
  );

  return [c];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Sous-vues
// ═══════════════════════════════════════════════════════════════════════════════

// ── Vue "En cours" ────────────────────────────────────────────────────────────
function _buildPlayerView(c, q) {
  if (!q?.current) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### ⏹  Aucune piste en cours',
          '',
          'Utilise **🔍 Ajouter** pour mettre une piste dans la file,',
          'ou reviens sur **⭐ Favoris** pour relancer un titre sauvegardé.',
        ].join('\n')
      )
    );
    return;
  }

  const elapsed  = elapsedSecs(q);
  const total    = q.current.durationSecs || 0;
  const bar      = progressBar(elapsed, total);
  const volBar   = volumeBar(q.volume ?? 100);
  const loopTag  = q.loop ? '  •  🔂 Répéter piste' : q.loopQueue ? '  •  🔁 Répéter file' : '';

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### ${q.paused ? '⏸' : '▶'} ${q.paused ? 'En pause' : 'Lecture en cours'}`,
        `**${trunc(q.current.title, 55)}**`,
        `-# Demandé par <@${q.current.requestedBy}>`,
        '',
        `\`${fmtDuration(elapsed)}\`  \`${bar}\`  \`${q.current.duration || '--:--'}\`${loopTag}`,
        `🔊 \`${volBar}\` **${q.volume ?? 100}%**`,
        '',
        q.queue.length
          ? `> 📋 **${q.queue.length}** piste(s) en attente — suivante : **${trunc(q.queue[0].title, 35)}**`
          : '> 📋 File vide — c\'est la dernière piste',
      ].join('\n')
    )
  );
}

// ── Vue "File d'attente" ──────────────────────────────────────────────────────
function _buildQueueView(c, q, member = null) {
  const guildId   = q?.guild?.id;
  const canManage = guildId && member ? music.isQueueOwnerOrAdmin(member, guildId) : false;

  if (!q?.queue?.length) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### 📋  File d\'attente vide',
          '',
          'Aucune piste en attente. Utilise **🔍 Ajouter** pour en mettre une.',
          canManage ? '' : '-# 🔒 Seul le créateur de la session ou un admin peut gérer la file.',
        ].filter(Boolean).join('\n')
      )
    );
    if (canManage) {
      c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('play_queue_delete')
            .setLabel('Supprimer la file sauvegardée')
            .setEmoji('🗑')
            .setStyle(ButtonStyle.Danger),
        )
      );
    }
    return;
  }

  const lines = q.queue.slice(0, 10).map((t, i) =>
    `\`${String(i + 1).padStart(2)}\` **${trunc(t.title, 36)}**  \`${t.duration}\`  -# <@${t.requestedBy}>`
  );
  if (q.queue.length > 10)
    lines.push(`-# … et **${q.queue.length - 10}** autre(s) piste(s)`);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `### 📋  File d'attente — **${q.queue.length}** piste(s)`,
        lines.join('\n'),
        canManage ? '' : '-# 🔒 Seul le créateur ou un admin peut modifier la file.',
      ].filter(Boolean).join('\n')
    )
  );

  // Select : Jouer une piste
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('play_queue_jump')
        .setPlaceholder('⏭  Passer directement à une piste…')
        .addOptions(
          q.queue.slice(0, 25).map((t, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(trunc(t.title, 50))
              .setDescription(`${t.duration}  —  par ${t.requestedBy}`)
              .setValue(`jump_${i}`)
          )
        )
    )
  );

  if (!canManage) return;

  // Select : Retirer une piste
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('play_queue_remove')
        .setPlaceholder('🗑  Retirer une piste de la file…')
        .addOptions(
          q.queue.slice(0, 25).map((t, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(trunc(t.title, 50))
              .setDescription(`Pos. ${i + 1}  —  ${t.duration}  —  par ${t.requestedBy}`)
              .setValue(`remove_${i}`)
          )
        )
    )
  );

  // Select : Remonter une piste (seulement si 2+ pistes)
  if (q.queue.length >= 2) {
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('play_queue_move_up')
          .setPlaceholder('⬆  Remonter une piste d\'une position…')
          .addOptions(
            q.queue.slice(1, 25).map((t, i) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(trunc(t.title, 50))
                .setDescription(`Pos. ${i + 2} → ${i + 1}  —  ${t.duration}`)
                .setValue(`moveup_${i + 1}`)
            )
          )
      )
    );
  }

  // Boutons gestion globale
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_queue_clear')
        .setLabel('Vider la file')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('play_queue_delete')
        .setLabel('Supprimer la file')
        .setEmoji('🗑')
        .setStyle(ButtonStyle.Danger),
    )
  );
}

// ── Vue "Favoris" ─────────────────────────────────────────────────────────────
function _buildFavoritesView(c, q, userId) {
  const favs = userId ? music.getFavorites(userId) : [];

  if (!favs.length) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### ⭐  Tes favoris — vide',
          '',
          'Tu n\'as aucun favori pour l\'instant.',
          'Pendant la lecture, appuie sur **⭐ Favoris** pour sauvegarder une piste.',
        ].join('\n')
      )
    );
    return;
  }

  const lines = favs.slice(0, 10).map((t, i) =>
    `\`${String(i + 1).padStart(2)}\` **${trunc(t.title, 38)}**  \`${t.duration || '--:--'}\``
  );
  if (favs.length > 10)
    lines.push(`-# … et **${favs.length - 10}** autre(s)`);

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [`### ⭐  Tes favoris — **${favs.length}** piste(s)`, lines.join('\n')].join('\n')
    )
  );

  // Select : Ajouter à la file
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('play_fav_pick')
        .setPlaceholder('▶  Ajouter un favori à la file…')
        .addOptions(
          favs.slice(0, 25).map((t, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(trunc(t.title, 50))
              .setDescription(t.duration || '--:--')
              .setValue(`fav_pick_${i}`)
          )
        )
    )
  );

  // Select : Supprimer un favori
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('play_fav_remove')
        .setPlaceholder('🗑  Supprimer un favori…')
        .addOptions(
          favs.slice(0, 25).map((t, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(trunc(t.title, 50))
              .setDescription(`Supprimer de tes favoris  —  ${t.duration || '--:--'}`)
              .setValue(`fav_remove_${i}`)
          )
        )
    )
  );

  // Bouton vider tout
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_fav_clear')
        .setLabel('Vider tous mes favoris')
        .setEmoji('🗑')
        .setStyle(ButtonStyle.Danger),
    )
  );
}

// ── Vue "Résultats de recherche" ──────────────────────────────────────────────
function _buildSearchView(c, results) {
  if (!results?.length) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 🔍  Aucun résultat\n*Essaie des mots-clés différents ou colle une URL directement.*'
      )
    );
    return;
  }

  const lines = results.map((t, i) =>
    `\`${i + 1}.\` **${trunc(t.title, 42)}**  \`${t.duration}\``
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [`### 🔍  Résultats — sélectionne une piste`, lines.join('\n')].join('\n')
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('play_search_pick')
        .setPlaceholder('Ajouter un résultat à la file…')
        .addOptions(
          results.map((t, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(trunc(t.title, 50))
              .setDescription(`${t.duration}`)
              .setValue(`search_pick_${i}`)
          )
        )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Commande principale
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'play',
  aliases: ['music', 'm', 'jouer', 'p2'],
  description: 'Lecteur audio — rejoins ton vocal et lance la musique',
  category: 'Multimédia',

  async execute(message, args, client) {
    const member       = message.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel)
      return message.reply({ content: '❌ Rejoins d\'abord un salon vocal !' });

    const botPerms = voiceChannel.permissionsFor(message.guild.members.me);
    if (!botPerms?.has('Connect') || !botPerms?.has('Speak'))
      return message.reply({ content: '❌ Je n\'ai pas la permission de rejoindre ce salon.' });

    const guildId           = message.guild.id;
    const query             = args.join(' ').trim();
    let   currentView       = 'player';
    let   lastSearchResults = [];
    let   modalOpen         = false;

    const q = music.getOrCreateQueue(
      message.guild, voiceChannel, message.channel, message.author.id
    );

    // Résolution directe si query en argument
    if (query) {
      const loadMsg = await message.reply({ content: '🔎 Recherche en cours…' });
      const track   = await music.resolveTrack(query, message.author.id);
      await loadMsg.delete().catch(() => {});
      if (!track) return message.reply({ content: `❌ Aucun résultat pour : \`${query}\`` });
      const res = music.addToQueue(guildId, track);
      if (res === 'duplicate')
        return message.reply({ content: `⚠️ **${trunc(track.title)}** est déjà dans la file.` });
    }

    // Si un dashboard est déjà actif sur ce guild, le fermer proprement
    if (q._stopDash) q._stopDash();

    // Envoi du dashboard
    const hasTrack = q.current || q.queue.length > 0;
    const dashMsg  = await message.channel.send({
      components: hasTrack
        ? buildDashboard(q, 'player', [], message.author.id, message.member)
        : buildIdleDashboard(),
      flags: MessageFlags.IsComponentsV2,
    });
    q.dashboardMessage = dashMsg;

    if (!q.current && q.queue.length > 0)
      await music.playNext(q, autoUpdate);

    // Callback appelé par musicManager quand l'état change
    function autoUpdate(qUpd, status) {
      const qNow = qUpd || music.getQueue(guildId);
      // Le bot a quitté le vocal → on ferme le dashboard
      if (!qNow || status === 'disconnected') {
        stopDash();
        dashMsg.edit({ components: buildIdleDashboard(), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return;
      }
      const comp = status === 'idle'
        ? buildDashboard(qNow, 'player', [], message.author.id, message.member)
        : buildDashboard(qNow, currentView, lastSearchResults, message.author.id, message.member);
      dashMsg.edit({ components: comp, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    // Rafraîchissement barre de progression toutes les 10s
    const progressInterval = setInterval(() => {
      const qNow = music.getQueue(guildId);
      if (!qNow?.current || currentView !== 'player') return;
      dashMsg.edit({
        components: buildDashboard(qNow, 'player', [], message.author.id, message.member),
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }, 10_000);

    // Collector SANS timeout → actif tant que le bot est en vocal
    const collector = dashMsg.createMessageComponentCollector();

    // Fonction d'arrêt propre (appelée par destroyQueue ou autoUpdate)
    function stopDash() {
      clearInterval(progressInterval);
      if (!collector.ended) collector.stop('voice_left');
      const q2 = music.getQueue(guildId);
      if (q2) q2._stopDash = null;
    }

    // Enregistrer stopDash dans la queue pour que destroyQueue puisse l'appeler
    const qRef = music.getQueue(guildId);
    if (qRef) qRef._stopDash = stopDash;

    // Helper mise à jour après action
    async function upd(i, view = currentView, extra = lastSearchResults) {
      const qNow = music.getQueue(guildId);
      const comp = !qNow
        ? buildIdleDashboard()
        : buildDashboard(qNow, view, extra, message.author.id, message.member);
      try {
        if (i.deferred || i.replied) await i.editReply({ components: comp, flags: MessageFlags.IsComponentsV2 });
        else                         await i.update({ components: comp, flags: MessageFlags.IsComponentsV2 });
      } catch { /* ignore */ }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Collector — sans timeout, actif tant que le bot est en vocal
    // ══════════════════════════════════════════════════════════════════════════

    collector.on('collect', async i => {
      if (modalOpen) return i.deferUpdate().catch(() => {});
      const id = i.customId;

      // ── Vérification salon vocal (sauf navigation pure et ajout favori à la file) ──
      const controlIds = new Set([
        'play_pause','play_stop','play_skip','play_back','play_loop',
        'play_vol_down','play_vol_up','play_fav',
        'play_queue_clear','play_queue_delete','play_queue_remove','play_queue_move_up','play_queue_jump',
        'play_search','play_search_pick','play_fav_pick',
      ]);
      if (controlIds.has(id)) {
        const qNow        = music.getQueue(guildId);
        const botVoice    = qNow?.voiceChannel || message.guild.members.me?.voice?.channel;
        const userVoice   = i.member?.voice?.channel;
        if (botVoice && userVoice?.id !== botVoice.id) {
          await i.deferUpdate().catch(() => {});
          return i.followUp({
            content: `🔒 Tu dois être dans le salon vocal **${botVoice.name}** pour contrôler la musique.`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
      }

      // ── Navigation vues ────────────────────────────────────────────────────
      if (id === 'play_view_player') { currentView = 'player';    return upd(i, 'player'); }
      if (id === 'play_view_queue')  { currentView = 'queue';     return upd(i, 'queue'); }
      if (id === 'play_view_favs')   { currentView = 'favorites'; return upd(i, 'favorites'); }

      // ── Favoris : ajouter à la file ────────────────────────────────────────
      if (id === 'play_fav_pick') {
        const idx  = parseInt(i.values[0].replace('fav_pick_', ''), 10);
        const favs = music.getFavorites(i.user.id);
        const fav  = favs[idx];
        if (fav) {
          const qNow = music.getQueue(guildId)
            || music.getOrCreateQueue(message.guild, voiceChannel, message.channel, i.user.id);
          const res = music.addToQueue(guildId, { ...fav, requestedBy: i.user.id });
          if (res === 'duplicate') {
            await i.deferUpdate().catch(() => {});
            return i.followUp({ content: `⚠️ **${trunc(fav.title)}** est déjà dans la file.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!qNow.current) await music.playNext(qNow, autoUpdate);
        }
        currentView = 'favorites';
        return upd(i, 'favorites');
      }

      // ── Favoris : supprimer un favori ──────────────────────────────────────
      if (id === 'play_fav_remove') {
        const idx  = parseInt(i.values[0].replace('fav_remove_', ''), 10);
        const favs = music.getFavorites(i.user.id);
        const fav  = favs[idx];
        if (fav) music.removeFavorite(i.user.id, fav.url);
        await i.deferUpdate().catch(() => {});
        await i.followUp({
          content: fav ? `🗑 **${trunc(fav.title)}** retiré de tes favoris.` : '❓ Favori introuvable.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        currentView = 'favorites';
        return upd(i, 'favorites');
      }

      // ── Favoris : vider tout ───────────────────────────────────────────────
      if (id === 'play_fav_clear') {
        music.clearFavorites(i.user.id);
        await i.deferUpdate().catch(() => {});
        await i.followUp({ content: '🗑 Tous tes favoris ont été supprimés.', flags: MessageFlags.Ephemeral }).catch(() => {});
        currentView = 'favorites';
        return upd(i, 'favorites');
      }

      // ── Recherche via modal ────────────────────────────────────────────────
      if (id === 'play_search') {
        modalOpen = true;
        const modal = new ModalBuilder()
          .setCustomId('play_search_modal')
          .setTitle('Ajouter une piste')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('play_search_query')
                .setLabel('URL YouTube ou mots-clés')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Daft Punk Get Lucky  —  ou  https://youtu.be/…')
                .setRequired(true)
                .setMaxLength(250)
            )
          );
        await i.showModal(modal).catch(() => {});
        const mi = await i.awaitModalSubmit({
          time: 90_000,
          filter: mi => mi.user.id === i.user.id,
        }).catch(() => null);
        modalOpen = false;
        if (!mi) return;
        await mi.deferUpdate().catch(() => {});

        const sq = mi.fields.getTextInputValue('play_search_query').trim();
        if (!sq) return upd(mi, currentView);

        // URL YouTube → résolution directe
        if (/youtube\.com|youtu\.be/.test(sq)) {
          const track = await music.resolveTrack(sq, i.user.id);
          if (!track) {
            await mi.editReply({ components: buildDashboard(music.getQueue(guildId), 'player', [], message.author.id, message.member), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return mi.followUp({ content: '❌ Impossible de résoudre cette URL.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          const qNow = music.getQueue(guildId)
            || music.getOrCreateQueue(message.guild, voiceChannel, message.channel, i.user.id);
          const res = music.addToQueue(guildId, track);
          if (res === 'duplicate') {
            return mi.followUp({ content: `⚠️ **${trunc(track.title)}** est déjà dans la file.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!qNow.current) await music.playNext(qNow, autoUpdate);
          currentView = 'player';
          return mi.editReply({ components: buildDashboard(music.getQueue(guildId), 'player', [], message.author.id, message.member), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        // Mots-clés → recherche
        const results = await music.searchTracks(sq, 5);
        if (!results.length) {
          return mi.editReply({ components: buildDashboard(music.getQueue(guildId), 'search', [], message.author.id, message.member), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        if (results.length === 1) {
          results[0].requestedBy = i.user.id;
          const qNow = music.getQueue(guildId)
            || music.getOrCreateQueue(message.guild, voiceChannel, message.channel, i.user.id);
          const res = music.addToQueue(guildId, results[0]);
          if (res === 'duplicate') {
            return mi.followUp({ content: `⚠️ **${trunc(results[0].title)}** est déjà dans la file.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!qNow.current) await music.playNext(qNow, autoUpdate);
          currentView = 'player';
          return mi.editReply({ components: buildDashboard(music.getQueue(guildId), 'player', [], message.author.id, message.member), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        lastSearchResults = results;
        currentView = 'search';
        return mi.editReply({ components: buildDashboard(music.getQueue(guildId), 'search', results, message.author.id, message.member), flags: MessageFlags.IsComponentsV2 }).catch(console.error);
      }

      // ── Sélection résultat de recherche ────────────────────────────────────
      if (id === 'play_search_pick') {
        const idx   = parseInt(i.values[0].replace('search_pick_', ''), 10);
        const track = lastSearchResults[idx];
        if (track) {
          track.requestedBy = i.user.id;
          const qNow = music.getQueue(guildId)
            || music.getOrCreateQueue(message.guild, voiceChannel, message.channel, i.user.id);
          const res = music.addToQueue(guildId, track);
          if (res === 'duplicate') {
            await i.deferUpdate().catch(() => {});
            return i.followUp({ content: `⚠️ **${trunc(track.title)}** est déjà dans la file.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!qNow.current) await music.playNext(qNow, autoUpdate);
        }
        lastSearchResults = [];
        currentView = 'player';
        return upd(i, 'player', []);
      }

      // ── File : passer à une piste ──────────────────────────────────────────
      if (id === 'play_queue_jump') {
        const idx  = parseInt(i.values[0].replace('jump_', ''), 10);
        const qNow = music.getQueue(guildId);
        if (qNow && idx < qNow.queue.length) {
          const jumped = qNow.queue.splice(idx, 1)[0];
          if (qNow.current) qNow.history.push(qNow.current);
          qNow.queue.unshift(jumped);
          if (qNow.player) qNow.player.stop();
        }
        currentView = 'player';
        return upd(i, 'player');
      }

      // ── File : retirer une piste (owner/admin) ─────────────────────────────
      if (id === 'play_queue_remove') {
        if (!music.isQueueOwnerOrAdmin(i.member, guildId)) {
          await i.deferUpdate().catch(() => {});
          return i.followUp({ content: '🔒 Seul le créateur ou un admin peut retirer des pistes.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const idx     = parseInt(i.values[0].replace('remove_', ''), 10);
        const removed = music.removeTrackFromQueue(guildId, idx, i.user.id);
        await i.deferUpdate().catch(() => {});
        await i.followUp({
          content: removed ? `🗑 **${trunc(removed.title)}** retiré de la file.` : '❓ Piste introuvable.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        currentView = 'queue';
        return upd(i, 'queue');
      }

      // ── File : remonter une piste (owner/admin) ────────────────────────────
      if (id === 'play_queue_move_up') {
        if (!music.isQueueOwnerOrAdmin(i.member, guildId)) {
          await i.deferUpdate().catch(() => {});
          return i.followUp({ content: '🔒 Seul le créateur ou un admin peut réorganiser la file.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const idx = parseInt(i.values[0].replace('moveup_', ''), 10);
        music.moveTrackInQueue(guildId, idx, idx - 1);
        await i.deferUpdate().catch(() => {});
        await i.followUp({ content: '⬆ Piste remontée d\'une position.', flags: MessageFlags.Ephemeral }).catch(() => {});
        currentView = 'queue';
        return upd(i, 'queue');
      }

      // ── File : vider (owner/admin) ─────────────────────────────────────────
      if (id === 'play_queue_clear') {
        if (!music.isQueueOwnerOrAdmin(i.member, guildId)) {
          await i.deferUpdate().catch(() => {});
          return i.followUp({ content: '🔒 Seul le créateur ou un admin peut vider la file.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        music.clearQueue(guildId, i.user.id);
        await i.deferUpdate().catch(() => {});
        await i.followUp({ content: '🧹 File vidée.', flags: MessageFlags.Ephemeral }).catch(() => {});
        currentView = 'queue';
        return upd(i, 'queue');
      }

      // ── File : supprimer la file sauvegardée (owner/admin) ────────────────
      if (id === 'play_queue_delete') {
        if (!music.isQueueOwnerOrAdmin(i.member, guildId)) {
          await i.deferUpdate().catch(() => {});
          return i.followUp({ content: '🔒 Seul le créateur ou un admin peut supprimer la file.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        music.deleteQueue(guildId);
        await i.deferUpdate().catch(() => {});
        await i.followUp({ content: '🗑 File supprimée définitivement.', flags: MessageFlags.Ephemeral }).catch(() => {});
        currentView = 'queue';
        return upd(i, 'queue');
      }

      // ── Transport ──────────────────────────────────────────────────────────
      if (id === 'play_pause') {
        const qNow = music.getQueue(guildId);
        if (qNow?.paused) music.resume(guildId); else music.pause(guildId);
        return upd(i, currentView);
      }

      if (id === 'play_stop') {
        music.stop(guildId, i.user.id);
        currentView = 'player';
        const comp = buildIdleDashboard();
        try {
          if (i.deferred || i.replied) await i.editReply({ components: comp, flags: MessageFlags.IsComponentsV2 });
          else                         await i.update({ components: comp, flags: MessageFlags.IsComponentsV2 });
        } catch { /* ignore */ }
        return;
      }

      if (id === 'play_skip') {
        const qNow = music.getQueue(guildId);
        if (qNow?.current) {
          if (_log && i.guild) _log.onMusicSkip(i.guild, { track: qNow.current, skippedBy: i.user.id }).catch(() => {});
          qNow.history.push(qNow.current);
        }
        if (qNow?.player)  qNow.player.stop();
        return upd(i, currentView);
      }

      if (id === 'play_back') {
        music.back(guildId, autoUpdate);
        return upd(i, currentView);
      }

      if (id === 'play_loop') {
        const qNow = music.getQueue(guildId);
        if (!qNow) return upd(i, currentView);
        if (!qNow.loop && !qNow.loopQueue) { qNow.loop = true;  qNow.loopQueue = false; }
        else if (qNow.loop)                { qNow.loop = false; qNow.loopQueue = true;  }
        else                               { qNow.loop = false; qNow.loopQueue = false; }
        return upd(i, currentView);
      }

      if (id === 'play_vol_down') {
        const qNow = music.getQueue(guildId);
        if (qNow) music.setVolume(guildId, (qNow.volume ?? 100) - 10);
        return upd(i, currentView);
      }
      if (id === 'play_vol_up') {
        const qNow = music.getQueue(guildId);
        if (qNow) music.setVolume(guildId, (qNow.volume ?? 100) + 10);
        return upd(i, currentView);
      }

      // ── Ajouter la piste en cours aux favoris ──────────────────────────────
      if (id === 'play_fav') {
        const qNow = music.getQueue(guildId);
        if (qNow?.current) {
          const added = music.addFavorite(i.user.id, qNow.current);
          await i.deferUpdate().catch(() => {});
          return i.followUp({
            content: added
              ? `⭐ **${trunc(qNow.current.title)}** ajouté à tes favoris !`
              : '⭐ Cette piste est déjà dans tes favoris.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
        return upd(i, currentView);
      }
    });

    // ── Fin du collector (bot parti du vocal via stopDash) ──────────────────
    collector.on('end', (_col, reason) => {
      clearInterval(progressInterval);
      // Si le collector s'est arrêté pour une raison autre que voice_left
      // (ex : message supprimé), on ne touche pas le dashboard
      if (reason !== 'voice_left') return;
      const qNow = music.getQueue(guildId);
      dashMsg.edit({
        components: qNow
          ? buildDashboard(qNow, 'player', [], message.author.id, message.member)
          : buildIdleDashboard(),
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
