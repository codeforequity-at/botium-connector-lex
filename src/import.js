const AWS = require('aws-sdk')
const botium = require('botium-core')
const debug = require('debug')('botium-connector-lex-import')

const { Defaults } = require('./connector')
const { paginatedCall, loadSlotTypes, loadCustomSlotTypes, extractSlotNames, expandSlotType } = require('./slottypes')

const importIntents = async ({ caps, buildconvos, buildentities }) => {
  const driver = new botium.BotDriver(caps)

  const botVersion = driver.caps.LEX_VERSION
  const botName = driver.caps.LEX_PROJECT_NAME
  const botAlias = driver.caps.LEX_PROJECT_ALIAS

  const client = botVersion === 'V1'
    ? new AWS.LexModelBuildingService({
      apiVersion: '2017-04-19',
      region: driver.caps.LEX_REGION,
      accessKeyId: driver.caps.LEX_ACCESS_KEY_ID,
      secretAccessKey: driver.caps.LEX_SECRET_ACCESS_KEY
    })
    : new AWS.LexModelsV2({
      apiVersion: '2020-08-07',
      region: driver.caps.LEX_REGION,
      accessKeyId: driver.caps.LEX_ACCESS_KEY_ID,
      secretAccessKey: driver.caps.LEX_SECRET_ACCESS_KEY
    })
  if (botVersion === 'V2' && !driver.caps.LEX_PROJECT_VERSION) {
    const aliasResponse = await client.describeBotAlias({ botId: botName, botAliasId: botAlias }).promise()
    if (aliasResponse && aliasResponse.botVersion) {
      driver.caps.LEX_PROJECT_VERSION = aliasResponse.botVersion
    }
  }

  const builtinSlotTypes = await loadSlotTypes('en-us')
  debug(`Loaded ${Object.keys(builtinSlotTypes).length} built-in slot types`)

  const customSlotTypes = await loadCustomSlotTypes(client, driver.caps)
  debug(`Loaded ${Object.keys(customSlotTypes).length} custom slot types`)

  let intents
  if (botVersion === 'V1') {
    intents = (await client.getBot({ name: botName, versionOrAlias: botAlias }).promise()).intents || []
  } else {
    intents = await paginatedCall(client.listIntents.bind(client), d => d.intentSummaries, { botId: driver.caps.LEX_PROJECT_NAME, botVersion: driver.caps.LEX_PROJECT_VERSION, localeId: driver.caps.LEX_LOCALE || Defaults.LEX_LOCALE }) || []
  }

  debug(`Loaded ${intents.length} intents`)

  const convos = []
  const utterances = []

  for (const intent of intents) {
    let sampleUtterances = []
    let slots = []
    if (botVersion === 'V1') {
      const botIntent = await client.getIntent({ version: intent.intentVersion, name: intent.intentName }).promise()
      sampleUtterances = botIntent.sampleUtterances || []
      slots = botIntent.slots || []
    } else {
      const botIntent = await client.describeIntent({ botId: driver.caps.LEX_PROJECT_NAME, botVersion: driver.caps.LEX_PROJECT_VERSION, localeId: driver.caps.LEX_LOCALE || Defaults.LEX_LOCALE, intentId: intent.intentId }).promise()
      sampleUtterances = (botIntent.sampleUtterances && botIntent.sampleUtterances.map(s => s.utterance)) || []

      const botSlots = await paginatedCall(client.listSlots.bind(client), d => d.slotSummaries, { botId: driver.caps.LEX_PROJECT_NAME, botVersion: driver.caps.LEX_PROJECT_VERSION, localeId: driver.caps.LEX_LOCALE || Defaults.LEX_LOCALE, intentId: intent.intentId }) || []
      slots = botSlots.map(s => ({ name: s.slotName, slotType: s.slotTypeId }))
    }
    const userExamples = {}
    const userExamplesSlotNames = {}

    for (const userExample of sampleUtterances) {
      const slotNames = extractSlotNames(userExample)
      if (slotNames.length > 0) {
        debug(`Filling slots ${slotNames.join('|')} in user example "${userExample}"`)
        const expandedUserExamples = slotNames.reduce((result, slotName) => {
          const slot = slots.find(s => s.name === slotName)
          if (slot) {
            if (customSlotTypes[slot.slotType]) {
              return result.reduce((expanded, resultUtt) => {
                return [...expanded, ...expandSlotType(resultUtt, slot.name, customSlotTypes[slot.slotType])]
              }, [])
            }
            const builtinSlotTypeName = Object.keys(builtinSlotTypes).find(st => st.toLowerCase() === slot.slotType.toLowerCase())
            if (builtinSlotTypeName) {
              return result.reduce((expanded, resultUtt) => {
                return [...expanded, ...expandSlotType(resultUtt, slot.name, builtinSlotTypes[builtinSlotTypeName])]
              }, [])
            }
          }
          return result
        }, [userExample])

        const uttSuffix = `_${slotNames.join('_')}`
        userExamplesSlotNames[uttSuffix] = slotNames
        userExamples[uttSuffix] = userExamples[uttSuffix] ? userExamples[uttSuffix].concat(expandedUserExamples) : expandedUserExamples
      } else {
        userExamplesSlotNames[''] = []
        userExamples[''] = userExamples[''] || []
        userExamples[''].push(userExample)
      }
    }
    if (buildconvos && buildentities) {
      for (const uttSuffix of Object.keys(userExamples)) {
        utterances.push({
          name: intent.intentName + uttSuffix,
          utterances: userExamples[uttSuffix]
        })

        const convo = {
          header: {
            name: intent.intentName + uttSuffix
          },
          conversation: [
            {
              sender: 'me',
              messageText: intent.intentName + uttSuffix
            },
            {
              sender: 'bot',
              asserters: [
                {
                  name: 'INTENT',
                  args: [intent.intentName]
                }
              ]
            }
          ]
        }
        if (userExamplesSlotNames[uttSuffix].length > 0) {
          convo.conversation[1].asserters.push({
            name: 'ENTITIES',
            args: userExamplesSlotNames[uttSuffix]
          })
        }
        convos.push(convo)
      }
    } else if (buildconvos) {
      utterances.push({
        name: intent.intentName,
        utterances: Object.keys(userExamples).reduce((all, k) => all.concat(userExamples[k]), [])
      })

      const convo = {
        header: {
          name: intent.intentName
        },
        conversation: [
          {
            sender: 'me',
            messageText: intent.intentName
          },
          {
            sender: 'bot',
            asserters: [
              {
                name: 'INTENT',
                args: [intent.intentName]
              }
            ]
          }
        ]
      }
      convos.push(convo)
    } else {
      utterances.push({
        name: intent.intentName,
        utterances: Object.keys(userExamples).reduce((all, k) => all.concat(userExamples[k]), [])
      })
    }
  }
  return { convos, utterances }
}

module.exports = {
  importHandler: ({ caps, buildconvos, ...rest } = {}) => importIntents({ caps, buildconvos, ...rest }),
  importArgs: {
    caps: {
      describe: 'Capabilities',
      type: 'json',
      skipCli: true
    },
    buildconvos: {
      describe: 'Build convo files with intent asserters',
      type: 'boolean',
      default: true
    },
    buildentities: {
      describe: 'Add entity asserters to convo files',
      type: 'boolean',
      default: false
    }
  }
}
