const util = require('util')
const _ = require('lodash')
const mime = require('mime-types')
const randomize = require('randomatic')
const zlib = require('zlib')
const AWS = require('aws-sdk')
const debug = require('debug')('botium-connector-lex')

const Capabilities = {
  LEX_VERSION: 'LEX_VERSION',
  LEX_REGION: 'LEX_REGION',
  LEX_AUTH_MODE: 'LEX_AUTH_MODE',
  LEX_ROLE_ARN: 'LEX_ROLE_ARN',
  LEX_ROLE_EXTERNAL_ID: 'LEX_ROLE_EXTERNAL_ID',
  LEX_ACCESS_KEY_ID: 'LEX_ACCESS_KEY_ID',
  LEX_SECRET_ACCESS_KEY: 'LEX_SECRET_ACCESS_KEY',
  LEX_LOCALE: 'LEX_LOCALE',
  LEX_PROJECT_NAME: 'LEX_PROJECT_NAME',
  LEX_PROJECT_ALIAS: 'LEX_PROJECT_ALIAS',
  LEX_PROJECT_VERSION: 'LEX_PROJECT_VERSION',
  LEX_SESSION_ATTRIBUTES: 'LEX_SESSION_ATTRIBUTES',
  LEX_REQUEST_ATTRIBUTES: 'LEX_REQUEST_ATTRIBUTES',
  LEX_ACCEPT: 'LEX_ACCEPT',
  LEX_CONTENTTYPE_TEXT: 'LEX_CONTENTTYPE_TEXT',
  LEX_CONTENTTYPE_AUDIO: 'LEX_CONTENTTYPE_AUDIO',
  LEX_ADD_DIALOG_ACTION: 'LEX_SHOW_DIALOG_ACTION',
  LEX_CUSTOM_VARIABLES: 'LEX_CUSTOM_VARIABLES',
  LEX_BOT_CHAIN_ENABLED: 'LEX_BOT_CHAIN_ENABLED'
}

const Defaults = {
  [Capabilities.LEX_AUTH_MODE]: 'IAM_KEYS',
  [Capabilities.LEX_VERSION]: 'V1',
  [Capabilities.LEX_LOCALE]: 'en_US',
  [Capabilities.LEX_ACCEPT]: 'text/plain; charset=utf-8',
  [Capabilities.LEX_CONTENTTYPE_TEXT]: 'text/plain; charset=utf-8',
  [Capabilities.LEX_CONTENTTYPE_AUDIO]: 'audio/l16; rate=16000; channels=1',
  [Capabilities.LEX_ADD_DIALOG_ACTION]: false,
  [Capabilities.LEX_CUSTOM_VARIABLES]: 'ListPicker',
  [Capabilities.LEX_BOT_CHAIN_ENABLED]: false
}

const gzipAndBase64 = (obj) => zlib.gzipSync(JSON.stringify(obj)).toString('base64')
const base64AndUnzip = (str) => JSON.parse(zlib.gunzipSync(Buffer.from(str, 'base64')))

/**
 * Parse ARN to extract Bot ID and Alias ID
 * ARN format: arn:aws:lex:{region}:{account}:bot-alias/{botId}/{aliasId}
 * @param {string} arn - The ARN string
 * @returns {object|null} - { botId, aliasId } or null if parsing fails
 */
const parseArnForBotDetails = (arn) => {
  if (!arn || typeof arn !== 'string') return null
  const match = arn.match(/bot-alias\/([^/]+)\/([^/]+)$/)
  if (match) {
    return {
      botId: match[1],
      aliasId: match[2]
    }
  }
  return null
}

const sts = new AWS.STS()

const getCrossAccountCredentials = async ({ roleArn, roleExternalId }) => {
  return new Promise((resolve, reject) => {
    const timestamp = (new Date()).getTime()
    const params = {
      RoleArn: roleArn,
      ExternalId: roleExternalId,
      RoleSessionName: `botium-session-lex-${timestamp}`
    }
    sts.assumeRole(params, (err, data) => {
      if (err) reject(err)
      else {
        resolve({
          accessKeyId: data.Credentials.AccessKeyId,
          secretAccessKey: data.Credentials.SecretAccessKey,
          sessionToken: data.Credentials.SessionToken
        })
      }
    })
  })
}

