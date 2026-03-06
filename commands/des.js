// commands/des.js — .des [faces]
// Lance un ou plusieurs dés avec bouton pour relancer — Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

function rollDice(faces) {
  return Math.floor(Math.random() * faces) + 1;
}

// Images de dés selon les faces courantes
function getDiceImage(faces, value) {
  // Pour D6, on utilise des emojis chiffrés — pour les autres, image générique
  const d6faces = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
  if (faces === 6) return { emoji: d6faces[value - 1], url: null };
  return { emoji: '🎲', url: null };
}

module.exports = {
  name: 'des',
  aliases: ['dice', 'roll', 'd'],
  description: 'Lance un dé (par défaut D6)',

  async execute(message, args, client) {
    const faces = Math.min(Math.max(parseInt(args[0]) || 6, 2), 1000);
    let result = rollDice(faces);
    let rollCount = 1;

    function buildContainer(val, count) {
      const pct = val / faces;
      const icon = pct > 0.8 ? '🎉' : pct > 0.5 ? '😊' : pct > 0.2 ? '😐' : '😬';
      const color = pct > 0.8 ? 0x57f287 : pct > 0.5 ? 0xfee75c : 0xed4245;
      const bar = buildBar(val, faces);
      const { emoji } = getDiceImage(faces, val);

      // Thumbnail : avatar de l'utilisateur avec un emoji de dé en superposition
      const avatarURL = message.author.displayAvatarURL({ size: 128, extension: 'png' });

      return new ContainerBuilder()
        .setAccentColor(color)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# 🎲 Dé à ${faces} faces\n` +
                `-# Lancer n°${count}\n\n` +
                `${icon} **Résultat : ${val}** / ${faces}\n\n` +
                `${bar}\n` +
                `-# ${pct > 0.8 ? 'Excellent !' : pct > 0.5 ? 'Pas mal !' : pct > 0.2 ? 'Bof...' : 'Aïe...'}`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder()
                .setURL(avatarURL)
                .setDescription(`Avatar de ${message.author.username}`)
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('des_reroll')
              .setLabel(`Relancer le D${faces}`)
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎲'),
            new ButtonBuilder()
              .setCustomId('des_stop')
              .setLabel('Arrêter')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🛑'),
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Lancé par ${message.author.tag} • max 10 lancers`)
        );
    }

    function buildExpired(val, count) {
      const pct = val / faces;
      const color = 0x99aab5;
      const bar = buildBar(val, faces);
      const icon = pct > 0.8 ? '🎉' : pct > 0.5 ? '😊' : pct > 0.2 ? '😐' : '😬';

      return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🎲 Dé à ${faces} faces — terminé\n` +
            `-# ${count} lancer(s) au total\n\n` +
            `${icon} Dernier résultat : **${val}** / ${faces}\n${bar}`
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Lancé par ${message.author.tag}`)
        );
    }

    const reply = await message.reply({
      components: [buildContainer(result, rollCount)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 60_000,
      max: 10,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'des_stop') {
        collector.stop('user');
        return;
      }
      result = rollDice(faces);
      rollCount++;
      await i.update({
        components: [buildContainer(result, rollCount)],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', () => {
      reply.edit({
        components: [buildExpired(result, rollCount)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};

function buildBar(val, faces) {
  const pct = val / faces;
  const filled = Math.round(pct * 10);
  const empty  = 10 - filled;
  const barFull  = '█';
  const barEmpty = '░';
  return `\`${barFull.repeat(filled)}${barEmpty.repeat(empty)}\` ${Math.round(pct * 100)}%`;
}

