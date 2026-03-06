// tickets/ticketManager.js
// Logique métier : création de salons, permissions, embeds, logs, transcripts

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, SeparatorSpacingSize,
  PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');
const db = require('./ticketDB.js');

const COLORS = {
  open:    0x57f287,
  closed:  0xed4245,
  claimed: 0xfee75c,
  log:     0x5865f2,
  info:    0x5865f2,
};

// ─── Helper séparateur CV2 ────────────────────────────────────────────────────
function sep() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }

// ─── Embed helpers (logs — gardent le format embed classique) ─────────────────

function embedClosed(ticket, closedBy) {
  return new EmbedBuilder()
    .setColor(COLORS.closed)
    .setTitle(`🔒 Ticket #${String(ticket.id).padStart(4, '0')} — Fermé`)
    .setDescription(`Ce ticket a été fermé par ${closedBy}.`)
    .addFields(
      { name: '⏱️ Durée',      value: formatDuration(ticket.openedAt, ticket.closedAt || Date.now()), inline: true },
      { name: '📋 Catégorie',  value: ticket.tag, inline: true },
      ...(ticket.claimedBy ? [{ name: '🛡️ Pris en charge par', value: `<@${ticket.claimedBy}>`, inline: true }] : []),
    )
    .setTimestamp();
}

function embedClaimed(ticket, claimer) {
  return new EmbedBuilder()
    .setColor(COLORS.claimed)
    .setTitle(`🛡️ Ticket pris en charge`)
    .setDescription(`${claimer} a pris en charge ce ticket et va vous aider.`)
    .setTimestamp();
}

