'use strict'

/*
    Required modules
 */
var Primus = require('primus')
var irc = require('irc')
var fs = require('fs')
var bunyan = require('bunyan')

var log = bunyan.createLogger({
  name: 'Chimera IRChat bot',
  serializers: {
    req: bunyan.stdSerializers.req,
    res: bunyan.stdSerializers.res
  }
})

try {
  var config = JSON.parse(fs.readFileSync('config.json', 'utf8'))
} catch (e) {
  log.fatal(e)
  process.exit(1)
}

if (!config.bot.url) {
  log.fatal('bot.url configuration is empty, no bots for you!')
  process.exit(1)
}

var Socket = Primus.createSocket()
var client = new Socket(config.bot.url + config.bot.args,
  {
    manual: true,
    reconnect: {
      max: Infinity,
      min: 10000,
      retries: 1
    }
  })
var bot = new irc.Client(config.bot.ircServer, config.bot.nick,
  {
    channels: [config.bot.ircChannels],
    autoRejoin: true,
    floodProtection: true,
    debug: true,
    showErrorors: true
  })
var connectedToServer = false
var nickColors = [
  'light_blue',
  'dark_blue',
  'light_red',
  'dark_red',
  'light_green',
  'dark_green',
  'magenta',
  'light_magenta',
  'orange',
  'yellow',
  'cyan',
  'light_cyan'
]

/*
    Bot authentication
 */
bot.addListener('registered', function (msg) {
  if (config.bot.auth.useAuth) {
    bot.say(config.bot.auth.authReceiver, config.bot.auth.authMessage)
  }

  log.info('Bot status' +
    '\nnick: ' + config.bot.nick +
    '\nserver: ' + config.bot.ircServer +
    '\nchannel: ' + config.bot.ircChannels +
    '\nauthed: ' + (config.bot.useAuth ? 'most likely' : false)
  )

  if (!connectedToServer) {
    client.open()
  }
})

bot.addListener('error', function (msg) {
  log.error(msg)
})

/*
    Listen message within the selected channel
        supports only 1 channel atm.

    https://github.com/primus/primus#primuswritemessage
        "client will automatically buffer all the data you've send and
        automatically write it to the server once it's connected."

    Anyone in the irc channel can:
        try to connect the bot to the server by writing ">connect", without
        quotes hide their messages from the bot with ! symbol
        example: "!Bot can't see me now ;)"*
*/
bot.addListener('message' + config.bot.ircChannels, function (from, to, text, msg) {
  if (to.charAt(0) === '>') {
    if (!connectedToServer && to === '>connect') {
      client.open()
    }
  } else if (to.charAt(0) === '!') {
  } else {
    client.write({
      'type': 'ircMessage',
      'user': from,
      'message': to
    })
  }
})

/*
    Function which allows the bot to write to IRC channel
 */
function writeToIrc (channel, user, msg) {
  if (user) {
    /* Use the ASCII code of the first character of the user's nick to generate a color */
    var colorIndex = (user.charCodeAt(0) + user.length) % nickColors.length
    bot.say(channel, irc.colors.wrap(nickColors[colorIndex], user) + ': ' + msg)
  } else {
    bot.say(channel, msg)
  }
}

/*
    Connection is open to the chat/socket server
*/
client.on('open', function () {
  log.info('Connected to the chat/socket server')

  writeToIrc(config.bot.ircChannels, null, 'Connection to the chat server established.')
  connectedToServer = true
})

/*
    Writes only those messages that are not from the irc channel
 */
client.on('data', function (data) {
  if (data.type !== 'CleanMessage') {
    return
  }

  data.message = data.message
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')

  writeToIrc(config.bot.ircChannels, data.user, data.message)
})

/*
    Disconnected from the chat/socket server
 */
client.on('close', function () {
  writeToIrc(config.bot.ircChannels, null, 'Disconnection detected, trying to reconnect..')
})

/*
    All reconnection tries have failed
 */
client.on('reconnect failed', function () {
  client.end()
})

/*
    The connection is now fully killed
 */
client.on('end', function () {
  log.error('Bot has disconnected from the chat/socket server!')
  writeToIrc(config.bot.ircChannels, null, 'Disconnection is permanent.')
  connectedToServer = false
})
