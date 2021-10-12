const _ = require('lodash')
const AWS = require('aws-sdk')
const randomize = require('randomatic')
const botium = require('botium-core')
const debug = require('debug')('botium-connector-lex-export')

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

const exportIntents = async ({ caps, uploadmode, newBotName, newBotAliasName, waitforready }, { convos, utterances }, { statusCallback }) => {
  const driver = new botium.BotDriver(caps)
  if (driver.caps.LEX_VERSION !== 'V1') throw new Error('Only supported for Lex Version 1')

  const status = (log, obj) => {
    debug(log, obj)
    if (statusCallback) statusCallback(log, obj)
  }

  const botName = driver.caps.LEX_PROJECT_NAME
  const botAlias = driver.caps.LEX_PROJECT_ALIAS

  const client = new AWS.LexModelBuildingService({
    apiVersion: '2017-04-19',
    region: driver.caps.LEX_REGION,
    accessKeyId: driver.caps.LEX_ACCESS_KEY_ID,
    secretAccessKey: driver.caps.LEX_SECRET_ACCESS_KEY
  })

  const bot = await client.getBot({
    name: botName,
    versionOrAlias: botAlias
  }).promise()

  if (uploadmode === 'copy') {
    const nameExt = randomize('Aa', 5)
    const newBotData = Object.assign({}, _.omit(bot, ['name', 'status', 'failureReason', 'lastUpdatedDate', 'createdDate', 'checksum', 'version', 'intents']),
      {
        name: newBotName || `Copy_Of_${bot.name}_${nameExt}`,
        intents: []
      }
    )

    for (const utt of utterances) {
      const newIntentData = {
        name: utt.name,
        fulfillmentActivity: {
          type: 'ReturnIntent'
        },
        sampleUtterances: _.uniq(utt.utterances.map(u => u.replace(/[^\w\s]/gi, '').replace(/[0-9]/gi, 'X').toLowerCase()).filter(u => u && u.length > 0)),
        slots: []
      }

      try {
        const existingBotIntent = await client.getIntent({
          version: '$LATEST',
          name: utt.name
        }).promise()
        Object.assign(newIntentData, _.omit(existingBotIntent, ['sampleUtterances', 'lastUpdatedDate', 'createdDate', 'version']))
      } catch (err) {
        debug(`Lex Intent ${utt.name} failed to load: ${err.message}. Will be created new.`)
      }

      while (true) {
        try {
          const newIntent = await client.putIntent(newIntentData).promise()
          status(`Lex Intent uploaded ${newIntent.name}/${newIntent.version}`, { botName: newBotData.name })

          newBotData.intents.push({
            intentName: newIntent.name,
            intentVersion: newIntent.version
          })
          break
        } catch (err) {
          debug(`Lex Intent creation ${utt.name} failed, retry: ${err.message || err}`)
          await timeout(2000)
        }
      }
    }

    let newBot, newBotAlias

    while (true) {
      try {
        newBot = await client.putBot(newBotData).promise()
        status(`Lex Bot created ${newBot.name}/${newBot.version}`, { botName: newBotData.name, botVersion: newBot.version })
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
          name: newBotAliasName
        }).promise()
        status(`Lex Bot Alias created ${newBotAlias.name}`, { botName: newBotData.name, botVersion: newBot.version, botAlias: newBotAlias.name })
        break
      } catch (err) {
        debug(`Lex Bot Alias creation botiumdev failed, retry: ${err.message || err}`)
        await timeout(2000)
      }
    }

    if (waitforready) {
      status(`Waiting for Lex Bot ${newBotData.name} training`, { botName: newBotData.name, botVersion: newBot.version, botAlias: newBotAlias.name })
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
      status(`Lex Bot ${newBotData.name} ready for use`, { botName: newBotData.name, botVersion: newBot.version, botAlias: newBotAlias.name })
    }
    const newCaps = _.pickBy(driver.caps, (value, key) => key.startsWith('LEX_'))
    newCaps.LEX_PROJECT_NAME = newBotData.name
    newCaps.LEX_PROJECT_ALIAS = newBotAlias.name
    return { caps: newCaps, botName: newBotData.name, botVersion: newBot.version, botAlias: newBotAlias.name }
  } else {
    for (const utt of utterances) {
      const newIntentData = {
        name: utt.name,
        fulfillmentActivity: {
          type: 'ReturnIntent'
        },
        sampleUtterances: _.uniq(utt.utterances.map(u => u.replace(/[^\w\s]/gi, '').replace(/[0-9]/gi, 'X').toLowerCase()).filter(u => u && u.length > 0)),
        slots: []
      }

      try {
        const existingBotIntent = await client.getIntent({
          version: '$LATEST',
          name: utt.name
        }).promise()
        Object.assign(newIntentData, _.omit(existingBotIntent, ['sampleUtterances', 'lastUpdatedDate', 'createdDate', 'version']))
        newIntentData.sampleUtterances = _.uniq(newIntentData.sampleUtterances.concat(existingBotIntent.sampleUtterances))
      } catch (err) {
        debug(`Lex Intent ${utt.name} failed to load: ${err.message}. Will be created new.`)
      }

      while (true) {
        try {
          const newIntent = await client.putIntent(newIntentData).promise()
          status(`Lex Intent uploaded ${newIntent.name}/${newIntent.version}`, { botName })
          break
        } catch (err) {
          debug(`Lex Intent creation ${utt.name} failed, retry: ${err.message || err}`)
          await timeout(2000)
        }
      }
    }

    if (waitforready) {
      status(`Waiting for Lex Bot ${botName} training`, { botName })
      while (true) {
        const newBotStatus = await client.getBot({
          name: botName,
          versionOrAlias: botAlias
        }).promise()
        debug(`Lex Bot Status received: ${newBotStatus.status}`)
        if (newBotStatus.status === 'READY') break
        if (newBotStatus.status === 'FAILED') throw new Error('Lex Bot Status is FAILED')
        await timeout(2000)
      }
      status(`Lex Bot ${botName} ready for use`, { botName })
    }
    const newCaps = _.pickBy(driver.caps, (value, key) => key.startsWith('LEX_'))
    return { caps: newCaps, botName }
  }
}

module.exports = {
  exportHandler: ({ caps, uploadmode, newBotName, newBotAliasName, waitforready, ...rest } = {}, { convos, utterances } = {}, { statusCallback } = {}) => exportIntents({ caps, uploadmode, newBotName, newBotAliasName, waitforready, ...rest }, { convos, utterances }, { statusCallback }),
  exportArgs: {
    caps: {
      describe: 'Capabilities',
      type: 'json',
      skipCli: true
    },
    uploadmode: {
      describe: 'Copy Lex Bot and create new intent version with user examples, or append user examples to existing intents only',
      choices: ['copy', 'append'],
      default: 'copy'
    },
    newBotName: {
      describe: 'New Lex Bot name (if not given will be generated)',
      type: 'string'
    },
    newBotAliasName: {
      describe: 'New Lex Bot alias',
      type: 'string',
      default: 'botiumdev'
    },
    waitforready: {
      describe: 'Wait until Lex Bot is ready',
      type: 'boolean',
      default: false
    }
  }
}
