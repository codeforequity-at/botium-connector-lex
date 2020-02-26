const randomize = require('randomatic')
const AWS = require('aws-sdk')
const debug = require('debug')('botium-connector-lex')
const util = require('util')

const Capabilities = {
  LEX_REGION: 'LEX_REGION',
  LEX_ACCESS_KEY_ID: 'LEX_ACCESS_KEY_ID',
  LEX_SECRET_ACCESS_KEY: 'LEX_SECRET_ACCESS_KEY',
  LEX_PROJECT_NAME: 'LEX_PROJECT_NAME',
  LEX_PROJECT_ALIAS: 'LEX_PROJECT_ALIAS',
  LEX_SESSION_ATTRIBUTES: 'LEX_SESSION_ATTRIBUTES'
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

    this.lexUserId = 'chatbot-demo-' + randomize('Aa', 5)
    const fromCaps = this.caps[Capabilities.LEX_SESSION_ATTRIBUTES]
    if (fromCaps) {
      if (typeof fromCaps === 'string') {
        try {
          this.sessionAttributes = JSON.parse(fromCaps)
        } catch (ex) {
          throw new Error('The type LEX_SESSION_ATTRIBUTES capability is invalid. Cant be converted to JSON')
        }
      } else {
        this.sessionAttributes = fromCaps
      }

      if (typeof this.sessionAttributes !== 'object') {
        throw new Error('The type LEX_SESSION_ATTRIBUTES capability is invalid. It must be object, or an object as string')
      }
    } else {
      this.sessionAttributes = {}
    }

    return Promise.resolve()
  }

  UserSays (msg) {
    debug('UserSays called')

    const params = {
      botName: this.caps[Capabilities.LEX_PROJECT_NAME],
      botAlias: this.caps[Capabilities.LEX_PROJECT_ALIAS],
      inputText: msg.messageText,
      userId: this.lexUserId,
      sessionAttributes: this.sessionAttributes
    }

    return new Promise((resolve, reject) => {
      debug(`Lex posting text: ${util.inspect(params)}`)
      this.client.postText(params, (err, data) => {
        if (err) {
          return reject(new Error(`Lex answered with error ${util.inspect(err)}`))
        }
        if (data) {
          debug(`Lex answered: ${JSON.stringify(data, null, 2)}`)
          this.sessionAttributes = data.sessionAttributes
          const structuredResponse = {
            sender: 'bot',
            messageText: data.message,
            nlp: {
              intent: {
                name: data.intentName
              },
              entities: data.slots
                ? Object.entries(data.slots).filter(([name, value]) => value != null).map(([name, value]) => { return { name, value } })
                : []
            },
            sourceData: data
          }
          if (data.responseCard) {
            if (data.responseCard.contentType === 'application/vnd.amazonaws.card.generic') {
              if (data.responseCard.genericAttachments) {
                structuredResponse.cards = data.responseCard.genericAttachments.map(card => ({
                  text: card.title,
                  subtext: card.subTitle,
                  image: (card.imageUrl && { mediaUri: card.imageUrl }) || null,
                  buttons: (card.buttons && card.buttons.map(b => ({ text: b.text, payload: b.value }))) || []
                }))
              }
            }
          }
          setTimeout(() => this.queueBotSays(structuredResponse), 0)
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

module.exports = BotiumConnectorLex
