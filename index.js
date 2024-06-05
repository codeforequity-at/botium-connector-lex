const AWS = require('aws-sdk')
const BotiumConnectorLex = require('./src/connector')
const { extractIntentUtterances, trainIntentUtterances, cleanupIntentUtterances } = require('./src/nlp')
const { importHandler, importArgs } = require('./src/import')
const { exportHandler, exportArgs } = require('./src/export')
const { paginatedCall } = require('./src/slottypes')

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorLex,
  Import: {
    Handler: importHandler,
    Args: importArgs
  },
  Export: {
    Handler: exportHandler,
    Args: exportArgs
  },
  NLP: {
    ExtractIntentUtterances: extractIntentUtterances,
    TrainIntentUtterances: trainIntentUtterances,
    CleanupIntentUtterances: cleanupIntentUtterances
  },
  PluginDesc: {
    name: 'Amazon Lex',
    provider: 'Amazon',
    features: {
      intentResolution: true,
      entityResolution: true
    },
    helperText: 'See section <b>Connecting Amazon Lex to Botium</b> in the <a href="https://github.com/codeforequity-at/botium-connector-lex" target="_blank" rel="noopener noreferrer">Github Repository</a> of the connector for instructions how to get an IAM user.',
    capabilities: [
      {
        name: 'LEX_VERSION',
        label: 'Lex Version',
        type: 'choice',
        required: true,
        choices: [
          { key: 'V1', name: 'V1' },
          { key: 'V2', name: 'V2' }
        ]
      },
      {
        name: 'LEX_AUTH_MODE',
        label: 'Authentication Mode',
        description: 'Default: IAM Access Keys',
        type: 'choice',
        required: false,
        advanced: false,
        choices: [
          { key: 'IAM_KEYS', name: 'IAM Access Keys' },
          { key: 'IAM_ROLE', name: 'IAM Role' }
        ]
      },
      {
        name: 'LEX_ROLE_ARN',
        label: 'IAM Role ARN',
        description: 'ARN of the IAM Role to assume (for IAM Role based authentication only)',
        type: 'string',
        required: false,
        advanced: false
      },
      {
        name: 'LEX_ROLE_EXTERNAL_ID',
        label: 'IAM Role External ID',
        description: 'External ID of the IAM Role to assume (for IAM Role based authentication only)',
        type: 'string',
        required: false,
        advanced: false
      },
      {
        name: 'LEX_ACCESS_KEY_ID',
        label: 'IAM Access Key',
        description: 'Access Key of the IAM User (for IAM Access Keys authentication only)',
        type: 'string',
        required: false,
        advanced: false
      },
      {
        name: 'LEX_SECRET_ACCESS_KEY',
        label: 'IAM Secret Key',
        description: 'Secret Key of the IAM User (for IAM Access Keys authentication only)',
        type: 'secret',
        required: false,
        advanced: false
      },
      {
        name: 'LEX_REGION',
        label: 'Amazon Region Code',
        type: 'choice',
        required: true,
        choices: [
          { key: 'us-east-1', name: 'US East (N. Virginia)' },
          { key: 'us-west-2', name: 'US West (Oregon)' },
          { key: 'af-south-1', name: 'Africa (Cape Town)' },
          { key: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
          { key: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
          { key: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
          { key: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
          { key: 'eu-central-1', name: 'Europe (Frankfurt)' },
          { key: 'eu-west-1', name: 'Europe (Ireland)' },
          { key: 'eu-west-2', name: 'Europe (London)' },
          { key: 'ca-central-1', name: 'Canada (Central)' }
        ]
      },
      {
        name: 'LEX_PROJECT_NAME',
        label: 'Name of the Lex Bot (project name)',
        type: 'query',
        required: true,
        query: async (caps) => {
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_VERSION === 'V1') {
            const client = new AWS.LexModelBuildingService({
              apiVersion: '2017-04-19',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const bots = await paginatedCall(client.getBots.bind(client), r => r.bots)
            if (bots && bots.length > 0) {
              return bots.map(b => ({
                key: b.name,
                name: b.name,
                description: b.description
              }))
            }
          }
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_VERSION === 'V2') {
            const client = new AWS.LexModelsV2({
              apiVersion: '2020-08-07',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const botSummaries = await paginatedCall(client.listBots.bind(client), r => r.botSummaries)
            if (botSummaries && botSummaries.length > 0) {
              return botSummaries.map(b => ({
                key: b.botId,
                name: b.botName,
                description: b.description
              }))
            }
          }
        }
      },
      {
        name: 'LEX_PROJECT_ALIAS',
        label: 'Alias of the Lex Bot (see publishing)',
        type: 'query',
        required: true,
        query: async (caps) => {
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_PROJECT_NAME && caps.LEX_VERSION === 'V1') {
            const client = new AWS.LexModelBuildingService({
              apiVersion: '2017-04-19',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const botAliases = await paginatedCall(client.getBotAliases.bind(client), r => r.BotAliases, { botName: caps.LEX_PROJECT_NAME })
            if (botAliases && botAliases.length > 0) {
              return botAliases.map(b => ({
                key: b.name,
                name: b.name,
                description: b.description
              }))
            }
          }
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_PROJECT_NAME && caps.LEX_VERSION === 'V2') {
            const client = new AWS.LexModelsV2({
              apiVersion: '2020-08-07',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const botAliasSummaries = await paginatedCall(client.listBotAliases.bind(client), r => r.botAliasSummaries, { botId: caps.LEX_PROJECT_NAME })
            if (botAliasSummaries && botAliasSummaries.length > 0) {
              return botAliasSummaries.map(b => ({
                key: b.botAliasId,
                name: b.botAliasName,
                description: b.description
              }))
            }
          }
        }
      },
      {
        name: 'LEX_LOCALE',
        label: 'Locale of the Lex Bot (V2 only)',
        type: 'query',
        query: async (caps) => {
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_PROJECT_NAME && caps.LEX_PROJECT_ALIAS && caps.LEX_VERSION === 'V2') {
            const client = new AWS.LexModelsV2({
              apiVersion: '2020-08-07',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const aliasResponse = await client.describeBotAlias({ botId: caps.LEX_PROJECT_NAME, botAliasId: caps.LEX_PROJECT_ALIAS }).promise()
            if (aliasResponse && aliasResponse.botVersion) {
              const botLocaleSummaries = await paginatedCall(client.listBotLocales.bind(client), r => r.botLocaleSummaries, { botId: caps.LEX_PROJECT_NAME, botVersion: aliasResponse.botVersion })
              if (botLocaleSummaries && botLocaleSummaries.length > 0) {
                return botLocaleSummaries.map(b => ({
                  key: b.localeId,
                  name: b.localeName,
                  description: b.description
                }))
              }
            }
          }
        }
      },
      {
        name: 'LEX_ACCEPT',
        label: 'Audio Response Type',
        description: 'Set the response audio type to the expected format (only applicable for voice tests with audio input)',
        type: 'choice',
        required: false,
        advanced: true,
        choices: [
          { key: 'text/plain; charset=utf-8', name: 'Text' },
          { key: 'audio/mpeg', name: 'MP3 Audio (*.mp3)' },
          { key: 'audio/ogg', name: 'Ogg Vorbis Audio (*.ogg)' },
          { key: 'audio/pcm', name: 'PCM Audio (*.wav)' }
        ]
      }
    ],
    actions: [
      {
        name: 'GetAgentMetaData',
        description: 'GetAgentMetaData',
        run: async (caps) => {
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_PROJECT_NAME && caps.LEX_PROJECT_ALIAS && caps.LEX_VERSION === 'V1') {
            const client = new AWS.LexModelBuildingService({
              apiVersion: '2017-04-19',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const bot = await client.getBot({ name: caps.LEX_PROJECT_NAME, versionOrAlias: caps.LEX_PROJECT_ALIAS }).promise()
            return {
              name: bot.name,
              description: bot.description,
              metadata: bot
            }
          }
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_PROJECT_NAME && caps.LEX_VERSION === 'V2') {
            const client = new AWS.LexModelsV2({
              apiVersion: '2020-08-07',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const botResponse = await client.describeBot({ botId: caps.LEX_PROJECT_NAME }).promise()
            return {
              name: botResponse.botName,
              description: botResponse.description,
              metadata: botResponse
            }
          }
        }
      }
    ]
  }
}
