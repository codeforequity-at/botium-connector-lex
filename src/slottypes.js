const debug = require('debug')('botium-connector-lex-slottypes')

const SLOT_TYPE_SAMPLES = require('../data/slottypesamples.json')
const BUILTIN_SLOT_TYPE_SAMPLES = require('../data/builtinslottypesamples.json')

const loadSlotTypes = (language) => {
  const slotTypes = {}

  const builtinLangKey = Object.keys(BUILTIN_SLOT_TYPE_SAMPLES).find(l => language.startsWith(l))
  if (builtinLangKey) {
    Object.assign(slotTypes, BUILTIN_SLOT_TYPE_SAMPLES[builtinLangKey])
  }

  const langKey = Object.keys(SLOT_TYPE_SAMPLES).find(l => language.startsWith(l))
  if (langKey) {
    Object.assign(slotTypes, SLOT_TYPE_SAMPLES[langKey])
  }
  debug(`Loaded slot type samples for: ${Object.keys(slotTypes)}`)
  return slotTypes
}

const expandSlotType = (sample, slotName, slotSamples) => {
  const result = []
  slotSamples.forEach(ss => {
    result.push(sample.replace(`{${slotName}}`, ss))
  })
  return result
}

const reSlots = /{(.*?)}/g
const extractSlotNames = (sample) => {
  const reMatches = (sample.match(reSlots) || []).map(e => RegExp(reSlots.source, reSlots.flags).exec(e))
  if (reMatches.length > 0) {
    return reMatches.map(r => r[1])
  }
  return []
}

module.exports = {
  loadSlotTypes,
  expandSlotType,
  extractSlotNames
}
