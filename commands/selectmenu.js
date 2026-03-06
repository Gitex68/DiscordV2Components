// commands/selectmenu.js — .selectmenu
// Démo de menu de sélection de couleur — Components V2

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

const couleurs = {
  rouge:  { label: 'Rouge',  emoji: '🔴', desc: 'Une couleur chaude',         color: 0xed4245, hex: '#ED4245' },
  vert:   { label: 'Vert',   emoji: '🟢', desc: 'La couleur de la nature',    color: 0x57f287, hex: '#57F287' },
  bleu:   { label: 'Bleu',   emoji: '🔵', desc: 'La couleur de Discord',      color: 0x5865f2, hex: '#5865F2' },
  jaune:  { label: 'Jaune',  emoji: '🟡', desc: 'Soleil et lumière',          color: 0xfee75c, hex: '#FEE75C' },
  violet: { label: 'Violet', emoji: '🟣', desc: 'Royauté et mystère',         color: 0xeb459e, hex: '#EB459E' },
  orange: { label: 'Orange', emoji: '🟠', desc: 'Énergie et créativité',      color: 0xe67e22, hex: '#E67E22' },
  blanc:  { label: 'Blanc',  emoji: '⚪', desc: 'Pureté et simplicité',       color: 0xffffff, hex: '#FFFFFF' },
  noir:   { label: 'Noir',   emoji: '⚫', desc: 'Élégance et profondeur',     color: 0x2b2d31, hex: '#2B2D31' },
};

module.exports = {
  name: 'selectmenu',
  aliases: ['menu'],
  description: 'Démo de menu de sélection Components V2',

  async execute(message, args, client) {
    const botAvatar = message.client.user.displayAvatarURL({ size: 128, extension: 'png' });

    function buildContainer(selected = null) {
      const couleur = selected ? couleurs[selected] : null;
      const accentColor = couleur ? couleur.color : 0xeb459e;

      const textContent = couleur
        ? `# ${couleur.emoji} ${couleur.label}\n` +
          `-# Couleur sélectionnée\n\n` +
          `**Hex** — \`${couleur.hex}\`\n` +
          `**Description** — ${couleur.desc}\n\n` +
          `L'accent du container a été mis à jour avec cette couleur.`
        : `# 📋 Démo — StringSelectMenu\n` +
          `-# Components V2\n\n` +
          `Choisis une couleur dans le menu ci-dessous.\n` +
          `La couleur d'accent du container changera en temps réel !`;

      return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(textContent)
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(botAvatar).setDescription('Icône du bot')
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_couleur_v2')
              .setPlaceholder(couleur ? `${couleur.emoji} ${couleur.label} sélectionné` : 'Choisir une couleur...')
              .addOptions(
                Object.entries(couleurs).map(([val, c]) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(val)
                    .setEmoji(c.emoji)
                    .setDescription(c.desc)
                    .setDefault(selected === val)
                )
              )
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# Sélectionné par ${message.author.tag} • expire dans 60s`
          )
        );
    }

    function buildExpired(selected) {
      const couleur = selected ? couleurs[selected] : null;
      const accentColor = 0x99aab5;
      const text = couleur
        ? `# ${couleur.emoji} ${couleur.label} — terminé\n-# Dernière sélection`
        : `# 📋 StringSelectMenu — expiré\n-# Aucune sélection`;
      return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ⏱️ Interaction expirée • ${message.author.tag}`)
        );
    }

    let current = null;
    const reply = await message.reply({
      components: [buildContainer()],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 60_000,
    });

    collector.on('collect', async (i) => {
      current = i.values[0];
      await i.update({
        components: [buildContainer(current)],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', () => {
      reply.edit({
        components: [buildExpired(current)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};

