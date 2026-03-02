const fs = require("fs")
const path = require("path")

const FILE = path.join(__dirname, "data.json")

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

function load() {
  if (!fs.existsSync(FILE)) return null
  return JSON.parse(fs.readFileSync(FILE))
}

module.exports = { save, load }