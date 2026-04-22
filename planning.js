const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js")

const fs = require("fs")
const path = require("path")

const DATA_FILE = path.join(__dirname, "planning_data.json")

/* =========================
   CONFIG
========================= */

const JOURS = {
  lun: "Lundi",
  mar: "Mardi",
  mer: "Mercredi",
  jeu: "Jeudi",
  ven: "Vendredi",
  sam: "Samedi",
  dim: "Dimanche"
}

const HORAIRES_DEFAUT = ["20h-22h"]

let votes = new Map()
let sessions = new Map()
let timers = new Map()

/* =========================
   PARSER
========================= */

function parser(input) {

  if (!input) {
    return {
      jours: ["ven"],
      horaires: HORAIRES_DEFAUT
    }
  }

  const args = input.toLowerCase().split(/\s+/)

  let jours = []
  let horaires = []

  for (let arg of args) {

    if (JOURS[arg]) {
      jours.push(arg)
    }

    const match = arg.match(/^(\d{1,2})h?-(\d{1,2})h?$/)
    if (match) {
      horaires.push(`${match[1]}h-${match[2]}h`)
    }
  }

  if (jours.length === 0) jours = ["ven"]
  if (horaires.length === 0) horaires = HORAIRES_DEFAUT

  return { jours, horaires }
}

/* =========================
   SAVE / RESTORE
========================= */

function persist() {

  const data = {
    votes: [...votes.entries()].map(([id, v]) => [
      id,
      {
        ...v,
        up: [...v.up],
        maybe: [...v.maybe],
        down: [...v.down]
      }
    ]),
    sessions: [...sessions.entries()]
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function restore(client) {

  if (!fs.existsSync(DATA_FILE)) return

  const data = JSON.parse(fs.readFileSync(DATA_FILE))

  votes = new Map(
    data.votes.map(([id, v]) => [
      id,
      {
        ...v,
        up: new Set(v.up),
        maybe: new Set(v.maybe),
        down: new Set(v.down)
      }
    ])
  )

  sessions = new Map(data.sessions)

  for (const [channelId, session] of sessions.entries()) {

    const remaining = session.endTime - Date.now()

    if (remaining <= 0) {
      cleanupSession(channelId)
      continue
    }

    const timer = setTimeout(() => {
      const channel = global.client.channels.cache.get(channelId)
      if (channel) finaliserSession(channel)
    }, remaining)

    timers.set(channelId, timer)
  }

  console.log("✔ Sessions restaurées")
}

/* =========================
   CLEANUP
========================= */

function cleanupSession(channelId) {

  const session = sessions.get(channelId)
  if (!session) return

  for (const id of session.creneaux) {
    votes.delete(id)
  }

  const timer = timers.get(channelId)
  if (timer) clearTimeout(timer)

  timers.delete(channelId)
  sessions.delete(channelId)

  persist()
}

/* =========================
   UI
========================= */

function buildBar(value, total) {
  if (total === 0) return "░░░░░░░░░░"
  const filled = Math.round((value / total) * 10)
  return "█".repeat(filled) + "░".repeat(10 - filled)
}

function createButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vote_up_${id}`).setLabel("👍").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`vote_maybe_${id}`).setLabel("🤔").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`vote_down_${id}`).setLabel("❌").setStyle(ButtonStyle.Danger)
  )
}

function createEmbed(jourKey, horaire, data) {

  const total = data.up.size + data.maybe.size + data.down.size

  return new EmbedBuilder()
    .setTitle(`📅 ${JOURS[jourKey]}`)
    .setDescription(`⏰ ${horaire}`)
    .addFields({
      name: "Votes",
      value:
`👍 ${data.up.size} ${buildBar(data.up.size, total)}
🤔 ${data.maybe.size} ${buildBar(data.maybe.size, total)}
❌ ${data.down.size} ${buildBar(data.down.size, total)}`
    })
    .setColor(0x5865F2)
}

/* =========================
   CREATION MULTI CRENEAUX
========================= */

async function envoyerPlanning(interaction, jours, horaires, duree) {

  const channel = interaction.channel

  if (sessions.has(channel.id)) {
    return interaction.editReply({
      content: "❌ Un planning est déjà actif."
    })
  }

  const duration = 24 * 60 * 60 * 1000

  const session = {
    creneaux: [],
    endTime: Date.now() + duration
  }

  sessions.set(channel.id, session)

  for (const jour of jours) {
    for (const horaire of horaires) {

      const id = `${Date.now()}_${jour}_${horaire}`

      const voteData = {
        jour,
        horaire,
        up: new Set(),
        maybe: new Set(),
        down: new Set()
      }

      const embed = createEmbed(jour, horaire, voteData)

      const msg = await channel.send({
        embeds: [embed],
        components: [createButtons(id)]
      })

      voteData.messageId = msg.id

      votes.set(id, voteData)
      session.creneaux.push(id)
    }
  }

  const timer = setTimeout(() => {
    finaliserSession(channel)
  }, duration)

  timers.set(channel.id, timer)

  persist()
}

/* =========================
   VOTE
========================= */

async function handleVote(interaction) {

  const [_, type, id] = interaction.customId.split("_")
  const voteData = votes.get(id)
  if (!voteData) return

  const user = interaction.user.id

  voteData.up.delete(user)
  voteData.maybe.delete(user)
  voteData.down.delete(user)

  voteData[type].add(user)

  const embed = createEmbed(voteData.jour, voteData.horaire, voteData)

  const msg = await interaction.channel.messages.fetch(voteData.messageId)
  await msg.edit({ embeds: [embed] })

  await interaction.reply({ content: "Vote enregistré", ephemeral: true })

  persist()
}

/* =========================
   FINALISATION
========================= */

async function finaliserSession(channel) {

  const session = sessions.get(channel.id)
  if (!session) return

  let recap = ""

  for (const id of session.creneaux) {

    const data = votes.get(id)
    if (!data) continue

    recap += `📅 ${JOURS[data.jour]} ${data.horaire}
👍 ${data.up.size} | 🤔 ${data.maybe.size} | ❌ ${data.down.size}\n\n`
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📊 Résultat")
        .setDescription(recap)
    ]
  })

  cleanupSession(channel.id)
}

/* =========================
   COMMANDES
========================= */

async function stopSession(channel) {

  if (!sessions.has(channel.id)) return false

  await finaliserSession(channel)
  return true
}

function clearSession(channel) {

  if (!sessions.has(channel.id)) return false

  cleanupSession(channel.id)
  return true
}

/* ========================= */

module.exports = {
  parser,
  envoyerPlanning,
  handleVote,
  stopSession,
  clearSession,
  restore
}