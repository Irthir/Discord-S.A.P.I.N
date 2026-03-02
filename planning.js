const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js')

const { normaliserHoraire, parseDuree } = require('./utils')
const { save, load } = require("./storage")

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

let activeSessions = new Map()
let votes = new Map()

/* =========================
   PARSER
========================= */

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

/* =========================
   DATE COMPLETE
========================= */

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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  })
}

/* =========================
   EMBED + BOUTONS
========================= */

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

/* =========================
   CREATION SESSION
========================= */

async function envoyerPlanning(interaction, jours, horaires, dureeInput) {

  const existing = [...activeSessions.values()]
    .find(s => s.channelId === interaction.channel.id)

  if (existing) {
    return interaction.reply({
      content: "⚠️ Un planning est déjà actif dans ce salon.",
      flags: 64
    })
  }

  const dureeMs = parseDuree(dureeInput)

  await interaction.reply({
    content: `📅 Planning lancé (clôture dans ${dureeInput || "24h"})`,
    flags: 64
  })

  const sessionId = Date.now().toString()

  const endTime = Date.now() + dureeMs

  activeSessions.set(sessionId, {
    channelId: interaction.channel.id,
    creneaux: [],
    timer: null,
    endTime
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

  const timer = setTimeout(() => {
    finaliserSession(sessionId)
  }, dureeMs)
  activeSessions.get(sessionId).timer = timer

  persist()
}

/* =========================
   VOTE
========================= */

async function handleVote(interaction) {

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

  const embed = createEmbed(voteData.jour, voteData.horaire, voteData)

  await interaction.update({
    embeds: [embed],
    components: [createButtons(id)]
  })

  persist()
}

/* =========================
   FINALISATION
========================= */

async function finaliserSession(sessionId) {

  const session = activeSessions.get(sessionId)
  if (!session) return

  const channel = await global.client.channels.fetch(session.channelId)

  let bestScore = -1
  let winners = []
  let recap = ""
  let participants = new Set()

  for (const id of session.creneaux) {

    const data = votes.get(id)
    if (!data) continue

    data.up.forEach(u => participants.add(u))
    data.maybe.forEach(u => participants.add(u))
    data.down.forEach(u => participants.add(u))

    const score = data.up.size * 2 + data.maybe.size

    if (score > bestScore) {
      bestScore = score
      winners = [data]
    } else if (score === bestScore) {
      winners.push(data)
    }

    const upUsers = [...data.up].map(id => `<@${id}>`).join(", ") || "-"
    const maybeUsers = [...data.maybe].map(id => `<@${id}>`).join(", ") || "-"
    const downUsers = [...data.down].map(id => `<@${id}>`).join(", ") || "-"

    recap += `📅 ${JOURS[data.jour]} ${data.horaire}\n`
    recap += `👍 (${data.up.size}) ${upUsers}\n`
    recap += `🤔 (${data.maybe.size}) ${maybeUsers}\n`
    recap += `❌ (${data.down.size}) ${downUsers}\n\n`

    try {
      const msg = await channel.messages.fetch(data.messageId)
      await msg.delete()
    } catch {}

    votes.delete(id)
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle("📊 Résumé global du planning")
    .setDescription(recap)
    .addFields(
      {
        name: "👥 Participants",
        value: `${participants.size} personne(s)`
      },
      {
        name: "🏆 Créneau recommandé",
        value: winners.length > 1
          ? winners.map(w => `${JOURS[w.jour]} ${w.horaire}`).join("\n")
          : winners[0]
            ? `${JOURS[winners[0].jour]} ${winners[0].horaire}`
            : "Aucun vote"
      }
    )
    .setColor(0x2ecc71)

  await channel.send({ embeds: [resultEmbed] })

  clearTimeout(session.timer)
  activeSessions.delete(sessionId)

  persist()
}

/* =========================
   STOP & CLEAR
========================= */

async function stopSession(channelId) {
  const entry = [...activeSessions.entries()]
    .find(([_, v]) => v.channelId === channelId)

  if (!entry) return false

  const [sessionId] = entry
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

  persist()
  return true
}

/* =========================
   PERSISTENCE
========================= */

function persist() {
  const data = {
    activeSessions: [...activeSessions.entries()].map(([id, s]) => [
      id,
      {
        channelId: s.channelId,
        creneaux: s.creneaux,
        endTime: s.endTime
      }
    ]),
    votes: [...votes.entries()].map(([id, v]) => [
      id,
      {
        ...v,
        up: [...v.up],
        maybe: [...v.maybe],
        down: [...v.down]
      }
    ])
  }

  save(data)
}

function restore() {

  const data = load()
  if (!data) return

  activeSessions = new Map()
  votes = new Map()

  // Restaurer votes
  for (const [id, v] of data.votes) {
    votes.set(id, {
      ...v,
      up: new Set(v.up),
      maybe: new Set(v.maybe),
      down: new Set(v.down)
    })
  }

  // Restaurer sessions + recréer timers
  for (const [sessionId, s] of data.activeSessions) {

    const remaining = s.endTime - Date.now()

    if (remaining <= 0) {
      // Session expirée pendant que le bot était off
      finaliserSession(sessionId)
      continue
    }

    const timer = setTimeout(() => {
      finaliserSession(sessionId)
    }, remaining)

    activeSessions.set(sessionId, {
      channelId: s.channelId,
      creneaux: s.creneaux,
      endTime: s.endTime,
      timer
    })
  }

  console.log("Sessions restaurées :", activeSessions.size)
}

module.exports = {
  parser,
  envoyerPlanning,
  handleVote,
  stopSession,
  clearSession,
  restore
}