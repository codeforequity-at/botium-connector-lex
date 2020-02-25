const { extractIntentUtterances } = require('./nlp')

const importIntents = async ({ caps, buildconvos }) => {
  const { intents } = await extractIntentUtterances({ caps })

  const convos = []
  const utterances = []

  for (const intent of intents) {
    utterances.push({
      name: intent.intentName,
      utterances: intent.utterances
    })

    if (buildconvos) {
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
      default: false,
      skipCli: false
    }
  }
}
