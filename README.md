# 🤖 Discord Bot — Components V2

Bot Discord multifonction développé avec **discord.js v14** et les **Components V2** (flag `IsComponentsV2`).  
Préfixe : `.` — Système de commandes préfixées avec dashboards interactifs full Components V2.

---

## ✨ Fonctionnalités

### ⚙️ Administration
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.config` | `.cfg` `.conf` `.setup` `.panel` | Dashboard centralisé — accès à tous les modules |
| `.aconfig` | `.adminconfig` `.acfg` | Config rôle admin & méthode de mute |
| `.ban` | `.bannir` | Bannir un membre (durée optionnelle) |
| `.unban` | `.debannir` `.pardon` | Débannir un membre par ID |
| `.kick` | `.expulser` | Expulser un membre |
| `.mute` | `.silence` `.timeout` | Timeout un membre |
| `.unmute` | `.desilence` `.untimeout` | Retirer le timeout |
| `.warn` | `.avertir` | Avertir un membre |
| `.warnings` | `.warns` `.infractions` | Voir les avertissements d'un membre |
| `.clearwarns` | `.delwarn` `.rmwarn` | Effacer les avertissements |
| `.purge` | `.prune` `.clr` | Supprimer des messages en masse |
| `.lock` / `.unlock` | `.verrouiller` / `.deverrouiller` | Verrouiller/déverrouiller un salon |
| `.slowmode` | `.slow` `.ratelimit` | Définir le mode lent d'un salon |
| `.clean` | `.clear` | Nettoyer les messages du bot |

### 🎙️ Vocal
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.vcconfig` | `.vc` `.voiceconfig` `.tempvoice` | Dashboard salons vocaux temporaires |
| `.move` | `.deplacer` `.vmove` | Déplacer un membre en vocal |
| `.vkick` | `.voicekick` `.deco` | Déconnecter un membre du vocal |
| `.vmute` / `.vunmute` | `.voicemute` / `.voiceunmute` | Muter/démuter en vocal |
| `.wouaf` | `.summon` `.rappatrier` | Forcer un membre à rejoindre ton salon vocal |

### 🎫 Tickets
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.tconfig` | `.tc` `.ticketconfig` | Dashboard complet du système de tickets |
| `.tpanel` | `.panel` `.ticketpanel` | Créer/envoyer le panel de tickets |
| `.ticket` | `.t` `.open` | Ouvrir un ticket |
| `.tclose` | `.fermer` `.close` | Fermer un ticket |
| `.tclaim` | `.claim` | Claim un ticket (staff) |
| `.tadd` / `.tremove` | `.ticketadd` / `.ticketremove` | Ajouter/retirer un membre du ticket |

### 📋 Logs & Modération
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.lconfig` | `.lc` `.logconfig` | Dashboard configuration des logs serveur |

### 📊 Compteurs & Stats
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.sconfig` | `.scfg` `.counters` | Salons compteurs dynamiques (membres, bots, boosts…) |
| `.stats` | `.activite` `.activity` `.ac` | Stats d'activité des membres |
| `.srank` | `.rank` `.classement` `.leaderboard` | Classement d'activité |

### 🎮 Jeux Gratuits
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.fgconfig` | `.fg` `.freeconfig` `.jeux` | Dashboard annonces jeux gratuits (Epic Games, Steam, GamerPower) |

### ⛏️ Minecraft Status
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.mcconfig` | `.mc` `.minecraft` `.mcstatus` `.mcs` | Dashboard surveillance serveur Minecraft (protocole SLP natif) |

### 📜 Règlement
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.rconfig` | `.rc` `.rulesconfig` `.reglement` `.rules` | Dashboard règlement interactif avec bouton de validation |

### 🎵 Musique
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.play` | `.music` `.m` `.jouer` | Jouer de la musique (YouTube, Spotify, SoundCloud) |
| `.ytdl` | `.yt` `.download` `.télécharger` | Télécharger une vidéo/audio YouTube |

### 🛠️ Utilitaires
| Commande | Aliases | Description |
|----------|---------|-------------|
| `.ping` | `.latence` `.p` | Latence WebSocket & API |
| `.info` | `.serveur` `.server` | Infos du serveur |
| `.profil` | `.user` `.membre` `.whois` | Profil d'un membre |
| `.sprofil` | `.serverinfo` `.si` `.guild` | Infos détaillées du serveur |
| `.avatar` | `.av` `.pp` | Avatar d'un membre |
| `.help` | `.h` `.aide` | Aide complète (paginée, CV2) |
| `.roll` | `.random` `.rand` `.rng` `.nombre` | Nombre aléatoire |
| `.des` | `.dice` `.d` | Lancer des dés (ex: `2d6`, `1d20`) |
| `.sondage` | `.poll` | Créer un sondage |
| `.qrcode` | `.qr` `.genqr` | Générer un QR code |
| `.shorten` | `.short` `.tinyurl` `.raccourcir` | Raccourcir une URL |
| `.scan` | `.urlscan` `.virustotal` `.check` | Scanner une URL (VirusTotal / URLScan) |
| `.wiki` | `.wikipedia` `.w` `.recherche` | Recherche Wikipédia |

### 🎨 Démos Components V2
| Commande | Description |
|----------|-------------|
| `.boutons` | Démo des styles de boutons CV2 |
| `.cv2demo` | Démo interactive de tous les composants CV2 |
| `.cv2galerie` | Galerie MediaGallery CV2 |
| `.cv2carte` | Carte de profil CV2 |
| `.cv2profil` | Profil avancé CV2 avec stats |
| `.selectmenu` | Démo Select Menu CV2 |
| `.modal` | Démo Modal |

---

## 🚀 Installation

### Prérequis
- **Node.js** v18 ou supérieur
- **npm** v9+
- Un bot Discord avec les intents `MESSAGE_CONTENT`, `GUILD_MEMBERS`, `GUILDS`

### 1. Cloner le dépôt
```bash
git clone https://github.com/TON_USER/TON_REPO.git
cd TON_REPO
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configurer le bot
Copier le fichier d'exemple et remplir les valeurs :
```bash
cp config.example.json config.json
```

