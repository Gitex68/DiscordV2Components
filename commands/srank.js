// commands/srank.js — .srank
// Classements d'activité du serveur : vocal, messages, jeux, vue globale
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
const TABS = ['overview', 'voice', 'messages', 'games'];
const TAB_LABELS = {
  overview: { emoji: '🏆', label: 'Global'   },
  voice:    { emoji: '🔊', label: 'Vocal'    },
  messages: { emoji: '💬', label: 'Messages' },
  games:    { emoji: '🎮', label: 'Jeux'     },
};

// ─── Périodes ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { id: '24h',  days: 1,   label: '24h'  },
  { id: '7j',   days: 7,   label: '7j'   },
  { id: '30j',  days: 30,  label: '30j'  },
  { id: '1an',  days: 365, label: '1 an' },
  { id: 'tout', days: 0,   label: 'Tout' },
];
const PERIOD_DEFAULT = '7j';

const DAY_NAMES   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const MEDALS      = ['🥇', '🥈', '🥉'];

// ─── Constructeurs UI ─────────────────────────────────────────────────────────
function navRow(activeTab) {
  return new ActionRowBuilder().addComponents(
    TABS.map(t => {
      const { emoji, label } = TAB_LABELS[t];
      return new ButtonBuilder()
        .setCustomId(`srank_tab_${t}`)
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
        .setCustomId(`srank_period_${p.id}`)
        .setLabel(p.label)
        .setStyle(p.id === activePeriodId ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(p.id === activePeriodId)
    )
  );
}

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function periodLabel(pid) { return PERIODS.find(p => p.id === pid)?.label ?? pid; }
function periodDays(pid)  { return PERIODS.find(p => p.id === pid)?.days  ?? 7;  }

// ─── Résolution username ───────────────────────────────────────────────────────
async function resolveUser(guild, userId) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) return member.displayName;
    const user = await guild.client.users.fetch(userId).catch(() => null);
    return user?.username ?? `\`${userId}\``;
  } catch { return `\`${userId}\``; }
}

// Génère l'URL courbe de l'historique messages adapté à la période
async function msgHistoryChart(history, days, pLabel) {
  let labels, data;
  if (days === 365) {
    const byMonth = {};
    for (const { date, count } of history) {
      const key = date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + count;
    }
    const keys = Object.keys(byMonth).sort().slice(-12);
    labels = keys.map(k => MONTH_NAMES[parseInt(k.slice(5)) - 1]);
    data   = keys.map(k => byMonth[k]);
  } else {
    labels = history.map(d => days === 1
      ? d.date.slice(5)
      : DAY_NAMES[new Date(d.date + 'T12:00:00').getDay()]
    );
    data = history.map(d => d.count);
  }
  return lineURL(labels, data, 'rgba(88,101,242,1)', pLabel, 'msg');
}

// ─── Vue globale ──────────────────────────────────────────────────────────────
async function buildOverview(guild, iconURL, periodId) {
  const gid   = guild.id;
  const days  = periodDays(periodId);
  const pLabel = periodLabel(periodId);

  // Live vocal
  const inVoice = guild.channels.cache
    .filter(c => c.isVoiceBased?.() || c.type === 2 || c.type === 13)
    .reduce((acc, c) => acc + (c.members?.size ?? 0), 0);

  // Live jeux
  const playingNow = new Map();
  guild.members.cache.forEach(m => {
    const game = m.presence?.activities?.find(a => a.type === 0)?.name;
    if (game) playingNow.set(game, (playingNow.get(game) || 0) + 1);
  });
  const topNowGames = [...playingNow.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([g, n]) => `🕹️ **${g}** × ${n}`).join('\n') || '-# *Aucun membre ne joue en ce moment.*';

  // Historique messages pour la période — passe histDays (pas days) à msgHistoryChart
  const histDays  = days === 0 ? 30 : Math.min(days, 365);
  const history   = db.getMessageHistory(gid, histDays);
  const total7    = history.reduce((a, d) => a + d.count, 0);
  const histURL   = await msgHistoryChart(history, histDays, pLabel);

  // Top 3 chaque catégorie pour la période
  const voiceRanking = days ? db.getVoiceRankingPeriod(gid, days) : db.getVoiceRanking(gid);
  const msgRanking   = days ? db.getMessageRankingPeriod(gid, days) : db.getMessageRanking(gid);
  const gameRanking  = days ? db.getGameRankingServerPeriod(gid, days) : db.getGameRankingServer(gid);

  const voiceTop = db.topN(voiceRanking, 3);
  const msgTop   = db.topN(msgRanking, 3);
  const gameTop  = db.topN(gameRanking, 3);

  const voiceLines = voiceTop.length
    ? (await Promise.all(voiceTop.map(async ([uid, ms], i) =>
        `${MEDALS[i]} <@${uid}> — ${db.fmtMs(ms)}`))).join('\n')
    : '-# *Aucune donnée*';
  const msgLines = msgTop.length
    ? (await Promise.all(msgTop.map(async ([uid, n], i) =>
        `${MEDALS[i]} <@${uid}> — ${n} msg`))).join('\n')
    : '-# *Aucune donnée*';
  const gameLines = gameTop.length
    ? gameTop.map(([g, ms], i) => `${MEDALS[i]} **${g}** — ${db.fmtMs(ms)}`).join('\n')
    : '-# *Aucune donnée*';

  const overviewContainer = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 📊 Activité du Serveur\n-# ${guild.name} · Période : **${pLabel}**`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône ${guild.name}`))
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📡 En direct\n🎙️ **${inVoice} membre${inVoice !== 1 ? 's' : ''}** en vocal\n\n**Jeux en cours**\n${topNowGames}`
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📨 Messages — ${total7} (${pLabel})`));

  if (histURL) {
    overviewContainer.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(histURL).setDescription(`Messages serveur ${pLabel}`)
      )
    );
  }

  return overviewContainer
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🏆 Top Vocal\n${voiceLines}\n\n## 💬 Top Messages\n${msgLines}\n\n## 🎮 Top Jeux\n${gameLines}`
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('overview'))
    .addActionRowComponents(periodRow(periodId));
}

