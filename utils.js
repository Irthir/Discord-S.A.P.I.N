function parseDuree(input) {
  if (!input) return 24 * 60 * 60 * 1000

  const match = input.match(/^(\d+)(m|h|j)$/i)
  if (!match) return 24 * 60 * 60 * 1000

  const value = parseInt(match[1])
  const unit = match[2].toLowerCase()

  if (unit === 'm') return value * 60 * 1000
  if (unit === 'h') return value * 60 * 60 * 1000
  if (unit === 'j') return value * 24 * 60 * 60 * 1000

  return 24 * 60 * 60 * 1000
}

function normaliserHoraire(input) {
  const match = input.match(/^(\d{1,2})h?-(\d{1,2})h?$/i)
  if (!match) return null

  let debut = parseInt(match[1])
  let fin = parseInt(match[2])

  if (debut < 0 || debut > 23) return null
  if (fin < 0 || fin > 23) return null
  if (debut === fin) return null

  return `${debut}h-${fin}h`
}

module.exports = { normaliserHoraire, parseDuree }