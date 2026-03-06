// commands/ytdl.js — .ytdl
// Téléchargeur YouTube — Components V2 — discord.js v14
// Sélecteur qualité/format dans un seul StringSelectMenu dépliable

'use strict';

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

const ytdlp = require('yt-dlp-exec');
const { createProxyLink } = require('../utils/ytdlProxy.js');

let _log = null;
try { _log = require('../logs/logManager.js'); } catch { _log = null; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trunc(str, max = 50) {
  if (!str) return '(inconnu)';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
function fmtSize(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
function fmtDuration(secs) {
  if (!secs || isNaN(secs)) return '?:??';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function isYouTubeUrl(url) {
  try { return /youtube\.com|youtu\.be/.test(new URL(url).hostname); } catch { return false; }
}

// ─── Récupérer les infos vidéo ───────────────────────────────────────────────

/**
 * @typedef {{ h: number|null, size: number, ext: string, formatId: string }} FmtEntry
 * @typedef {{ title, author, duration, durationSecs, thumbnail, url, maxHeight: number, audioSize: number }} VideoInfo
 */
async function getVideoInfo(url) {
  try {
    const info    = await ytdlp(url, { 'dump-json': true, 'no-playlist': true, 'no-warnings': true });
    const formats = info.formats || [];

    // Meilleure hauteur disponible (pour savoir quelles qualités afficher)
    const maxHeight = Math.max(0, ...formats.filter(f => f.height).map(f => f.height));

    // Taille approximative du meilleur audio
    const audioFmt = formats
      .filter(f => f.vcodec === 'none' && f.acodec !== 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    const audioSize = audioFmt?.filesize || audioFmt?.filesize_approx || 0;

    // Tailles par palier vidéo
    const sizeAt = (h) => {
      const fmt = formats
        .filter(f => f.height && f.height <= h && f.ext === 'mp4')
        .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      return fmt?.filesize || fmt?.filesize_approx || 0;
    };

    return {
      title:        info.title       || 'Sans titre',
      author:       info.uploader    || info.channel || 'Inconnu',
      duration:     fmtDuration(info.duration || 0),
      durationSecs: info.duration    || 0,
      thumbnail:    info.thumbnail   || '',
      url:          info.webpage_url || url,
      maxHeight,
      audioSize,
      sizeAt,
    };
  } catch (e) {
    console.error('[ytdl] getVideoInfo error:', e.message);
    return null;
  }
}

// ─── Options du sélecteur de qualité ─────────────────────────────────────────

/**
 * Construit les options du StringSelectMenu en fonction de la vidéo.
 * Retourne jusqu'à 25 options (limite Discord).
 */
function buildFormatOptions(info) {
  const options = [];

  // ── Vidéo MP4 ─────────────────────────────────────────────────────────────
  const videoQualities = [
    { key: 'mp4_best', label: 'MP4 — Meilleure qualité',  emoji: '🎬', minH: 0    },
    { key: 'mp4_1080', label: 'MP4 — 1080p Full HD',      emoji: '📺', minH: 720  },
    { key: 'mp4_720',  label: 'MP4 — 720p HD',            emoji: '📺', minH: 480  },
    { key: 'mp4_480',  label: 'MP4 — 480p',               emoji: '📱', minH: 360  },
    { key: 'mp4_360',  label: 'MP4 — 360p',               emoji: '📱', minH: 0    },
  ];

  for (const q of videoQualities) {
    if (info.maxHeight < q.minH) continue; // qualité non disponible
    const size    = info.sizeAt(parseInt(q.key.split('_')[1]) || 99999);
    const sizeStr = fmtSize(size);
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(q.label)
        .setDescription(sizeStr ? `Taille estimée : ${sizeStr}` : 'Taille inconnue')
        .setValue(q.key)
        .setEmoji(q.emoji)
    );
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  const audioSizeStr = fmtSize(info.audioSize);
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('MP3 — Audio uniquement')
      .setDescription(audioSizeStr ? `Taille estimée : ${audioSizeStr}` : 'Taille inconnue')
      .setValue('mp3')
      .setEmoji('🎵'),
    new StringSelectMenuOptionBuilder()
      .setLabel('M4A — Audio haute qualité')
      .setDescription(audioSizeStr ? `Taille estimée : ${audioSizeStr}` : 'Taille inconnue')
      .setValue('m4a')
      .setEmoji('🎧'),
  );

  return options;
}

// ─── Dashboard CV2 ───────────────────────────────────────────────────────────

function buildDashboard(state, info = null, currentUrl = '', statusMsg = '', timeRange = null) {
  const c = new ContainerBuilder();

  // ── En-tête ──
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '## ⬇️  YouTube Downloader\n-# Génère un lien de téléchargement direct'
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
          info?.thumbnail || 'https://cdn.discordapp.com/embed/avatars/3.png'
        )
      )
  );

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // ── URL courante ──
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      currentUrl
        ? `🔗 \`${currentUrl.length > 70 ? currentUrl.slice(0, 70) + '…' : currentUrl}\``
        : '🔗 *Aucune URL — clique sur **Saisir une URL** pour commencer*'
    )
  );

  // ── Time range (si défini) ──
  if (timeRange) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`✂️ Extrait : \`${timeRange}\``)
    );
  }

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // ── Corps ──
  if (state === 'idle') {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### 📋  Comment utiliser',
          '> **1.** Clique sur **🔗 Saisir une URL**',
          '> **2.** Colle ton lien YouTube',
          '> **3.** *(Optionnel)* Définis un **extrait** avec ✂️',
          '> **4.** Déplie le menu **Qualité & Format** et sélectionne',
          '> **5.** Un lien de téléchargement direct est généré',
          '',
          '-# Lien valable **1 heure** — fonctionne dans tout navigateur.',
        ].join('\n')
      )
    );

  } else if (state === 'info' && info) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### 🎬  ${trunc(info.title, 55)}`,
          `👤 **${info.author}**  •  ⏱️ \`${info.duration}\`  •  📐 max \`${info.maxHeight}p\``,
          '',
          timeRange
            ? `✂️ **Extrait sélectionné :** \`${timeRange}\` — seule cette plage sera téléchargée.`
            : '✂️ *Aucun extrait — la vidéo entière sera téléchargée.*',
          '',
          '**Sélectionne une qualité et un format dans le menu ci-dessous :**',
          '-# Le lien sera valable **1 heure** après génération.',
        ].join('\n')
      )
    );

    // ── Bloc info format extrait (affiché dans le dashboard, pas dans le modal) ──
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '-# **Format extrait :**  `MM:SS-MM:SS`  ex : `1:30-3:45`  •  `HH:MM:SS-HH:MM:SS`  ex : `0:01:30-0:03:45`  •  `secondes-secondes`  ex : `90-225`',
        ].join('\n')
      )
    );

  } else if (state === 'generating') {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### ⏳  Génération du lien…',
          statusMsg || '*Prépare le lien de téléchargement…*',
        ].join('\n')
      )
    );

  } else if (state === 'done') {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### ✅  Lien généré !',
          statusMsg || 'Le lien a été envoyé en réponse.',
          '',
          '-# Utilise **🔗 Nouvelle URL** pour télécharger autre chose.',
        ].join('\n')
      )
    );

  } else if (state === 'error') {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '### ❌  Erreur',
          statusMsg || 'Une erreur est survenue. Vérifie l\'URL et réessaie.',
        ].join('\n')
      )
    );
  }

  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // ── Contrôles ──
  if (state === 'generating') {
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ytdl_noop')
          .setLabel('Génération en cours…')
          .setEmoji('⏳')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );

  } else if (state === 'info' && info) {
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ytdl_format_select')
          .setPlaceholder('🎚️  Choisir la qualité et le format…')
          .addOptions(buildFormatOptions(info))
      )
    );
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ytdl_set_timerange')
          .setLabel(timeRange ? 'Modifier l\'extrait' : 'Définir un extrait')
          .setEmoji('✂️')
          .setStyle(timeRange ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ytdl_clear_timerange')
          .setLabel('Supprimer l\'extrait')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!timeRange),
        new ButtonBuilder()
          .setCustomId('ytdl_new_url')
          .setLabel('Changer l\'URL')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Secondary),
      )
    );

  } else {
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ytdl_new_url')
          .setLabel(state === 'done' ? 'Nouvelle URL' : 'Saisir une URL')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  return [c];
}

