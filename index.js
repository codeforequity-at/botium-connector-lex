const BotiumConnectorLex = require('./src/connector')
const { extractIntentUtterances, trainIntentUtterances, cleanupIntentUtterances } = require('./src/nlp')

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorLex,
  NLP: {
    ExtractIntentUtterances: extractIntentUtterances,
    TrainIntentUtterances: trainIntentUtterances,
    CleanupIntentUtterances: cleanupIntentUtterances
  }
}
