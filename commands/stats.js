// commands/stats.js — .stats [@user]
// Statistiques personnelles d'activité : vocal, messages, jeux
// 4 onglets × 5 périodes — Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

const db = require('../activity/activityDB.js');
const { lineURL, hBarURL } = require('../utils/charts.js');

// ─── Onglets ──────────────────────────────────────────────────────────────────
const TABS = ['summary', 'voice', 'messages', 'games'];
const TAB_LABELS = {
  summary:  { emoji: '📊', label: 'Résumé'   },
  voice:    { emoji: '🔊', label: 'Vocal'    },
  messages: { emoji: '💬', label: 'Messages' },
  games:    { emoji: '🎮', label: 'Jeux'     },
};

// ─── Périodes ─────────────────────────────────────────────────────────────────
// days=0 → tout le cumulatif
const PERIODS = [
  { id: '24h',   days: 1,   label: '24h'  },
  { id: '7j',    days: 7,   label: '7j'   },
  { id: '30j',   days: 30,  label: '30j'  },
  { id: '1an',   days: 365, label: '1 an' },
  { id: 'tout',  days: 0,   label: 'Tout' },
];
const PERIOD_DEFAULT = '7j';

const DAY_NAMES   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// ─── Constructeurs UI ─────────────────────────────────────────────────────────
function navRow(activeTab) {
  return new ActionRowBuilder().addComponents(
    TABS.map(t => {
      const { emoji, label } = TAB_LABELS[t];
      return new ButtonBuilder()
        .setCustomId(`stats_tab_${t}`)
        .setLabel(`${emoji} ${label}`)
        .setStyle(t === activeTab ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(t === activeTab);
    })
  );
}

function periodRow(activePeriodId) {
  return new ActionRowBuilder().addComponents(
    PERIODS.map(p =>
      new ButtonBuilder()
        .setCustomId(`stats_period_${p.id}`)
        .setLabel(p.label)
        .setStyle(p.id === activePeriodId ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(p.id === activePeriodId)
    )
  );
}

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

// ─── Libellé période ──────────────────────────────────────────────────────────
function periodLabel(periodId) {
  return PERIODS.find(p => p.id === periodId)?.label ?? periodId;
}
function periodDays(periodId) {
  return PERIODS.find(p => p.id === periodId)?.days ?? 7;
}

// ─── Onglet Résumé ─────────────────────────────────────────────────────────
function buildSummary(guildId, userId, member, avatarURL, periodId) {
  const days     = periodDays(periodId);
  const pLabel   = periodLabel(periodId);

  const voiceMap = days ? db.getVoicePeriod(guildId, userId, days) : db.getVoice(guildId, userId);
  const gamesMap = days ? db.getGamesPeriod(guildId, userId, days) : db.getGames(guildId, userId);
  const msgTotal = db.getUserMsgTotal(guildId, userId, days);

  const totalVoice = Object.values(voiceMap).reduce((a, b) => a + b, 0);
  const totalGame  = Object.values(gamesMap).reduce((a, b) => a + b, 0);

  const topVoiceChs = db.topN(voiceMap, 3);
  const topGames    = db.topN(gamesMap, 3);

  const voiceDetails = topVoiceChs.length
    ? topVoiceChs.map(([id, ms], i) => {
        const pct = totalVoice > 0 ? Math.round((ms / totalVoice) * 100) : 0;
        return `${['🥇','🥈','🥉'][i]} <#${id}> — ${db.fmtMs(ms)} (${pct}%)`;
      }).join('\n')
    : '-# *Aucun salon vocal*';

  const gamesDetails = topGames.length
    ? topGames.map(([g, ms], i) => {
        const pct = totalGame > 0 ? Math.round((ms / totalGame) * 100) : 0;
        return `${['🥇','🥈','🥉'][i]} **${g}** — ${db.fmtMs(ms)} (${pct}%)`;
      }).join('\n')
    : '-# *Aucun jeu*';

  const currentGame = member.presence?.activities?.find(a => a.type === 0)?.name;
  const currentVC   = member.voice?.channel;
  const liveLines   = [
    currentVC   ? `🎙️ En vocal dans <#${currentVC.id}>` : null,
    currentGame ? `🕹️ Joue à **${currentGame}** en ce moment` : null,
  ].filter(Boolean).join('\n') || '-# *Hors ligne ou inactif*';

  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 📊 Statistiques — ${member.displayName}\n` +
            `-# ${member.user.tag} · Période : **${pLabel}**`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL).setDescription('Avatar'))
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📡 En ce moment\n${liveLines}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🔊 Vocal — ${db.fmtMs(totalVoice)}\n${voiceDetails}`
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 💬 Messages — ${msgTotal}`)
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🎮 Jeux — ${db.fmtMs(totalGame)}\n${gamesDetails}`
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('summary'))
    .addActionRowComponents(periodRow(periodId));
}

// ─── Onglet Vocal ──────────────────────────────────────────────────────────
async function buildVoice(guildId, userId, member, avatarURL, guild, periodId) {
  const days     = periodDays(periodId);
  const pLabel   = periodLabel(periodId);
  const voiceMap = days ? db.getVoicePeriod(guildId, userId, days) : db.getVoice(guildId, userId);
  const total    = Object.values(voiceMap).reduce((a, b) => a + b, 0);
  const top      = db.topN(voiceMap, 8);

  const chartURL = await hBarURL(
    top.map((_, i) => `Salon ${i + 1}`),
    top.map(([, ms]) => Math.round(ms / 60000)),
    'rgba(87,242,135,0.85)',
    pLabel,
    'min',
    Math.max(160, top.length * 38)
  );

  const lines = top.length
    ? top.map(([chId, ms], i) => {
        const pct = total > 0 ? Math.round((ms / total) * 100) : 0;
        return `**${i + 1}.** <#${chId}>\n-# ${db.fmtMs(ms)} · ${pct}% du temps total`;
      }).join('\n')
    : '-# *Aucune donnée sur cette période.*';

  const currentVC = member.voice?.channel;
  const liveVoice = currentVC ? `🎙️ Actuellement dans <#${currentVC.id}>` : null;

  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🔊 Vocal — ${member.displayName}\n` +
            `-# **${db.fmtMs(total)}** · ${top.length} salon${top.length > 1 ? 's' : ''} · ${pLabel}`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL).setDescription('Avatar'))
    );

  if (liveVoice) {
    container.addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📡 En direct\n${liveVoice}`));
  }

  if (chartURL) {
    container.addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Répartition par salon (min)`))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(chartURL).setDescription('Temps vocal par salon')
        )
      );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Top salons vocaux\n\n${lines}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('voice'))
    .addActionRowComponents(periodRow(periodId));

  return container;
}

