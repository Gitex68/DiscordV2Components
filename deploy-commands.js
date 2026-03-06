// deploy-commands.js
// Enregistre les slash commands sur le serveur (guild)

const { REST, Routes } = require('discord.js');
const { token, clientId, guildId } = require('./config.json');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`✅ Commande chargée : /${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`\n🚀 Déploiement de ${commands.length} commande(s) sur le serveur...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log(`✅ ${data.length} commande(s) déployée(s) avec succès !\n`);
    data.forEach(cmd => console.log(`   • /${cmd.name} (id: ${cmd.id})`));
  } catch (error) {
    console.error('❌ Erreur lors du déploiement :', error);
  }
})();