// ─── Libellés lisibles pour le résumé ────────────────────────────────────────

const FORMAT_LABELS = {
  mp4_best: '🎬 MP4 Meilleure qualité',
  mp4_1080: '📺 MP4 1080p Full HD',
  mp4_720:  '📺 MP4 720p HD',
  mp4_480:  '📱 MP4 480p',
  mp4_360:  '📱 MP4 360p',
  mp3:      '🎵 MP3 Audio',
  m4a:      '🎧 M4A Audio HQ',
};

// ─── Génération du lien proxy ─────────────────────────────────────────────────

async function generateAndSend(info, formatKey, dashMsg, message, currentUrl, timeRange) {
  const label = FORMAT_LABELS[formatKey] || formatKey;

  await dashMsg.edit({
    components: buildDashboard('generating', info, currentUrl,
      `Format : **${label}**${timeRange ? ` — extrait \`${timeRange}\`` : ''} — génération du lien…`, timeRange),
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});

  try {
    const { proxyUrl, filename } = createProxyLink(info.url, formatKey, info.title, 3_600_000, timeRange || null);

    if (_log && message.guild) _log.onYtdlDownload?.(message.guild, {
      user: message.author, channel: message.channel,
      title: info.title, format: label, size: '(stream)', url: proxyUrl,
    }).catch(() => {});

    // ── Réponse en Components V2 ──────────────────────────────────────────────
    const replyContainer = new ContainerBuilder();
    replyContainer.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ⬇️  ${trunc(info.title, 60)}`
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            info.thumbnail || 'https://cdn.discordapp.com/embed/avatars/3.png'
          )
        )
    );
    replyContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    replyContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `📁 Format : \`${label}\`  •  Fichier : \`${filename}\``,
          timeRange ? `✂️ Extrait : \`${timeRange}\`` : null,
          '',
          '**🔗 Lien de téléchargement direct :**',
          proxyUrl,
        ].filter(Boolean).join('\n')
      )
    );
    replyContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    replyContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Lien valable **1 heure** — clique pour télécharger dans ton navigateur.'
      )
    );

    await message.reply({
      components: [replyContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    await dashMsg.edit({
      components: buildDashboard('done', info, currentUrl,
        `Lien envoyé pour \`${filename}\` — valable 1h.`, timeRange),
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});

  } catch (e) {
    console.error('[ytdl] generateAndSend error:', e.message);
    await dashMsg.edit({
      components: buildDashboard('error', info, currentUrl,
        `Erreur : \`${e.message.slice(0, 200)}\``, timeRange),
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  }
}

// ─── Commande ─────────────────────────────────────────────────────────────────

module.exports = {
  name: 'ytdl',
  aliases: ['download', 'yt', 'ytdownload', 'télécharger'],
  description: 'Télécharge une vidéo/audio YouTube (mp3, m4a, mp4)',
  category: 'Multimédia',

  async execute(message, args, client) {
    let currentUrl = args.join(' ').trim();
    let videoInfo  = null;
    let modalOpen  = false;
    let timeRange  = null;   // ← nouveau : extrait temporel

    if (currentUrl && isYouTubeUrl(currentUrl)) {
      const loadMsg = await message.reply({ content: '🔎 Chargement des informations…' });
      videoInfo = await getVideoInfo(currentUrl);
      await loadMsg.delete().catch(() => {});
      if (!videoInfo) {
        currentUrl = '';
        await message.reply({ content: '❌ Impossible de charger cette vidéo. Vérifie l\'URL.' });
      }
    } else {
      currentUrl = '';
    }

    const dashMsg = await message.channel.send({
      components: buildDashboard(videoInfo ? 'info' : 'idle', videoInfo, currentUrl, '', timeRange),
      flags: MessageFlags.IsComponentsV2,
    });

    const filter    = i => i.user.id === message.author.id;
    const collector = dashMsg.createMessageComponentCollector({ filter, time: 300_000 });

    collector.on('collect', async i => {
      if (modalOpen) return i.deferUpdate().catch(() => {});
      const id = i.customId;

      // ── Saisir / changer l'URL ──────────────────────────────────────────────
      if (id === 'ytdl_new_url') {
        modalOpen = true;
        const modal = new ModalBuilder()
          .setCustomId('ytdl_url_modal')
          .setTitle('🔗 URL YouTube')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('ytdl_url_input')
                .setLabel('Colle ton URL YouTube ici')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://www.youtube.com/watch?v=…')
                .setValue(currentUrl || '')
                .setRequired(true)
                .setMaxLength(300)
            )
          );
        await i.showModal(modal).catch(() => {});
        const mi = await i.awaitModalSubmit({ time: 60_000, filter: mi => mi.user.id === message.author.id }).catch(() => null);
        modalOpen = false;
        if (!mi) return;
        await mi.deferUpdate().catch(() => {});

        const url = mi.fields.getTextInputValue('ytdl_url_input').trim();
        if (!isYouTubeUrl(url)) {
          return mi.editReply({ components: buildDashboard('error', videoInfo, url, '❌ URL invalide. Fournis un lien YouTube valide.', timeRange), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        currentUrl = url;
        timeRange  = null; // reset extrait quand on change d'URL
        await mi.editReply({ components: buildDashboard('generating', null, currentUrl, '🔎 Récupération des informations de la vidéo…', null), flags: MessageFlags.IsComponentsV2 }).catch(() => {});

        videoInfo = await getVideoInfo(url);
        if (!videoInfo) {
          return mi.editReply({ components: buildDashboard('error', null, currentUrl, '❌ Impossible de récupérer les infos.\nVidéo privée, age-restricted ou indisponible.', null), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        return mi.editReply({ components: buildDashboard('info', videoInfo, currentUrl, '', timeRange), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      // ── Définir / modifier un extrait temporel ──────────────────────────────
      if (id === 'ytdl_set_timerange') {
        modalOpen = true;
        // Le modal ne contient QUE le champ de saisie — les instructions sont dans le dashboard
        const modal = new ModalBuilder()
          .setCustomId('ytdl_timerange_modal')
          .setTitle('✂️ Définir un extrait temporel')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('ytdl_timerange_input')
                .setLabel('Plage : DEBUT-FIN  (ex: 1:30-3:45 ou 90-225)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('1:30-3:45  •  0:01:30-0:03:45  •  90-225')
                .setValue(timeRange || '')
                .setRequired(true)
                .setMaxLength(30)
            )
          );
        await i.showModal(modal).catch(() => {});
        const mi = await i.awaitModalSubmit({ time: 60_000, filter: mi => mi.user.id === message.author.id }).catch(() => null);
        modalOpen = false;
        if (!mi) return;
        await mi.deferUpdate().catch(() => {});

        const raw = mi.fields.getTextInputValue('ytdl_timerange_input').trim();

        const valid = /^[\d:]+\s*-\s*[\d:]+$/.test(raw);
        if (!valid) {
          return dashMsg.edit({
            components: buildDashboard('error', videoInfo, currentUrl,
              [
                `❌ Format invalide : \`${raw}\``,
                '',
                '**Formats acceptés :**',
                '• `1:30-3:45`  *(MM:SS-MM:SS)*',
                '• `0:01:30-0:03:45`  *(HH:MM:SS-HH:MM:SS)*',
                '• `90-225`  *(secondes-secondes)*',
              ].join('\n'),
              timeRange),
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }

        timeRange = raw.replace(/\s/g, '');
        return dashMsg.edit({
          components: buildDashboard('info', videoInfo, currentUrl, '', timeRange),
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      // ── Supprimer l'extrait ─────────────────────────────────────────────────
      if (id === 'ytdl_clear_timerange') {
        timeRange = null;
        await i.deferUpdate().catch(() => {});
        return i.editReply({
          components: buildDashboard('info', videoInfo, currentUrl, '', null),
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      // ── Sélection qualité + format ──────────────────────────────────────────
      if (id === 'ytdl_format_select') {
        if (!videoInfo) return i.deferUpdate().catch(() => {});
        await i.deferUpdate().catch(() => {});
        const formatKey = i.values[0];
        await generateAndSend(videoInfo, formatKey, dashMsg, message, currentUrl, timeRange);
        return;
      }
    });

    collector.on('end', () => {
      dashMsg.edit({
        components: buildDashboard(
          videoInfo ? 'done' : 'idle', videoInfo, currentUrl,
          videoInfo ? '⏱️ Session expirée — relance `.ytdl` pour télécharger à nouveau.' : '',
          timeRange
        ),
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
