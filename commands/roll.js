// commands/roll.js — .roll <min> <max>
// Génère un nombre aléatoire entre deux bornes — Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

module.exports = {
  name: 'roll',
  aliases: ['random', 'rand', 'rng', 'nombre'],
  description: 'Génère un nombre aléatoire entre deux bornes',

  async execute(message, args) {
    let min = parseInt(args[0]);
    let max = parseInt(args[1]);

    // Tolérance : .roll 10 → entre 1 et 10
    if (!isNaN(min) && isNaN(max)) { max = min; min = 1; }
    // Valeurs par défaut
    if (isNaN(min) || isNaN(max)) { min = 1; max = 100; }
    // Correction si inversé
    if (min > max) [min, max] = [max, min];

    if (min === max) {
      return message.reply({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('❌ Les deux bornes sont identiques.')
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const range = max - min;
    const avatarURL = message.author.displayAvatarURL({ size: 128, extension: 'png' });

    function buildResult() {
      const value = Math.floor(Math.random() * (max - min + 1)) + min;
      const pct   = (value - min) / range;
      const color = pct > 0.8 ? 0x57f287 : pct > 0.4 ? 0xfee75c : 0xed4245;
      const icon  = pct > 0.8 ? '🎉' : pct > 0.6 ? '😊' : pct > 0.3 ? '😐' : '😬';
      const filled = Math.round(pct * 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

      return { value, color, icon, bar };
    }

    let { value, color, icon, bar } = buildResult();

    function buildContainer(v, c, ic, b) {
      return new ContainerBuilder()
        .setAccentColor(c)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# 🎲 Nombre aléatoire\n` +
                `-# Bornes : ${min} → ${max}\n\n` +
                `${ic} **Résultat : \`${v}\`**\n\n` +
                `${b}\n` +
                `-# ${min}${' '.repeat(35)}${max}`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(avatarURL).setDescription('Avatar')
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('roll_again')
              .setLabel('Relancer')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎲'),
            new ButtonBuilder()
              .setCustomId('roll_change_bounds')
              .setLabel('Changer les bornes')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✏️')
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# Demandé par ${message.author.tag}`)
        );
    }

    const reply = await message.reply({
      components: [buildContainer(value, color, icon, bar)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id && (i.customId === 'roll_again' || i.customId === 'roll_change_bounds'),
      time: 120_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'roll_again') {
        ({ value, color, icon, bar } = buildResult());
        await i.update({
          components: [buildContainer(value, color, icon, bar)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (i.customId === 'roll_change_bounds') {
        const modal = new ModalBuilder()
          .setCustomId('roll_modal')
          .setTitle('Changer les bornes')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('roll_min')
                .setLabel('Minimum')
                .setStyle(TextInputStyle.Short)
                .setValue(String(min))
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('roll_max')
                .setLabel('Maximum')
                .setStyle(TextInputStyle.Short)
                .setValue(String(max))
                .setRequired(true)
            )
          );

        await i.showModal(modal);

        const sub = await i.awaitModalSubmit({
          filter: m => m.user.id === message.author.id && m.customId === 'roll_modal',
          time: 60_000,
        }).catch(() => null);

        if (!sub) return;

        const newMin = parseInt(sub.fields.getTextInputValue('roll_min'));
        const newMax = parseInt(sub.fields.getTextInputValue('roll_max'));

        if (isNaN(newMin) || isNaN(newMax)) {
          await sub.reply({ content: '❌ Valeurs invalides (nombres entiers requis).', flags: MessageFlags.Ephemeral });
          return;
        }
        if (newMin === newMax) {
          await sub.reply({ content: '❌ Les deux bornes sont identiques.', flags: MessageFlags.Ephemeral });
          return;
        }

        // Swap si inversé
        if (newMin > newMax) { min = newMax; max = newMin; }
        else { min = newMin; max = newMax; }

        ({ value, color, icon, bar } = buildResult());
        await sub.update({
          components: [buildContainer(value, color, icon, bar)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  },
};
