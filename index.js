const AWS = require('aws-sdk')
const BotiumConnectorLex = require('./src/connector')
const { extractIntentUtterances, trainIntentUtterances, cleanupIntentUtterances } = require('./src/nlp')
const { importHandler, importArgs } = require('./src/import')
const { exportHandler, exportArgs } = require('./src/export')

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
        name: 'LEX_ACCESS_KEY_ID',
        label: 'IAM Access Key',
        type: 'string',
        required: true
      },
      {
        name: 'LEX_SECRET_ACCESS_KEY',
        label: 'IAM Secret Key',
        type: 'secret',
        required: true
      },
      {
        name: 'LEX_REGION',
        label: 'Amazon Region Code',
        type: 'choice',
        required: true,
        choices: [
          { key: 'us-east-1', name: 'US East (N. Virginia)' },
          { key: 'us-west-2', name: 'US West (Oregon)' },
          { key: 'eu-west-1', name: 'Europe (Ireland)' },
          { key: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' }
        ]
      },
      {
        name: 'LEX_PROJECT_NAME',
        label: 'Name of the Lex Bot (project name)',
        type: 'query',
        required: true,
        query: async (caps) => {
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION) {
            const client = new AWS.LexModelBuildingService({
              apiVersion: '2017-04-19',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const response = await client.getBots({ maxResults: 50 }).promise()
            if (response.bots && response.bots.length > 0) {
              return response.bots.map(b => ({
                key: b.name,
                name: b.name,
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
          if (caps && caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY && caps.LEX_REGION && caps.LEX_PROJECT_NAME) {
            const client = new AWS.LexModelBuildingService({
              apiVersion: '2017-04-19',
              region: caps.LEX_REGION,
              accessKeyId: caps.LEX_ACCESS_KEY_ID,
              secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
            })
            const response = await client.getBotAliases({ botName: caps.LEX_PROJECT_NAME, maxResults: 50 }).promise()
            if (response.BotAliases && response.BotAliases.length > 0) {
              return response.BotAliases.map(b => ({
                key: b.name,
                name: b.name,
                description: b.description
              }))
            }
          }
        }
      },
      {
        name: 'LEX_CONTENTTYPE_AUDIO',
        label: 'Input Audio Content Type',
        type: 'choice',
        required: false,
        choices: [
          { key: 'audio/l16; rate=16000; channels=1', name: 'audio/l16; rate=16000; channels=1' },
          { key: 'audio/x-l16; sample-rate=16000; channel-count=1', name: 'audio/x-l16; sample-rate=16000; channel-count=1' },
          { key: 'audio/lpcm; sample-rate=8000; sample-size-bits=16; channel-count=1; is-big-endian=false ', name: 'audio/lpcm; sample-rate=8000; sample-size-bits=16; channel-count=1; is-big-endian=false ' },
          { key: 'audio/x-cbr-opus-with-preamble; preamble-size=0; bit-rate=256000; frame-size-milliseconds=4 ', name: 'audio/x-cbr-opus-with-preamble; preamble-size=0; bit-rate=256000; frame-size-milliseconds=4' }
        ]
      }
    ]
  }
}
