const AWS = require('aws-sdk')
const debug = require('debug')('botium-connector-alexa-avs-main')
const util = require('util')

const Capabilities = {
  LEX_REGION: 'LEX_REGION',
  LEX_ACCESS_KEY_ID: 'LEX_ACCESS_KEY_ID',
  LEX_SECRET_ACCESS_KEY: 'LEX_SECRET_ACCESS_KEY',
  LEX_PROJECT_NAME: 'LEX_PROJECT_NAME',
  LEX_PROJECT_ALIAS: 'LEX_PROJECT_ALIAS'
}

class BotiumConnectorLex {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  Validate () {
    debug('Validate called')

    if (!this.caps[Capabilities.LEX_REGION]) throw new Error('LEX_REGION capability required')
    if (!this.caps[Capabilities.LEX_ACCESS_KEY_ID]) throw new Error('LEX_ACCESS_KEY_ID capability required')
    if (!this.caps[Capabilities.LEX_SECRET_ACCESS_KEY]) throw new Error('LEX_SECRET_ACCESS_KEY capability required')
    if (!this.caps[Capabilities.LEX_PROJECT_NAME]) throw new Error('LEX_PROJECT_NAME capability required')
    if (!this.caps[Capabilities.LEX_PROJECT_ALIAS]) throw new Error('LEX_PROJECT_ALIAS capability required')

    return Promise.resolve()
  }

  Build () {
    debug('Build called')
    this.client = new AWS.LexRuntime({
      apiVersion: '2016-11-28',
      region: this.caps[Capabilities.LEX_REGION],
      accessKeyId: this.caps[Capabilities.LEX_ACCESS_KEY_ID],
      secretAccessKey: this.caps[Capabilities.LEX_SECRET_ACCESS_KEY]
    })

    return Promise.resolve()
  }

  Start () {
    debug('Start called')

    this.lexUserId = 'chatbot-demo' + Date.now()
    this.sessionAttributes = {}

    return Promise.resolve()
  }

  UserSays ({messageText}) {
    debug('UserSays called')

    const params = {
      botName: this.caps[Capabilities.LEX_PROJECT_NAME],
      botAlias: this.caps[Capabilities.LEX_PROJECT_ALIAS],
      inputText: messageText,
      userId: this.lexUserId,
      sessionAttributes: this.sessionAttributes
    }

    return new Promise((resolve, reject) => {
      this.client.postText(params, (err, data) => {
        if (err) {
          return reject(new Error(`Lex answered with error ${util.inspect(err)}`))
        }
        if (data) {
          debug(`Lex answered: ${util.inspect(data)}`)
          this.sessionAttributes = data.sessionAttributes
          const structuredResponse = {
            sender: 'bot',
            messageText: data.message,
            nlp: {
              intent: {
                name: data.intentName
              },
              entities: data.slots
                ? Object.entries(data.slots).filter(([name, value]) => value != null).map(([name, value]) => { return {name, value} })
                : []
            },
            sourceData: data
          }
          debug(`Converted response: ${util.inspect(structuredResponse)}`)
          this.queueBotSays(structuredResponse)
          return resolve()
        }
      })
    })
  }

  Stop () {
    debug('Stop called')

    this.lexUserId = null
    this.sessionAttributes = null

    return Promise.resolve()
  }

  Clean () {
    debug('Clean called')

    this.client = null

    return Promise.resolve()
  }
}

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorLex
}
