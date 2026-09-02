import AWS from 'aws-sdk'

import { getAwsCredentials } from './auth.js'
import { paginatedCall } from './slottypes.js'

export const isIamKeysAuth = caps => !caps.LEX_AUTH_MODE || caps.LEX_AUTH_MODE === 'IAM_KEYS'
export const isIamRoleAuth = caps => caps.LEX_AUTH_MODE === 'IAM_ROLE'

const hasAuthConfiguration = caps => {
  if (isIamRoleAuth(caps)) {
    return caps.LEX_ROLE_ARN && caps.LEX_ROLE_EXTERNAL_ID
  }
  if (isIamKeysAuth(caps)) {
    return caps.LEX_ACCESS_KEY_ID && caps.LEX_SECRET_ACCESS_KEY
  }
  return false
}

const buildModelClient = async caps => {
  if (!caps || !caps.LEX_REGION || !hasAuthConfiguration(caps)) return null

  const accessparams = await getAwsCredentials(caps)
  if (caps.LEX_VERSION === 'V1') {
    return new AWS.LexModelBuildingService({
      apiVersion: '2017-04-19',
      region: caps.LEX_REGION,
      ...accessparams
    })
  }
  if (caps.LEX_VERSION === 'V2') {
    return new AWS.LexModelsV2({
      apiVersion: '2020-08-07',
      region: caps.LEX_REGION,
      ...accessparams
    })
  }
  return null
}

export const queryBots = async caps => {
  const client = await buildModelClient(caps)
  if (!client) return

  if (caps.LEX_VERSION === 'V1') {
    const bots = await paginatedCall(client.getBots.bind(client), r => r.bots)
    if (bots && bots.length > 0) {
      return bots.map(b => ({
        key: b.name,
        name: b.name,
        description: b.description
      }))
    }
  } else {
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

export const queryBotAliases = async caps => {
  if (!caps || !caps.LEX_PROJECT_NAME) return

  const client = await buildModelClient(caps)
  if (!client) return

  if (caps.LEX_VERSION === 'V1') {
    const botAliases = await paginatedCall(client.getBotAliases.bind(client), r => r.BotAliases, { botName: caps.LEX_PROJECT_NAME })
    if (botAliases && botAliases.length > 0) {
      return botAliases.map(b => ({
        key: b.name,
        name: b.name,
        description: b.description
      }))
    }
  } else {
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
