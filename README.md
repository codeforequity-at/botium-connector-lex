# Botium Connector for Amazon Lex

[![NPM](https://nodei.co/npm/botium-connector-lex.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-connector-lex/)

[![Codeship Status for codeforequity-at/botium-connector-lex](https://app.codeship.com/projects/c947b780-0daa-0137-4acf-3a9e8715cbf8/status?branch=master)](https://app.codeship.com/projects/326745)
[![npm version](https://badge.fury.io/js/botium-connector-lex.svg)](https://badge.fury.io/js/botium-connector-lex)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

This is a [Botium](https://github.com/codeforequity-at/botium-core) connector for testing your Amazon Lex chatbot.

__Did you read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) articles? Be warned, without prior knowledge of Botium you won't be able to properly use this library!__

## How it works
Botium connects to the [Amazon Lex API](https://docs.aws.amazon.com/de_de/lex/latest/dg/API_Reference.html).

It can be used as any other Botium connector with all Botium Stack components:
* [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
* [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
* [Botium Box](https://www.botium.at)

This connector processes info about NLP. So Intent/Entity asserters can be used. (Does not returns confidences, and alternative intents)

## Requirements
* **Node.js and NPM**
* a **published Lex bot**, and user account with administrative rights
* a **project directory** on your workstation to hold test cases and Botium configuration

## Install Botium and Amazon Lex Connector

When using __Botium CLI__:

```
> npm install -g botium-cli
> npm install -g botium-connector-lex
> botium-cli init
> botium-cli run
```

When using __Botium Bindings__:

```
> npm install -g botium-bindings
> npm install -g botium-connector-lex
> botium-bindings init mocha
> npm install && npm run mocha
```

When using __Botium Box__:

_Already integrated into Botium Box, no setup required_

## Connecting Amazon Lex to Botium

You have to create an **IAM user** to enable Botium to access the Amazon Lex API.

* [Create an IAM user](https://console.aws.amazon.com/iam/) (see [here](https://docs.aws.amazon.com/de_de/IAM/latest/UserGuide/id_users_create.html) for help)
  * Important: choose _Programmatic access_ as access type
  * Note access key and secret, you need it later
* Choose _Attach existing policies to user directly_ to give permissions _AmazonLexFullAccess_
  * Feel free to use finer grained policies if you know what you are doing, 
  or read [Authentication and Access Control for Amazon Lex](https://docs.aws.amazon.com/lex/latest/dg/auth-and-access-control.html)
    
Create a botium.json with 
* Amazon region where you have created your bot. See [Amazon Lex Console](https://console.aws.amazon.com/lex)
* access key and secret of IAM user,
* name of the bot
* alias of the bot (see publishing)

```
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

To check the configuration, run the emulator (Botium CLI required) to bring up a chat interface in your terminal window:

```
> botium-cli emulator
```

Botium setup is ready, you can begin to write your [BotiumScript](https://github.com/codeforequity-at/botium-core/wiki/Botium-Scripting) files.

## How to start sample

There is a small demo in [samples/BookTrip dir](./samples/BookTrip) with Botium Bindings. This tests the BookTrip template of Amazon Lex. To start it you have to :

* Create and publish a bot from the template
  * Go to [console](https://console.aws.amazon.com/lex/home)
  * Choose **region** (top right) and note it, you need it later
  * Click _Create_
  * Choose _BookTrip_
  * Choose a **name** and note it, you need it later
  * Accept COPPA
  * Click _Create_ to create the Lex project
  * Now click _Publish_ and select an **alias**
* Adapt botium.json in the sample directory
* Run the sample

```
> cd ./samples/BookTrip
> npm install && npm test
```
## Using the botium-connector-lex-cli

This connector provides a CLI interface for importing convos and utterances from your Amazon Lex bot and convert it to BotiumScript.

* Bot intents and user examples are mapped to utterances in BotiumScript
* Slots in user examples are either filled with enumeration values (for enumeration slot types) or with random values
* Convos are using the utterances as input and attach an INTENT asserter

You can either run the CLI with *[botium-cli](https://github.com/codeforequity-at/botium-cli) (recommended - it is integrated there)*, or directly from this connector (see samples/BookTrip directory for some examples):

    > npx botium-connector-lex-cli import --buildconvos --output spec/convo

_Please note that you will have to install the npm package botium-core manually before using this CLI_

For getting help on the available CLI options and switches, run:

    > npx botium-connector-lex-cli import --help

## Supported Capabilities

Set the capability __CONTAINERMODE__ to __lex__ to activate this connector.

### LEX_ACCESS_KEY_ID
See Amazon IAM user

### LEX_SECRET_ACCESS_KEY
See Amazon IAM user

### LEX_REGION
Amazon region code where you have created your bot. See [Amazon Lex Console](https://console.aws.amazon.com/lex).

_Hint: a list of region codes is available [here](https://docs.aws.amazon.com/de_de/general/latest/gr/rande.html)_

### LEX_PROJECT_NAME
The name of the bot. See [Amazon Lex Console](https://console.aws.amazon.com/lex)

### LEX_PROJECT_ALIAS
The alias of the bot. (see publishing)

### LEX_SESSION_ATTRIBUTES
_Optional_.

Initial session attributes. It must be object, or object as string. Lex supports just string attributes. 
(otherwise retrurns error like "error sending to bot Error: Lex answered with error { InvalidParameterType: Expected params.sessionAttributes['somenumber'] to be a string")