function embedLog(ticket, action, actor, extra = '') {
  const colors = { opened: 0x57f287, closed: 0xed4245, claimed: 0xfee75c, deleted: 0x99aab5, reopened: 0x5865f2, added: 0x57f287, removed: 0xed4245 };
  const icons  = { opened: '🟢', closed: '🔴', claimed: '🟡', deleted: '⚫', reopened: '🔵', added: '➕', removed: '➖' };
  return new EmbedBuilder()
    .setColor(colors[action] || COLORS.log)
    .setTitle(`${icons[action] || '📋'} Ticket #${String(ticket.id).padStart(4, '0')} — ${action.charAt(0).toUpperCase() + action.slice(1)}`)
    .addFields(
      { name: '🏷️ Catégorie',  value: ticket.tag,          inline: true },
      { name: '👤 Propriétaire', value: `<@${ticket.ownerId}>`, inline: true },
      { name: '🛠️ Action par',  value: actor.toString(),    inline: true },
      { name: '📍 Salon',       value: `<#${ticket.channelId}>`, inline: true },
      { name: '⏱️ Date',        value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ...(extra ? [{ name: '📝 Détail', value: extra }] : []),
    )
    .setFooter({ text: `Ticket ID: ${ticket.id}` })
    .setTimestamp();
}

// ─── Boutons de contrôle ──────────────────────────────────────────────────────

function buildControlRow(ticket) {
  if (ticket.status === 'closed') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_reopen_${ticket.channelId}`).setLabel('Réouvrir').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId(`ticket_delete_${ticket.channelId}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`ticket_transcript_${ticket.channelId}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticket.channelId}`).setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );
  if (!ticket.claimedBy) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ticket_claim_${ticket.channelId}`).setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ticket_unclaim_${ticket.channelId}`).setLabel('Libérer').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(`ticket_transcript_${ticket.channelId}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
  );
  return row;
}

// ─── Message d'accueil ticket — Components V2 ────────────────────────────────

function buildOpenContainer(ticket, owner, config, customWelcome = null, pingLine = null) {
  const ticketNum = String(ticket.id).padStart(4, '0');
  const ownerAvatar = owner.displayAvatarURL?.({ size: 64, extension: 'png' })
    || `https://cdn.discordapp.com/embed/avatars/${Number(owner.discriminator || 0) % 5}.png`;

  const welcomeText = customWelcome ||
    `## 👋 Bienvenue ${owner} !\n\n` +
    `Merci d'avoir ouvert un ticket. Notre équipe va vous répondre dès que possible.\n\n` +
    `> 🏷️ **Catégorie :** \`${ticket.tag}\`\n` +
    (ticket.reason ? `> ❓ **Raison :** ${ticket.reason}\n` : '') +
    `> 📅 **Ouvert le :** <t:${Math.floor(ticket.openedAt / 1000)}:F>\n\n` +
    `**En attendant, merci de :**\n` +
    `• Décrire ton problème en détail\n` +
    `• Joindre des captures d'écran si nécessaire\n` +
    `• Rester disponible pour les questions du staff\n\n` +
    `-# Un membre du staff va prendre en charge votre demande sous peu.`;

  const container = new ContainerBuilder()
    .setAccentColor(COLORS.open);

  // Ligne de ping en tête du container (IS_COMPONENTS_V2 interdit 'content')
  if (pingLine) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(pingLine)
    );
    container.addSeparatorComponents(sep());
  }

  // Section principale : titre + avatar
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎫 Ticket #${ticketNum} — ${ticket.tag}\n` +
          `-# Ouvert le <t:${Math.floor(ticket.openedAt / 1000)}:F>`
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(ownerAvatar).setDescription(`Avatar de ${owner.username}`)
      )
  );

  container.addSeparatorComponents(sep());

  // Corps du message d'accueil
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(welcomeText)
  );

  container.addSeparatorComponents(sep());

  // Champs infos
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `👤 **Ouvert par** : ${owner} (\`${owner.id}\`)\n` +
      `🏷️ **Catégorie** : \`${ticket.tag}\`\n` +
      `🆔 **ID ticket** : \`${ticketNum}\`\n` +
      `📍 **Salon** : <#${ticket.channelId}>`
    )
  );

  container.addSeparatorComponents(sep());

  // Boutons de contrôle
  container.addActionRowComponents(buildControlRow(ticket));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ID interne : ${ticket.channelId}`)
  );

  return container;
}

// ─── Permissions ──────────────────────────────────────────────────────────────

function buildPermissions(guild, config, ownerId, addedUsers = []) {
  const perms = [
    // @everyone : pas de vue
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    // Propriétaire du ticket
    {
      id:    ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    // Bot
    {
      id:    guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  // Rôle support (gestion complète)
  if (config.supportRoleId) {
    perms.push({
      id:    config.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  // Rôle claim (peut voir + gérer comme staff)
  if (config.claimRoleId && config.claimRoleId !== config.supportRoleId) {
    perms.push({
      id:    config.claimRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  // Rôle viewer (lecture seule)
  if (config.viewerRoleId) {
    perms.push({
      id:    config.viewerRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny:  [PermissionFlagsBits.SendMessages],
    });
  }

  // Utilisateurs ajoutés manuellement
  for (const uid of addedUsers) {
    perms.push({
      id:    uid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  return perms;
}

// ─── Nommage du salon ────────────────────────────────────────────────────────

function buildChannelName(config, counter, username, tag) {
  const num  = String(counter).padStart(4, '0');
  const user = username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const tg   = tag.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'ticket';
  const pattern = config.ticketNaming || '{num}-{username}';
  return pattern
    .replace('{num}',      num)
    .replace('{username}', user)
    .replace('{tag}',      tg)
    .slice(0, 100);
}

// ─── Création d'un ticket ─────────────────────────────────────────────────────

async function createTicketChannel(guild, config, owner, tag, reason) {
  // Vérification limite
  const open = db.getOpenTicketsByUser(guild.id, owner.id);
  if (open.length >= config.maxOpen) {
    return { success: false, message: `Tu as déjà **${open.length}** ticket(s) ouvert(s) (max : ${config.maxOpen}).\nFerme un ticket existant avant d'en ouvrir un nouveau.` };
  }

  // Nom du salon
  const counter = db.getCounter(guild.id) + 1;
  const channelName = buildChannelName(config, counter, owner.username, tag);

  // Création du salon
  const channel = await guild.channels.create({
    name:                 channelName,
    type:                 ChannelType.GuildText,
    parent:               config.categoryId || null,
    topic:                `Ticket de ${owner.tag} | Tag: ${tag} | Raison: ${reason || 'N/A'}`,
    permissionOverwrites: buildPermissions(guild, config, owner.id),
    reason:               `Ticket ouvert par ${owner.tag}`,
  });

  // Enregistrement en DB
  const ticket = db.createTicket(guild.id, channel.id, owner.id, tag, reason);

  // Préparer le message d'accueil (texte welcome personnalisé)
  const welcome = config.welcomeMessage?.trim()
    ? config.welcomeMessage
        .replace('{user}',   `${owner}`)
        .replace('{tag}',    tag)
        .replace('{reason}', reason || '*Non précisée*')
        .replace('{num}',    String(ticket.id).padStart(4, '0'))
    : null;

  // Construire le contenu de ping
  let pingParts = [`${owner}`];
  if (config.pingOnOpen) {
    if (config.supportRoleId) pingParts.push(`<@&${config.supportRoleId}>`);
    if (config.mentionRoles?.length) {
      for (const rid of config.mentionRoles) {
        if (rid !== config.supportRoleId) pingParts.push(`<@&${rid}>`);
      }
    }
  }
  const pingContent = pingParts.join(' ');

  // Envoyer le message d'accueil en Components V2
  // Note : avec IS_COMPONENTS_V2, le champ 'content' est interdit → le ping va dans le container
  const openContainer = buildOpenContainer(ticket, owner, config, welcome, pingContent);
  const msg = await channel.send({
    components: [openContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  db.updateTicket(guild.id, channel.id, { controlMsgId: msg.id });

  // Message textuel supplémentaire à l'ouverture
  if (config.openMessage?.trim()) {
    const openMsg = config.openMessage
      .replace('{user}',   `${owner}`)
      .replace('{tag}',    tag)
      .replace('{reason}', reason || '*Non précisée*')
      .replace('{num}',    String(ticket.id).padStart(4, '0'));
    await channel.send({ content: openMsg }).catch(() => {});
  }

    // Créer un thread dans le salon de logs pour ce ticket
  // Note : createLogThread envoie déjà le log d'ouverture dans le thread
  await createLogThread(guild, config, ticket, owner, tag, reason);

  return { success: true, ticket, channel };
}

// ─── Fermeture ────────────────────────────────────────────────────────────────

async function closeTicketChannel(guild, config, ticket, closedBy) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return { error: 'Salon introuvable.' };

  // Retirer la permission d'envoi au propriétaire (peut encore voir)
  await channel.permissionOverwrites.edit(ticket.ownerId, {
    SendMessages: false,
  }).catch(() => {});

  // Mettre à jour la DB
  db.closeTicket(guild.id, ticket.channelId);
  const updated = db.getTicket(guild.id, ticket.channelId);

  // Mise à jour du message de contrôle CV2 (remplacer le container par version fermée)
  if (updated.controlMsgId) {
    const ctrlMsg = await channel.messages.fetch(updated.controlMsgId).catch(() => null);
    if (ctrlMsg) {
      const closedContainer = new ContainerBuilder()
        .setAccentColor(COLORS.closed)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🔒 Ticket #${String(updated.id).padStart(4, '0')} — Fermé\n` +
            `-# Fermé par ${closedBy} · <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `👤 **Propriétaire** : <@${updated.ownerId}>\n` +
            `🏷️ **Catégorie** : \`${updated.tag}\`\n` +
            `⏱️ **Durée** : ${formatDuration(updated.openedAt, updated.closedAt || Date.now())}\n` +
            (updated.claimedBy ? `🛡️ **Pris en charge par** : <@${updated.claimedBy}>` : '')
          )
        )
        .addSeparatorComponents(sep())
        .addActionRowComponents(buildControlRow(updated));
      await ctrlMsg.edit({
        components: [closedContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  }

  // Message de fermeture custom
  const closeMsg = config.closeMessage?.trim()
    ? config.closeMessage
        .replace('{user}',   `<@${updated.ownerId}>`)
        .replace('{staff}',  closedBy.toString())
        .replace('{num}',    String(updated.id).padStart(4, '0'))
        .replace('{tag}',    updated.tag)
    : null;

  if (closeMsg) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.closed).setDescription(closeMsg).setTimestamp()] }).catch(() => {});
  }

  // Déplacer vers la catégorie des tickets fermés si configuré
  if (config.closedCategoryId && config.closedCategoryId !== config.categoryId) {
    await channel.setParent(config.closedCategoryId, { lockPermissions: false }).catch(() => {});
  }

  // Renommer le salon
  await channel.setName(`closed-${channel.name.replace(/^(closed-|ticket-)/, '')}`).catch(() => {});

  // Transcript auto : envoyer dans le thread de logs du ticket
  // (le log de fermeture est inclus dans updateLogThread)
  if (config.transcriptOnClose && config.logChannelId) {
    try {
      const html = await generateTranscript(guild, updated);
      if (html) {
        await updateLogThread(guild, config, updated, closedBy, html);
      }
    } catch (_) {}
  }

  return { ticket: updated, channel };
}

