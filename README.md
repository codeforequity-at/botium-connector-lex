# Botium Connector for Amazon Lex

[![NPM](https://nodei.co/npm/botium-connector-google-assistant.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-connector-lex/)

[ ![Codeship Status for codeforequity-at/botium-connector-lex](https://app.codeship.com/projects/f379ece0-ee76-0136-6e85-5afc45d94643/status?branch=master)](https://app.codeship.com/projects/320125)
[![npm version](https://badge.fury.io/js/botium-connector-lex.svg)](https://badge.fury.io/js/botium-connector-lex)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

This is a [Botium](https://github.com/codeforequity-at/botium-core) connector for testing your Amazon Lex chatbot.

__Did you read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) articles? Be warned, without prior knowledge of Botium you won't be able to properly use this library!__

## How it works

It can be used as any other Botium connector with all Botium Stack components:
* [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
* [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
* [Botium Box](https://www.botium.at)

This connector processes info about NLP. So Intent/Entity asserters can be used. (Does not returns confidences, and alternative intents)

## Prerequisites

### Published Lex bot.
* Note the alias (Where it is published to)

### An IAM user is requred to access te API.
* [Create an IAM user](https://console.aws.amazon.com/iam/) (see [here](https://docs.aws.amazon.com/de_de/IAM/latest/UserGuide/id_users_create.html) for help)
  * Important: choose _Programmatic access_ as access type
  * Note access key and secret, you need it later
* Choose _Attach existing policies to user directly_ to give permissions _AmazonLexFullAccess_
  * Feel free to use finer grained policies if you know what you are doing, 
  or read [Authentication and Access Control for Amazon Lex](https://docs.aws.amazon.com/lex/latest/dg/auth-and-access-control.html)
    
## How to use

### Create your testcases

### Create botium.json

Create a botium.json with 
* Amazon region where you have created your bot. See [Amazon Lex Console](https://console.aws.amazon.com/lex)
* access key and secret of IAM user,
* name of the bot
* alias (see publishing) 
```javascript
{
  "botium": {
    "Capabilities": {
      "PROJECTNAME": "<whatever>",
      "CONTAINERMODE": "lex",
      "LEX_REGION": "xxx",
      "LEX_ACCESS_KEY_ID": "xxx",
      "LEX_SECRET_ACCESS_KEY": "xxx",
      "LEX_PROJECT_NAME": "xxx",
      "LEX_PROJECT_ALIAS": "xxx"
    }
  }
}
```

### Run your testcases

It depending how you want to run them:
* [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
* [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
* [Botium Box](https://www.botium.at)

## How to start sample

There is a small demo in [samples/BookTrip dir](./samples/BookTrip) with Botium Bindings.  This tests the BookTrip template of Amazon Lex. 
So to start it you have to 

* Create a bot from the template
  * Go to [console](https://console.aws.amazon.com/lex/home)
  * Choose region (top right) and note it, you need it later
  * Click create
  * Choose BookTrip
  * Choose a name and note it, you need it later
  * Accept COPPA
  * Click create
* Create botium.json
* Run it
  * cd ./samples/BookTrip
  * npm run test

## Supported Capabilities

Set the capability __CONTAINERMODE__ to __lex__ to activate this connector.

### LEX_ACCESS_KEY_ID
See Amazon IAM user

### LEX_SECRET_ACCESS_KEY
See Amazon IAM user

### LEX_REGION
Amazon region where you have created your bot. See [Amazon Lex Console](https://console.aws.amazon.com/lex)

### LEX_PROJECT_NAME
The name of the bot. See [Amazon Lex Console](https://console.aws.amazon.com/lex)

### LEX_PROJECT_ALIAS
The alias of the bot. (see publishing)
