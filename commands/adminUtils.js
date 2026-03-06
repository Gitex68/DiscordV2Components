// commands/adminUtils.js — Helpers partagés pour les commandes admin
// Résolution de membre, embeds CV2 uniformes, vérification de hiérarchie.

const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  SeparatorSpacingSize, MessageFlags, PermissionFlagsBits,
} = require('discord.js');

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

// Embed conteneur succès (vert)
function ok(text) {
  return {
    components: [
      new ContainerBuilder().setAccentColor(0x57f287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

// Embed conteneur erreur (rouge)
function err(text) {
  return {
    components: [
      new ContainerBuilder().setAccentColor(0xed4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

// Embed conteneur info (bleu)
function info(text, color = 0x5865f2) {
  return {
    components: [
      new ContainerBuilder().setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

// Résoudre un membre depuis une mention ou ID
async function resolveMember(guild, arg) {
  if (!arg) return null;
  const id = arg.replace(/[<@!>]/g, '');
  return guild.members.fetch(id).catch(() => null);
}

// Résoudre un salon depuis une mention ou ID
function resolveChannel(guild, arg) {
  if (!arg) return null;
  const id = arg.replace(/[<#>]/g, '');
  return guild.channels.cache.get(id) || null;
}

// Vérifie si le bot peut agir sur le membre cible (hiérarchie des rôles)
function canActOn(botMember, targetMember) {
  if (!targetMember) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  return botMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

// Vérifie si le modérateur peut agir sur la cible
function modCanActOn(modMember, targetMember) {
  if (!targetMember) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  return modMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

// Formate une durée en secondes → lisible
function fmtDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}j`;
}

// Parse une durée (ex: "10m", "2h", "1d", "30s") → secondes
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d|j)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400, j: 86400 };
  return n * (mult[unit] || 1);
}

module.exports = { sep, ok, err, info, resolveMember, resolveChannel, canActOn, modCanActOn, fmtDuration, parseDuration };
