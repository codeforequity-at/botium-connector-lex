const util = require('util')
const _ = require('lodash')
const mime = require('mime-types')
const randomize = require('randomatic')
const AWS = require('aws-sdk')
const debug = require('debug')('botium-connector-lex')

const Capabilities = {
  LEX_REGION: 'LEX_REGION',
  LEX_ACCESS_KEY_ID: 'LEX_ACCESS_KEY_ID',
  LEX_SECRET_ACCESS_KEY: 'LEX_SECRET_ACCESS_KEY',
  LEX_PROJECT_NAME: 'LEX_PROJECT_NAME',
  LEX_PROJECT_ALIAS: 'LEX_PROJECT_ALIAS',
  LEX_SESSION_ATTRIBUTES: 'LEX_SESSION_ATTRIBUTES',
  LEX_REQUEST_ATTRIBUTES: 'LEX_REQUEST_ATTRIBUTES',
  LEX_ACCEPT: 'LEX_ACCEPT',
  LEX_CONTENTTYPE_TEXT: 'LEX_CONTENTTYPE_TEXT',
  LEX_CONTENTTYPE_AUDIO: 'LEX_CONTENTTYPE_AUDIO'
}

const Defaults = {
  [Capabilities.LEX_ACCEPT]: 'text/plain; charset=utf-8',
  [Capabilities.LEX_CONTENTTYPE_TEXT]: 'text/plain; charset=utf-8',
  [Capabilities.LEX_CONTENTTYPE_AUDIO]: 'audio/l16; rate=16000; channels=1'
}

class BotiumConnectorLex {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = Object.assign({}, Defaults, caps)
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
    const sessionAttributesfromCaps = this.caps[Capabilities.LEX_SESSION_ATTRIBUTES]
    if (sessionAttributesfromCaps) {
      if (typeof sessionAttributesfromCaps === 'string') {
        try {
          this.sessionAttributes = JSON.parse(sessionAttributesfromCaps)
        } catch (ex) {
          throw new Error('The type LEX_SESSION_ATTRIBUTES capability is invalid. Cant be converted to JSON')
        }
      } else {
        this.sessionAttributes = sessionAttributesfromCaps
      }

      if (typeof this.sessionAttributes !== 'object') {
        throw new Error('The type LEX_SESSION_ATTRIBUTES capability is invalid. It must be object, or an object as string')
      }
    } else {
      this.sessionAttributes = {}
    }
    const requestAttributesfromCaps = this.caps[Capabilities.LEX_REQUEST_ATTRIBUTES]
    if (requestAttributesfromCaps) {
      if (typeof requestAttributesfromCaps === 'string') {
        try {
          this.requestAttributes = JSON.parse(requestAttributesfromCaps)
        } catch (ex) {
          throw new Error('The type LEX_REQUEST_ATTRIBUTES capability is invalid. Cant be converted to JSON')
        }
      } else {
        this.requestAttributes = requestAttributesfromCaps
      }

      if (typeof this.requestAttributes !== 'object') {
        throw new Error('The type LEX_REQUEST_ATTRIBUTES capability is invalid. It must be object, or an object as string')
      }
    } else {
      this.requestAttributes = {}
    }
  }

  async _handleResponse (data) {
    debug(`Lex answered: ${util.inspect(_.omit(data, ['audioStream']))}`)
    this.sessionAttributes = data.sessionAttributes
    const structuredResponse = {
      sender: 'bot',
      messageText: data.message,
      nlp: {
      },
      sourceData: data
    }

    if (data.intentName) {
      structuredResponse.nlp.intent = {
        name: data.intentName
      }
    } else {
      structuredResponse.nlp.intent = {
        incomprehension: true
      }
    }
    if (data.slots) {
      structuredResponse.nlp.entities = Object.entries(data.slots).filter(([name, value]) => value != null).map(([name, value]) => { return { name, value } })
    } else {
      structuredResponse.nlp.entities = []
    }

    if (data.audioStream && !data.contentType.startsWith('text')) {
      let ext = null
      if (data.contentType === 'audio/mpeg') {
        ext = 'mp3'
      } else if (data.contentType === 'audio/ogg') {
        ext = 'ogg'
      } else if (data.contentType === 'audio/pcm') {
        ext = 'wav'
      } else {
        ext = mime.extension(data.contentType)
      }
      if (ext) {
        structuredResponse.media = [{
          mediaUri: `lex-response.${ext}`,
          mimeType: data.contentType
        }]
        structuredResponse.attachments = [{
          name: `lex-response.${ext}`,
          mimeType: data.contentType,
          base64: data.audioStream.toString('base64')
        }]
      }
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
  }

  async UserSays (msg) {
    debug('UserSays called')

    const params = {
      botName: this.caps[Capabilities.LEX_PROJECT_NAME],
      botAlias: this.caps[Capabilities.LEX_PROJECT_ALIAS],
      userId: this.lexUserId,
      sessionAttributes: this.sessionAttributes,
      requestAttributes: this.requestAttributes
    }

    if (msg.SET_LEX_SESSION_ATTRIBUTE) {
      params.sessionAttributes = Object.assign({}, params.sessionAttributes, msg.SET_LEX_SESSION_ATTRIBUTE)
    }
    if (msg.SET_LEX_REQUEST_ATTRIBUTE) {
      params.requestAttributes = Object.assign({}, params.requestAttributes, msg.SET_LEX_REQUEST_ATTRIBUTE)
    }

    if (msg.media && msg.media.length > 0) {
      const media = msg.media[0]
      if (!media.buffer) {
        return Promise.reject(new Error(`Media attachment ${media.mediaUri} not downloaded`))
      }
      if (!media.mimeType || !media.mimeType.startsWith('audio')) {
        return Promise.reject(new Error(`Media attachment ${media.mediaUri} mime type ${media.mimeType || '<empty>'} not supported (audio only)`))
      }
      params.accept = this.caps[Capabilities.LEX_ACCEPT]
      params.contentType = this.caps[Capabilities.LEX_CONTENTTYPE_AUDIO]
      params.inputStream = media.buffer

      if (!msg.attachments) {
        msg.attachments = []
      }
      msg.attachments.push({
        name: media.mediaUri,
        mimeType: media.mimeType,
        base64: media.buffer.toString('base64')
      })
      msg.sourceData = params
      debug(`Lex posting audio: ${util.inspect(_.omit(params, ['inputStream']))}`)

      return new Promise((resolve, reject) => {
        this.client.postContent(params, (err, data) => {
          if (err) return reject(new Error(`Lex answered with error: ${err.message}`))
          if (data) this._handleResponse(data)
          resolve()
        })
      })
    } else {
      params.inputText = msg.messageText
      msg.sourceData = params
      debug(`Lex posting text: ${util.inspect(params)}`)
      return new Promise((resolve, reject) => {
        this.client.postText(params, (err, data) => {
          if (err) return reject(new Error(`Lex answered with error: ${err.message}`))
          if (data) this._handleResponse(data)
          resolve()
        })
      })
    }
  }

  Stop () {
    debug('Stop called')
    this.lexUserId = null
    this.sessionAttributes = null
    this.requestAttributes = null
  }

  Clean () {
    debug('Clean called')
    this.client = null
  }
}

module.exports = BotiumConnectorLex
