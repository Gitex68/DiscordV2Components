// commands/sondage.js — .sondage <question> | <choix1> | <choix2> [| <choix3>]
// Sondage interactif en Components V2 avec barres de progression en temps réel

const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'sondage',
  aliases: ['poll'],
  description: 'Lance un sondage interactif (5 minutes)',

  async execute(message, args, client) {
    // Format : .sondage Question? | Choix A | Choix B | Choix C
    const full = message.content.slice(1 + 'sondage'.length).trim();
    const parts = full.split('|').map(s => s.trim()).filter(Boolean);

    if (parts.length < 3) {
      return message.reply(
        '❌ Utilisation : `.sondage <question> | <choix1> | <choix2> [| <choix3>]`\n' +
        'Exemple : `.sondage Meilleur fruit ? | Pomme | Banane | Raisin`',
      );
    }

    const question = parts[0];
    const choix    = parts.slice(1, 4); // max 3 choix
    const emojis   = ['1️⃣', '2️⃣', '3️⃣'];
    const colors   = [0x5865f2, 0x57f287, 0xed4245];
    const votes    = choix.map(() => new Set());

    function buildBar(pct) {
      const filled = Math.round(pct / 10);
      return `\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\``;
    }

    function buildContainer(disabled = false) {
      const total = votes.reduce((acc, s) => acc + s.size, 0);

      // Déterminer le choix gagnant
      let maxVotes = 0;
      let winnerIdx = -1;
      votes.forEach((s, i) => { if (s.size > maxVotes) { maxVotes = s.size; winnerIdx = i; } });

      // Couleur = couleur du choix gagnant, bleu si égalité/vide
      const accentColor = total > 0 ? colors[winnerIdx] : 0x5865f2;

      const lines = choix.map((c, i) => {
        const count = votes[i].size;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        const bar   = buildBar(pct);
        const crown = !disabled && count === maxVotes && count > 0 ? ' 👑' : '';
        return `**${emojis[i]} ${c}**${crown}\n${bar} **${pct}%** — ${count} vote${count !== 1 ? 's' : ''}`;
      }).join('\n\n');

      const statusLine = disabled
        ? `🔒 **Sondage terminé** — ${total} vote${total !== 1 ? 's' : ''} au total`
        : `📊 **${total} vote${total !== 1 ? 's' : ''}** — expire dans 5 minutes`;

      return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 📊 ${question}\n` +
            `-# Sondage lancé par ${message.author.tag}`
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(lines)
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            choix.map((c, i) =>
              new ButtonBuilder()
                .setCustomId(`sondage_vote_${i}`)
                .setLabel(c)
                .setEmoji(emojis[i])
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled)
            )
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${statusLine}`)
        );
    }

    const reply = await message.reply({
      components: [buildContainer()],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({ time: 300_000 });

    collector.on('collect', async (i) => {
      const idx = parseInt(i.customId.replace('sondage_vote_', ''));
      // Un seul vote par utilisateur (changer de vote autorisé)
      votes.forEach(s => s.delete(i.user.id));
      votes[idx].add(i.user.id);
      await i.update({
        components: [buildContainer()],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', async () => {
      await reply.edit({
        components: [buildContainer(true)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};

