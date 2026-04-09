import 'dotenv/config'
import { assert } from 'chai'
import BotiumConnectorLex from '../../src/connector.js'
import { readCaps } from './helper.js'

describe('connector', function () {
  beforeEach(async function () {
    this.caps = readCaps()
    this.botMsgPromise = new Promise(resolve => {
      this.botMsgPromiseResolve = resolve
    })
    const queueBotSays = (botMsg) => {
      this.botMsgPromiseResolve(botMsg)
    }
    this.connector = new BotiumConnectorLex({ queueBotSays, caps: this.caps })
    await this.connector.Validate()
    await this.connector.Build()
    await this.connector.Start()
  })

  it('should successfully get an answer for say hello', async function () {
    await this.connector.UserSays({ messageText: 'Hello' })
    const botMsg = await this.botMsgPromise
    assert.isTrue(botMsg?.messageText === 'I didn\'t understand you, what would you like to do?', `Incorrect response "${botMsg?.messageText}"`)
  }).timeout(20000)

  afterEach(async function () {
    await this.connector.Stop()
  })
})
