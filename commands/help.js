// commands/help.js — .help [commande]
// Une page = une catégorie. Navigation prev/next + select commande.
// Section Administration : visible uniquement par les membres avec perm ManageGuild ou Administrator.

const {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits,
} = require('discord.js');

// ─── Données des commandes ────────────────────────────────────────────────────
const commandsInfo = {
  // ── Utilitaires ──────────────────────────────────────────────────────────────
  ping:       { emoji: '📡', description: 'Affiche la latence du bot',                         usage: '.ping',                                      aliases: ['.p', '.latence'],                        category: 'Utilitaires' },
  help:       { emoji: '📚', description: 'Affiche cette aide',                                 usage: '.help [commande]',                            aliases: ['.h', '.aide'],                           category: 'Utilitaires' },
  info:       { emoji: 'ℹ️',  description: 'Informations du serveur (4 onglets)',               usage: '.info',                                      aliases: ['.serveur', '.server', '.i'],              category: 'Utilitaires' },
  avatar:     { emoji: '🖼️', description: "Affiche l'avatar d'un utilisateur",                 usage: '.avatar [@user]',                             aliases: ['.av', '.pp'],                            category: 'Utilitaires' },
  profil:     { emoji: '🪪',  description: "Profil complet, stats et avatar d'un membre",       usage: '.profil [@user]',                             aliases: ['.user', '.membre', '.whois', '.ui'],     category: 'Utilitaires' },
  sprofil:    { emoji: '🏠',  description: 'Profil du serveur, stats et icône',                 usage: '.sprofil',                                    aliases: ['.serverinfo', '.si', '.guild'],          category: 'Utilitaires' },
  stats:      { emoji: '📊',  description: 'Statistiques d\'activité (vocal, messages, jeux)',  usage: '.stats [@user]',                              aliases: ['.activite', '.activity', '.ac', '.stat'], category: 'Utilitaires' },
  srank:      { emoji: '🏆',  description: 'Classements d\'activité du serveur',                usage: '.srank',                                      aliases: ['.rank', '.classement', '.lb', '.top'],   category: 'Utilitaires' },
  shorten:    { emoji: '🔗',  description: 'Raccourcit un lien via TinyURL',                    usage: '.shorten <url>',                              aliases: ['.short', '.tinyurl', '.raccourcir'],     category: 'Utilitaires' },
  wiki:       { emoji: '📖',  description: 'Recherche rapide sur Wikipédia (FR)',               usage: '.wiki <recherche>',                           aliases: ['.wikipedia', '.w', '.recherche'],        category: 'Utilitaires' },
  qrcode:     { emoji: '🔲',  description: 'Génère un QR Code',                                 usage: '.qrcode <texte ou url>',                      aliases: ['.qr', '.genqr'],                         category: 'Utilitaires' },
  scan:       { emoji: '🛡️',  description: 'Analyse une URL pour contenu malveillant',         usage: '.scan <url>',                                 aliases: ['.urlscan', '.check', '.analyser'],       category: 'Utilitaires' },

  // ── Fun ──────────────────────────────────────────────────────────────────────
  des:        { emoji: '🎲', description: 'Lance un dé (D6 par défaut, max D1000)',             usage: '.des [faces]',                                aliases: ['.dice', '.d'],                           category: 'Fun' },
  roll:       { emoji: '🎯', description: 'Nombre aléatoire entre deux bornes',                 usage: '.roll <min> <max>',                           aliases: ['.random', '.rand', '.rng'],              category: 'Fun' },
  sondage:    { emoji: '📊', description: 'Lance un sondage interactif (5 minutes)',            usage: '.sondage <question> | <choix1> | <choix2>',   aliases: ['.poll'],                                 category: 'Fun' },

  // ── Démos V2 ─────────────────────────────────────────────────────────────────
  boutons:    { emoji: '🎛️', description: 'Démo de tous les styles de boutons V2',             usage: '.boutons',                                    aliases: ['.buttons', '.btn', '.demo'],             category: 'Démos V2' },
  selectmenu: { emoji: '📋', description: 'Démo de menu de sélection StringSelect',            usage: '.selectmenu',                                 aliases: ['.menu'],                                 category: 'Démos V2' },
  modal:      { emoji: '📝', description: 'Démo de formulaire modal (TextInput)',               usage: '.modal',                                      aliases: ['.form', '.formulaire'],                  category: 'Démos V2' },
  cv2demo:    { emoji: '🧪', description: 'Démo complète de tous les composants V2',            usage: '.cv2demo',                                    aliases: ['.v2', '.components'],                    category: 'Démos V2' },
  cv2profil:  { emoji: '🪪', description: 'Carte de profil V2 avec bouton de note',             usage: '.cv2profil [@user]',                          aliases: ['.cv2p', '.cardprofil'],                  category: 'Démos V2' },
  cv2galerie: { emoji: '🗂️', description: 'Galerie MediaGallery V2 interactive',               usage: '.cv2galerie',                                 aliases: ['.galerie', '.cv2g'],                     category: 'Démos V2' },
  cv2carte:   { emoji: '🗺️', description: 'Carte contextuelle V2 avec onglets',                usage: '.cv2carte',                                   aliases: ['.carte', '.cv2c'],                       category: 'Démos V2' },

  // ── Tickets ───────────────────────────────────────────────────────────────────
  ticket:     { emoji: '🎫', description: 'Ouvre un ticket de support',                        usage: '.ticket [raison]',                            aliases: ['.t', '.open'],                           category: 'Tickets' },
  tconfig:    { emoji: '⚙️', description: 'Configure le système de tickets',                   usage: '.tconfig <sous-commande>',                    aliases: ['.tc', '.ticketconfig'],                  category: 'Tickets' },
  tpanel:     { emoji: '📌', description: 'Envoie le panneau de tickets dans un salon',        usage: '.tpanel [#salon]',                            aliases: ['.panel', '.ticketpanel', '.tp'],         category: 'Tickets' },
  tclose:     { emoji: '🔒', description: 'Ferme le ticket du salon courant',                  usage: '.tclose',                                     aliases: ['.close', '.fermer'],                     category: 'Tickets' },
  tclaim:     { emoji: '🛡️', description: 'Prend en charge / libère un ticket (staff)',       usage: '.tclaim',                                     aliases: ['.claim'],                                category: 'Tickets' },
  tadd:       { emoji: '➕', description: "Ajoute un utilisateur à un ticket",                 usage: '.tadd @user',                                 aliases: ['.ticketadd'],                            category: 'Tickets' },
  tremove:    { emoji: '➖', description: "Retire un utilisateur d'un ticket",                 usage: '.tremove @user',                              aliases: ['.tkick'],                                category: 'Tickets' },

  // ── Multimédia ───────────────────────────────────────────────────────────────
  play:       { emoji: '🎵', description: 'Lecteur audio — rejoins ton vocal et lance la musique', usage: '.play [url ou recherche]', aliases: ['.music', '.m', '.jouer'],         category: 'Multimédia' },
  ytdl:       { emoji: '⬇️', description: 'Télécharge une vidéo/audio YouTube (mp3, mp4)',         usage: '.ytdl [url]',             aliases: ['.download', '.yt', '.télécharger'], category: 'Multimédia' },

  // ── Administration (admin uniquement) ─────────────────────────────────────────
  lconfig:    { emoji: '📋', description: 'Configure les logs du serveur',                      usage: '.lconfig',                                    aliases: ['.logconfig', '.lc'],                     category: 'Administration' },
  sconfig:    { emoji: '📊', description: 'Configure les salons compteurs dynamiques',          usage: '.sconfig [set|remove|reset|refresh]',         aliases: ['.scfg', '.counters'],                    category: 'Administration' },
  ban:        { emoji: '🔨', description: 'Banni un membre (durée optionnelle)',                usage: '.ban @user [durée] [raison]',                 aliases: ['.bannir'],                               category: 'Administration' },
  unban:      { emoji: '🔓', description: 'Débanni un membre par ID',                           usage: '.unban <ID> [raison]',                        aliases: ['.debannir', '.pardon'],                  category: 'Administration' },
  kick:       { emoji: '👢', description: 'Expulse un membre du serveur',                       usage: '.kick @user [raison]',                        aliases: ['.expulser'],                             category: 'Administration' },
  mute:       { emoji: '🔇', description: 'Timeout un membre (durée obligatoire)',              usage: '.mute @user <durée> [raison]',                aliases: ['.silence', '.timeout'],                  category: 'Administration' },
  unmute:     { emoji: '🔊', description: "Retire le timeout d'un membre",                     usage: '.unmute @user',                               aliases: ['.desilence', '.untimeout'],              category: 'Administration' },
  warn:       { emoji: '⚠️', description: 'Ajoute un avertissement à un membre',               usage: '.warn @user <raison>',                        aliases: ['.avertir'],                              category: 'Administration' },
  warnings:   { emoji: '📋', description: "Liste les avertissements d'un membre",              usage: '.warnings @user',                             aliases: ['.warns', '.infractions'],                category: 'Administration' },
  clearwarns: { emoji: '🗑️', description: 'Supprime tout ou un avertissement',                usage: '.clearwarns @user [id]',                      aliases: ['.delwarn', '.rmwarn'],                   category: 'Administration' },
  purge:      { emoji: '🧹', description: 'Supprime des messages en masse (max 100, filtre @user)',  usage: '.purge <nombre> [@user]',  aliases: ['.prune', '.clr'],          category: 'Administration' },
  clean:      { emoji: '🗑️', description: 'Supprime N messages ou vide entièrement le salon (all)', usage: '.clean <nombre|all>',      aliases: ['.clear'],                  category: 'Administration' },
};