// ─── Réouverture ──────────────────────────────────────────────────────────────

async function reopenTicketChannel(guild, config, ticket, reopenedBy) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return { error: 'Salon introuvable.' };

  // Remettre la permission d'envoi au propriétaire
  await channel.permissionOverwrites.edit(ticket.ownerId, {
    ViewChannel:        true,
    SendMessages:       true,
    ReadMessageHistory: true,
    AttachFiles:        true,
    EmbedLinks:         true,
  }).catch(() => {});

  // Remettre les permissions des utilisateurs ajoutés
  for (const uid of ticket.addedUsers || []) {
    await channel.permissionOverwrites.edit(uid, {
      ViewChannel:        true,
      SendMessages:       true,
      ReadMessageHistory: true,
    }).catch(() => {});
  }

  db.reopenTicket(guild.id, ticket.channelId);
  const updated = db.getTicket(guild.id, ticket.channelId);

  // Renommer : retirer le préfixe "closed-"
  const cleanName = channel.name.replace(/^closed-/, '');
  await channel.setName(cleanName.startsWith('ticket-') ? cleanName : `ticket-${cleanName}`).catch(() => {});

  // Déplacer vers la catégorie ouverts si configuré
  if (config.categoryId && channel.parentId !== config.categoryId) {
    await channel.setParent(config.categoryId, { lockPermissions: false }).catch(() => {});
  }

  // Message de réouverture en CV2
  const reopenContainer = new ContainerBuilder()
    .setAccentColor(COLORS.open)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🔓 Ticket #${String(updated.id).padStart(4, '0')} — Réouvert\n` +
        `-# Réouvert par ${reopenedBy} · <t:${Math.floor(Date.now() / 1000)}:F>`
      )
    )
    .addSeparatorComponents(sep())
    .addActionRowComponents(buildControlRow(updated));

  const reopenMsg = await channel.send({
    components: [reopenContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  // Mettre à jour le controlMsgId
  db.updateTicket(guild.id, ticket.channelId, { controlMsgId: reopenMsg.id });

  await sendLog(guild, config, updated, 'reopened', reopenedBy);
  return { ticket: updated, channel };
}

// ─── Suppression ─────────────────────────────────────────────────────────────

async function deleteTicketChannel(guild, config, ticket, deletedBy) {
  const channel = guild.channels.cache.get(ticket.channelId);

  // Log avant suppression (le salon va disparaître)
  await sendLog(guild, config, ticket, 'deleted', deletedBy, 'Salon supprimé définitivement');

  db.deleteTicket(guild.id, ticket.channelId);
  if (channel) await channel.delete(`Supprimé par ${deletedBy.tag}`).catch(() => {});

  return { success: true };
}

// ─── Claim / Unclaim ─────────────────────────────────────────────────────────

async function claimTicketChannel(guild, config, ticket, claimer) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return { error: 'Salon introuvable.' };

  db.claimTicket(guild.id, ticket.channelId, claimer.id);
  const updated = db.getTicket(guild.id, ticket.channelId);

  // Message claim en CV2
  await channel.send({
    components: [
      new ContainerBuilder()
        .setAccentColor(COLORS.claimed)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🛡️ **Ticket pris en charge par ${claimer}**\n` +
            `-# <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});

  // Mettre à jour les boutons de contrôle dans le message d'accueil CV2
  if (updated.controlMsgId) {
    const ctrlMsg = await channel.messages.fetch(updated.controlMsgId).catch(() => null);
    if (ctrlMsg) {
      // Reconstruire le container CV2 d'accueil avec le bouton unclaim
      const owner = await channel.guild.members.fetch(updated.ownerId).catch(() => null);
      const ownerUser = owner?.user || { id: updated.ownerId, username: 'Utilisateur', discriminator: '0' };
      const ownerAvatar = ownerUser.displayAvatarURL?.({ size: 64, extension: 'png' })
        || `https://cdn.discordapp.com/embed/avatars/0.png`;
      const ticketNum = String(updated.id).padStart(4, '0');
      const updatedContainer = new ContainerBuilder()
        .setAccentColor(COLORS.claimed)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# 🎫 Ticket #${ticketNum} — ${updated.tag}\n` +
              `-# Ouvert le <t:${Math.floor(updated.openedAt / 1000)}:F> · 🛡️ Pris en charge par ${claimer}`
            ))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(ownerAvatar).setDescription('Avatar'))
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `👤 **Ouvert par** : <@${updated.ownerId}> (\`${updated.ownerId}\`)\n` +
          `🏷️ **Catégorie** : \`${updated.tag}\`\n` +
          `🛡️ **Pris en charge par** : ${claimer}`
        ))
        .addSeparatorComponents(sep())
        .addActionRowComponents(buildControlRow(updated))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ID interne : ${updated.channelId}`));
      await ctrlMsg.edit({
        components: [updatedContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  }

  await sendLog(guild, config, updated, 'claimed', claimer);
  return { ticket: updated };
}

async function unclaimTicketChannel(guild, config, ticket, unclaimer) {
  const channel = guild.channels.cache.get(ticket.channelId);
  db.unclaimTicket(guild.id, ticket.channelId);
  const updated = db.getTicket(guild.id, ticket.channelId);

  if (channel && updated.controlMsgId) {
    const ctrlMsg = await channel.messages.fetch(updated.controlMsgId).catch(() => null);
    if (ctrlMsg) {
      // Reconstruire le container ouvert simple
      const owner = await channel.guild.members.fetch(updated.ownerId).catch(() => null);
      const ownerUser = owner?.user || { id: updated.ownerId, username: 'Utilisateur', discriminator: '0' };
      const ownerAvatar = ownerUser.displayAvatarURL?.({ size: 64, extension: 'png' })
        || `https://cdn.discordapp.com/embed/avatars/0.png`;
      const ticketNum = String(updated.id).padStart(4, '0');
      const updatedContainer = new ContainerBuilder()
        .setAccentColor(COLORS.open)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `# 🎫 Ticket #${ticketNum} — ${updated.tag}\n` +
              `-# Ouvert le <t:${Math.floor(updated.openedAt / 1000)}:F>`
            ))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(ownerAvatar).setDescription('Avatar'))
        )
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `👤 **Ouvert par** : <@${updated.ownerId}> (\`${updated.ownerId}\`)\n` +
          `🏷️ **Catégorie** : \`${updated.tag}\``
        ))
        .addSeparatorComponents(sep())
        .addActionRowComponents(buildControlRow(updated))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ID interne : ${updated.channelId}`));
      await ctrlMsg.edit({
        components: [updatedContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  }

  return { ticket: updated };
}

// ─── Ajout / Retrait d'utilisateur ───────────────────────────────────────────

async function addUserToChannel(guild, config, ticket, member, addedBy) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return { error: 'Salon introuvable.' };

  await channel.permissionOverwrites.edit(member.id, {
    ViewChannel:        true,
    SendMessages:       true,
    ReadMessageHistory: true,
  });

  db.addUserToTicket(guild.id, ticket.channelId, member.id);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.open)
        .setDescription(`➕ ${member} a été ajouté au ticket par ${addedBy}.`)
        .setTimestamp(),
    ],
  });

  await sendLog(guild, config, ticket, 'added', addedBy, `Utilisateur ajouté : ${member.tag}`);
  return { success: true };
}

async function removeUserFromChannel(guild, config, ticket, member, removedBy) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return { error: 'Salon introuvable.' };

  await channel.permissionOverwrites.delete(member.id).catch(() => {});
  db.removeUserFromTicket(guild.id, ticket.channelId, member.id);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.closed)
        .setDescription(`➖ ${member} a été retiré du ticket par ${removedBy}.`)
        .setTimestamp(),
    ],
  });

  await sendLog(guild, config, ticket, 'removed', removedBy, `Utilisateur retiré : ${member.tag}`);
  return { success: true };
}

// ─── Thread de logs par ticket ────────────────────────────────────────────────
// Crée (ou retrouve) un thread dans le salon logChannelId pour ce ticket.
// Le thread contient : résumé d'ouverture + à la fermeture le transcript HTML.

async function createLogThread(guild, config, ticket, owner, tag, reason) {
  if (!config.logChannelId) return;
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  const ticketNum = String(ticket.id).padStart(4, '0');
  const threadName = `ticket-${ticketNum}-${tag.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'ticket'}`;

  try {
    // Envoyer le message récap dans le salon logs (sert d'ancre pour le thread)
    const summaryMsg = await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.open)
          .setTitle(`🟢 Ticket #${ticketNum} ouvert — ${tag}`)
          .addFields(
            { name: '👤 Ouvert par',   value: `<@${owner.id}> (\`${owner.id}\`)`, inline: true },
            { name: '🏷️ Catégorie',   value: tag,                                  inline: true },
            { name: '📍 Salon',        value: `<#${ticket.channelId}>`,             inline: true },
            { name: '📅 Date',         value: `<t:${Math.floor(ticket.openedAt / 1000)}:F>`, inline: true },
            ...(reason ? [{ name: '❓ Raison', value: reason }] : []),
          )
          .setFooter({ text: `ID ticket : ${ticket.channelId}` })
          .setTimestamp(),
      ],
    });

    // Créer un thread sur ce message
    const thread = await summaryMsg.startThread({
      name:                  threadName,
      autoArchiveDuration:   10080, // 7 jours
      reason:                `Logs ticket #${ticketNum}`,
    });

    // Sauvegarder le threadId dans la DB
    db.updateTicket(guild.id, ticket.channelId, { logThreadId: thread.id, logMsgId: summaryMsg.id });

    // Envoyer le log d'OUVERTURE dans le thread (au lieu du salon principal)
    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.open)
          .setTitle(`� Ticket #${ticketNum} — Ouvert`)
          .addFields(
            { name: '👤 Ouvert par',    value: `<@${owner.id}> (\`${owner.id}\`)`, inline: true },
            { name: '🏷️ Catégorie',    value: tag,                                  inline: true },
            { name: '📍 Salon',         value: `<#${ticket.channelId}>`,             inline: true },
            { name: '📅 Ouvert le',     value: `<t:${Math.floor(ticket.openedAt / 1000)}:F>`, inline: true },
            ...(reason ? [{ name: '❓ Raison', value: reason }] : []),
          )
          .setDescription(`📋 Toutes les actions de ce ticket seront enregistrées ici.`)
          .setFooter({ text: `ID salon : ${ticket.channelId}` })
          .setTimestamp(),
      ],
    }).catch(() => {});

  } catch (e) {
    console.error('[TicketManager] Erreur création thread logs:', e.message);
  }
}

