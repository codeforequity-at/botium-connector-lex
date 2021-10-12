const _ = require('lodash')
const AWS = require('aws-sdk')
const randomize = require('randomatic')
const botium = require('botium-core')
const debug = require('debug')('botium-connector-lex-nlp')

const { loadSlotTypes, loadCustomSlotTypes, expandSlotType } = require('./slottypes')

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

const getCaps = (caps) => {
  const result = Object.assign({}, caps || {})
  return result
}

const extractIntentUtterances = async ({ caps }) => {
  const driver = new botium.BotDriver(getCaps(caps))
  if (driver.caps.LEX_VERSION !== 'V1') throw new Error('Only supported for Lex Version 1')

  const botName = driver.caps.LEX_PROJECT_NAME
  const botAlias = driver.caps.LEX_PROJECT_ALIAS

  const client = new AWS.LexModelBuildingService({
    apiVersion: '2017-04-19',
    region: driver.caps.LEX_REGION,
    accessKeyId: driver.caps.LEX_ACCESS_KEY_ID,
    secretAccessKey: driver.caps.LEX_SECRET_ACCESS_KEY
  })

  const builtinSlotTypes = await loadSlotTypes('en-us')
  debug(`Loaded ${Object.keys(builtinSlotTypes).length} built-in slot types`)

  const customSlotTypes = await loadCustomSlotTypes(client)
  debug(`Loaded ${Object.keys(customSlotTypes).length} custom slot types`)

  const bot = await client.getBot({
    name: botName,
    versionOrAlias: botAlias
  }).promise()

  const intents = []

  for (const intent of (bot.intents || [])) {
    const botIntent = await client.getIntent({
      version: intent.intentVersion,
      name: intent.intentName
    }).promise()

    let utterances = botIntent.sampleUtterances || []

    for (const slot of botIntent.slots) {
      const slotMatch = `{${slot.name}}`

      utterances = utterances.reduce((result, utterance) => {
        if (utterance.indexOf(slotMatch) > 0) {
          if (customSlotTypes[slot.slotType]) {
            result = [...result, ...expandSlotType(utterance, slot.name, customSlotTypes[slot.slotType])]
          } else if (builtinSlotTypes[slot.slotType]) {
            result = [...result, ...expandSlotType(utterance, slot.name, builtinSlotTypes[slot.slotType])]
          }
        } else {
          result = [...result, utterance]
        }
        return result
      }, [])
    }

    intents.push({
      intentName: intent.intentName,
      utterances: utterances
    })
  }
  return {
    intents,
    origBot: bot
  }
}