// ─── Onglet Messages ───────────────────────────────────────────────────────
async function buildMessages(guildId, userId, member, avatarURL, periodId) {
  const days     = periodDays(periodId);
  const pLabel   = periodLabel(periodId);

  // Histogramme sur la période
  const histDays = days === 0 ? 30 : days === 365 ? 365 : days;
  const history  = userId
    ? db.getUserMessageHistory(guildId, userId, histDays)
    : db.getMessageHistory(guildId, histDays);

  const msgTotal = db.getUserMsgTotal(guildId, userId, days);
  const top      = db.topN(db.getMessages(guildId, userId), 8); // toujours cumulatif par salon

  // Agréger historique selon la période
  let histLabels, histData;
  if (days === 365) {
    // grouper par mois
    const byMonth = {};
    for (const { date, count } of history) {
      const key = date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + count;
    }
    const keys = Object.keys(byMonth).sort().slice(-12);
    histLabels = keys.map(k => MONTH_NAMES[parseInt(k.slice(5)) - 1]);
    histData   = keys.map(k => byMonth[k]);
  } else {
    histLabels = history.map(d =>
      days === 1 ? d.date.slice(5) : DAY_NAMES[new Date(d.date + 'T12:00:00').getDay()]
    );
    histData = history.map(d => d.count);
  }

  const histChartURL = histLabels.length
    ? await lineURL(histLabels, histData, 'rgba(88,101,242,1)', pLabel, 'msg')
    : null;
  const topChartURL  = top.length
    ? await hBarURL(
        top.map((_, i) => `Salon ${i + 1}`),
        top.map(([, n]) => n),
        'rgba(254,231,92,0.85)',
        pLabel,
        'msg',
        Math.max(160, top.length * 38)
      )
    : null;

  const lines = top.length
    ? top.map(([chId, n], i) => {
        const total = Object.values(db.getMessages(guildId, userId)).reduce((a, b) => a + b, 0);
        const pct   = total > 0 ? Math.round((n / total) * 100) : 0;
        return `**${i + 1}.** <#${chId}>\n-# ${n} msg · ${pct}% du total cumulé`;
      }).join('\n')
    : '-# *Aucune donnée.*';

  const container = new ContainerBuilder()
    .setAccentColor(0xfee75c)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 💬 Messages — ${member.displayName}\n` +
            `-# **${msgTotal} message${msgTotal > 1 ? 's' : ''}** sur ${pLabel}`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL).setDescription('Avatar'))
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 📅 Activité — ${pLabel}`
    ));

  if (histChartURL) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(histChartURL).setDescription(`Messages ${pLabel}`)
      )
    );
  }

  if (topChartURL) {
    container.addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Top salons (cumulatif)`))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(topChartURL).setDescription('Messages par salon')
        )
      );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Top salons\n\n${lines}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('messages'))
    .addActionRowComponents(periodRow(periodId));

  return container;
}