async function updateLogThread(guild, config, ticket, closedBy, html) {
  if (!config.logChannelId) return;

  const ticketNum = String(ticket.id).padStart(4, '0');

  // Récupérer le thread depuis la DB
  const logThreadId = ticket.logThreadId;
  let thread = logThreadId ? guild.channels.cache.get(logThreadId) : null;

  // Si pas en cache, essayer de fetch
  if (!thread && logThreadId) {
    thread = await guild.channels.fetch(logThreadId).catch(() => null);
  }

  if (!thread) {
    // Fallback : envoyer directement dans logChannel
    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (logChannel && html) {
      await logChannel.send({
        embeds: [new EmbedBuilder().setColor(COLORS.closed).setTitle(`📄 Transcript — Ticket #${ticketNum}`).setDescription(`Fermé par ${closedBy}`).setTimestamp()],
        files: [{ attachment: Buffer.from(html, 'utf8'), name: `transcript-${ticketNum}.html` }],
      }).catch(() => {});
    }
    return;
  }

  // Envoyer le log de FERMETURE dans le thread
  const closedDate = ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');

  await thread.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.closed)
        .setTitle(`🔴 Ticket #${ticketNum} — Fermé`)
        .addFields(
          { name: '🛠️ Fermé par',   value: closedBy.toString(),                         inline: true },
          { name: '⏱️ Durée',       value: formatDuration(ticket.openedAt, ticket.closedAt || Date.now()), inline: true },
          { name: '📋 Catégorie',   value: ticket.tag,                                   inline: true },
          { name: '🔒 Fermé le',    value: closedDate,                                   inline: true },
          ...(ticket.claimedBy ? [{ name: '🛡️ Pris en charge par', value: `<@${ticket.claimedBy}>`, inline: true }] : []),
        )
        .setTimestamp(),
    ],
    files: html ? [{ attachment: Buffer.from(html, 'utf8'), name: `transcript-${ticketNum}.html` }] : [],
  }).catch(() => {});

  // Archiver le thread
  await thread.setArchived(true).catch(() => {});
}

