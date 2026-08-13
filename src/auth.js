import AWS from 'aws-sdk'

export const getCrossAccountCredentials = async ({ roleArn, roleExternalId }) => {
  const sts = new AWS.STS()

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

export const getAwsCredentials = async (caps) => {
  if (caps.LEX_AUTH_MODE === 'IAM_ROLE') {
    return getCrossAccountCredentials({
      roleArn: caps.LEX_ROLE_ARN,
      roleExternalId: caps.LEX_ROLE_EXTERNAL_ID
    })
  }

  return {
    accessKeyId: caps.LEX_ACCESS_KEY_ID,
    secretAccessKey: caps.LEX_SECRET_ACCESS_KEY
  }
}
