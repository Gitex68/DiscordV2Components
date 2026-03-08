// index.js — Bot préfixe "." avec Components V2

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const { token } = require('./config.json');
const fs = require('fs');
const path = require('path');

// ─── Ticket system ────────────────────────────────────────────────────────────
const db      = require('./tickets/ticketDB.js');
const manager = require('./tickets/ticketManager.js');
const { ensureTicketAccess } = require('./utils/ticketUtils.js');

// ─── Logs serveur ─────────────────────────────────────────────────────────────
const logManager = require('./logs/logManager.js');

// ─── Tracker d'activité ───────────────────────────────────────────────────────
const activityTracker = require('./activity/activityTracker.js');

// ─── Compteurs dynamiques (salons vocaux stats) ───────────────────────────────
const counterManager = require('./utils/counterManager.js');

// ─── Jeux gratuits (Epic, Steam) ──────────────────────────────────────────────
const freeGamesManager = require('./freegames/freeGamesManager.js');

// ─── Config admin (rôle d'accès, mute custom) ─────────────────────────────────
const adminConfigDB = require('./utils/adminConfigDB.js');

// ─── Salons vocaux temporaires ────────────────────────────────────────────────
const tempVoiceDB      = require('./utils/tempVoiceDB.js');
const tempVoiceManager = require('./utils/tempVoiceManager.js');

// ─── Système de règlement ────────────────────────────────────────────────────
const rulesDB = require('./utils/rulesDB.js');

// ─── Système Minecraft Status ─────────────────────────────────────────────────
const mcManager = require('./utils/mcManager.js');
const mcDB      = require('./utils/mcDB.js');

// ─── Mémoire salon vocal précédent (anti-intrusion lock) ─────────────────────
// Clé : `${guildId}:${userId}` → channelId du dernier salon vocal légitime
const lastVoiceChannel = new Map();

const PREFIX = '.';

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// ─── Chargement des commandes ─────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.name && command.execute) {
    client.commands.set(command.name, command);
    if (command.aliases) {
      command.aliases.forEach(alias => client.commands.set(alias, command));
    }
    const aliasStr = command.aliases ? ` (alias: ${command.aliases.map(a => PREFIX + a).join(', ')})` : '';
    console.log(`✅ Commande chargée : ${PREFIX}${command.name}${aliasStr}`);
  }
}

// ─── Prêt ─────────────────────────────────────────────────────────────────────
client.once('clientReady', () => {
  console.log(`\n🤖 Bot connecté : ${client.user.tag}`);
  console.log(`📡 Serveurs     : ${client.guilds.cache.size}`);
  console.log(`🔑 Préfixe      : "${PREFIX}"`);
  console.log('─────────────────────────────────────');

  // ── Initialisation du tracker d'activité ──────────────────────────────────
  activityTracker.init(client);

  // ── Initialiser le tracker d'activité ──────────────────────────────────────
  activityTracker.init(client);

  // ── Initialisation des compteurs dynamiques ────────────────────────────────
  counterManager.init(client);

  // ── Initialisation du système Jeux Gratuits ────────────────────────────────
  freeGamesManager.init(client);

  // ── Initialisation du tracker Minecraft ───────────────────────────────────
  mcManager.init(client);

  // ── Suppression automatique des tickets fermés ──────────────────────────────
  // Scan toutes les 60 secondes. Supprime les tickets fermés dont closedAt
  // dépasse le délai configuré (config.closedDeleteHours, par défaut 24h).
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const config = db.getConfig(guild.id);
        const hours = config.closedDeleteHours ?? 24;
        if (hours <= 0) continue; // 0 = désactivé

        const allTickets = db.getAllTickets(guild.id, { status: 'closed' });
        const now = Date.now();
        const limitMs = hours * 3_600_000;

        for (const ticket of allTickets) {
          if (!ticket.closedAt) continue;
          if (now - ticket.closedAt < limitMs) continue;

          // Délai atteint → supprimer le salon et la DB
          const channel = guild.channels.cache.get(ticket.channelId);
          if (channel) {
            await channel.delete(`Suppression automatique — ticket fermé depuis +${hours}h`).catch(() => {});
          }
          db.deleteTicket(guild.id, ticket.channelId);
          console.log(`[AutoDelete] Ticket #${String(ticket.id).padStart(4, '0')} supprimé (guild: ${guild.id})`);
        }
      } catch (err) {
        console.error('[AutoDelete] Erreur:', err.message);
      }
    }
  }, 60_000); // toutes les 60 secondes
});

// ─── Gestion des messages (commandes préfixées) ───────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ── Toujours tracker le message, commande ou non ───────────────────────────
  activityTracker.onMessage(message);

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command) return;

  // ── Vérification accès admin ───────────────────────────────────────────────
  // Une commande adminOnly nécessite : ManageGuild OU le rôle adminRoleId configuré
  if (command.adminOnly && message.guild) {
    if (!adminConfigDB.hasAdminAccess(message.member)) {
      // Supprimer le message de commande (silencieux si pas la perm)
      message.delete().catch(() => {});
      // Envoyer la réponse en DM pour que seul l'auteur la voit
      message.author.send({
        components: [
          new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                '# ❌ Accès refusé\n' +
                '-# Tu n\'as pas les permissions nécessaires pour utiliser cette commande.\n\n' +
                `> Requiert la permission **Gérer le serveur** ou le rôle admin configuré via \`.aconfig\`.\n` +
                `-# Serveur : **${message.guild.name}**`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {
        // DM désactivés → message temporaire dans le salon (supprimé après 5s)
        message.channel.send({
          components: [
            new ContainerBuilder().setAccentColor(0xed4245)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `# ❌ Accès refusé\n-# <@${message.author.id}> — Permission insuffisante.`
                )
              ),
          ],
          flags: MessageFlags.IsComponentsV2,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
      });
      return;
    }
  }

  try {
    await command.execute(message, args, client);
    if (!command.adminOnly && message.guild) {
      logManager.onCmdUsed(message.guild, {
        user:        message.author,
        channel:     message.channel,
        commandName,
        args,
      }).catch(() => {});
    }
  } catch (error) {
    console.error(`❌ Erreur dans ${PREFIX}${commandName} :`, error);
    message.reply('❌ Une erreur est survenue lors de l\'exécution de la commande.');
  }
});

