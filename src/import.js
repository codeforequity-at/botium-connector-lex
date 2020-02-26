const AWS = require('aws-sdk')
const botium = require('botium-core')
const debug = require('debug')('botium-connector-lex-import')

const { loadSlotTypes, loadCustomSlotTypes, extractSlotNames, expandSlotType } = require('./slottypes')

const importIntents = async ({ caps, buildconvos, buildentities }) => {
  const driver = new botium.BotDriver(caps)

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

  const convos = []
  const utterances = []

  for (const intent of (bot.intents || [])) {
    const botIntent = await client.getIntent({
      version: intent.intentVersion,
      name: intent.intentName
    }).promise()

    const userExamples = {}
    const userExamplesSlotNames = {}

    for (const userExample of botIntent.sampleUtterances || []) {
      const slotNames = extractSlotNames(userExample)
      if (slotNames.length > 0) {
        debug(`Filling slots ${slotNames.join('|')} in user example "${userExample}"`)
        const expandedUserExamples = slotNames.reduce((result, slotName) => {
          const slot = botIntent.slots.find(s => s.name === slotName)
          if (slot) {
            if (customSlotTypes[slot.slotType]) {
              result = result.reduce((expanded, resultUtt) => {
                return [...expanded, ...expandSlotType(resultUtt, slot.name, customSlotTypes[slot.slotType])]
              }, [])
            } else if (builtinSlotTypes[slot.slotType]) {
              result = result.reduce((expanded, resultUtt) => {
                return [...expanded, ...expandSlotType(resultUtt, slot.name, builtinSlotTypes[slot.slotType])]
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