const trainIntentUtterances = async ({ caps }, intents, { origBot }) => {
  const driver = new botium.BotDriver(getCaps(caps))
  if (driver.caps.LEX_VERSION !== 'V1') throw new Error('Only supported for Lex Version 1')

  const client = new AWS.LexModelBuildingService({
    apiVersion: '2017-04-19',
    region: driver.caps.LEX_REGION,
    accessKeyId: driver.caps.LEX_ACCESS_KEY_ID,
    secretAccessKey: driver.caps.LEX_SECRET_ACCESS_KEY
  })

  const newBotData = {
    name: `${origBot ? origBot.name : 'Botium'}TrainingCopy${randomize('Aa', 5)}`,
    childDirected: origBot ? origBot.childDirected : true,
    locale: origBot ? origBot.locale : 'en-US',
    voiceId: '',
    abortStatement: origBot
      ? origBot.abortStatement
      : {
        messages: [
          {
            content: "I'm sorry, I don't understand.",
            contentType: 'PlainText'
          }
        ]
      },
    intents: []
  }
  const trainedIntents = []

  for (const intent of intents || []) {
    const newIntentName = `${intent.intentName.replace(/[^A-Za-z]/gi, '')}Botium${randomize('Aa', 5)}`
    while (true) {
      try {
        const newIntent = await client.putIntent({
          name: newIntentName,
          fulfillmentActivity: {
            type: 'ReturnIntent'
          },
          sampleUtterances: _.uniq(intent.utterances.map(u => u.replace(/[^\w\s]/gi, '').replace(/[0-9]/gi, 'X').toLowerCase()).filter(u => u && u.length > 0)),
          slots: []
        }).promise()
        debug(`Lex Intent created: ${newIntent.name}`)

        trainedIntents.push({
          intentName: intent.intentName,
          mapFromIntentName: newIntentName
        })
        newBotData.intents.push({
          intentName: newIntent.name,
          intentVersion: newIntent.version
        })
        break
      } catch (err) {
        debug(`Lex Intent creation ${newIntentName} failed, retry: ${err.message || err}`)
        await timeout(2000)
      }
    }
  }

  let newBot, newBotAlias

  while (true) {
    try {
      newBot = await client.putBot(newBotData).promise()
      debug(`Lex Bot created: ${newBot.name}`)
      break
    } catch (err) {
      debug(`Lex Bot creation ${newBotData.name} failed, retry: ${err.message || err}`)
      await timeout(2000)
    }
  }

  while (true) {
    try {
      newBotAlias = await client.putBotAlias({
        botName: newBot.name,
        botVersion: newBot.version,
        name: 'botiumdev'
      }).promise()
      debug(`Lex Bot Alias created: ${newBotAlias.name}`)
      break
    } catch (err) {
      debug(`Lex Bot Alias creation botiumdev failed, retry: ${err.message || err}`)
      await timeout(2000)
    }
  }

  while (true) {
    const newBotStatus = await client.getBot({
      name: newBot.name,
      versionOrAlias: newBot.version
    }).promise()
    debug(`Lex Bot Status received: ${newBotStatus.status}`)
    if (newBotStatus.status === 'READY') break
    if (newBotStatus.status === 'FAILED') throw new Error('Lex Bot Status is FAILED')
    await timeout(2000)
  }

  return {
    trainedIntents,
    caps: Object.assign({}, getCaps(caps), {
      LEX_PROJECT_NAME: newBot.name,
      LEX_PROJECT_ALIAS: newBotAlias.name
    }),
    origBot,
    tempBot: newBot,
    tempBotAlias: newBotAlias
  }
}

const cleanupIntentUtterances = async ({ caps }, { caps: trainCaps, tempBot, tempBotAlias }) => {
  const driver = new botium.BotDriver(getCaps(Object.assign(caps || {}, trainCaps || {})))

  const client = new AWS.LexModelBuildingService({
    apiVersion: '2017-04-19',
    region: driver.caps.LEX_REGION,
    accessKeyId: driver.caps.LEX_ACCESS_KEY_ID,
    secretAccessKey: driver.caps.LEX_SECRET_ACCESS_KEY
  })

  while (true) {
    try {
      await client.deleteBotAlias({
        botName: tempBot.name,
        name: tempBotAlias.name
      }).promise()
      debug(`Lex Bot Alias deleted: ${tempBotAlias.name}`)
      break
    } catch (err) {
      debug(`Lex Bot Alias deletion ${tempBotAlias.name} failed: ${err.message || err}`)
      await timeout(2000)
    }
  }

  while (true) {
    try {
      await client.deleteBot({
        name: tempBot.name
      }).promise()
      debug(`Lex Bot deleted: ${tempBot.name}`)
      break
    } catch (err) {
      debug(`Lex Bot deletion ${tempBot.name} failed, retry: ${err.message || err}`)
      await timeout(2000)
    }
  }
  for (const intent of tempBot.intents) {
    while (true) {
      try {
        await client.deleteIntent({
          name: intent.intentName
        }).promise()
        debug(`Lex Intent deleted: ${intent.intentName}`)
        break
      } catch (err) {
        debug(`Lex Intent deletion ${intent.intentName} failed, retry: ${err.message || err}`)
        await timeout(2000)
      }
    }
  }
}

module.exports = {
  extractIntentUtterances,
  trainIntentUtterances,
  cleanupIntentUtterances
}
