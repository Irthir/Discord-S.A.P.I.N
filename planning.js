const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js")

const fs = require("fs")
const path = require("path")

const DATA_FILE = path.join(__dirname, "planning_data.json")

const JOURS = {
  lun: "Lundi",
  mar: "Mardi",
  mer: "Mercredi",
  jeu: "Jeudi",
  ven: "Vendredi",
  sam: "Samedi",
  dim: "Dimanche"
}

let votes = new Map()
let sessions = new Map()
let timers = new Map()

/* ------------------------ */
/*      SAUVEGARDE          */
/* ------------------------ */

function persist() {

  const data = {
    votes: [...votes.entries()].map(([id,v]) => [
      id,
      {
        ...v,
        up:[...v.up],
        maybe:[...v.maybe],
        down:[...v.down]
      }
    ]),
    sessions: [...sessions.entries()]
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2))
}

function restore(client) {

  if (!fs.existsSync(DATA_FILE)) return

  const data = JSON.parse(fs.readFileSync(DATA_FILE))

  votes = new Map(
    data.votes.map(([id,v])=>[
      id,
      {
        ...v,
        up:new Set(v.up),
        maybe:new Set(v.maybe),
        down:new Set(v.down)
      }
    ])
  )

  sessions = new Map(data.sessions)

  for (const [channelId,session] of sessions.entries()) {

    const remaining = session.endTime - Date.now()
    if (remaining <= 0) continue

    const timer = setTimeout(()=>{

      const channel = client.channels.cache.get(channelId)
      if(channel) finaliserSession(channel)

    },remaining)

    timers.set(channelId,timer)
  }

  console.log("✔ Planning restauré")
}

/* ------------------------ */
/*      UTILITAIRES         */
/* ------------------------ */

function buildBar(value,total){

  if(total===0) return "░░░░░░░░░░"

  const filled=Math.round((value/total)*10)

  return "█".repeat(filled)+"░".repeat(10-filled)
}

function getDateForNext(jourKey){

  const today=new Date()
  const targetIndex=Object.keys(JOURS).indexOf(jourKey)

  const diff=(targetIndex-today.getDay()+7)%7||7

  const target=new Date()
  target.setDate(today.getDate()+diff)

  return target.toLocaleDateString("fr-FR",{
    weekday:"long",
    day:"numeric",
    month:"long",
    year:"numeric"
  })
}

function createButtons(id){

  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId(`vote_up_${id}`)
      .setLabel("👍")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`vote_maybe_${id}`)
      .setLabel("🤔")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`vote_down_${id}`)
      .setLabel("❌")
      .setStyle(ButtonStyle.Danger)
  )
}

function createEmbed(jourKey,horaire,data){

  const total=data.up.size+data.maybe.size+data.down.size

  return new EmbedBuilder()
    .setTitle(`📅 ${JOURS[jourKey]} (${getDateForNext(jourKey)})`)
    .setDescription(`⏰ ${horaire}`)
    .addFields({
      name:"Votes",
      value:
`👍 ${data.up.size} ${buildBar(data.up.size,total)}
🤔 ${data.maybe.size} ${buildBar(data.maybe.size,total)}
❌ ${data.down.size} ${buildBar(data.down.size,total)}`
    })
    .setColor(0x5865F2)
}

/* ------------------------ */
/*      CREATION VOTE       */
/* ------------------------ */

async function envoyerPlanning(channel,jourKey,horaire,duration){

  if(sessions.has(channel.id))
    return channel.send("❌ Une session est déjà active")

  const id=Date.now().toString()

  const voteData={
    jour:jourKey,
    horaire,
    up:new Set(),
    maybe:new Set(),
    down:new Set()
  }

  const embed=createEmbed(jourKey,horaire,voteData)

  const msg=await channel.send({
    embeds:[embed],
    components:[createButtons(id)]
  })

  voteData.messageId=msg.id
  votes.set(id,voteData)

  const session={
    creneaux:[id],
    endTime:Date.now()+duration
  }

  sessions.set(channel.id,session)

  const timer=setTimeout(()=>{
    finaliserSession(channel)
  },duration)

  timers.set(channel.id,timer)

  persist()
}