Éditer `config.json` :
```json
{
  "token": "VOTRE_TOKEN_BOT",
  "clientId": "ID_APPLICATION_BOT",
  "guildId": "ID_SERVEUR_DISCORD"
}
```

> ⚠️ **Ne jamais commit `config.json`** — il est dans le `.gitignore`.

### 4. Déployer les slash commands (optionnel)
```bash
npm run deploy
```

### 5. Lancer le bot
```bash
npm start
```

---

## 📁 Structure du projet

```
├── index.js                  # Point d'entrée, gestion des events et interactions
├── deploy-commands.js        # Déploiement des slash commands
├── config.json               # ⛔ Ignoré — Token & IDs (voir config.example.json)
├── config.example.json       # Template de configuration
├── package.json
│
├── commands/                 # Toutes les commandes préfixées
│   ├── config.js             # Dashboard centralisé (8 modules)
│   ├── mcconfig.js           # Surveillance serveur Minecraft
│   ├── tconfig.js            # Système de tickets
│   ├── lconfig.js            # Logs serveur
│   ├── sconfig.js            # Compteurs dynamiques
│   ├── vcconfig.js           # Salons vocaux temporaires
│   ├── fgconfig.js           # Annonces jeux gratuits
│   ├── rconfig.js            # Règlement interactif
│   ├── aconfig.js            # Config admin
│   └── ...                   # ~50 commandes
│
├── utils/
│   ├── mcManager.js          # Tracker MC — protocole SLP natif (net + dns)
│   ├── mcDB.js               # DB JSON Minecraft Status
│   ├── musicManager.js       # Gestionnaire musique (play-dl + @discordjs/voice)
│   ├── counterManager.js     # Compteurs dynamiques
│   ├── counterDB.js          # DB JSON compteurs
│   ├── charts.js             # Génération de graphiques (stats activité)
│   ├── ticketUtils.js        # Utilitaires tickets
│   └── ytdlProxy.js          # Proxy yt-dlp
│
├── tickets/
│   ├── ticketManager.js      # Logique tickets (ouverture, fermeture, claim)
│   └── ticketDB.js           # DB JSON tickets
│
├── logs/
│   ├── logManager.js         # Événements serveur → salon de logs
│   ├── logDB.js              # DB JSON config logs
│   └── warningDB.js          # DB JSON avertissements
│
├── activity/
│   ├── activityTracker.js    # Tracker d'activité (messages, vocal)
│   └── activityDB.js         # DB JSON activité
│
├── freegames/
│   ├── freeGamesManager.js   # Fetch Epic Games / Steam / GamerPower
│   └── freeGamesDB.js        # DB JSON jeux gratuits
│
└── data/                     # ⛔ Ignoré — Données persistantes JSON (auto-générées)
```

---

## 🔧 Technologies

| Tech | Usage |
|------|-------|
| **discord.js v14** | Framework Discord |
| **Components V2** | UI riche (Container, Section, TextDisplay, Thumbnail, Separator, MediaGallery) |
| **Node.js `net` + `dns`** | Protocole SLP Minecraft natif (sans lib externe) |
| **play-dl** | Streaming musique YouTube/Spotify/SoundCloud |
| **@discordjs/voice** | Audio Discord |
| **yt-dlp-exec** | Téléchargement vidéo/audio |
| **JSON files** | Persistance légère (pas de DB externe requise) |

---

## ⚙️ Configuration des modules

Chaque module se configure via le dashboard `.config` ou sa commande dédiée :

| Module | Commande | Données persistées |
|--------|----------|--------------------|
| Compteurs | `.sconfig` | `data/counters.json` |
| Logs | `.lconfig` | `logs/logs_data.json` |
| Tickets | `.tconfig` | `tickets/tickets_data.json` |
| Jeux Gratuits | `.fgconfig` | `freegames/freegames_data.json` |
| Admin | `.aconfig` | `data/admin_config.json` |
| Salons Vocaux Temp | `.vcconfig` | `data/tempvoice_data.json` |
| Règlement | `.rconfig` | `data/rules_data.json` |
| Minecraft Status | `.mcconfig` | `data/mc_data.json` |

---

## 📝 Licence

MIT — libre d'utilisation, modification et redistribution.