// ─── Commandes exécutables directement depuis le help (sans args requis) ─────
// Les autres affichent un modal pour collecter les arguments
const RUNNABLE_CMDS = new Set([
  'ping', 'help', 'info', 'sprofil', 'stats', 'srank', 'sconfig',
  'boutons', 'selectmenu', 'modal', 'cv2demo', 'cv2galerie', 'cv2carte', 'cv2profil',
  'des', 'roll', 'play', 'ytdl',
]);

// ─── Schémas d'arguments pour les commandes nécessitant des entrées ───────────
const CMD_ARG_SCHEMAS = {
  // Utilitaires — @user optionnel
  avatar:     { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: false, placeholder: 'Laisse vide pour toi-même' }] },
  profil:     { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: false, placeholder: 'Laisse vide pour toi-même' }] },
  cv2profil:  { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: false, placeholder: 'Laisse vide pour toi-même' }] },
  // Utilitaires — texte / URL requis
  wiki:       { inputs: [{ id: 'query', label: 'Recherche Wikipédia', required: true, placeholder: 'Ex: Tour Eiffel' }] },
  shorten:    { inputs: [{ id: 'url', label: 'URL à raccourcir', required: true, placeholder: 'https://exemple.com' }] },
  qrcode:     { inputs: [{ id: 'text', label: 'Texte ou URL pour le QR Code', required: true, placeholder: 'Ex: https://discord.gg/...' }] },
  scan:       { inputs: [{ id: 'url', label: 'URL à analyser', required: true, placeholder: 'https://exemple.com' }] },
  // Fun
  des:        { inputs: [{ id: 'faces', label: 'Nombre de faces (défaut : 6)', required: false, placeholder: 'Ex: 20' }] },
  roll:       { inputs: [{ id: 'min', label: 'Minimum (défaut : 1)', required: false, placeholder: '1' }, { id: 'max', label: 'Maximum (défaut : 100)', required: false, placeholder: '100' }] },
  sondage:    { inputs: [{ id: 'question', label: 'Question', required: true, placeholder: 'Ex: Tu préfères...' }, { id: 'choices', label: 'Choix séparés par |', required: true, placeholder: 'Oui | Non | Peut-être' }] },
  // Tickets
  ticket:     { inputs: [{ id: 'reason', label: 'Raison du ticket (optionnel)', required: false, placeholder: 'Ex: Problème de paiement' }] },
  tadd:       { inputs: [{ id: 'user', label: 'Utilisateur à ajouter (@mention ou ID)', required: true }] },
  tremove:    { inputs: [{ id: 'user', label: 'Utilisateur à retirer (@mention ou ID)', required: true }] },
  // Administration
  ban:        { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }, { id: 'duration', label: 'Durée (ex: 7d) — optionnel', required: false, placeholder: 'Ex: 7d, 1h' }, { id: 'reason', label: 'Raison — optionnel', required: false }] },
  unban:      { inputs: [{ id: 'id', label: 'ID de l\'utilisateur', required: true }, { id: 'reason', label: 'Raison — optionnel', required: false }] },
  kick:       { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }, { id: 'reason', label: 'Raison — optionnel', required: false }] },
  mute:       { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }, { id: 'duration', label: 'Durée (ex: 10m, 1h)', required: true }, { id: 'reason', label: 'Raison — optionnel', required: false }] },
  unmute:     { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }] },
  warn:       { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }, { id: 'reason', label: 'Raison', required: true }] },
  warnings:   { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }] },
  clearwarns: { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }, { id: 'id', label: 'ID warn à supprimer — optionnel', required: false }] },
  purge:      { inputs: [{ id: 'count', label: 'Nombre de messages (max 100)', required: true, placeholder: '20' }, { id: 'user', label: 'Filtrer par @user — optionnel', required: false }] },
  lock:       { inputs: [{ id: 'target', label: 'Salon ou "all" — optionnel', required: false, placeholder: '#salon ou all' }, { id: 'reason', label: 'Raison — optionnel', required: false }] },
  unlock:     { inputs: [{ id: 'target', label: 'Salon ou "all" — optionnel', required: false, placeholder: '#salon ou all' }] },
  slowmode:   { inputs: [{ id: 'duration', label: 'Durée ou "off"', required: true, placeholder: 'Ex: 10s, 1m, off' }] },
  vmute:      { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }] },
  vunmute:    { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }] },
  vkick:      { inputs: [{ id: 'user', label: 'Utilisateur (@mention ou ID)', required: true }] },
  move:       { inputs: [{ id: 'users', label: 'Utilisateurs (mentions séparées par espace)', required: true }, { id: 'channel', label: 'Salon vocal cible (#mention ou ID)', required: true }] },
  wouaf:      { inputs: [{ id: 'users', label: 'Utilisateurs (@mention)', required: true }, { id: 'duration', label: 'Durée (ex: 30s, 2m) — optionnel', required: false }] },
  // Multimédia
  play:       { inputs: [{ id: 'query', label: 'URL YouTube ou recherche', required: false, placeholder: 'Ex: Daft Punk Get Lucky ou https://youtu.be/...' }] },
  ytdl:       { inputs: [{ id: 'url', label: 'URL YouTube', required: false, placeholder: 'https://www.youtube.com/watch?v=...' }] },
};

