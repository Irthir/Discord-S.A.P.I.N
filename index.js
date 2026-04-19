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
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
})

/* =========================
   READY
========================= */

client.once('clientReady', () => {
  console.log(`Connecté en tant que ${client.user.tag}`)
  restore()
})

/* =========================
   INTERACTIONS
========================= */

client.on('interactionCreate', async interaction => {

  try {

    /* ---------- COMMANDES ---------- */

    if (interaction.isChatInputCommand()) {

      /* ===== PLANNING ===== */
      if (interaction.commandName === 'planning') {

        await interaction.deferReply({ flags: 64 })

        const input = interaction.options.getString('options') || ""
        const duree = interaction.options.getString('duree') || null

        const { jours, horaires } = parser(input)

        await envoyerPlanning(interaction, jours, horaires, duree)

        // IMPORTANT : confirmer la fin
        await interaction.editReply({
          content: "✅ Planning créé avec succès"
        })
      }

      /* ===== STOP ===== */
      else if (interaction.commandName === 'stopplanning') {

        const success = await stopSession(interaction.channel.id)

        await interaction.reply({
          content: success
            ? "📊 Planning clôturé."
            : "❌ Aucun planning actif.",
          flags: 64
        })
      }

      /* ===== CLEAR ===== */
      else if (interaction.commandName === 'clearplanning') {

        const success = await clearSession(interaction.channel.id)

        await interaction.reply({
          content: success
            ? "🧹 Planning supprimé."
            : "❌ Aucun planning actif.",
          flags: 64
        })
      }
    }

    /* ---------- BOUTONS ---------- */

    if (interaction.isButton()) {
      await handleVote(interaction)
    }

  } catch (err) {

    console.error("❌ Erreur interaction :", err)

    // éviter "application ne répond plus"
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "❌ Une erreur est survenue.",
        flags: 64
      }).catch(() => {})
    } else {
      await interaction.reply({
        content: "❌ Une erreur est survenue.",
        flags: 64
      }).catch(() => {})
    }
  }
})

/* =========================
   MESSAGE DELETE
========================= */

client.on("messageDelete", async message => {
  try {
    if (!message.guild || !message.id) return
    await recreateIfMissing(message)
  } catch (err) {
    console.error("Erreur recreate message :", err)
  }
})

/* =========================
   ANTI CRASH
========================= */

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)

/* =========================
   LOGIN
========================= */

client.login(process.env.TOKEN)

/* =========================
   GLOBAL CLIENT
========================= */

global.client = client