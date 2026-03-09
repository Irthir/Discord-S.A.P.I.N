const { 
  Client, 
  GatewayIntentBits, 
  Partials 
} = require('discord.js')

require('dotenv').config()

const {
  parser,
  envoyerPlanning,
  handleVote,
  stopSession,
  clearSession,
  restore,
  recreateIfMissing
} = require('./planning')

const client = new Client({
  intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
})

client.once('clientReady', () => {
  console.log(`Connecté en tant que ${client.user.tag}`)
  restore()
})

client.on('interactionCreate', async interaction => {

  try {

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === 'planning') {

        const input = interaction.options.getString('options') || ""
        const duree = interaction.options.getString('duree') || null

        const { jours, horaires } = parser(input)

        await envoyerPlanning(interaction, jours, horaires, duree)
      }

      if (interaction.commandName === 'stopplanning') {

        const success = await stopSession(interaction.channel.id)

        await interaction.reply({
          content: success
            ? "📊 Planning clôturé."
            : "Aucun planning actif.",
          flags: 64
        })
      }

      if (interaction.commandName === 'clearplanning') {

        const success = await clearSession(interaction.channel.id)

        await interaction.reply({
          content: success
            ? "🧹 Planning supprimé."
            : "Aucun planning actif.",
          flags: 64
        })
      }
    }

    if (interaction.isButton()) {
      await handleVote(interaction)
    }

  } catch (err) {
    console.error(err)
  }
})

client.on("messageDelete", async message => {

  if (!message.guild) return
  if (!message.id) return

  await recreateIfMissing(message)
})

client.login(process.env.token)

global.client = client