// ─── Métadonnées des catégories ────────────────────────────────────────────────
const categoryMeta = {
  'Utilitaires':    { emoji: '🔧', color: 0x5865f2, thumb: 'https://cdn.discordapp.com/embed/avatars/0.png' },
  'Fun':            { emoji: '🎉', color: 0xfee75c, thumb: 'https://cdn.discordapp.com/embed/avatars/2.png' },
  'Multimédia':     { emoji: '🎵', color: 0xeb459e, thumb: 'https://cdn.discordapp.com/embed/avatars/3.png' },
  'Démos V2':       { emoji: '🧩', color: 0x2b2d31, thumb: 'https://cdn.discordapp.com/embed/avatars/3.png' },
  'Tickets':        { emoji: '🎫', color: 0x57f287, thumb: 'https://cdn.discordapp.com/embed/avatars/4.png' },
  'Administration': { emoji: '⚔️', color: 0xed4245, thumb: 'https://cdn.discordapp.com/embed/avatars/5.png' },
};

// Ordre logique des pages
const PAGE_ORDER = ['Utilitaires', 'Fun', 'Multimédia', 'Démos V2', 'Tickets', 'Administration'];

// ─── Permission admin ─────────────────────────────────────────────────────────
function isAdmin(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
      || member.permissions.has(PermissionFlagsBits.Administrator);
}