// ─── Onglet Jeux ───────────────────────────────────────────────────────────
async function buildGames(guildId, userId, member, avatarURL, periodId) {
  const days     = periodDays(periodId);
  const pLabel   = periodLabel(periodId);
  const gamesMap = days ? db.getGamesPeriod(guildId, userId, days) : db.getGames(guildId, userId);
  const total    = Object.values(gamesMap).reduce((a, b) => a + b, 0);
  const top      = db.topN(gamesMap, 8);

  const chartURL = await hBarURL(
    top.map(([g]) => g.slice(0, 18)),
    top.map(([, ms]) => Math.round(ms / 60000)),
    'rgba(235,69,158,0.85)',
    pLabel,
    'min',
    Math.max(160, top.length * 38)
  );

  const lines = top.length
    ? top.map(([game, ms], i) => {
        const pct = total > 0 ? Math.round((ms / total) * 100) : 0;
        return `**${i + 1}.** **${game}**\n-# ${db.fmtMs(ms)} · ${pct}% du temps`;
      }).join('\n')
    : '-# *Aucune donnée sur cette période.*';

  const currentGame = member.presence?.activities?.find(a => a.type === 0);
  const liveGame    = currentGame
    ? `🕹️ Joue à **${currentGame.name}**` + (currentGame.state ? `\n-# ${currentGame.state}` : '')
    : null;

  const topGame    = top[0];
  const topGameLine = topGame ? `-# Jeu n°1 : **${topGame[0]}** — ${db.fmtMs(topGame[1])}` : '';

  const container = new ContainerBuilder()
    .setAccentColor(0xeb459e)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🎮 Jeux — ${member.displayName}\n` +
            `-# **${db.fmtMs(total)}** · ${top.length} jeu${top.length > 1 ? 'x' : ''} · ${pLabel}` +
            (topGameLine ? `\n${topGameLine}` : '')
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL).setDescription('Avatar'))
    );

  if (liveGame) {
    container.addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📡 En direct\n${liveGame}`));
  }

  if (chartURL) {
    container.addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Temps de jeu par titre (min) · ${pLabel}`))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(chartURL).setDescription('Temps de jeu')
        )
      );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Top jeux\n\n${lines}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('games'))
    .addActionRowComponents(periodRow(periodId));

  return container;
}

module.exports = {
  name: 'stats',
  aliases: ['activite', 'activity', 'ac', 'stat'],
  description: 'Statistiques d\'activité personnelles (vocal, messages, jeux) avec filtre période',

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');

    const mention   = message.mentions.members.first();
    const member    = mention || message.member;
    const userId    = member.id;
    const guildId   = message.guild.id;
    const avatarURL = member.displayAvatarURL({ size: 128, extension: 'png' });

    let activeTab    = 'summary';
    let activePeriod = PERIOD_DEFAULT;

    async function buildCurrent() {
      if (activeTab === 'summary')  return buildSummary(guildId, userId, member, avatarURL, activePeriod);
      if (activeTab === 'voice')    return buildVoice(guildId, userId, member, avatarURL, message.guild, activePeriod);
      if (activeTab === 'messages') return buildMessages(guildId, userId, member, avatarURL, activePeriod);
      if (activeTab === 'games')    return buildGames(guildId, userId, member, avatarURL, activePeriod);
    }

    const reply = await message.reply({
      components: [await buildCurrent()],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id &&
        (i.customId.startsWith('stats_tab_') || i.customId.startsWith('stats_period_')),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId.startsWith('stats_tab_')) {
        activeTab = i.customId.replace('stats_tab_', '');
      } else if (i.customId.startsWith('stats_period_')) {
        activePeriod = i.customId.replace('stats_period_', '');
      }
      await i.update({
        components: [await buildCurrent()],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  },
};

