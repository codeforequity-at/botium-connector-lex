require('dotenv').config()
const assert = require('chai').assert
const { importHandler } = require('../../src/import')
const { readCaps } = require('./helper')

describe('importhandler', function () {
  beforeEach(async function () {
    this.caps = readCaps()
  })
  it('should successfully download intents', async function () {
    const result = await importHandler({ caps: this.caps })
    assert.isFalse(!!result.convos?.length)
    assert.isAbove(result.utterances.length, 0)
    const utterance = result.utterances.find(u => (u.name === 'TalkToAnAgent'))

    assert.isTrue(!!utterance, '"Ping" intent not found')
    assert.equal(utterance.name, 'TalkToAnAgent')
    assert.isTrue(utterance.utterances.includes('agent'))
    assert.isTrue(utterance.utterances.includes('Speak to an agent'))
  }).timeout(100000)
})