// ─── Vocal ────────────────────────────────────────────────────────────────────
async function buildVoice(guild, iconURL, periodId) {
  const gid   = guild.id;
  const days  = periodDays(periodId);
  const pLabel = periodLabel(periodId);

  const ranking  = days ? db.getVoiceRankingPeriod(gid, days) : db.getVoiceRanking(gid);
  const top      = db.topN(ranking, 8);
  const totalAll = top.reduce((a, [, ms]) => a + ms, 0);

  const names    = await Promise.all(top.map(([uid]) => resolveUser(guild, uid)));
  const chartURL = await hBarURL(
    names.map(n => n.slice(0, 16)),
    top.map(([, ms]) => Math.round(ms / 60000)),
    'rgba(87,242,135,0.85)',
    pLabel,
    'min',
    Math.max(160, top.length * 38)
  );

  const lines = top.length
    ? top.map(([uid, ms], i) => {
        const medal = MEDALS[i] ?? `**${i + 1}.**`;
        const pct   = totalAll > 0 ? Math.round((ms / totalAll) * 100) : 0;
        return `${medal} <@${uid}>\n-# ${db.fmtMs(ms)} · ${pct}% du total serveur`;
      }).join('\n')
    : '-# *Aucune donnée sur cette période.*';

  const nowInVoice = guild.channels.cache
    .filter(c => c.isVoiceBased?.() || c.type === 2 || c.type === 13)
    .flatMap(c => [...(c.members?.values() ?? [])])
    .filter(m => !m.user.bot);
  const liveVoice = nowInVoice.length
    ? `🎙️ **${nowInVoice.length} membre${nowInVoice.length > 1 ? 's' : ''}** en vocal\n` +
      nowInVoice.slice(0, 5).map(m => `-# ${m.displayName} dans <#${m.voice.channelId}>`).join('\n')
    : '-# *Aucun membre en vocal en ce moment.*';

  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🔊 Classement Vocal\n-# ${guild.name} · Top ${top.length} · **${pLabel}**`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône ${guild.name}`))
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📡 En direct\n${liveVoice}`));

  if (chartURL) {
    container
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Répartition (min) · ${pLabel}`))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(chartURL).setDescription('Classement vocal serveur')
        )
      );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Top membres\n\n${lines}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('voice'))
    .addActionRowComponents(periodRow(periodId));

  return container;
}

