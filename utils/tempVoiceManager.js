// utils/tempVoiceManager.js
// Gestion des salons vocaux temporaires.
// - Création d'un salon perso quand un membre rejoint le hub
// - Panel de contrôle persistant (Components V2) posté dans le salon
// - Suppression automatique quand le salon est vide
// - Limite de membres, verrouillage, renommage, transfert d'ownership

'use strict';

const {
  ChannelType, PermissionFlagsBits,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');

const db = require('./tempVoiceDB.js');

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

// ─── Nommage ──────────────────────────────────────────────────────────────────

function formatName(template, member) {
  return template
    .replace('{username}', member.user.username)
    .replace('{displayname}', member.displayName)
    .replace('{tag}', member.user.tag)
    .slice(0, 100);
}

// ─── Création du salon temporaire ────────────────────────────────────────────

async function createTempChannel(guild, member) {
  const cfg = db.getConfig(guild.id);
  if (!cfg.enabled || !cfg.hubChannelId) return null;

  const name = formatName(cfg.nameTemplate || '🎮 {username}', member);

  const channelOptions = {
    name,
    type: ChannelType.GuildVoice,
    userLimit: cfg.defaultLimit ?? 0,
    permissionOverwrites: [
      // L'owner a tous les droits
      {
        id:    member.id,
        allow: [
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Speak,
        ],
      },
      // @everyone par défaut : peut se connecter (sera ajusté si verrouillé)
      {
        id:    guild.roles.everyone.id,
        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
      },
    ],
  };

  // Placer dans la catégorie configurée si définie
  if (cfg.categoryId) {
    const cat = guild.channels.cache.get(cfg.categoryId);
    if (cat) channelOptions.parent = cat.id;
  } else {
    // Sinon, même catégorie que le hub
    const hub = guild.channels.cache.get(cfg.hubChannelId);
    if (hub?.parentId) channelOptions.parent = hub.parentId;
  }

  let channel;
  try {
    channel = await guild.channels.create(channelOptions);
  } catch (e) {
    console.error('[TempVoice] Impossible de créer le salon:', e.message);
    return null;
  }

  // Enregistrer dans la DB
  db.registerChannel(channel.id, guild.id, member.id);

  // Déplacer le membre dans son nouveau salon
  try {
    await member.voice.setChannel(channel);
  } catch (e) {
    console.error('[TempVoice] Impossible de déplacer le membre:', e.message);
    // Supprimer le salon car inutilisable
    await channel.delete('[TempVoice] Échec du déplacement').catch(() => {});
    db.unregisterChannel(channel.id);
    return null;
  }

  // Poster le panel de contrôle dans le salon texte le plus proche (même catégorie)
  // ou en DM de l'owner si pas de salon texte
  await postControlPanel(channel, member, guild);

  return channel;
}

// ─── Panel de contrôle ────────────────────────────────────────────────────────

/**
 * Construit le Container V2 du panel de contrôle.
 * channelId et ownerId sont passés pour permettre le refresh.
 */
function buildControlPanel(channel, ownerId, cfg) {
  const chData = db.getChannel(channel.id);
  const isPrivate = chData?.private ?? false;
  const limit = channel.userLimit ?? 0;

  const c = new ContainerBuilder().setAccentColor(0x5865f2);

  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🎙️ Ton salon vocal\n` +
          `-# <@${ownerId}> · <#${channel.id}>`
        )
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('https://cdn.discordapp.com/embed/avatars/2.png')
          .setDescription('Salon vocal')
      )
  );

  c.addSeparatorComponents(sep());

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `🔒 **État :** ${isPrivate ? 'Privé — accès sur invitation' : 'Public — ouvert à tous'}\n` +
      `👥 **Limite :** ${limit > 0 ? `${limit} personne${limit > 1 ? 's' : ''}` : 'Illimitée'}\n` +
      `\n` +
      `-# Seul le propriétaire peut modifier ces paramètres.`
    )
  );

  c.addSeparatorComponents(sep());

  // Ligne 1 : verrouillage + limite
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vc_lock_${channel.id}`)
      .setLabel(isPrivate ? 'Déverrouiller' : 'Verrouiller')
      .setStyle(isPrivate ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(isPrivate ? '🔓' : '🔒')
      .setDisabled(!cfg.allowLock),
    new ButtonBuilder()
      .setCustomId(`vc_limit_${channel.id}`)
      .setLabel('Limite')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👥')
      .setDisabled(!cfg.allowLimit),
    new ButtonBuilder()
      .setCustomId(`vc_rename_${channel.id}`)
      .setLabel('Renommer')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✏️')
      .setDisabled(!cfg.allowRename),
  );

  // Ligne 2 : transfert + kick + supprimer
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vc_transfer_${channel.id}`)
      .setLabel('Transférer')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👑'),
    new ButtonBuilder()
      .setCustomId(`vc_kick_${channel.id}`)
      .setLabel('Expulser')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('👢'),
    new ButtonBuilder()
      .setCustomId(`vc_delete_${channel.id}`)
      .setLabel('Supprimer')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
  );

  c.addActionRowComponents(row1);
  c.addActionRowComponents(row2);
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Ce panel reste actif tant que le salon existe.`
    )
  );

  return c;
}

/**
 * Poste le panel de contrôle dans le salon textuel intégré au salon vocal qui vient d'être créé.
 * Discord intègre un fil de discussion textuel dans chaque salon GuildVoice — on y écrit directement.
 */
async function postControlPanel(voiceChannel, member, guild) {
  const cfg = db.getConfig(guild.id);
  const panel = buildControlPanel(voiceChannel, member.id, cfg);

  try {
    const msg = await voiceChannel.send({
      components: [panel],
      flags: MessageFlags.IsComponentsV2,
    });
    return msg;
  } catch (e) {
    console.error('[TempVoice] Impossible de poster le panel dans le salon vocal:', e.message);
    return null;
  }
}

// ─── Suppression automatique ─────────────────────────────────────────────────

/**
 * Appelé à chaque voiceStateUpdate.
 * Vérifie si le salon est enregistré et vide → le supprime.
 */
async function checkAndDelete(channel) {
  if (!channel) return;
  if (!db.isTempChannel(channel.id)) return;

  // Recharger le salon depuis le cache pour avoir les membres à jour
  const members = channel.members?.size ?? 0;
  if (members > 0) return;

  console.log(`[TempVoice] Salon vide → suppression : ${channel.name} (${channel.id})`);
  db.unregisterChannel(channel.id);
  try {
    await channel.delete('[TempVoice] Salon vide — suppression automatique');
  } catch (e) {
    console.error('[TempVoice] Impossible de supprimer le salon:', e.message);
  }
}

// ─── Actions du panel ─────────────────────────────────────────────────────────

/** Verrouille ou déverrouille le salon */
async function toggleLock(channel, guild) {
  const chData = db.getChannel(channel.id);
  if (!chData) return false;

  const newPrivate = !chData.private;
  db.setChannelPrivate(channel.id, newPrivate);

  try {
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      Connect: newPrivate ? false : null,
    });
    return true;
  } catch (e) {
    console.error('[TempVoice] toggleLock error:', e.message);
    return false;
  }
}

/** Change la limite de membres */
async function setLimit(channel, limit) {
  try {
    await channel.setUserLimit(limit);
    return true;
  } catch (e) {
    console.error('[TempVoice] setLimit error:', e.message);
    return false;
  }
}

/** Renomme le salon */
async function renameChannel(channel, name) {
  try {
    await channel.setName(name.slice(0, 100));
    return true;
  } catch (e) {
    console.error('[TempVoice] renameChannel error:', e.message);
    return false;
  }
}

/** Transfert de propriété */
async function transferOwnership(channel, guild, oldOwnerId, newOwner) {
  db.setChannelOwner(channel.id, newOwner.id);

  // Modifier les permissions : retirer les droits de l'ancien owner, donner au nouveau
  try {
    await channel.permissionOverwrites.edit(oldOwnerId, {
      ManageChannels: null,
      MuteMembers:    null,
      DeafenMembers:  null,
      MoveMembers:    null,
    });
    await channel.permissionOverwrites.edit(newOwner.id, {
      Connect:        true,
      ManageChannels: true,
      MuteMembers:    true,
      DeafenMembers:  true,
      MoveMembers:    true,
      ViewChannel:    true,
      Speak:          true,
    });
    return true;
  } catch (e) {
    console.error('[TempVoice] transferOwnership error:', e.message);
    return false;
  }
}

/** Expulse un membre du salon vocal */
async function kickFromChannel(guild, targetId) {
  const member = guild.members.cache.get(targetId);
  if (!member?.voice?.channelId) return false;
  try {
    await member.voice.disconnect('[TempVoice] Expulsé par le propriétaire du salon');
    return true;
  } catch (e) {
    console.error('[TempVoice] kickFromChannel error:', e.message);
    return false;
  }
}

module.exports = {
  createTempChannel,
  buildControlPanel,
  postControlPanel,
  checkAndDelete,
  toggleLock,
  setLimit,
  renameChannel,
  transferOwnership,
  kickFromChannel,
  formatName,
};
