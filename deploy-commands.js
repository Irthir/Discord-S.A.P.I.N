const { REST, Routes, SlashCommandBuilder } = require('discord.js')
require('dotenv').config()

const commands = [
  new SlashCommandBuilder()
  .setName('planning')
  .setDescription('Générer un planning')
  .addStringOption(option =>
    option
      .setName('options')
      .setDescription('semaine / weekend / lun mar 10-12 etc.')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('duree')
      .setDescription('Durée avant clôture (ex: 30m, 2h, 1j)')
      .setRequired(false)
  ).toJSON(),

  new SlashCommandBuilder()
  .setName('stopplanning')
  .setDescription('Clôturer immédiatement le planning actif'),

  new SlashCommandBuilder()
  .setName('clearplanning')
  .setDescription('Supprimer le planning actif sans afficher les résultats')
]

const rest = new REST({ version: '10' }).setToken(process.env.token)

;(async () => {
  try {
    console.log('Déploiement commande...')

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    )

    console.log('Commande déployée.')
  } catch (error) {
    console.error(error)
  }
})()