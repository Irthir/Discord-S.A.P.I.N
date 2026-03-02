const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js')

const { normaliserHoraire, parseDuree } = require('./utils')
let activeSessions = new Map()

const JOURS = {
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
  samedi: "Samedi",
  dimanche: "Dimanche"
}

const ALIAS = {
  lun: "lundi",
  mar: "mardi",
  mer: "mercredi",
  jeu: "jeudi",
  ven: "vendredi",
  sam: "samedi",
  dim: "dimanche"
}

const SEMAINE = ["lundi","mardi","mercredi","jeudi","vendredi"]
const WEEKEND = ["samedi","dimanche"]
const HORAIRES_DEFAUT = ["20h-22h"]

const AUTO_DELETE_DELAY = 24 * 60 * 60 * 1000 // 24h

const votes = new Map()

function parser(input) {
  const args = input.trim().split(/\s+/)
  let jours = new Set()
  let horaires = []

  for (let arg of args) {
    arg = arg.toLowerCase()

    if (ALIAS[arg]) arg = ALIAS[arg]

    if (arg === "semaine")
      SEMAINE.forEach(j => jours.add(j))
    else if (arg === "weekend")
      WEEKEND.forEach(j => jours.add(j))
    else if (JOURS[arg])
      jours.add(arg)
    else {
      const h = normaliserHoraire(arg)
      if (h) horaires.push(h)
    }
  }

  if (jours.size === 0)
    Object.keys(JOURS).forEach(j => jours.add(j))

  if (horaires.length === 0)
    horaires = HORAIRES_DEFAUT

  return { jours: [...jours], horaires }
}

function getDateForNext(jourKey) {
  const today = new Date()
  const joursIndex = {
    dimanche: 0,
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6
  }

  const target = joursIndex[jourKey]
  const diff = (target + 7 - today.getDay()) % 7
  const next = new Date(today)
  next.setDate(today.getDate() + diff)

  return next.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit"
  })
}

function createEmbed(jourKey, horaire, voteData) {
  return new EmbedBuilder()
    .setTitle(`📅 ${JOURS[jourKey]} (${getDateForNext(jourKey)})`)
    .setDescription(`⏰ ${horaire}`)
    .addFields({
      name: "Votes en cours",
      value: `👍 ${voteData.up.size} | 🤔 ${voteData.maybe.size} | ❌ ${voteData.down.size}`
    })
    .setColor(0x5865F2)
}

function createButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`up_${id}`)
      .setLabel("👍 Dispo")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`maybe_${id}`)
      .setLabel("🤔 Peut-être")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`down_${id}`)
      .setLabel("❌ Indispo")
      .setStyle(ButtonStyle.Danger)
  )
}

async function envoyerPlanning(interaction, jours, horaires, dureeInput) {

  const dureeMs = parseDuree(dureeInput)

  await interaction.reply({
  content: `📅 Planning lancé (clôture dans ${dureeInput || "24h"})`,
  flags: 64
  })

  const sessionId = Date.now().toString()

  activeSessions.set(sessionId, {
    channelId: interaction.channel.id,
    creneaux: [],
    timer: null
  })

  for (const jour of jours) {
    for (const horaire of horaires) {

      const id = `${sessionId}_${jour}_${horaire}`

      const voteData = {
        sessionId,
        jour,
        horaire,
        up: new Set(),
        maybe: new Set(),
        down: new Set(),
        messageId: null
      }

      const embed = createEmbed(jour, horaire, voteData)

      const message = await interaction.channel.send({
        embeds: [embed],
        components: [createButtons(id)]
      })

      voteData.messageId = message.id
      votes.set(id, voteData)

      activeSessions.get(sessionId).creneaux.push(id)
    }
  }

  activeSessions.get(sessionId).timer = setTimeout(async () => {
    await finaliserSession(sessionId)
  }, dureeMs)
}

async function handleVote(interaction) {

  if (!interaction.isButton()) return

  const firstUnderscore = interaction.customId.indexOf("_")
  const type = interaction.customId.substring(0, firstUnderscore)
  const id = interaction.customId.substring(firstUnderscore + 1)

  if (!votes.has(id)) {
    return interaction.reply({
      content: "Ce créneau n'est plus actif.",
      flags: 64
    })
  }

  const voteData = votes.get(id)

  voteData.up.delete(interaction.user.id)
  voteData.maybe.delete(interaction.user.id)
  voteData.down.delete(interaction.user.id)

  voteData[type].add(interaction.user.id)

  const embed = createEmbed(
    voteData.jour,
    voteData.horaire,
    voteData
  )

  await interaction.update({
    embeds: [embed],
    components: [createButtons(id)]
  })
}

async function finaliserSession(sessionId) {

  const session = activeSessions.get(sessionId)
  if (!session) return

  const channel = await global.client.channels.fetch(session.channelId)

  let bestScore = -1
  let winner = null
  let recap = ""

  for (const id of session.creneaux) {

    const data = votes.get(id)
    if (!data) continue

    const score = data.up.size * 2 + data.maybe.size

    recap += `📅 ${JOURS[data.jour]} ${data.horaire}\n`
    recap += `👍 ${data.up.size} | 🤔 ${data.maybe.size} | ❌ ${data.down.size}\n\n`

    if (score > bestScore) {
      bestScore = score
      winner = data
    }

    try {
      const msg = await channel.messages.fetch(data.messageId)
      await msg.delete()
    } catch {}

    votes.delete(id)
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle("📊 Résumé global du planning")
    .setDescription(recap)
    .addFields({
      name: "🏆 Créneau recommandé",
      value: winner
        ? `${JOURS[winner.jour]} ${winner.horaire}`
        : "Aucun vote"
    })
    .setColor(0x2ecc71)

  await channel.send({ embeds: [resultEmbed] })

  clearTimeout(session.timer)
  activeSessions.delete(sessionId)
}

async function stopSession(channelId) {

  const entry = [...activeSessions.entries()]
    .find(([_, v]) => v.channelId === channelId)

  if (!entry) return false

  const [sessionId, session] = entry

  clearTimeout(session.timer)

  await finaliserSession(sessionId)

  return true
}

async function clearSession(channelId) {

  const entry = [...activeSessions.entries()]
    .find(([_, v]) => v.channelId === channelId)

  if (!entry) return false

  const [sessionId, session] = entry

  const channel = await global.client.channels.fetch(channelId)

  for (const id of session.creneaux) {

    const data = votes.get(id)
    if (!data) continue

    try {
      const msg = await channel.messages.fetch(data.messageId)
      await msg.delete()
    } catch {}

    votes.delete(id)
  }

  clearTimeout(session.timer)
  activeSessions.delete(sessionId)

  return true
}

module.exports = {
  parser,
  envoyerPlanning,
  handleVote,
  stopSession,
  clearSession
}