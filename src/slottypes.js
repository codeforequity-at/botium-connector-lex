const _ = require('lodash')
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

const paginatedCall = async (fnc, extract, args, aggregateddata = []) => {
  const data = await fnc(args).promise()
  if (data.nextToken) {
    return paginatedCall(fnc, { ...args, nextToken: data.nextToken }, [...aggregateddata, ...extract(data)])
  } else {
    return [...aggregateddata, ...extract(data)]
  }
}

const loadCustomSlotTypes = async (client) => {
  const slotTypesShort = await paginatedCall(client.getSlotTypes.bind(client), d => d.slotTypes, {})

  const customSlotTypes = {}
  for (const slotTypeShort of slotTypesShort) {
    const st = await client.getSlotType({
      name: slotTypeShort.name,
      version: '$LATEST'
    }).promise()
    if (st.enumerationValues && st.enumerationValues.length > 0) {
      customSlotTypes[`${st.name}`] = st.enumerationValues.map(e => e.value)
    }
  }
  debug(`Loaded custom slot type samples for: ${Object.keys(customSlotTypes)}`)
  return customSlotTypes
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
    return _.sortBy(_.uniq(reMatches.map(r => r[1])))
  }
  return []
}

module.exports = {
  loadSlotTypes,
  loadCustomSlotTypes,
  expandSlotType,
  extractSlotNames
}