// ─── Gestion des interactions (boutons, menus, modals) ────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ── Boutons ─────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {

    // Boutons classiques (.boutons) — réponse Container V2
    const btnMap = {
      btn_primary:   { label: 'Primary',   color: 0x5865f2, emoji: '💙' },
      btn_secondary: { label: 'Secondary', color: 0x4f545c, emoji: '🩶' },
      btn_success:   { label: 'Success',   color: 0x57f287, emoji: '✅' },
      btn_danger:    { label: 'Danger',    color: 0xed4245, emoji: '🚫' },
    };
    if (btnMap[interaction.customId]) {
      const r = btnMap[interaction.customId];
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(r.color)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# ${r.emoji} Bouton ${r.label} cliqué !\n` +
                `-# Style \`${r.label}\` · Components V2\n\n` +
                `Interagi par ${interaction.user} depuis la commande \`.boutons\`.`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // Bouton ping relancer (.ping)
    if (interaction.customId === 'ping_reroll') {
      const ws = interaction.client.ws.ping;
      const pct = Math.min(ws / 300, 1);
      const color = ws < 80 ? 0x57f287 : ws < 150 ? 0xfee75c : 0xed4245;
      const icon  = ws < 80 ? '🟢' : ws < 150 ? '🟡' : '🔴';
      const filled = Math.round((1 - pct) * 10);
      const bar = `\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\``;
      const botAvatar = interaction.client.user.displayAvatarURL({ size: 128, extension: 'png' });
      return interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(color)
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    `# 📡 Pong !\n-# Latence actualisée\n\n` +
                    `${icon} **WebSocket** — \`${ws}ms\`\n` +
                    `${bar}\n` +
                    `-# ${ws < 80 ? 'Excellent !' : ws < 150 ? 'Correct' : 'Latence élevée'}`
                  )
                )
                .setThumbnailAccessory(
                  new ThumbnailBuilder().setURL(botAvatar).setDescription('Avatar du bot')
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ping_reroll').setLabel('Actualiser').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setLabel('Discord Status').setStyle(ButtonStyle.Link).setURL('https://discordstatus.com'),
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`-# Actualisé par ${interaction.user.tag}`)
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // Boutons Components V2 (.cv2demo) — réponse Container V2
    const cv2BtnMap = {
      cv2_btn_primary: { label: 'Primary', color: 0x5865f2, emoji: '💙' },
      cv2_btn_success: { label: 'Success', color: 0x57f287, emoji: '✅' },
      cv2_btn_danger:  { label: 'Danger',  color: 0xed4245, emoji: '🚫' },
    };
    if (cv2BtnMap[interaction.customId]) {
      const r = cv2BtnMap[interaction.customId];
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(r.color)
            .addTextDisplayComponents(
              new TextDisplayBuilder()
                .setContent(`${r.emoji} **Bouton ${r.label} cliqué !**\nInteragit par ${interaction.user} via un composant V2`),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // Bouton note profil (.cv2profil) → ouvre un modal
    if (interaction.customId.startsWith('profil_note_')) {
      const targetId = interaction.customId.replace('profil_note_', '');
      const modal = new ModalBuilder()
        .setCustomId(`modal_profil_note_${targetId}`)
        .setTitle('📝 Laisser une note');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('note_texte')
            .setLabel('Ta note sur cet utilisateur')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Écris ta note ici...')
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(300),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('note_score')
            .setLabel('Score (1-10)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 7')
            .setRequired(false)
            .setMaxLength(2),
        ),
      );
      return interaction.showModal(modal);
    }

    // Bouton → modal de contact (.modal)
    if (interaction.customId === 'open_modal') {
      const modal = new ModalBuilder()
        .setCustomId('formulaire_modal')
        .setTitle('📝 Formulaire de contact');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_nom')
            .setLabel('Ton nom / pseudo')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Jean Dupont')
            .setRequired(true)
            .setMaxLength(50),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_message')
            .setLabel('Ton message')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Écris ton message ici...')
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(500),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_note')
            .setLabel('Note sur 10 (optionnel)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 8')
            .setRequired(false)
            .setMaxLength(2),
        ),
      );
      return interaction.showModal(modal);
    }

    // ── Boutons TICKETS ─────────────────────────────────────────────────────────

    // Bouton "Ouvrir un ticket" depuis le panel (.tpanel)
    if (interaction.customId === 'ticket_open') {
      if (!interaction.guild) return interaction.reply({ content: '❌ Serveur introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      if (!config.categoryId) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle('❌ Tickets non configurés')
              .setDescription('Le système de tickets n\'est pas encore configuré. Contactez un administrateur.'),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      // Vérifier limite maxOpen
      const openTickets = db.getOpenTicketsByUser(interaction.guild.id, interaction.user.id);
      if (openTickets.length >= (config.maxOpen || 3)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle('❌ Limite atteinte')
              .setDescription(`Tu as déjà **${openTickets.length}** ticket(s) ouvert(s) (maximum : **${config.maxOpen || 3}**).\nFerme un ticket existant avant d'en ouvrir un nouveau.`)
              .addFields({ name: '📂 Tes tickets ouverts', value: openTickets.map(t => `<#${t.channelId}>`).join('\n') }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      const tags = config.tags?.length ? config.tags : ['Support', 'Bug', 'Commande', 'Autre'];
      // Afficher le menu de sélection de tag
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_tag_${interaction.user.id}_`)
        .setPlaceholder('Choisissez une catégorie...')
        .addOptions(
          tags.map(tag =>
            new StringSelectMenuOptionBuilder()
              .setLabel(tag)
              .setValue(tag)
              .setDescription(`Ouvrir un ticket : ${tag}`)
          )
        );
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎫 Ouvrir un ticket')
            .setDescription('Sélectionne la catégorie correspondant à ta demande, puis décris ton problème dans le ticket.'),
        ],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Bouton fermer ticket
    if (interaction.customId.startsWith('ticket_close_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_close_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      const isOwner = interaction.user.id === ticket.ownerId;
      const isStaff = manager.hasSupport(interaction.member, config);
      if (!isOwner && !isStaff) {
        return interaction.reply({ content: '❌ Tu n\'as pas la permission de fermer ce ticket.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await manager.closeTicketChannel(interaction.guild, config, ticket, interaction.member);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle('🔒 Ticket fermé')
              .setDescription('Le ticket a été fermé avec succès.'),
          ],
        });
      } catch (err) {
        console.error('ticket_close error:', err);
        return interaction.editReply({ content: '❌ Une erreur est survenue lors de la fermeture.' });
      }
    }

    // Bouton claim ticket
    if (interaction.customId.startsWith('ticket_claim_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_claim_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      if (!manager.hasClaim(interaction.member, config)) {
        return interaction.reply({ content: '❌ Réservé au staff ou au rôle claim.', flags: MessageFlags.Ephemeral });
      }
      if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle('❌ Déjà pris en charge')
              .setDescription(`Ce ticket est déjà pris en charge par <@${ticket.claimedBy}>.`),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await manager.claimTicketChannel(interaction.guild, config, ticket, interaction.member);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xfee75c)
              .setTitle('🛡️ Ticket pris en charge')
              .setDescription('Tu as pris en charge ce ticket.'),
          ],
        });
      } catch (err) {
        console.error('ticket_claim error:', err);
        return interaction.editReply({ content: '❌ Erreur lors du claim.' });
      }
    }

    // Bouton unclaim ticket
    if (interaction.customId.startsWith('ticket_unclaim_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_unclaim_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      if (!manager.hasSupport(interaction.member, config)) {
        return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await manager.unclaimTicketChannel(interaction.guild, config, ticket, interaction.member);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x99aab5)
              .setTitle('🔓 Ticket libéré')
              .setDescription('Tu as libéré ce ticket.'),
          ],
        });
      } catch (err) {
        console.error('ticket_unclaim error:', err);
        return interaction.editReply({ content: '❌ Erreur lors du unclaim.' });
      }
    }

    // Bouton réouvrir ticket
    if (interaction.customId.startsWith('ticket_reopen_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_reopen_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      if (!manager.hasSupport(interaction.member, config)) {
        return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await manager.reopenTicketChannel(interaction.guild, config, ticket, interaction.member);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle('🔓 Ticket réouvert')
              .setDescription('Le ticket a été réouvert avec succès.'),
          ],
        });
      } catch (err) {
        console.error('ticket_reopen error:', err);
        return interaction.editReply({ content: '❌ Erreur lors de la réouverture.' });
      }
    }

    // Bouton supprimer ticket — avec confirmation
    if (interaction.customId.startsWith('ticket_delete_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_delete_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      if (!manager.hasSupport(interaction.member, config)) {
        return interaction.reply({ content: '❌ Réservé au staff.', flags: MessageFlags.Ephemeral });
      }
      // Demander confirmation
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_delete_confirm_${channelId}`)
          .setLabel('Supprimer définitivement')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId(`ticket_delete_cancel_${channelId}`)
          .setLabel('Annuler')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✖️'),
      );
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('⚠️ Confirmer la suppression')
            .setDescription(
              `Tu es sur le point de **supprimer définitivement** le ticket #${String(ticket.id).padStart(4, '0')}.\n\n` +
              '❌ **Cette action est irréversible.** Le salon sera supprimé.\n' +
              '*Conseil : génère un transcript avant de supprimer.*'
            ),
        ],
        components: [confirmRow],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Bouton confirmer suppression ticket
    if (interaction.customId.startsWith('ticket_delete_confirm_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_delete_confirm_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await manager.deleteTicketChannel(interaction.guild, config, ticket, interaction.member);
        // Le salon est supprimé, on ne peut plus reply — si le salon est différent on répond
        return interaction.editReply({ content: '🗑️ Ticket supprimé.' }).catch(() => {});
      } catch (err) {
        console.error('ticket_delete error:', err);
        return interaction.editReply({ content: '❌ Erreur lors de la suppression.' });
      }
    }

    // Bouton annuler suppression ticket
    if (interaction.customId.startsWith('ticket_delete_cancel_')) {
      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ Suppression annulée')
            .setDescription('Le ticket n\'a pas été supprimé.'),
        ],
        components: [],
      });
    }

    // Bouton transcript ticket
    if (interaction.customId.startsWith('ticket_transcript_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('ticket_transcript_', '');
      const ticket = db.getTicketByChannel(interaction.guild.id, channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', flags: MessageFlags.Ephemeral });
      const config = db.getConfig(interaction.guild.id);
      if (!manager.hasSupport(interaction.member, config) && interaction.user.id !== ticket.ownerId) {
        return interaction.reply({ content: '❌ Permission insuffisante.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) return interaction.editReply({ content: '❌ Salon introuvable.' });
        const html = await manager.generateTranscript(interaction.guild, ticket);
        if (!html) return interaction.editReply({ content: '❌ Impossible de générer le transcript.' });
        const ticketNum = String(ticket.id).padStart(4, '0');
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle(`📄 Transcript — Ticket #${ticketNum}`)
              .setDescription(`Transcript HTML généré — ouvre le fichier dans un navigateur.`)
              .addFields(
                { name: '🏷️ Catégorie',   value: ticket.tag,              inline: true },
                { name: '👤 Propriétaire', value: `<@${ticket.ownerId}>`, inline: true },
                { name: '💬 Messages',    value: `${channel.messages?.cache?.size ?? '?'}`, inline: true },
              ),
          ],
          files: [{
            attachment: Buffer.from(html, 'utf8'),
            name: `transcript-${ticketNum}.html`,
          }],
        });
      } catch (err) {
        console.error('ticket_transcript error:', err);
        return interaction.editReply({ content: '❌ Erreur lors de la génération du transcript.' });
      }
    }

    // ── Boutons panel salon vocal temporaire ────────────────────────────────
    if (interaction.customId.startsWith('vc_')) {
      if (!interaction.guild) return interaction.reply({ content: '❌ Serveur introuvable.', flags: MessageFlags.Ephemeral });
      const parts    = interaction.customId.split('_');
      const action   = parts[1];           // lock | limit | rename | transfer | kick | delete
      const channelId = parts.slice(2).join('_'); // channelId (peut contenir des _)

      const chData = tempVoiceDB.getChannel(channelId);
      if (!chData) {
        return interaction.reply({ content: '❌ Ce salon temporaire n\'existe plus.', flags: MessageFlags.Ephemeral });
      }

      const isOwner = interaction.user.id === chData.ownerId;
      if (!isOwner) {
        return interaction.reply({ content: '❌ Seul le propriétaire du salon peut utiliser ces boutons.', flags: MessageFlags.Ephemeral });
      }

      const voiceChannel = interaction.guild.channels.cache.get(channelId);
      if (!voiceChannel) {
        tempVoiceDB.unregisterChannel(channelId);
        return interaction.reply({ content: '❌ Salon introuvable — il a probablement été supprimé.', flags: MessageFlags.Ephemeral });
      }

      const vcCfg = tempVoiceDB.getConfig(interaction.guild.id);

      // ── Verrouillage ─────────────────────────────────────────────────────
      if (action === 'lock') {
        if (!vcCfg.allowLock) return interaction.reply({ content: '❌ Le verrouillage est désactivé sur ce serveur.', flags: MessageFlags.Ephemeral });
        await tempVoiceManager.toggleLock(voiceChannel, interaction.guild);
        const fresh = tempVoiceDB.getChannel(channelId);
        const panel = tempVoiceManager.buildControlPanel(voiceChannel, chData.ownerId, vcCfg);
        return interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
      }

      // ── Limite ────────────────────────────────────────────────────────────
      if (action === 'limit') {
        if (!vcCfg.allowLimit) return interaction.reply({ content: '❌ La modification de limite est désactivée sur ce serveur.', flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder()
          .setCustomId(`vc_modal_limit_${channelId}`)
          .setTitle('👥 Limite de membres')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('limit')
                .setLabel('Limite (0 = illimitée, max 99)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(`Actuelle : ${voiceChannel.userLimit ?? 0}`)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        let mi;
        try { mi = await interaction.awaitModalSubmit({ filter: m => m.customId === `vc_modal_limit_${channelId}`, time: 120_000 }); }
        catch { return; }
        await mi.deferUpdate();
        const val = parseInt(mi.fields.getTextInputValue('limit'), 10);
        if (!isNaN(val) && val >= 0 && val <= 99) {
          await tempVoiceManager.setLimit(voiceChannel, val);
        }
        const panel = tempVoiceManager.buildControlPanel(voiceChannel, chData.ownerId, vcCfg);
        return interaction.message.edit({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      // ── Renommer ──────────────────────────────────────────────────────────
      if (action === 'rename') {
        if (!vcCfg.allowRename) return interaction.reply({ content: '❌ Le renommage est désactivé sur ce serveur.', flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder()
          .setCustomId(`vc_modal_rename_${channelId}`)
          .setTitle('✏️ Renommer le salon')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('name')
                .setLabel('Nouveau nom (max 100 car.)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(voiceChannel.name)
                .setRequired(true)
                .setMaxLength(100)
            )
          );
        await interaction.showModal(modal);
        let mi;
        try { mi = await interaction.awaitModalSubmit({ filter: m => m.customId === `vc_modal_rename_${channelId}`, time: 120_000 }); }
        catch { return; }
        await mi.deferUpdate();
        const name = mi.fields.getTextInputValue('name').trim();
        if (name) await tempVoiceManager.renameChannel(voiceChannel, name);
        const panel = tempVoiceManager.buildControlPanel(voiceChannel, chData.ownerId, vcCfg);
        return interaction.message.edit({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      // ── Transfert de propriété ────────────────────────────────────────────
      if (action === 'transfer') {
        const members = voiceChannel.members.filter(m => !m.user.bot && m.id !== interaction.user.id);
        if (members.size === 0) {
          return interaction.reply({ content: '❌ Il n\'y a personne d\'autre dans le salon pour transférer la propriété.', flags: MessageFlags.Ephemeral });
        }
        // Proposer un menu de sélection
        const options = members.map(m =>
          new StringSelectMenuOptionBuilder()
            .setLabel(m.displayName)
            .setValue(m.id)
            .setDescription(m.user.tag)
        ).slice(0, 25);

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`vc_transfer_select_${channelId}`)
            .setPlaceholder('Choisir le nouveau propriétaire...')
            .addOptions(options)
        );
        return interaction.reply({
          components: [
            new ContainerBuilder().setAccentColor(0x5865f2)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# 👑 Transférer la propriété\nChoisir le nouveau propriétaire de **${voiceChannel.name}** :`
              ))
              .addActionRowComponents(selectRow),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }

      // ── Expulser un membre ────────────────────────────────────────────────
      if (action === 'kick') {
        const members = voiceChannel.members.filter(m => !m.user.bot && m.id !== interaction.user.id);
        if (members.size === 0) {
          return interaction.reply({ content: '❌ Il n\'y a personne d\'autre à expulser.', flags: MessageFlags.Ephemeral });
        }
        const options = members.map(m =>
          new StringSelectMenuOptionBuilder()
            .setLabel(m.displayName)
            .setValue(m.id)
            .setDescription(m.user.tag)
        ).slice(0, 25);

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`vc_kick_select_${channelId}`)
            .setPlaceholder('Choisir le membre à expulser...')
            .addOptions(options)
        );
        return interaction.reply({
          components: [
            new ContainerBuilder().setAccentColor(0xed4245)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# 👢 Expulser du salon\nChoisir le membre à retirer de **${voiceChannel.name}** :`
              ))
              .addActionRowComponents(selectRow),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }

      // ── Supprimer le salon ────────────────────────────────────────────────
      if (action === 'delete') {
        tempVoiceDB.unregisterChannel(channelId);
        await interaction.deferUpdate().catch(() => {});
        await voiceChannel.delete('[TempVoice] Supprimé par le propriétaire').catch(() => {});
        return;
      }

      return;
    }

    // ── Menus select salon vocal temporaire ─────────────────────────────────
    // (gérés dans isStringSelectMenu, mais le return doit se faire ici)

    return;
  }
  if (interaction.isStringSelectMenu()) {

    // ── Transfert propriété salon vocal temp ────────────────────────────────
    if (interaction.customId.startsWith('vc_transfer_select_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('vc_transfer_select_', '');
      const chData = tempVoiceDB.getChannel(channelId);
      if (!chData || interaction.user.id !== chData.ownerId) {
        return interaction.reply({ content: '❌ Action non autorisée.', flags: MessageFlags.Ephemeral });
      }
      const voiceChannel = interaction.guild.channels.cache.get(channelId);
      if (!voiceChannel) return interaction.reply({ content: '❌ Salon introuvable.', flags: MessageFlags.Ephemeral });

      const newOwnerId = interaction.values[0];
      const newOwner   = interaction.guild.members.cache.get(newOwnerId);
      if (!newOwner) return interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral });

      await tempVoiceManager.transferOwnership(voiceChannel, interaction.guild, chData.ownerId, newOwner);
      const vcCfg = tempVoiceDB.getConfig(interaction.guild.id);

      return interaction.update({
        components: [
          new ContainerBuilder().setAccentColor(0x57f287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# ✅ Propriété transférée\n<@${newOwnerId}> est maintenant propriétaire de **${voiceChannel.name}**.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // ── Expulser membre salon vocal temp ─────────────────────────────────────
    if (interaction.customId.startsWith('vc_kick_select_')) {
      if (!interaction.guild) return;
      const channelId = interaction.customId.replace('vc_kick_select_', '');
      const chData = tempVoiceDB.getChannel(channelId);
      if (!chData || interaction.user.id !== chData.ownerId) {
        return interaction.reply({ content: '❌ Action non autorisée.', flags: MessageFlags.Ephemeral });
      }
      const targetId = interaction.values[0];
      await tempVoiceManager.kickFromChannel(interaction.guild, targetId);
      return interaction.update({
        components: [
          new ContainerBuilder().setAccentColor(0x57f287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# ✅ Membre expulsé\n<@${targetId}> a été retiré du salon vocal.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // ─── Règlement : validation ───────────────────────────────────────────────
    if (interaction.customId === 'rules_validate') {
      if (!interaction.guild || !interaction.member) return;
      const rulesCfg = rulesDB.getConfig(interaction.guild.id);
      if (!rulesCfg.enabled) {
        return interaction.reply({
          components: [new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Le système de règlement n\'est pas activé.'))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      try {
        const member = interaction.member;
        // Retirer le rôle de restriction si présent
        if (rulesCfg.joinRoleId && member.roles.cache.has(rulesCfg.joinRoleId)) {
          await member.roles.remove(rulesCfg.joinRoleId, 'Règlement accepté').catch(() => {});
        }
        // Attribuer le rôle vérifié
        if (rulesCfg.verifiedRoleId) {
          const role = interaction.guild.roles.cache.get(rulesCfg.verifiedRoleId);
          if (role) await member.roles.add(role, 'Règlement accepté').catch(() => {});
        }
        return interaction.reply({
          components: [new ContainerBuilder().setAccentColor(0x57f287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              '✅ **Bienvenue !** Tu as accepté le règlement et tu as maintenant accès au serveur.'
            ))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error('[rules_validate] Erreur:', err.message);
        return interaction.reply({
          components: [new ContainerBuilder().setAccentColor(0xed4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('❌ Une erreur s\'est produite.'))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
    }

    // ─── Règlement : panel variables (persistant) ─────────────────────────────
    if (interaction.customId === 'rconfig_variables') {
      const rconfigCmd = client.commands?.get('rconfig');
      if (!rconfigCmd?.buildVariablesPanel) return interaction.deferUpdate().catch(() => {});
      return interaction.reply({
        components: [rconfigCmd.buildVariablesPanel()],
        flags:      MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'rconfig_variables_close') {
      return interaction.deleteReply().catch(() => interaction.deferUpdate().catch(() => {}));
    }

    // Sélection info composant V2 (.cv2demo) — réponse Container V2
    if (interaction.customId === 'cv2_select_demo') {
      const infos = {
        container: {
          emoji: '📦', title: 'Container',
          desc: 'Regroupe des composants avec une barre de couleur latérale (comme un embed).\nPeut contenir : `TextDisplay`, `Section`, `Separator`, `MediaGallery`, `ActionRow`, `File`.',
        },
        section: {
          emoji: '📋', title: 'Section',
          desc: '1 à 3 `TextDisplay` côte à côte + 1 accessoire (`Thumbnail` ou `Button`).\nIdéal pour afficher un profil avec avatar.',
        },
        textdisplay: {
          emoji: '��', title: 'TextDisplay',
          desc: 'Texte markdown jusqu\'à 4 000 caractères.\nSupporte **gras**, *italique*, `code`, > citations, [liens](https://discord.js.org), -# sous-titres.',
        },
        mediagallery: {
          emoji: '🖼️', title: 'MediaGallery',
          desc: 'Grille d\'images (jusqu\'à 10 items).\nChaque image peut avoir une description optionnelle (max 1 024 chars).',
        },
        separator: {
          emoji: '➖', title: 'Separator',
          desc: 'Séparateur vertical entre composants.\n- Spacing : `Small` (1) ou `Large` (2)\n- `setDivider(true)` : affiche un trait visible',
        },
      };
      const info = infos[interaction.values[0]];
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addTextDisplayComponents(
              new TextDisplayBuilder()
                .setContent(`## ${info.emoji} ${info.title}\n${info.desc}`),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // Sélection couleur (.selectmenu) — géré localement dans selectmenu.js via collecteur
    // Le customId 'select_couleur_v2' est intercepté par le collecteur dans la commande
    // On ignore ici pour éviter un double traitement
    if (interaction.customId === 'select_couleur_v2') {
      return; // géré par collecteur local dans selectmenu.js
    }

    // ── Menus TICKETS ────────────────────────────────────────────────────────
    // Sélection du tag ticket (depuis .ticket ou bouton ticket_open du panel)
    if (interaction.customId.startsWith('ticket_tag_')) {
      if (!interaction.guild) return interaction.reply({ content: '❌ Serveur introuvable.', flags: MessageFlags.Ephemeral });
      // Format customId: ticket_tag_{authorId}_{encodedReason}
      const parts = interaction.customId.split('_');
      // parts[0]=ticket, parts[1]=tag, parts[2]=authorId, parts[3..]=encodedReason (peut être vide)
      const authorId = parts[2];
      const encodedReason = parts.slice(3).join('_');
      const reason = encodedReason ? decodeURIComponent(encodedReason) : '';
      const tag = interaction.values[0];

      // Vérifier que c'est bien l'auteur qui interagit
      if (interaction.user.id !== authorId) {
        return interaction.reply({ content: '❌ Ce menu ne t\'est pas destiné.', flags: MessageFlags.Ephemeral });
      }

      const config = db.getConfig(interaction.guild.id);
      if (!config.categoryId) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Tickets non configurés').setDescription('Aucune catégorie configurée.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Vérifier limite maxOpen
      const openTickets = db.getOpenTicketsByUser(interaction.guild.id, authorId);
      if (openTickets.length >= (config.maxOpen || 3)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Limite atteinte')
            .setDescription(`Tu as déjà **${openTickets.length}** ticket(s) ouvert(s) (max : **${config.maxOpen || 3}**).`)
            .addFields({ name: '📂 Tes tickets ouverts', value: openTickets.map(t => `<#${t.channelId}>`).join('\n') })],
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const owner     = await interaction.guild.members.fetch(authorId).catch(() => null);
        const ownerUser = owner?.user || interaction.user;
        const result    = await manager.createTicketChannel(interaction.guild, config, ownerUser, tag, reason);
        if (!result.success) {
          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Impossible d\'ouvrir le ticket').setDescription(result.message || 'Une erreur est survenue.')],
          });
        }
        // ── S'assurer que le membre peut accéder au ticket même s'il est mute ──
        await ensureTicketAccess(interaction.guild, authorId);

        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Ticket ouvert !')
            .setDescription(`Ton ticket a été créé : ${result.channel}\n\n*Un membre du staff va te répondre dès que possible.*`)],
        });
      } catch (err) {
        console.error('ticket_tag select error:', err);
        return interaction.editReply({ content: '❌ Erreur lors de la création du ticket.' });
      }
    }

  } // fin isStringSelectMenu

  // ── Soumission de modal ──────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {

    // ── Modaux tconfig — messages personnalisés ──────────────────────────────

    if (interaction.customId === 'tconfig_modal_welcome') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const text = interaction.fields.getTextInputValue('welcome_text').trim();
      db.setConfig(interaction.guild.id, 'welcomeMessage', text);
      return interaction.reply({
        components: [
          new ContainerBuilder().setAccentColor(0x57f287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# ✅ Message d'accueil mis à jour\n` +
              (text ? `**Aperçu :**\n> ${text.replace(/\n/g, '\n> ').slice(0, 300)}` : '*Message par défaut rétabli.*')
            )),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'tconfig_modal_close') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const text = interaction.fields.getTextInputValue('close_text').trim();
      db.setConfig(interaction.guild.id, 'closeMessage', text);
      return interaction.reply({
        components: [
          new ContainerBuilder().setAccentColor(0x57f287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# ✅ Message de fermeture mis à jour\n` +
              (text ? `**Aperçu :**\n> ${text.replace(/\n/g, '\n> ').slice(0, 300)}` : '*Message par défaut rétabli.*')
            )),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'tconfig_modal_panel') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const title = interaction.fields.getTextInputValue('panel_title').trim();
      const desc  = interaction.fields.getTextInputValue('panel_desc').trim();
      db.setConfig(interaction.guild.id, 'panelTitle',       title);
      db.setConfig(interaction.guild.id, 'panelDescription', desc);
      return interaction.reply({
        components: [
          new ContainerBuilder().setAccentColor(0x57f287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# ✅ Panel mis à jour\n` +
              `**Titre :** ${title || '*Titre par défaut*'}\n` +
              `**Description :**\n${desc ? `> ${desc.replace(/\n/g, '\n> ').slice(0, 300)}` : '*Description par défaut*'}\n\n` +
              `-# Utilise \`.tpanel\` pour renvoyer le panel avec les nouveaux textes.`
            )),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // ── Modaux tconfig — set paramètre individuel ────────────────────────────

    // ── Modal ajout tags ─────────────────────────────────────────────────────
    if (interaction.customId === 'tconfig_modal_addtags') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const raw = interaction.fields.getTextInputValue('tags_text');
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length <= 50);
      const config = db.getConfig(interaction.guild.id);
      const existing = config.tags || [];
      const toAdd = [...new Set(lines)].filter(t => !existing.includes(t));
      const available = 25 - existing.length;
      const added = toAdd.slice(0, available);
      for (const tag of added) db.addTag(interaction.guild.id, tag);

      // Mettre à jour le panel si des tags ont été ajoutés
      if (added.length) {
        const { refreshPanel, refreshOpenTicketMessages } = require('./commands/tconfig.js');
        await refreshPanel(interaction.guild, db.getConfig(interaction.guild.id)).catch(() => {});
        await refreshOpenTicketMessages(interaction.guild).catch(() => {});
      }

      const skipped = toAdd.length - added.length;
      const ignored = lines.length - toAdd.length; // doublons ou déjà existants

      let feedback = `# ✅ Tags mis à jour\n`;
      if (added.length) feedback += `**Ajoutés (${added.length}) :**\n${added.map(t => `> \`${t}\``).join('\n')}\n`;
      if (ignored > 0) feedback += `\n-# ${ignored} tag(s) ignoré(s) (déjà existant ou doublon)`;
      if (skipped > 0) feedback += `\n-# ${skipped} tag(s) ignoré(s) — limite de 25 tags atteinte`;
      if (!added.length) feedback = `# ❌ Aucun tag ajouté\nTous les tags étaient déjà présents ou la limite de 25 est atteinte.`;

      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(added.length ? 0x57f287 : 0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(feedback))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const TCONFIG_SET_MODALS = {
      tconfig_modal_set_category:    { key: 'categoryId',          type: 'category', label: 'Catégorie ouverts',      nav: 'channels' },
      tconfig_modal_set_closedcat:   { key: 'closedCategoryId',    type: 'category', label: 'Catégorie fermés',       nav: 'channels' },
      tconfig_modal_set_logs:        { key: 'logChannelId',        type: 'text',     label: 'Salon logs & transcripts', nav: 'channels' },
      tconfig_modal_set_panel:       { key: 'panelChannelId',      type: 'text',     label: 'Salon panel',            nav: 'channels' },
      tconfig_modal_set_support:     { key: 'supportRoleId',       type: 'role',     label: 'Rôle staff',             nav: 'roles'    },
      tconfig_modal_set_viewer:      { key: 'viewerRoleId',        type: 'role',     label: 'Rôle viewer',            nav: 'roles'    },
      tconfig_modal_set_claim:       { key: 'claimRoleId',         type: 'role',     label: 'Rôle claim',             nav: 'roles'    },
      tconfig_modal_set_naming:      { key: 'ticketNaming',        type: 'text_raw', label: 'Schéma de nommage',      nav: 'advanced' },
    };
    if (TCONFIG_SET_MODALS[interaction.customId]) {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const { key, type, label } = TCONFIG_SET_MODALS[interaction.customId];
      const raw = interaction.fields.getTextInputValue('set_value').trim();

      if (type === 'text_raw') {
        if (!raw || raw.length > 80) {
          return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Schéma invalide\nMax 80 caractères.`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        if (!['{num}', '{username}', '{tag}'].some(v => raw.includes(v))) {
          return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Schéma invalide\nDoit contenir au moins \`{num}\`, \`{username}\` ou \`{tag}\`.`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        db.setConfig(interaction.guild.id, key, raw);
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ ${label} mis à jour\n\`${raw}\``))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }

      const idMatch = raw.replace(/[<#@&>]/g, '').match(/\d{17,20}/);
      if (!idMatch) {
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ ID invalide\nFournis un ID Discord valide (17-20 chiffres).`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
      const resolvedId = idMatch[0];

      if (type === 'category') {
        const ch = interaction.guild.channels.cache.get(resolvedId);
        if (!ch || ch.type !== ChannelType.GuildCategory) {
          return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Catégorie introuvable\n\`${resolvedId}\` — vérifie que c'est bien une catégorie Discord.`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        db.setConfig(interaction.guild.id, key, resolvedId);
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ ${label}\n**${ch.name}**`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }

      if (type === 'text') {
        const ch = interaction.guild.channels.cache.get(resolvedId);
        if (!ch || ch.type !== ChannelType.GuildText) {
          return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Salon introuvable\n\`${resolvedId}\` — vérifie que c'est bien un salon textuel.`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        db.setConfig(interaction.guild.id, key, resolvedId);
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ ${label}\n${ch}`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }

      if (type === 'role') {
        const role = interaction.guild.roles.cache.get(resolvedId);
        if (!role) {
          return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Rôle introuvable\n\`${resolvedId}\``))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        db.setConfig(interaction.guild.id, key, resolvedId);
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ ${label}\n${role}`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
    }

    // ── Modal set mentionRoles (IDs multiples) ───────────────────────────────
    if (interaction.customId === 'tconfig_modal_set_mention') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const raw = interaction.fields.getTextInputValue('set_value').trim();
      const ids = raw.split(/[\s,]+/).map(s => s.replace(/[<#@&>]/g, '').match(/\d{17,20}/)?.[0]).filter(Boolean);
      const validRoles = ids.filter(id => interaction.guild.roles.cache.has(id));
      if (!validRoles.length) {
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Aucun rôle valide trouvé\nFournis des IDs de rôles Discord séparés par des virgules.`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
      db.setConfig(interaction.guild.id, 'mentionRoles', validRoles);
      const names = validRoles.map(id => `<@&${id}>`).join(' ');
      return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ Rôles mentionnés mis à jour\n${names}`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    // ── Modal openMessage ────────────────────────────────────────────────────
    if (interaction.customId === 'tconfig_modal_open') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const text = interaction.fields.getTextInputValue('open_text').trim();
      db.setConfig(interaction.guild.id, 'openMessage', text);
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `# ✅ Message d'ouverture mis à jour\n` +
          (text ? `**Aperçu :**\n> ${text.replace(/\n/g, '\n> ').slice(0, 300)}` : '*Message désactivé.*')
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // ── Modaux renommage catégories ──────────────────────────────────────────
    if (interaction.customId === 'tconfig_modal_rename_cat') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const name = interaction.fields.getTextInputValue('cat_name').trim();
      db.setConfig(interaction.guild.id, 'categoryName', name);
      // Renommer la catégorie Discord si elle existe
      const config = db.getConfig(interaction.guild.id);
      if (config.categoryId) {
        const cat = interaction.guild.channels.cache.get(config.categoryId);
        if (cat) await cat.setName(name).catch(() => {});
      }
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `# ✅ Catégorie tickets ouverts renommée\nNouveau nom : \`${name}\``
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'tconfig_modal_rename_closedcat') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const name = interaction.fields.getTextInputValue('closedcat_name').trim();
      db.setConfig(interaction.guild.id, 'closedCategoryName', name);
      const config = db.getConfig(interaction.guild.id);
      if (config.closedCategoryId) {
        const cat = interaction.guild.channels.cache.get(config.closedCategoryId);
        if (cat) await cat.setName(name).catch(() => {});
      }
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `# ✅ Catégorie tickets fermés renommée\nNouveau nom : \`${name}\``
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'tconfig_modal_rename_logs') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const name = interaction.fields.getTextInputValue('logs_name').trim();
      db.setConfig(interaction.guild.id, 'logChannelName', name);
      const config = db.getConfig(interaction.guild.id);
      if (config.logChannelId) {
        const ch = interaction.guild.channels.cache.get(config.logChannelId);
        if (ch) await ch.setName(name).catch(() => {});
      }
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `# ✅ Salon logs renommé\nNouveau nom : \`${name}\``
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'tconfig_modal_rename_panel_ch') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const name = interaction.fields.getTextInputValue('panel_ch_name').trim();
      db.setConfig(interaction.guild.id, 'panelChannelName', name);
      const config = db.getConfig(interaction.guild.id);
      if (config.panelChannelId) {
        const ch = interaction.guild.channels.cache.get(config.panelChannelId);
        if (ch) await ch.setName(name).catch(() => {});
      }
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `# ✅ Salon panel renommé\nNouveau nom : \`${name}\``
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // ── Modaux saisie personnalisée auto-close et suppression auto ────────────
    if (interaction.customId === 'tconfig_modal_ac_custom') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const raw = interaction.fields.getTextInputValue('ac_hours').trim();
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 0 || n > 8760) {
        return interaction.reply({
          components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ❌ Valeur invalide\nEntre **0** (désactivé) et **8760** heures (1 an).\nValeur saisie : \`${raw}\``
          ))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      db.setConfig(interaction.guild.id, 'autoCloseHours', n);
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          n === 0
            ? `# ✅ Fermeture automatique désactivée`
            : `# ✅ Fermeture automatique\nDurée d'inactivité : **${n}h** (${n >= 24 ? `${Math.floor(n/24)}j${n%24 ? ` ${n%24}h` : ''}` : `${n}h`})`
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === 'tconfig_modal_cd_custom') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const raw = interaction.fields.getTextInputValue('cd_hours').trim();
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 0 || n > 8760) {
        return interaction.reply({
          components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ❌ Valeur invalide\nEntre **0** (désactivé) et **8760** heures (1 an).\nValeur saisie : \`${raw}\``
          ))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      db.setConfig(interaction.guild.id, 'closedDeleteHours', n);
      return interaction.reply({
        components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          n === 0
            ? `# ✅ Suppression automatique désactivée`
            : `# ✅ Suppression automatique\nSuppression **${n}h** après fermeture (${n >= 24 ? `${Math.floor(n/24)}j${n%24 ? ` ${n%24}h` : ''}` : `${n}h`})`
        ))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // Formulaire de contact (.modal) — réponse Container V2
    if (interaction.customId === 'formulaire_modal') {
      const nom  = interaction.fields.getTextInputValue('input_nom');
      const msg  = interaction.fields.getTextInputValue('input_message');
      const note = interaction.fields.getTextInputValue('input_note') || 'Non renseignée';
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
              new TextDisplayBuilder()
                .setContent(
                  `# 📬 Formulaire reçu !\n` +
                  `**👤 Nom** : ${nom}\n` +
                  `**⭐ Note** : ${note}\n` +
                  `**💬 Message** :\n> ${msg}\n\n` +
                  `-# Soumis par ${interaction.user.tag} • <t:${Math.floor(Date.now() / 1000)}:T>`,
                ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // Note profil (.cv2profil) — réponse Container V2
    if (interaction.customId.startsWith('modal_profil_note_')) {
      const targetId = interaction.customId.replace('modal_profil_note_', '');
      const texte    = interaction.fields.getTextInputValue('note_texte');
      const score    = interaction.fields.getTextInputValue('note_score') || 'N/A';
      const target   = await client.users.fetch(targetId).catch(() => null);
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xfee75c)
            .addTextDisplayComponents(
              new TextDisplayBuilder()
                .setContent(
                  `# 📝 Note laissée\n` +
                  `**Sur** : ${target ? `${target.username} (\`${targetId}\`)` : `\`${targetId}\``}\n` +
                  `**Score** : ${score}/10\n\n` +
                  `> ${texte}\n\n` +
                  `-# Par ${interaction.user.tag}`,
                ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    // ── Modal lconfig — salon de logs par défaut ─────────────────────────────
    if (interaction.customId === 'lconfig_modal_set_channel') {
      if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
      const raw = interaction.fields.getTextInputValue('channel_id').trim();
      const idMatch = raw.replace(/[<#@&>]/g, '').match(/\d{17,20}/);
      if (!idMatch) {
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ ID invalide\nFournis un ID ou une mention de salon.`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
      const ch = interaction.guild.channels.cache.get(idMatch[0]);
      if (!ch) {
        return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Salon introuvable\n\`${idMatch[0]}\``))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
      const logDB = require('./logs/logDB.js');
      logDB.setChannel(interaction.guild.id, ch.id);
      return interaction.reply({ components: [new ContainerBuilder().setAccentColor(0x57f287).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ✅ Salon de logs défini\n${ch}`))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
  }
});

// ─── Logs serveur — événements Discord ───────────────────────────────────────

// Messages
client.on('messageDelete',      msg       => logManager.onMessageDelete(msg).catch(() => {}));
client.on('messageUpdate',      (o, n)    => logManager.onMessageUpdate(o, n).catch(() => {}));
client.on('messageDeleteBulk',  (msgs, ch) => logManager.onMessageBulkDelete(msgs, ch).catch(() => {}));
client.on('messageReactionAdd', (r, u)    => logManager.onMessageReactionAdd(r, u).catch(() => {}));
client.on('messageReactionRemove', (r, u) => logManager.onMessageReactionRemove(r, u).catch(() => {}));
client.on('channelPinsUpdate',  (ch, t)   => logManager.onMessagePin(ch, t).catch(() => {}));

// Membres
client.on('guildMemberAdd', async (m) => {
  logManager.onGuildMemberAdd(m).catch(() => {});
  // ── Règlement : attribuer le rôle de restriction au join ─────────────────
  try {
    const rulesCfg = rulesDB.getConfig(m.guild.id);
    if (rulesCfg.enabled && rulesCfg.joinRoleId) {
      const joinRole = m.guild.roles.cache.get(rulesCfg.joinRoleId);
      if (joinRole) await m.roles.add(joinRole, 'Règlement — rôle de restriction au join').catch(() => {});
    }
  } catch {}
});
client.on('guildMemberRemove',  m         => logManager.onGuildMemberRemove(m).catch(() => {}));
client.on('guildMemberUpdate',  (o, n)    => logManager.onGuildMemberUpdate(o, n).catch(() => {}));
client.on('guildBanAdd',        ban       => logManager.onGuildBanAdd(ban).catch(() => {}));
client.on('guildBanRemove',     ban       => logManager.onGuildBanRemove(ban).catch(() => {}));

// Salons
client.on('channelCreate',      ch        => logManager.onChannelCreate(ch).catch(() => {}));
client.on('channelDelete',      ch        => logManager.onChannelDelete(ch).catch(() => {}));
client.on('channelUpdate',      (o, n)    => logManager.onChannelUpdate(o, n).catch(() => {}));

// Fils de discussion
client.on('threadCreate',       t         => logManager.onThreadCreate(t).catch(() => {}));
client.on('threadDelete',       t         => logManager.onThreadDelete(t).catch(() => {}));
client.on('threadUpdate',       (o, n)    => logManager.onThreadUpdate(o, n).catch(() => {}));

// Rôles
client.on('roleCreate',         r         => logManager.onRoleCreate(r).catch(() => {}));
client.on('roleDelete',         r         => logManager.onRoleDelete(r).catch(() => {}));
client.on('roleUpdate',         (o, n)    => logManager.onRoleUpdate(o, n).catch(() => {}));

// Vocal
client.on('voiceStateUpdate', async (oldState, newState) => {
  // ── Log normal ─────────────────────────────────────────────────────────────
  logManager.onVoiceStateUpdate(oldState, newState).catch(() => {});

  const member = newState.member;
  if (!member || member.user.bot) return;
  const guild = newState.guild;

  // ── Salons vocaux temporaires ──────────────────────────────────────────────
  const vcCfg = tempVoiceDB.getConfig(guild.id);

  // Suppression automatique si le salon quitté est un salon temporaire et devient vide
  if (oldState.channel && oldState.channel.id !== newState.channel?.id) {
    await tempVoiceManager.checkAndDelete(oldState.channel);
  }

  // Rejoindre le hub → créer un salon perso
  if (vcCfg.enabled && vcCfg.hubChannelId && newState.channelId === vcCfg.hubChannelId) {
    await tempVoiceManager.createTempChannel(guild, member);
    return; // le membre a été déplacé dans son nouveau salon
  }

  const key = `${guild.id}:${member.id}`;

  // Déconnexion → effacer la mémoire
  if (oldState.channel && !newState.channel) {
    lastVoiceChannel.delete(key);
    return;
  }

  // ── Détecter un join/move vers un salon vocal verrouillé ──────────────────
  const joinedChannel = newState.channel;
  if (!joinedChannel) return;

  // Vérifier si @everyone a Connect:false sur ce salon
  const everyoneOverwrite = joinedChannel.permissionOverwrites.cache.get(newState.guild.roles.everyone.id);
  const isLocked = everyoneOverwrite && everyoneOverwrite.deny.has(PermissionFlagsBits.Connect);

  if (isLocked) {
    // Récupérer le salon précédent mémorisé
    const prevChannelId = lastVoiceChannel.get(key);
    const prevChannel   = prevChannelId ? newState.guild.channels.cache.get(prevChannelId) : null;

    // Léger délai pour laisser Discord enregistrer le join
    setTimeout(async () => {
      try {
        if (prevChannel) {
          // Renvoyer vers l'ancien salon
          await member.voice.setChannel(prevChannel, '[AUTO] Salon verrouillé — retour forcé');
        } else {
          // Pas d'ancien salon → déconnecter
          await member.voice.disconnect('[AUTO] Salon verrouillé — déconnexion forcée');
        }
        // Notifier discrètement via DM
        await member.send({
          content: `🔒 Le salon **${joinedChannel.name}** est **verrouillé** sur le serveur **${newState.guild.name}**. Tu as été automatiquement ${prevChannel ? `renvoyé vers <#${prevChannel.id}>` : 'déconnecté'}.`,
        }).catch(() => {});
      } catch { /* bot peut manquer de perms */ }
    }, 300);

    return; // ne pas mettre à jour lastVoice avec le salon lock
  }

  // ── Mémoriser ce salon légitime ────────────────────────────────────────────
  lastVoiceChannel.set(key, joinedChannel.id);
});

// Serveur
client.on('guildUpdate',        (o, n)    => logManager.onGuildUpdate(o, n).catch(() => {}));
client.on('emojiCreate',        e         => logManager.onEmojiCreate(e).catch(() => {}));
client.on('emojiDelete',        e         => logManager.onEmojiDelete(e).catch(() => {}));
client.on('stickerCreate',      s         => logManager.onStickerCreate(s).catch(() => {}));
client.on('stickerDelete',      s         => logManager.onStickerDelete(s).catch(() => {}));
client.on('inviteCreate',       inv       => logManager.onInviteCreate(inv).catch(() => {}));
client.on('inviteDelete',       inv       => logManager.onInviteDelete(inv).catch(() => {}));

// Événements planifiés
client.on('guildScheduledEventCreate', ev => logManager.onScheduledEventCreate(ev).catch(() => {}));
client.on('guildScheduledEventDelete', ev => logManager.onScheduledEventDelete(ev).catch(() => {}));
client.on('guildScheduledEventUpdate', (o, n) => logManager.onScheduledEventUpdate(o, n).catch(() => {}));

// AutoMod
client.on('autoModerationRuleCreate',      rule => logManager.onAutoModerationRuleCreate(rule).catch(() => {}));
client.on('autoModerationRuleDelete',      rule => logManager.onAutoModerationRuleDelete(rule).catch(() => {}));
client.on('autoModerationActionExecution', exec => logManager.onAutoModerationActionExecution(exec).catch(() => {}));

// Avancé
client.on('webhookUpdate', ch   => logManager.onWebhookUpdate(ch).catch(() => {}));
client.on('userUpdate',    (o, n) => logManager.onUserUpdate(o, n).catch(() => {}));

// ─── Connexion ────────────────────────────────────────────────────────────────
client.login(token);