// ─── Transcript HTML ──────────────────────────────────────────────────────────

async function generateTranscript(guild, ticket) {
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return null;

  let messages = [];
  let lastId;
  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;
    messages = messages.concat([...batch.values()]);
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.reverse();

  const ticketNum  = String(ticket.id).padStart(4, '0');
  const openedDate = new Date(ticket.openedAt).toLocaleString('fr-FR');
  const closedDate = ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('fr-FR') : 'N/A';

  // ─ Helper couleur rôle → hue CSS ─
  function roleColor(member) {
    const color = member?.roles?.color?.color;
    if (!color) return '#b9bbbe';
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  // ─ Construire les lignes de messages ─
  const msgLines = messages.map(m => {
    const time    = new Date(m.createdTimestamp).toLocaleString('fr-FR');
    const avatar  = m.author.displayAvatarURL({ size: 64, extension: 'png' });
    const member  = guild.members.cache.get(m.author.id);
    const name    = member?.displayName || m.author.username;
    const color   = roleColor(member);
    const bot     = m.author.bot ? '<span class="badge">BOT</span>' : '';

    // Contenu principal
    let body = '';
    if (m.content) {
      body += `<div class="content">${escapeHtml(m.content)}</div>`;
    }

    // Embeds
    for (const e of m.embeds) {
      const ec = e.color ? `#${e.color.toString(16).padStart(6, '0')}` : '#4f545c';
      body += `<div class="embed" style="border-left:4px solid ${ec}">`;
      if (e.title) body += `<div class="embed-title">${escapeHtml(e.title)}</div>`;
      if (e.description) body += `<div class="embed-desc">${escapeHtml(e.description).replace(/\n/g, '<br>')}</div>`;
      if (e.fields?.length) {
        body += `<div class="embed-fields">`;
        for (const f of e.fields) {
          body += `<div class="embed-field ${f.inline ? 'inline' : ''}"><div class="field-name">${escapeHtml(f.name)}</div><div class="field-value">${escapeHtml(f.value)}</div></div>`;
        }
        body += `</div>`;
      }
      if (e.footer?.text) body += `<div class="embed-footer">${escapeHtml(e.footer.text)}</div>`;
      body += `</div>`;
    }

    // Pièces jointes
    for (const att of m.attachments.values()) {
      const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name || '');
      if (isImg) {
        body += `<div class="attachment"><img src="${att.url}" alt="${escapeHtml(att.name || 'image')}" loading="lazy" style="max-width:400px;max-height:300px;border-radius:4px;margin-top:4px"></div>`;
      } else {
        body += `<div class="attachment">📎 <a href="${att.url}" target="_blank">${escapeHtml(att.name || att.url)}</a> <span class="att-size">(${formatBytes(att.size)})</span></div>`;
      }
    }

    if (!body) body = `<div class="content muted">[Message vide ou non pris en charge]</div>`;

    return `
    <div class="message">
      <img class="avatar" src="${avatar}" alt="${escapeHtml(name)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
      <div class="msg-body">
        <span class="username" style="color:${color}">${escapeHtml(name)}</span>${bot}
        <span class="timestamp">${time}</span>
        ${body}
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Transcript — Ticket #${ticketNum}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #313338; color: #dcddde; font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; }
    .header { background: #1e1f22; padding: 24px 32px; border-bottom: 1px solid #232428; }
    .header h1 { font-size: 22px; color: #fff; }
    .header .meta { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 18px; color: #b5bac1; font-size: 13px; }
    .header .meta span { display: flex; align-items: center; gap: 6px; }
    .messages { padding: 16px 32px; max-width: 900px; margin: 0 auto; }
    .message { display: flex; gap: 16px; padding: 6px 0; }
    .message:hover { background: #2e3035; border-radius: 4px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
    .msg-body { flex: 1; min-width: 0; }
    .username { font-weight: 600; font-size: 15px; }
    .timestamp { color: #72767d; font-size: 11px; margin-left: 8px; }
    .badge { background: #5865f2; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 5px; text-transform: uppercase; vertical-align: middle; }
    .content { margin-top: 2px; white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
    .content.muted { color: #72767d; font-style: italic; }
    .embed { background: #2b2d31; border-radius: 4px; padding: 10px 14px; margin-top: 6px; max-width: 520px; }
    .embed-title { font-weight: 700; color: #fff; margin-bottom: 4px; }
    .embed-desc { font-size: 14px; color: #dcddde; line-height: 1.4; }
    .embed-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .embed-field { flex: 1 1 30%; min-width: 120px; }
    .embed-field.inline { flex: 0 0 auto; }
    .field-name { font-size: 12px; font-weight: 700; color: #b9bbbe; text-transform: uppercase; margin-bottom: 2px; }
    .field-value { font-size: 13px; color: #dcddde; }
    .embed-footer { font-size: 12px; color: #72767d; margin-top: 8px; }
    .attachment { margin-top: 4px; font-size: 13px; }
    .attachment a { color: #00b0f4; }
    .att-size { color: #72767d; font-size: 11px; }
    .footer { text-align: center; padding: 32px; color: #72767d; font-size: 12px; border-top: 1px solid #232428; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎫 Transcript — Ticket #${ticketNum} · ${escapeHtml(ticket.tag)}</h1>
    <div class="meta">
      <span>🏠 Serveur : <strong>${escapeHtml(guild.name)}</strong></span>
      <span>👤 Ouvert par : <strong>&lt;@${ticket.ownerId}&gt; (${ticket.ownerId})</strong></span>
      <span>📅 Ouvert le : <strong>${openedDate}</strong></span>
      <span>🔒 Fermé le : <strong>${closedDate}</strong></span>
      <span>💬 Messages : <strong>${messages.length}</strong></span>
      ${ticket.reason ? `<span>❓ Raison : <strong>${escapeHtml(ticket.reason)}</strong></span>` : ''}
    </div>
  </div>
  <div class="messages">
${msgLines}
  </div>
  <div class="footer">Transcript généré le ${new Date().toLocaleString('fr-FR')} • Ticket #${ticketNum}</div>
</body>
</html>`;

  return html;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

// ─── Envoi dans les logs ─────────────────────────────────────────────────────
// Envoie dans le thread du ticket si disponible, sinon dans le salon de logs principal.

async function sendLog(guild, config, ticket, action, actor, extra = '') {
  if (!config.logChannelId) return;

  const embed = embedLog(ticket, action, actor, extra);

  // Essayer d'envoyer dans le thread du ticket
  const logThreadId = ticket?.logThreadId;
  if (logThreadId) {
    let thread = guild.channels.cache.get(logThreadId);
    if (!thread) thread = await guild.channels.fetch(logThreadId).catch(() => null);
    if (thread) {
      // Désarchiver si nécessaire avant d'envoyer
      if (thread.archived) await thread.setArchived(false).catch(() => {});
      return thread.send({ embeds: [embed] }).catch(() => {});
    }
  }

  // Fallback : salon de logs principal
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;
  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function formatDuration(start, end) {
  const ms = end - start;
  const s  = Math.floor(ms / 1000);
  const m  = Math.floor(s  / 60);
  const h  = Math.floor(m  / 60);
  const d  = Math.floor(h  / 24);
  if (d > 0)  return `${d}j ${h % 24}h`;
  if (h > 0)  return `${h}h ${m % 60}min`;
  if (m > 0)  return `${m}min ${s % 60}s`;
  return `${s}s`;
}

function hasSupport(member, config) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (config.supportRoleId && member.roles.cache.has(config.supportRoleId)) return true;
  return false;
}

function hasClaim(member, config) {
  if (!member) return false;
  if (hasSupport(member, config)) return true;
  if (config.claimRoleId && member.roles.cache.has(config.claimRoleId)) return true;
  return false;
}

// ─── Mise à jour du message d'accueil d'un ticket ouvert ─────────────────────
// Utilisé quand un tag est appliqué/modifié pour rafraîchir le container CV2.

async function refreshTicketMessage(guild, ticket) {
  if (!ticket.controlMsgId) return;
  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) return;

  const ctrlMsg = await channel.messages.fetch(ticket.controlMsgId).catch(() => null);
  if (!ctrlMsg) return;

  // Récupérer le propriétaire du ticket
  const owner = await guild.members.fetch(ticket.ownerId).catch(() => null);
  const ownerUser = owner?.user || { id: ticket.ownerId, username: 'Utilisateur', discriminator: '0',
    displayAvatarURL: () => `https://cdn.discordapp.com/embed/avatars/0.png` };

  const config = require('./ticketDB.js').getConfig(guild.id);

  // Reconstruire le container complet avec le nouveau tag
  const container = buildOpenContainer(ticket, ownerUser, config);

  await ctrlMsg.edit({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

module.exports = {
  createTicketChannel, closeTicketChannel, reopenTicketChannel,
  deleteTicketChannel, claimTicketChannel, unclaimTicketChannel,
  addUserToChannel, removeUserFromChannel,
  generateTranscript, sendLog, createLogThread, updateLogThread,
  buildControlRow, buildOpenContainer, embedClosed, embedClaimed, embedLog,
  hasSupport, hasClaim, formatDuration, COLORS,
  refreshTicketMessage,
};
