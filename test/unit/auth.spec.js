import { assert } from 'chai'
import AWS from 'aws-sdk'

import { getAwsCredentials } from '../../src/auth.js'

describe('AWS authentication', function () {
  let originalAssumeRole

  beforeEach(function () {
    originalAssumeRole = AWS.STS.prototype.assumeRole
  })

  afterEach(function () {
    AWS.STS.prototype.assumeRole = originalAssumeRole
  })

  it('returns configured IAM access keys', async function () {
    const credentials = await getAwsCredentials({
      LEX_AUTH_MODE: 'IAM_KEYS',
      LEX_ACCESS_KEY_ID: 'access-key',
      LEX_SECRET_ACCESS_KEY: 'secret-key'
    })

    assert.deepEqual(credentials, {
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key'
    })
  })

  it('assumes the configured IAM role', async function () {
    let assumeRoleParams
    AWS.STS.prototype.assumeRole = (params, callback) => {
      assumeRoleParams = params
      callback(null, {
        Credentials: {
          AccessKeyId: 'role-access-key',
          SecretAccessKey: 'role-secret-key',
          SessionToken: 'role-session-token'
        }
      })
    }

    const credentials = await getAwsCredentials({
      LEX_AUTH_MODE: 'IAM_ROLE',
      LEX_ROLE_ARN: 'arn:aws:iam::123456789012:role/BotiumLex',
      LEX_ROLE_EXTERNAL_ID: 'botium-external-id'
    })

    assert.equal(assumeRoleParams.RoleArn, 'arn:aws:iam::123456789012:role/BotiumLex')
    assert.equal(assumeRoleParams.ExternalId, 'botium-external-id')
    assert.match(assumeRoleParams.RoleSessionName, /^botium-session-lex-\d+$/)
    assert.deepEqual(credentials, {
      accessKeyId: 'role-access-key',
      secretAccessKey: 'role-secret-key',
      sessionToken: 'role-session-token'
    })
  })
})