/* ------------------------ */
/*          VOTE            */
/* ------------------------ */

async function handleVote(interaction){

  const [_,type,id]=interaction.customId.split("_")

  const voteData=votes.get(id)
  if(!voteData) return

  const user=interaction.user.id

  voteData.up.delete(user)
  voteData.maybe.delete(user)
  voteData.down.delete(user)

  if(type==="up") voteData.up.add(user)
  if(type==="maybe") voteData.maybe.add(user)
  if(type==="down") voteData.down.add(user)

  const embed=createEmbed(voteData.jour,voteData.horaire,voteData)

  const msg=await interaction.channel.messages.fetch(voteData.messageId)

  await msg.edit({embeds:[embed]})

  await interaction.reply({content:"Vote enregistré",ephemeral:true})

  persist()
}

/* ------------------------ */
/*     FINALISATION         */
/* ------------------------ */

async function finaliserSession(channel){

  const session=sessions.get(channel.id)
  if(!session) return

  let participants=new Set()
  let recap=""
  let unanimousWinner=null

  for(const id of session.creneaux){

    const data=votes.get(id)
    if(!data) continue

    const voters=[...data.up,...data.maybe,...data.down]
    voters.forEach(v=>participants.add(v))

    recap+=`📅 ${JOURS[data.jour]} ${data.horaire}
👍 ${data.up.size} | 🤔 ${data.maybe.size} | ❌ ${data.down.size}\n\n`

    if(
      data.down.size===0 &&
      data.maybe.size===0 &&
      data.up.size>0 &&
      data.up.size===participants.size
    ){
      unanimousWinner=data
    }
  }

  const embed=new EmbedBuilder()
    .setTitle("📊 Résultat du vote")
    .setDescription(recap)
    .addFields({
      name:"🏆 Résultat",
      value:unanimousWinner
        ?`${JOURS[unanimousWinner.jour]} ${unanimousWinner.horaire}`
        :"❌ Aucun créneau unanime"
    })
    .setColor(0x2ecc71)

  await channel.send({embeds:[embed]})

  /* EVENT DISCORD */

  if(unanimousWinner){

    try{

      const startHour=parseInt(unanimousWinner.horaire.split("h")[0])
      const endHour=parseInt(unanimousWinner.horaire.split("-")[1])

      const startDate=new Date()
      startDate.setHours(startHour,0,0,0)

      const endDate=new Date()
      endDate.setHours(endHour,0,0,0)

      await channel.guild.scheduledEvents.create({
        name:`Planning - ${JOURS[unanimousWinner.jour]}`,
        scheduledStartTime:startDate,
        scheduledEndTime:endDate,
        privacyLevel:2,
        entityType:3,
        channel
      })

    }catch(err){
      console.log("Event impossible:",err.message)
    }

  }

  sessions.delete(channel.id)
  timers.delete(channel.id)

  persist()
}

/* ------------------------ */
/*      RECREATION MSG      */
/* ------------------------ */

async function recreateIfMissing(message){

  for(const [id,data] of votes.entries()){

    if(data.messageId===message.id){

      const embed=createEmbed(data.jour,data.horaire,data)

      const newMsg=await message.channel.send({
        embeds:[embed],
        components:[createButtons(id)]
      })

      data.messageId=newMsg.id

      persist()

      break
    }
  }
}

/* ------------------------ */
/*        COMMANDES         */
/* ------------------------ */

function stopSession(channel){

  const timer=timers.get(channel.id)
  if(timer) clearTimeout(timer)

  finaliserSession(channel)
}

function clearSession(channel){

  sessions.delete(channel.id)

  const timer=timers.get(channel.id)
  if(timer) clearTimeout(timer)

  timers.delete(channel.id)

  persist()
}

module.exports={
  envoyerPlanning,
  handleVote,
  stopSession,
  clearSession,
  restore,
  recreateIfMissing
}