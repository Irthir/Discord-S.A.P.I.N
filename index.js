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
  restore
} = require('./planning')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
})

client.once('clientReady', () => {
  console.log(`Connecté en tant que ${client.user.tag}`)
  restore()
})

client.on('interactionCreate', async interaction => {

  try {

    /* ===== COMMANDES ===== */
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === 'planning') {

        await interaction.deferReply({ flags: 64 })

        const input = interaction.options.getString('options') || ""
        const duree = interaction.options.getString('duree') || null

        const { jours, horaires } = parser(input)

        await envoyerPlanning(interaction, jours, horaires, duree)

        await interaction.editReply({
          content: "✅ Planning créé"
        })
      }

      else if (interaction.commandName === 'stopplanning') {

        const success = await stopSession(interaction.channel)

        await interaction.reply({
          content: success
            ? "📊 Planning clôturé."
            : "❌ Aucun planning actif.",
          flags: 64
        })
      }

      else if (interaction.commandName === 'clearplanning') {

        const success = await clearSession(interaction.channel)

        await interaction.reply({
          content: success
            ? "🧹 Planning supprimé."
            : "❌ Aucun planning actif.",
          flags: 64
        })
      }
    }

    /* ===== BOUTONS ===== */
    else if (interaction.isButton()) {
      await handleVote(interaction)
    }

  } catch (err) {

    console.error("❌ Interaction error:", err)

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "❌ Erreur.",
          flags: 64
        })
      } else {
        await interaction.reply({
          content: "❌ Erreur.",
          flags: 64
        })
      }
    } catch {}
  }
})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)

client.login(process.env.token)

global.client = client