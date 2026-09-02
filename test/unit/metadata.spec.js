import { assert } from 'chai'
import AWS from 'aws-sdk'

import { queryBotAliases, queryBots } from '../../src/metadata.js'

describe('Lex metadata queries', function () {
  let originalAssumeRole
  let originalListBots
  let originalListBotAliases

  beforeEach(function () {
    originalAssumeRole = AWS.STS.prototype.assumeRole
    originalListBots = AWS.LexModelsV2.prototype.listBots
    originalListBotAliases = AWS.LexModelsV2.prototype.listBotAliases
  })

  afterEach(function () {
    AWS.STS.prototype.assumeRole = originalAssumeRole
    AWS.LexModelsV2.prototype.listBots = originalListBots
    AWS.LexModelsV2.prototype.listBotAliases = originalListBotAliases
  })

  it('uses assumed-role credentials for bot and alias loading when access keys are also present', async function () {
    let assumeRoleCalls = 0
    const credentialsUsed = []

    AWS.STS.prototype.assumeRole = (params, callback) => {
      assumeRoleCalls++
      callback(null, {
        Credentials: {
          AccessKeyId: 'role-access-key',
          SecretAccessKey: 'role-secret-key',
          SessionToken: 'role-session-token'
        }
      })
    }
    AWS.LexModelsV2.prototype.listBots = function () {
      credentialsUsed.push(this.config.credentials.accessKeyId)
      return {
        promise: async () => ({
          botSummaries: [{ botId: 'bot-id', botName: 'Bot name', description: 'Bot description' }]
        })
      }
    }
    AWS.LexModelsV2.prototype.listBotAliases = function () {
      credentialsUsed.push(this.config.credentials.accessKeyId)
      return {
        promise: async () => ({
          botAliasSummaries: [{ botAliasId: 'alias-id', botAliasName: 'Alias name', description: 'Alias description' }]
        })
      }
    }

    const caps = {
      LEX_AUTH_MODE: 'IAM_ROLE',
      LEX_ROLE_ARN: 'arn:aws:iam::123456789012:role/BotiumLex',
      LEX_ROLE_EXTERNAL_ID: 'botium-external-id',
      LEX_ACCESS_KEY_ID: 'source-access-key',
      LEX_SECRET_ACCESS_KEY: 'source-secret-key',
      LEX_REGION: 'eu-central-1',
      LEX_VERSION: 'V2'
    }
    assert.deepEqual(await queryBots(caps), [
      { key: 'bot-id', name: 'Bot name', description: 'Bot description' }
    ])
    assert.deepEqual(await queryBotAliases({ ...caps, LEX_PROJECT_NAME: 'bot-id' }), [
      { key: 'alias-id', name: 'Alias name', description: 'Alias description' }
    ])
    assert.equal(assumeRoleCalls, 2)
    assert.deepEqual(credentialsUsed, ['role-access-key', 'role-access-key'])
  })
})
