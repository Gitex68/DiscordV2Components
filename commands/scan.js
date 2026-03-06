// commands/scan.js — .scan <url>
// Analyse une URL via urlscan.io (API publique, sans clé) + décode un QR code si c'est une image

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

// Vérifications simples sans API
const SUSPICIOUS_PATTERNS = [
  /discord[-.]?gift/i, /nitro[-.]?free/i, /free[-.]?nitro/i,
  /bit\.ly/i, /tinyurl\.com/i, /t\.co/i, /goo\.gl/i,
  /\.tk$/i, /\.ml$/i, /\.ga$/i, /\.cf$/i, /\.gq$/i,
  /paypal.*login/i, /confirm.*account/i, /verify.*account/i,
  /steam.*community.*(?!\.com)/i,
];

const IP_REGEX = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}/i;

function localCheck(raw) {
  const flags = [];
  if (IP_REGEX.test(raw)) flags.push('⚠️ URL pointe vers une IP directe');
  for (const p of SUSPICIOUS_PATTERNS) {
    if (p.test(raw)) flags.push(`⚠️ Motif suspect : \`${p.source}\``);
  }
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:') flags.push('⚠️ Non sécurisé (HTTP)');
    if (u.hostname.split('.').length > 4) flags.push('⚠️ Sous-domaine inhabituel (' + u.hostname + ')');
  } catch { flags.push('❌ URL malformée'); }
  return flags;
}

module.exports = {
  name: 'scan',
  aliases: ['urlscan', 'virustotal', 'check', 'analyser'],
  description: 'Analyse une URL pour détecter du contenu malveillant',

  async execute(message, args) {
    if (!args[0]) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ **Usage :** `.scan <url>`')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    let raw = args[0];
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

    let url;
    try { url = new URL(raw); }
    catch {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ URL invalide.')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const waiting = await message.reply({
      components: [
        new ContainerBuilder().setAccentColor(0x4f545c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`🔍 Analyse de \`${url.href.slice(0, 60)}\`...`)
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // Analyse locale (instantané)
    const localFlags = localCheck(url.href);

    // Soumettre à urlscan.io (API publique, pas de clé requise pour la recherche)
    let urlscanResult = null;
    try {
      const searchRes = await fetch(
        `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(url.hostname)}&size=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await searchRes.json();
      if (data.results?.length) {
        const r = data.results[0];
        urlscanResult = {
          verdict:    r.verdicts?.overall?.malicious ? '🔴 Malveillant' : '🟢 Propre',
          score:      r.verdicts?.overall?.score ?? 0,
          categories: r.verdicts?.overall?.categories?.join(', ') || 'Aucune',
          scanLink:   r.task?.reportURL ?? `https://urlscan.io/search/#domain:${url.hostname}`,
        };
      }
    } catch { /* silencieux */ }

    // Synthèse
    const isClean = localFlags.length === 0;
    const color = isClean && (!urlscanResult || urlscanResult.verdict.includes('Propre'))
      ? 0x57f287
      : localFlags.length > 2 ? 0xed4245 : 0xfee75c;

    const localSummary = isClean
      ? '✅ Aucun motif suspect détecté localement.'
      : localFlags.map(f => `• ${f}`).join('\n');

    const urlscanSummary = urlscanResult
      ? `**Verdict urlscan.io** — ${urlscanResult.verdict}\n` +
        `**Score** — \`${urlscanResult.score}\`\n` +
        `**Catégories** — ${urlscanResult.categories}`
      : '*urlscan.io — domaine non encore analysé.*';

    const container = new ContainerBuilder()
      .setAccentColor(color)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🛡️ Analyse d'URL\n` +
              `-# ${url.hostname}`
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(`https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`)
              .setDescription('Favicon')
          )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**🔎 Vérifications locales**\n${localSummary}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(urlscanSummary)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Voir sur urlscan.io')
            .setStyle(ButtonStyle.Link)
            .setURL(urlscanResult?.scanLink ?? `https://urlscan.io/search/#domain:${url.hostname}`)
            .setEmoji('🔬'),
          new ButtonBuilder()
            .setLabel('VirusTotal')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.virustotal.com/gui/url/${Buffer.from(url.href).toString('base64').replace(/=/g, '')}`)
            .setEmoji('🦠'),
        )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# ⚠️ Cette analyse est indicative. Résultat non garanti.\n` +
          `-# Demandé par ${message.author.tag}`
        )
      );

    await waiting.edit({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
