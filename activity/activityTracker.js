// activity/activityTracker.js
// Écoute les événements Discord et alimente activityDB
// Usage : const tracker = require('./activity/activityTracker'); tracker.init(client);

const db = require('./activityDB.js');

function init(client) {

  // ─── Vocal ─────────────────────────────────────────────────────────────────
  client.on('voiceStateUpdate', (oldState, newState) => {
    const guildId = newState.guild?.id || oldState.guild?.id;
    const userId  = newState.member?.id || oldState.member?.id;
    if (!guildId || !userId || newState.member?.user?.bot) return;

    const leftChannel   = oldState.channelId;
    const joinedChannel = newState.channelId;

    if (!leftChannel && joinedChannel) {
      // Rejoint un salon vocal
      db.voiceStart(guildId, userId, joinedChannel);
    } else if (leftChannel && !joinedChannel) {
      // Quitte le vocal
      db.voiceEnd(guildId, userId);
    } else if (leftChannel && joinedChannel && leftChannel !== joinedChannel) {
      // Change de salon : termine l'ancienne session, démarre une nouvelle
      db.voiceEnd(guildId, userId);
      db.voiceStart(guildId, userId, joinedChannel);
    }
  });

  // ─── Présences / Jeux ──────────────────────────────────────────────────────
  client.on('presenceUpdate', (oldPresence, newPresence) => {
    const member  = newPresence?.member || oldPresence?.member;
    if (!member || member.user?.bot) return;
    const guildId = newPresence?.guild?.id || oldPresence?.guild?.id;
    const userId  = member.id;
    if (!guildId) return;

    // Activité de jeu = type 0 (Playing)
    const getGame = (presence) =>
      presence?.activities?.find(a => a.type === 0)?.name ?? null;

    const oldGame = getGame(oldPresence);
    const newGame = getGame(newPresence);

    if (oldGame === newGame) return; // pas de changement de jeu

    if (oldGame) db.gameEnd(guildId, userId);
    if (newGame) db.gameStart(guildId, userId, newGame);
  });

  // ─── Messages ──────────────────────────────────────────────────────────────
  // NB : messageCreate est déjà écouté dans index.js ; on expose une fonction
  // à appeler depuis le handler messageCreate existant plutôt que de le réécouter.
  // → voir onMessage() exporté ci-dessous.

  console.log('[ActivityTracker] Initialisé ✅');
}

/** À appeler depuis messageCreate dans index.js */
function onMessage(message) {
  if (!message.guild || message.author?.bot) return;
  db.addMessage(message.guild.id, message.author.id, message.channel.id);
}

module.exports = { init, onMessage };