class BotiumConnectorLex {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = Object.assign({}, Defaults, caps)
  }

  async Validate () {
    debug('Validate called')

    if (!this._isV1() && !this._isV2()) throw new Error('LEX_VERSION capability V1 or V2 required')
    if (!this.caps[Capabilities.LEX_REGION]) throw new Error('LEX_REGION capability required')
    if (this.caps[Capabilities.LEX_AUTH_MODE] === 'IAM_ROLE' && !this.caps[Capabilities.LEX_ROLE_ARN]) throw new Error('LEX_ROLE_ARN capability required when using LEX_AUTH_MODE = IAM_ROLE')
    if (this.caps[Capabilities.LEX_AUTH_MODE] === 'IAM_ROLE' && !this.caps[Capabilities.LEX_ROLE_EXTERNAL_ID]) throw new Error('LEX_ROLE_EXTERNAL_ID capability required when using LEX_AUTH_MODE = IAM_ROLE')
    if (this.caps[Capabilities.LEX_AUTH_MODE] === 'IAM_KEYS' && !this.caps[Capabilities.LEX_ACCESS_KEY_ID]) throw new Error('LEX_ACCESS_KEY_ID capability required when using LEX_AUTH_MODE = IAM_KEYS')
    if (this.caps[Capabilities.LEX_AUTH_MODE] === 'IAM_KEYS' && !this.caps[Capabilities.LEX_SECRET_ACCESS_KEY]) throw new Error('LEX_SECRET_ACCESS_KEY capability required when using LEX_AUTH_MODE = IAM_KEYS')
    if (!this.caps[Capabilities.LEX_PROJECT_NAME]) throw new Error('LEX_PROJECT_NAME capability required')
    if (!this.caps[Capabilities.LEX_PROJECT_ALIAS]) throw new Error('LEX_PROJECT_ALIAS capability required')
    if (this._isV2() && !this.caps[Capabilities.LEX_LOCALE]) throw new Error('LEX_LOCALE capability required')

    if (this._isChainMode()) {
      if (this._isV1()) throw new Error('Bot chaining is only supported with LEX_VERSION = V2')
      debug('Bot chain mode enabled - Primary Bot ID: %s, Alias: %s',
        this.caps[Capabilities.LEX_PROJECT_NAME],
        this.caps[Capabilities.LEX_PROJECT_ALIAS])
    }
  }

  _isV1 () { return this.caps[Capabilities.LEX_VERSION] === 'V1' }
  _isV2 () { return this.caps[Capabilities.LEX_VERSION] === 'V2' }
  _isChainMode () { return this.caps[Capabilities.LEX_BOT_CHAIN_ENABLED] === true || this.caps[Capabilities.LEX_BOT_CHAIN_ENABLED] === 'true' }

  async Build () {
    debug('Build called')

    const accessparams = this.caps[Capabilities.LEX_AUTH_MODE] === 'IAM_ROLE'
      ? await getCrossAccountCredentials({
        roleArn: this.caps[Capabilities.LEX_ROLE_ARN],
        roleExternalId: this.caps[Capabilities.LEX_ROLE_EXTERNAL_ID]
      })
      : {
          accessKeyId: this.caps[Capabilities.LEX_ACCESS_KEY_ID],
          secretAccessKey: this.caps[Capabilities.LEX_SECRET_ACCESS_KEY]
        }

    if (this._isV1()) {
      this.client = new AWS.LexRuntime({
        apiVersion: '2016-11-28',
        region: this.caps[Capabilities.LEX_REGION],
        ...accessparams
      })
    } else {
      this.client = new AWS.LexRuntimeV2({
        apiVersion: '2020-08-07',
        region: this.caps[Capabilities.LEX_REGION],
        ...accessparams
      })
    }
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

    if (this._isChainMode()) {
      debug('Chain mode enabled - Primary bot: %s/%s', this.caps[Capabilities.LEX_PROJECT_NAME], this.caps[Capabilities.LEX_PROJECT_ALIAS])
    }

    this.activeBot = null
    this.activeBotSessionState = null
  }

  _handleResponseV1 (data) {
    debug(`Lex V1 answered: ${JSON.stringify(_.omit(data, ['audioStream']), null, 2)}`)
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
          mediaUri: `data:${data.contentType};base64,${data.audioStream.toString('base64')}`,
          altText: `lex-response.${ext}`,
          mimeType: data.contentType
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

  convertToJson (data) {
    if (typeof data === 'object' && data !== null) {
      // If it's already a JSON object, return it as is
      return {
        success: true,
        data
      }
    }

    try {
      const json = JSON.parse(data)
      return {
        success: true, data: json
      }
    } catch (e) {
      return {
        success: false,
        error: e
      }
    }
  }

  /**
   * Extract message content from session attributes (used in chain mode when messages[] is empty)
   * Looks for lastSlot or lexSlotPrompt attributes containing QuickReply/ListPicker templates
   * @param {object} sessionAttributes - The session attributes from response
   * @returns {object|null} - Extracted message object or null
   */
  _extractMessageFromSessionAttributes (sessionAttributes) {
    if (!sessionAttributes) return null

    // Try to get message from lastSlot or lexSlotPrompt (common attribute names)
    const slotPromptValue = sessionAttributes.lastSlot || sessionAttributes.lexSlotPrompt

    if (!slotPromptValue) return null

    const jsonContent = this.convertToJson(slotPromptValue)
    if (!jsonContent.success) {
      // Not JSON — treat as plain text message
      debug('Session attribute is plain text: %s', slotPromptValue)
      return { messageText: slotPromptValue }
    }

    const payload = jsonContent.data

    // Handle lexSlotPrompt format (wrapped in contentType/content)
    if (payload.contentType && payload.content) {
      const innerContent = this.convertToJson(payload.content)
      if (innerContent.success) {
        return this._parseCustomPayloadTemplate(innerContent.data)
      }
    }

    // Handle direct template format (templateType/data/content)
    return this._parseCustomPayloadTemplate(payload)
  }

  /**
   * Parse custom payload template (QuickReply, ListPicker, etc.)
   * @param {object} payload - The template payload
   * @returns {object|null} - Parsed message object or null
   */
  _parseCustomPayloadTemplate (payload) {
    if (!payload || !payload.templateType) return null

    const customPayloadTypesStr = this.caps[Capabilities.LEX_CUSTOM_VARIABLES]
    let customPayloadTypes = []
    if (customPayloadTypesStr && typeof customPayloadTypesStr === 'string') {
      customPayloadTypes = customPayloadTypesStr.split(',').map(type => type.trim()).filter(type => type.length > 0)
    }

    if (!customPayloadTypes.includes(payload.templateType)) {
      debug('Template type %s not in supported types: %s', payload.templateType, customPayloadTypes.join(', '))
      return null
    }

    const content = payload.data?.content
    if (!content) return null

    const result = {
      messageText: content.title || null
    }

    if (content.elements && Array.isArray(content.elements)) {
      result.buttons = content.elements.map(item => ({
        text: item.title || item.data?.content?.title || item.templateIdentifier || null,
        payload: item.value || null
      }))
    }

    debug('Extracted message from session attributes: %s', result.messageText)
    return result
  }

  /**
   * Check if routing to secondary bot is required based on session attributes
   * Looks for nextStep === 'RouteToBot' pattern
   * @param {object} sessionAttributes - The session attributes
   * @returns {boolean} - True if routing is needed
   */
  _shouldRouteToSecondaryBot (sessionAttributes) {
    if (!this._isChainMode()) return false
    if (!sessionAttributes) return false

    // Check for routing indicator (nextStep === 'RouteToBot')
    const shouldRoute = sessionAttributes.nextStep === 'RouteToBot'
    debug('Route check: nextStep = %s -> %s', sessionAttributes.nextStep, shouldRoute)
    return shouldRoute
  }

  /**
   * Get secondary bot details from session attributes ARN
   * Looks for 'ARN' attribute containing the target bot ARN
   * @param {object} sessionAttributes - The session attributes
   * @returns {object|null} - { botId, aliasId } or null
   */
  _getSecondaryBotDetails (sessionAttributes) {
    if (!sessionAttributes) return null

    // Look for ARN in session attributes
    const arn = sessionAttributes.ARN

    if (!arn) {
      debug('No ARN found in session attributes')
      return null
    }

    const botDetails = parseArnForBotDetails(arn)
    if (botDetails) {
      debug('Parsed secondary bot from ARN: botId=%s, aliasId=%s', botDetails.botId, botDetails.aliasId)
    }
    return botDetails
  }

  _handleResponseV2 (data) {
    debug(`Lex V2 answered: ${JSON.stringify(_.omit(data, ['audioStream']), null, 2)}`)
    this.sessionState = data.sessionState

    const _extractNlp = (structuredResponse) => {
      if (data.interpretations && data.interpretations.length > 0) {
        const i0 = data.interpretations[0]
        if (i0.intent) {
          structuredResponse.nlp.intent = {
            name: i0.intent.name,
            confidence: i0.nluConfidence && i0.nluConfidence.score,
            incomprehension: i0.intent.name === 'FallbackIntent'
          }
          if (i0.intent.slots) {
            structuredResponse.nlp.entities = Object.entries(i0.intent.slots).filter(([name, value]) => value != null).map(([name, value]) => { return { name, value: value?.value?.interpretedValue || value?.value?.originalValue } })
          } else {
            structuredResponse.nlp.entities = []
          }
        }
      }
      if (!structuredResponse.nlp.intent) {
        structuredResponse.nlp.intent = {
          incomprehension: true
        }
      }
      return structuredResponse
    }

    if (data.messages && data.messages.length > 0) {
      for (const message of data.messages || []) {
        const structuredResponse = {
          sender: 'bot',
          nlp: {
          },
          sourceData: data
        }
        _extractNlp(structuredResponse)

        if (message.contentType === 'PlainText') {
          structuredResponse.messageText = message.content
        } else if (message.contentType === 'ImageResponseCard' && message.imageResponseCard) {
          structuredResponse.cards = [{
            text: message.imageResponseCard.title,
            subtext: message.imageResponseCard.subTitle,
            image: (message.imageResponseCard.imageUrl && { mediaUri: message.imageResponseCard.imageUrl }) || null,
            buttons: (message.imageResponseCard.buttons && message.imageResponseCard.buttons.map(b => ({ text: b.text, payload: b.value }))) || []
          }]
        } else if (message.contentType === 'CustomPayload') {
          if (message.content) {
            const jsonContent = this.convertToJson(message.content)
            // Get custom payload types from capability
            const customPayloadTypesStr = this.caps[Capabilities.LEX_CUSTOM_VARIABLES]
            let customPayloadTypes = []
            if (customPayloadTypesStr && typeof customPayloadTypesStr === 'string') {
              customPayloadTypes = customPayloadTypesStr.split(',').map(type => type.trim()).filter(type => type.length > 0)
            }
            if (
              jsonContent.success && jsonContent.data.templateType &&
              customPayloadTypes.includes(jsonContent.data.templateType)
            ) {
              const { content } = jsonContent.data.data
              structuredResponse.messageText = content.title
              structuredResponse.buttons = content.elements.map(item => {
                return {
                  text: item.title,
                  payload: item.value || null
                }
              })
            }
          }
        }
        const contentType = this.caps[Capabilities.LEX_ACCEPT]
        if (data.audioStream && !(contentType.startsWith('text'))) {
          let ext = null
          if (contentType === 'audio/mpeg') {
            ext = 'mp3'
          } else if (contentType === 'audio/ogg') {
            ext = 'ogg'
          } else if (contentType === 'audio/pcm') {
            ext = 'wav'
          } else {
            ext = mime.extension(contentType)
          }
          if (ext) {
            structuredResponse.media = [{
              mediaUri: `data:${contentType};base64,${data.audioStream.toString('base64')}`,
              altText: `lex-response.${ext}`,
              mimeType: contentType
            }]
          }
        }

        setTimeout(() => this.queueBotSays(structuredResponse), 0)
      }
    } else {
      // No messages in response - try to extract from session attributes (chain mode scenario)
      const sessionAttrs = data.sessionState?.sessionAttributes

      if (this._isChainMode() && sessionAttrs) {
        const extractedMessage = this._extractMessageFromSessionAttributes(sessionAttrs)
        if (extractedMessage) {
          const structuredResponse = {
            sender: 'bot',
            nlp: {},
            sourceData: data,
            ...extractedMessage
          }
          _extractNlp(structuredResponse)
          debug('Using message extracted from session attributes')
          setTimeout(() => this.queueBotSays(structuredResponse), 0)
          return
        }
      }

      // Fallback: queue response without message text
      setTimeout(() => this.queueBotSays(_extractNlp({
        sender: 'bot',
        nlp: {
        },
        sourceData: data
      })), 0)
    }
  }

  /**
   * Call Lex V2 recognizeText API
   * @param {object} params - The request parameters
   * @returns {Promise<object>} - The response data
   */
  _callLexV2RecognizeText (params) {
    return new Promise((resolve, reject) => {
      this.client.recognizeText(params, (err, data) => {
        if (err) return reject(new Error(`Lex V2 answered with error: ${err.message}`))
        resolve(data)
      })
    })
  }

  /**
   * Handle chain mode with sticky routing:
   *
   * Flow:
   *   1. First message goes to PRIMARY bot
   *   2. If primary says "RouteToBot", save the secondary bot details
   *      and show the primary's response (which contains the prompt in session attributes)
   *   3. All subsequent messages go DIRECTLY to the secondary bot (it has the conversation context)
   *   4. If secondary bot routes to another bot, follow that routing
   *   5. If secondary bot's conversation ends (no more routing), stay with it
   *
   * @param {object} msg - The message object
   * @returns {Promise<void>}
   */
  async _userSaysChainMode (msg) {
    debug('UserSays chain mode called')

    const targetBotId = this.activeBot ? this.activeBot.botId : this.caps[Capabilities.LEX_PROJECT_NAME]
    const targetBotAlias = this.activeBot ? this.activeBot.aliasId : this.caps[Capabilities.LEX_PROJECT_ALIAS]
    const targetSessionState = this.activeBot ? this.activeBotSessionState : (this.sessionState || { sessionAttributes: this.sessionAttributes })

    debug('Chain mode: Sending to %s bot %s/%s',
      this.activeBot ? 'secondary' : 'primary', targetBotId, targetBotAlias)

    const params = {
      botId: targetBotId,
      botAliasId: targetBotAlias,
      localeId: this.caps[Capabilities.LEX_LOCALE],
      sessionId: this.lexUserId,
      text: msg.messageText,
      sessionState: targetSessionState,
      requestAttributes: this.requestAttributes
    }

    if (params.sessionState && params.sessionState.dialogAction && this.caps[Capabilities.LEX_ADD_DIALOG_ACTION] === false) {
      delete params.sessionState.dialogAction
    }

    if (msg.SET_LEX_SESSION_ATTRIBUTE) {
      params.sessionState.sessionAttributes = Object.assign(
        {}, params.sessionState.sessionAttributes || {}, msg.SET_LEX_SESSION_ATTRIBUTE
      )
    }
    if (msg.SET_LEX_REQUEST_ATTRIBUTE) {
      params.requestAttributes = Object.assign(
        {}, params.requestAttributes, msg.SET_LEX_REQUEST_ATTRIBUTE
      )
    }

    msg.sourceData = params
    debug('Chain mode: Params: %s', util.inspect(params))

    let response
    try {
      response = await this._callLexV2RecognizeText(params)
    } catch (err) {
      debug('Chain mode: Bot error: %s', err.message)
      throw err
    }

    debug('Chain mode: Response: %s', JSON.stringify(_.omit(response, ['audioStream']), null, 2))

    const sessionAttrs = response.sessionState?.sessionAttributes || {}

    if (this._shouldRouteToSecondaryBot(sessionAttrs)) {
      const nextBotDetails = this._getSecondaryBotDetails(sessionAttrs)

      if (nextBotDetails) {
        this.activeBot = nextBotDetails
        this.activeBotSessionState = {
          sessionAttributes: sessionAttrs
        }
        debug('Chain mode: Routed to secondary bot %s/%s — subsequent messages will go here',
          nextBotDetails.botId, nextBotDetails.aliasId)
        debug('Chain mode: Forwarding session attributes to secondary bot: %s',
          JSON.stringify(sessionAttrs))
      } else {
        debug('Chain mode: Routing indicated but no valid ARN found')
      }

      // Update primary session state (we stay aware of primary's state)
      this.sessionState = response.sessionState

      // Show the bot's response (messages[] like PlainText)
      this._handleResponseV2(response)

      // When routing, session attributes may contain additional content
      // (e.g. a Carousel/menu) that isn't in messages[]. Extract and show it.
      if (response.messages && response.messages.length > 0) {
        const extraMessage = this._extractMessageFromSessionAttributes(sessionAttrs)
        if (extraMessage) {
          debug('Chain mode: Extracted additional content from session attributes')
          const structuredResponse = {
            sender: 'bot',
            nlp: {},
            sourceData: response,
            ...extraMessage
          }
          setTimeout(() => this.queueBotSays(structuredResponse), 0)
        }
      }
    } else {
      // No routing — this is a normal response from whichever bot we're talking to
      if (this.activeBot) {
        this.activeBotSessionState = response.sessionState
        debug('Chain mode: Response from secondary bot %s/%s (no further routing)',
          this.activeBot.botId, this.activeBot.aliasId)
      } else {
        this.sessionState = response.sessionState
      }

      this._handleResponseV2(response)
    }
  }

  async UserSays (msg) {
    debug('UserSays called')

    // Use chain mode if enabled
    if (this._isChainMode()) {
      return this._userSaysChainMode(msg)
    }

    const params = this._isV1()
      ? {
          botName: this.caps[Capabilities.LEX_PROJECT_NAME],
          botAlias: this.caps[Capabilities.LEX_PROJECT_ALIAS],
          userId: this.lexUserId,
          sessionAttributes: this.sessionAttributes,
          requestAttributes: this.requestAttributes
        }
      : {
          botId: this.caps[Capabilities.LEX_PROJECT_NAME],
          botAliasId: this.caps[Capabilities.LEX_PROJECT_ALIAS],
          localeId: this.caps[Capabilities.LEX_LOCALE],
          sessionId: this.lexUserId,
          sessionState: this.sessionState || { sessionAttributes: this.sessionAttributes },
          requestAttributes: this.requestAttributes
        }

    // Remove dialogAction from sessionState to allow Lex to determine the next step automatically
    if (params.sessionState && params.sessionState.dialogAction && this.caps[Capabilities.LEX_ADD_DIALOG_ACTION] === false) {
      delete params.sessionState.dialogAction
    }

    if (msg.SET_LEX_SESSION_ATTRIBUTE) {
      if (this._isV1()) {
        params.sessionAttributes = Object.assign({}, params.sessionAttributes, msg.SET_LEX_SESSION_ATTRIBUTE)
      } else {
        params.sessionState.sessionAttributes = Object.assign({}, params.sessionState.sessionAttributes || {}, msg.SET_LEX_SESSION_ATTRIBUTE)
      }
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
      if (this._isV1()) {
        params.accept = this.caps[Capabilities.LEX_ACCEPT]
        params.contentType = this.caps[Capabilities.LEX_CONTENTTYPE_AUDIO]
      } else {
        params.responseContentType = this.caps[Capabilities.LEX_ACCEPT]
        params.requestContentType = this.caps[Capabilities.LEX_CONTENTTYPE_AUDIO]

        params.sessionState = gzipAndBase64(params.sessionState)
        params.requestAttributes = gzipAndBase64(params.requestAttributes)
      }
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
        if (this._isV1()) {
          this.client.postContent(params, (err, data) => {
            if (err) return reject(new Error(`Lex V1 answered with error: ${err.message}`))
            if (data) {
              try {
                this._handleResponseV1(data)
              } catch (err) {
                return reject(new Error(`Lex V2 error: ${err.message}`))
              }
            }
            resolve()
          })
        } else {
          this.client.recognizeUtterance(params, (err, data) => {
            if (err) return reject(new Error(`Lex V1 answered with error: ${err.message}`))
            if (data) {
              try {
                if (data.messages) data.messages = base64AndUnzip(data.messages)
                if (data.interpretations) data.interpretations = base64AndUnzip(data.interpretations)
                if (data.sessionState) data.sessionState = base64AndUnzip(data.sessionState)
                if (data.requestAttributes) data.requestAttributes = base64AndUnzip(data.requestAttributes)
                if (data.inputTranscript) data.inputTranscript = base64AndUnzip(data.inputTranscript)
                this._handleResponseV2(data)
              } catch (err) {
                return reject(new Error(`Lex V2 error: ${err.message}`))
              }
            }
            resolve()
          })
        }
      })
    } else {
      const wantsAudioResponse = !this.caps[Capabilities.LEX_ACCEPT].startsWith('text')
      if (this._isV1()) {
        params.inputText = msg.messageText
      } else {
        params.text = msg.messageText
      }
      msg.sourceData = params
      debug(`Lex posting text: ${util.inspect(params)}`)
      return new Promise((resolve, reject) => {
        if (this._isV1()) {
          this.client.postText(params, (err, data) => {
            if (err) return reject(new Error(`Lex V1 answered with error: ${err.message}`))
            if (data) {
              try {
                this._handleResponseV1(data)
              } catch (err) {
                return reject(new Error(`Lex V1 error: ${err.message}`))
              }
            }
            resolve()
          })
        } else if (wantsAudioResponse) {
          params.responseContentType = this.caps[Capabilities.LEX_ACCEPT]
          params.requestContentType = this.caps[Capabilities.LEX_CONTENTTYPE_TEXT]
          params.inputStream = Buffer.from(msg.messageText || '', 'utf8')
          params.sessionState = gzipAndBase64(params.sessionState)
          params.requestAttributes = gzipAndBase64(params.requestAttributes)
          delete params.text
          this.client.recognizeUtterance(params, (err, data) => {
            if (err) return reject(new Error(`Lex V2 answered with error: ${err.message}`))
            if (data) {
              try {
                if (data.messages) data.messages = base64AndUnzip(data.messages)
                if (data.interpretations) data.interpretations = base64AndUnzip(data.interpretations)
                if (data.sessionState) data.sessionState = base64AndUnzip(data.sessionState)
                if (data.requestAttributes) data.requestAttributes = base64AndUnzip(data.requestAttributes)
                if (data.inputTranscript) data.inputTranscript = base64AndUnzip(data.inputTranscript)
                this._handleResponseV2(data)
              } catch (err) {
                return reject(new Error(`Lex V2 error: ${err.message}`))
              }
            }
            resolve()
          })
        } else {
          this.client.recognizeText(params, (err, data) => {
            if (err) return reject(new Error(`Lex V2 answered with error: ${err.message}`))
            if (data) {
              try {
                this._handleResponseV2(data)
              } catch (err) {
                return reject(new Error(`Lex V2 error: ${err.message}`))
              }
            }
            resolve()
          })
        }
      })
    }
  }

  Stop () {
    debug('Stop called')
    this.lexUserId = null
    this.sessionAttributes = null
    this.sessionState = null
    this.requestAttributes = null
    this.activeBot = null
    this.activeBotSessionState = null
  }

  Clean () {
    debug('Clean called')
    this.client = null
  }
}

module.exports = BotiumConnectorLex
module.exports.Defaults = Defaults
module.exports.Capabilities = Capabilities
