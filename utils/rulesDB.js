// utils/rulesDB.js — Persistance JSON pour le système de règlement.
// Champs : enabled, rulesChannelId, joinRoleId, verifiedRoleId,
//          rulesText, buttonLabel, panelMessageId.

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'rules_data.json');

// ─── Valeurs par défaut ───────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  enabled:          false,
  rulesChannelId:   null,   // salon où le règlement est posté
  joinRoleId:       null,   // rôle attribué au join (bloque tout sauf #règlement)
  verifiedRoleId:   null,   // rôle attribué après validation du règlement
  rulesText:        '# 📜 Règlement\n\n' +
                    '**1.** Sois respectueux envers tous les membres.\n' +
                    '**2.** Pas de spam, flood ou publicité non autorisée.\n' +
                    '**3.** Pas de contenu NSFW en dehors des salons prévus à cet effet.\n' +
                    '**4.** Respecte les décisions des modérateurs.\n' +
                    '**5.** Bonne ambiance avant tout ! 🎉',
  buttonLabel:      '✅ J\'accepte le règlement',
  panelMessageId:   null,   // ID du message panel posté dans rulesChannelId
};

// ─── Lecture / Écriture ───────────────────────────────────────────────────────

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) return { guilds: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { guilds: {} };
  }
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Helpers guildes ──────────────────────────────────────────────────────────

function ensureGuild(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { ...DEFAULT_CONFIG };
  } else {
    // migration: ajouter les champs manquants
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
      if (data.guilds[guildId][k] === undefined) data.guilds[guildId][k] = v;
    }
  }
  return data.guilds[guildId];
}

// ─── API publique ─────────────────────────────────────────────────────────────

function getConfig(guildId) {
  const data = load();
  return ensureGuild(data, guildId);
}

function set(guildId, key, value) {
  const data = load();
  ensureGuild(data, guildId);
  data.guilds[guildId][key] = value;
  save(data);
}

function setMany(guildId, obj) {
  const data = load();
  ensureGuild(data, guildId);
  Object.assign(data.guilds[guildId], obj);
  save(data);
}

function reset(guildId) {
  const data = load();
  data.guilds[guildId] = { ...DEFAULT_CONFIG };
  save(data);
}

module.exports = { getConfig, set, setMany, reset, DEFAULT_CONFIG };