// ─── Messages ─────────────────────────────────────────────────────────────────
async function buildMessages(guild, iconURL, periodId) {
  const gid    = guild.id;
  const days   = periodDays(periodId);
  const pLabel = periodLabel(periodId);

  const ranking  = days ? db.getMessageRankingPeriod(gid, days) : db.getMessageRanking(gid);
  const top      = db.topN(ranking, 8);
  const totalAll = top.reduce((a, [, n]) => a + n, 0);

  const histDays = days === 0 ? 30 : Math.min(days, 365);
  const history  = db.getMessageHistory(gid, histDays);
  const totalH   = history.reduce((a, d) => a + d.count, 0);
  const histChartURL  = await msgHistoryChart(history, histDays, pLabel);

  const names        = await Promise.all(top.map(([uid]) => resolveUser(guild, uid)));
  const rankChartURL = await hBarURL(
    names.map(n => n.slice(0, 16)),
    top.map(([, n]) => n),
    'rgba(254,231,92,0.85)',
    pLabel,
    'msg',
    Math.max(160, top.length * 38)
  );

  const lines = top.length
    ? top.map(([uid, n], i) => {
        const medal = MEDALS[i] ?? `**${i + 1}.**`;
        const pct   = totalAll > 0 ? Math.round((n / totalAll) * 100) : 0;
        return `${medal} <@${uid}>\n-# ${n} message${n > 1 ? 's' : ''} · ${pct}% du total`;
      }).join('\n')
    : '-# *Aucune donnée sur cette période.*';

  const container = new ContainerBuilder()
    .setAccentColor(0xfee75c)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 💬 Classement Messages\n-# ${guild.name} · ${totalH} msg · **${pLabel}**`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône ${guild.name}`))
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📅 Activité — ${pLabel}`));

  if (histChartURL) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(histChartURL).setDescription(`Messages ${pLabel}`)
      )
    );
  }

  if (rankChartURL) {
    container
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Classement des membres`))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(rankChartURL).setDescription('Classement messages')
        )
      );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Top membres\n\n${lines}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('messages'))
    .addActionRowComponents(periodRow(periodId));

  return container;
}

// ─── Jeux ─────────────────────────────────────────────────────────────────────
async function buildGames(guild, iconURL, periodId) {
  const gid    = guild.id;
  const days   = periodDays(periodId);
  const pLabel = periodLabel(periodId);

  const ranking  = days ? db.getGameRankingServerPeriod(gid, days) : db.getGameRankingServer(gid);
  const top      = db.topN(ranking, 8);
  const totalAll = top.reduce((a, [, ms]) => a + ms, 0);

  const chartURL = await hBarURL(
    top.map(([g]) => g.slice(0, 18)),
    top.map(([, ms]) => Math.round(ms / 60000)),
    'rgba(235,69,158,0.85)',
    pLabel,
    'min',
    Math.max(160, top.length * 38)
  );

  const playingNow = new Map();
  guild.members.cache.forEach(m => {
    const game = m.presence?.activities?.find(a => a.type === 0)?.name;
    if (game) playingNow.set(game, (playingNow.get(game) || 0) + 1);
  });
  const liveGames = [...playingNow.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([g, n]) => `🕹️ **${g}** × ${n} joueur${n > 1 ? 's' : ''}`).join('\n')
    || '-# *Aucun membre ne joue en ce moment.*';

  const lines = top.length
    ? top.map(([game, ms], i) => {
        const medal = MEDALS[i] ?? `**${i + 1}.**`;
        const pct   = totalAll > 0 ? Math.round((ms / totalAll) * 100) : 0;
        return `${medal} **${game}**\n-# ${db.fmtMs(ms)} · ${pct}% du total`;
      }).join('\n')
    : '-# *Aucune donnée sur cette période.*';

  const container = new ContainerBuilder()
    .setAccentColor(0xeb459e)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🎮 Top Jeux du Serveur\n-# ${guild.name} · **${pLabel}**`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL).setDescription(`Icône ${guild.name}`))
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📡 En direct\n${liveGames}`));

  if (chartURL) {
    container
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📊 Temps de jeu (min) · ${pLabel}`))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(chartURL).setDescription('Top jeux serveur')
        )
      );
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏆 Classement\n\n${lines}`))
    .addSeparatorComponents(sep())
    .addActionRowComponents(navRow('games'))
    .addActionRowComponents(periodRow(periodId));

  return container;
}

// ─── Export ───────────────────────────────────────────────────────────────────
module.exports = {
  name: 'srank',
  aliases: ['rank', 'classement', 'leaderboard', 'lb', 'top'],
  description: 'Classements d\'activité du serveur (vocal, messages, jeux, global) avec filtre période',

  async execute(message, args, client) {
    if (!message.guild) return message.reply('❌ Commande serveur uniquement.');

    const guild   = message.guild;
    const iconURL = guild.iconURL({ size: 128, extension: 'png' })
                 ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    let activeTab    = 'overview';
    let activePeriod = PERIOD_DEFAULT;

    async function buildCurrent() {
      if (activeTab === 'overview') return buildOverview(guild, iconURL, activePeriod);
      if (activeTab === 'voice')    return buildVoice(guild, iconURL, activePeriod);
      if (activeTab === 'messages') return buildMessages(guild, iconURL, activePeriod);
      if (activeTab === 'games')    return buildGames(guild, iconURL, activePeriod);
    }

    const reply = await message.reply({
      components: [await buildCurrent()],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id &&
        (i.customId.startsWith('srank_tab_') || i.customId.startsWith('srank_period_')),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId.startsWith('srank_tab_')) {
        activeTab = i.customId.replace('srank_tab_', '');
      } else if (i.customId.startsWith('srank_period_')) {
        activePeriod = i.customId.replace('srank_period_', '');
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