module.exports = {
  name: 'help',
  aliases: ['h', 'aide'],
  description: 'Affiche la liste des commandes disponibles',

  async execute(message, args, client) {
    const botAvatar  = message.client.user.displayAvatarURL({ size: 128, extension: 'png' });
    const admin      = isAdmin(message.member);
    const visiblePages = admin ? PAGE_ORDER : PAGE_ORDER.filter(c => c !== 'Administration');
    const totalCmds    = Object.values(commandsInfo).filter(c => admin || c.category !== 'Administration').length;

    // ── Constructeur du sommaire ──────────────────────────────────────────────
    function buildSummaryContainer(user) {
      const lines = visiblePages.map(cat => {
        const meta  = categoryMeta[cat];
        const count = Object.values(commandsInfo).filter(c => c.category === cat).length;
        return `${meta.emoji} **${cat}** — ${count} commande${count > 1 ? 's' : ''}`;
      }).join('\n');

      // Découper les boutons de catégories en rangées de 5 max
      const catButtons = visiblePages.map(cat => {
        const meta = categoryMeta[cat];
        return new ButtonBuilder()
          .setCustomId(`help_goto_${cat}`)
          .setLabel(cat)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(meta.emoji);
      });
      const btnRows = [];
      for (let i = 0; i < catButtons.length; i += 5) {
        btnRows.push(
          new ActionRowBuilder().addComponents(...catButtons.slice(i, i + 5))
        );
      }

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help_summary')
          .setLabel('📋 Sommaire')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('help_next')
          .setLabel('Première catégorie ▶')
          .setStyle(ButtonStyle.Secondary),
      );

      const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# 📚 Aide — ${message.client.user.username}\n` +
                `-# ${totalCmds} commandes disponibles · Préfixe : \`.\``
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(botAvatar).setDescription('Bot')
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
        );

      for (const row of btnRows) container.addActionRowComponents(row);
      container.addActionRowComponents(navRow);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Demandé par ${user.tag} · expire dans 90s`)
      );
      return container;
    }

    // ── Constructeur de page catégorie ────────────────────────────────────────
    function buildPageContainer(idx, user) {
      const cat   = visiblePages[idx];
      const meta  = categoryMeta[cat];
      const cmds  = Object.entries(commandsInfo).filter(([, c]) => c.category === cat);
      const total = visiblePages.length;

      const lines = cmds.map(([, c]) =>
        `${c.emoji} **\`${c.usage}\`**\n-# ${c.description}`
      ).join('\n');

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('help_cmd_select')
          .setPlaceholder('🔍 Détail d\'une commande...')
          .addOptions(
            cmds.map(([name, c]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel('.' + name)
                .setValue(name)
                .setDescription(c.description.slice(0, 100))
            )
          )
      );

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help_prev')
          .setLabel('◀ Précédent')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(total <= 1),
        new ButtonBuilder()
          .setCustomId('help_summary')
          .setLabel('🏠 Sommaire')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('help_next')
          .setLabel('Suivant ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(total <= 1),
      );

      return new ContainerBuilder()
        .setAccentColor(meta.color)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# ${meta.emoji} ${cat}\n` +
                `-# Page ${idx + 1} / ${total} · ${cmds.length} commande${cmds.length > 1 ? 's' : ''} · ${totalCmds} au total`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(botAvatar).setDescription('Bot')
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
        .addActionRowComponents(selectRow)
        .addActionRowComponents(navRow)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# Demandé par ${user.tag} · expire dans 90s`
          )
        );
    }

    // ── Constructeur de vue détail ────────────────────────────────────────────
    function buildDetailContainer(name, user) {
      const c    = commandsInfo[name];
      const meta = categoryMeta[c.category];
      const catCmds = Object.entries(commandsInfo).filter(([, x]) => x.category === c.category);

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('help_cmd_select')
          .setPlaceholder('🔍 Autre commande de la catégorie...')
          .addOptions(
            catCmds.map(([n, x]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel('.' + n)
                .setValue(n)
                .setDescription(x.description.slice(0, 100))
                .setDefault(n === name)
            )
          )
      );

      return new ContainerBuilder()
        .setAccentColor(meta.color)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# ${c.emoji} \`${c.usage.split(' ')[0]}\`\n` +
                `-# ${meta.emoji} ${c.category}`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(botAvatar).setDescription('Commande .' + name)
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**📄 Description**\n${c.description}`)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**⌨️ Utilisation**\n\`${c.usage}\``)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**🔁 Aliases**\n` +
                (c.aliases.length ? c.aliases.map(a => `\`${a}\``).join(' · ') : '*Aucun*')
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(meta.thumb).setDescription('Catégorie ' + c.category)
            )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('help_back')
              .setLabel('Retour à la liste')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📚'),
            new ButtonBuilder()
              .setCustomId(`help_run_${name}`)
              .setLabel(
                RUNNABLE_CMDS.has(name) ? '▶ Lancer la commande' :
                CMD_ARG_SCHEMAS[name]   ? '▶ Lancer la commande' :
                '📋 Copier'
              )
              .setStyle(
                RUNNABLE_CMDS.has(name) || CMD_ARG_SCHEMAS[name]
                  ? ButtonStyle.Success
                  : ButtonStyle.Secondary
              )
              .setEmoji(
                RUNNABLE_CMDS.has(name) || CMD_ARG_SCHEMAS[name] ? '🚀' : '📄'
              )
          )
        )
        .addActionRowComponents(selectRow)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# Demandé par ${user.tag} · expire dans 90s`
          )
        );
    }

    // ── Page initiale ─────────────────────────────────────────────────────────
    // Si .help <commande>, chercher la commande et afficher son détail
    let initPageIdx = 0;
    let initName    = null;
    let showSummary = true;

    if (args[0]) {
      const lookup = args[0].toLowerCase().replace(/^\./, '');
      if (commandsInfo[lookup] && (admin || commandsInfo[lookup].category !== 'Administration')) {
        initName    = lookup;
        initPageIdx = visiblePages.indexOf(commandsInfo[lookup].category);
        if (initPageIdx < 0) initPageIdx = 0;
        showSummary = false;
      }
    }

    const reply = await message.reply({
      components: [
        initName
          ? buildDetailContainer(initName, message.author)
          : showSummary
            ? buildSummaryContainer(message.author)
            : buildPageContainer(initPageIdx, message.author)
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // ── Collecteur ────────────────────────────────────────────────────────────
    let pageIdx    = initPageIdx;
    let currentCmd = initName;
    let onSummary  = showSummary && !initName;

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 90_000,
    });

    collector.on('collect', async (i) => {
      try {
        if (i.customId === 'help_summary') {
          currentCmd = null;
          onSummary  = true;
          await i.update({
            components: [buildSummaryContainer(i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId.startsWith('help_goto_')) {
          const cat = i.customId.replace('help_goto_', '');
          const idx = visiblePages.indexOf(cat);
          if (idx < 0) return;
          currentCmd = null;
          onSummary  = false;
          pageIdx    = idx;
          await i.update({
            components: [buildPageContainer(pageIdx, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId === 'help_prev') {
          currentCmd = null;
          onSummary  = false;
          pageIdx = (pageIdx - 1 + visiblePages.length) % visiblePages.length;
          await i.update({
            components: [buildPageContainer(pageIdx, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId === 'help_next') {
          currentCmd = null;
          if (onSummary) {
            onSummary = false;
            pageIdx   = 0;
          } else {
            pageIdx = (pageIdx + 1) % visiblePages.length;
          }
          await i.update({
            components: [buildPageContainer(pageIdx, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId === 'help_cmd_select') {
          currentCmd = i.values[0];
          onSummary  = false;
          const catIdx = visiblePages.indexOf(commandsInfo[currentCmd]?.category);
          if (catIdx >= 0) pageIdx = catIdx;
          await i.update({
            components: [buildDetailContainer(currentCmd, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId === 'help_back') {
          currentCmd = null;
          await i.update({
            components: [buildPageContainer(pageIdx, i.user)],
            flags: MessageFlags.IsComponentsV2,
          });
        } else if (i.customId.startsWith('help_run_')) {
          const cmdName = i.customId.replace('help_run_', '');
          const info    = commandsInfo[cmdName];
          if (!info) return;

          if (RUNNABLE_CMDS.has(cmdName)) {
            // Acquitter d'abord, puis exécuter la commande dans le salon
            await i.deferUpdate();
            const cmd = client.commands.get(cmdName);
            if (cmd) {
              try {
                await cmd.execute(message, [], client);
              } catch (e) {
                console.error(`[help_run] Erreur ${cmdName}:`, e.message);
              }
            }
          } else if (CMD_ARG_SCHEMAS[cmdName]) {
            // Commande avec args — afficher un modal pour les collecter
            const schema = CMD_ARG_SCHEMAS[cmdName];
            const modal  = new ModalBuilder()
              .setCustomId(`help_modal_${cmdName}`)
              .setTitle(`▶ Lancer .${cmdName}`)
              .addComponents(
                ...schema.inputs.slice(0, 5).map(inp =>
                  new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                      .setCustomId(inp.id)
                      .setLabel(inp.label)
                      .setStyle(TextInputStyle.Short)
                      .setRequired(inp.required ?? false)
                      .setPlaceholder(inp.placeholder ?? '')
                  )
                )
              );

            await i.showModal(modal);

            const sub = await i.awaitModalSubmit({
              filter: m => m.user.id === message.author.id && m.customId === `help_modal_${cmdName}`,
              time: 60_000,
            }).catch(() => null);
            if (!sub) return;

            // Construire le tableau d'args depuis les valeurs du modal (filtre les vides)
            const args = schema.inputs
              .map(inp => sub.fields.getTextInputValue(inp.id).trim())
              .filter(Boolean);

            await sub.deferReply({ flags: MessageFlags.Ephemeral });

            const cmd = client.commands.get(cmdName);
            if (!cmd) {
              return sub.editReply({ content: '❌ Commande introuvable.' });
            }
            try {
              await sub.editReply({
                components: [
                  new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                      new TextDisplayBuilder().setContent(
                        `🚀 Lancement de \`.${cmdName}\`...\n-# Les arguments ont bien été pris en compte.`
                      )
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
              });
              await cmd.execute(message, args, client);
            } catch (e) {
              console.error(`[help_run modal] ${cmdName}:`, e.message);
            }
          } else {
            // Commande sans schema connu — afficher l'usage en éphémère
            await i.reply({
              components: [
                new ContainerBuilder()
                  .setAccentColor(0xfee75c)
                  .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                      `## ${info.emoji} Utilisation de \`${info.usage.split(' ')[0]}\`\n` +
                      `\`${info.usage}\`\n\n` +
                      `-# Cette commande nécessite des arguments, tape-la directement dans le salon.`
                    )
                  ),
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
          }
        }
      } catch { /* interaction déjà acquittée */ }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'time') return;
      reply.edit({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      message.channel.send({
        content: `⏱️ <@${message.author.id}> L'aide a expiré. Relance avec \`.help\`.`,
        allowedMentions: { users: [message.author.id] },
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 8_000)).catch(() => {});
    });
  },
};
