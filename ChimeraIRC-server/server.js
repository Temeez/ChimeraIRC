'user strict'

var Primus = require('primus')
var http = require('http')
var request = require('request')
var Redis = require('redis')
var fs = require('fs')
var bunyan = require('bunyan')
var CronJob = require('cron').CronJob

var log = bunyan.createLogger({
  name: 'Chimera IRChat server',
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

var job = new CronJob('0 0 0 * * *', function () {
  updateRedisKeyToDate()
}, function () {},
  false,
  config.server.timezone
)

job.start()

if (!config.server.allowedHost) {
  log.error('allowedHost configuration is empty, no one is allowed to connect!')
  process.exit(1)
}

var redis = Redis.createClient(config.redis.port, config.redis.host)
var server = http.createServer().listen(config.server.port)
var primus = new Primus(server, { strategy: 'online, disconnect' })
var nextRedisKey = 0
var usersConnected = []

redis.select(config.redis.db)
redis.scard(getServerDate(0), function (err, reply) {
  if (err) {
    log.fatal(err)
  }

  nextRedisKey = reply
})

log.info('Chimera IRChat server is running' +
  '\nserver port: ' + config.server.port +
  '\nredis port: ' + config.redis.port +
  '\nredis host: ' + config.redis.host +
  '\nredis db: ' + config.redis.db)

function updateRedisKeyToDate () {
  nextRedisKey = 0

  log.info('nextRedisKey value changed to ' + nextRedisKey + '. Today is ' + getServerDate(0))
}

function getServerTime () {
  var currentTime = new Date()
  var currentHours = currentTime.getHours()
  var currentMinutes = currentTime.getMinutes()
  var currentSeconds = currentTime.getSeconds()

  currentHours = (currentHours < 10 ? '0' : '') + currentHours
  currentMinutes = (currentMinutes < 10 ? '0' : '') + currentMinutes
  currentSeconds = (currentSeconds < 10 ? '0' : '') + currentSeconds

  currentHours = (currentHours === '24') ? '00' : currentHours

  return currentHours + ':' + currentMinutes + ':' + currentSeconds
}

function getServerDate (daysToPast) {
  var date = Date.now()

  if (daysToPast > 0) {
    var dayMs = 1000 * 60 * 60 * 24
    var diff = date - (dayMs * daysToPast)
    date = new Date(diff)
  } else {
    date = new Date(date)
  }

  var day = date.getDate()
  var month = date.getMonth() + 1
  var year = date.getFullYear()

  return day + '.' + month + '.' + year
}

function chunk (array, groupsize) {
  var sets = []
  var chunks
  var i = 0

  chunks = array.length / groupsize

  while (i < chunks) {
    sets[i] = array.splice(0, groupsize)
    i++
  }

  return sets
}

function isValidMessage (msg) {
  return (msg !== '' || msg !== undefined || msg !== null || typeof (msg) === 'string')
}

function cleanMessage (msg, spaces) {
  if (msg == null) {
    return null
  }

  if (!spaces) {
    msg = msg.replace(/\s/g, '')
  }

  return msg
    .replace(/(<([^>]+)>)/ig, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\s{2,}/g, ' ')
}

function writeMessage (type, user, msg, date, more) {
  return {
    'type': type,
    'user': user,
    'date': date,
    'messages': msg !== undefined ? msg : [],
    'more': more
  }
}

function getHistory (spark, loadHistory) {
  if (usersConnected[spark.id] === undefined) {
    log.warn('getHistory' + usersConnected[spark.id])
    return
  }

  if (spark.query === undefined || spark.query.historyLimit === undefined) {
    log.warn(spark.address.ip + ' kicked for not having any queries or historyLimit')
    log.warn(spark.query)

    spark.end()
  }

  var historyLimit = parseInt(spark.query.historyLimit, 10)
  var canGetHistory = usersConnected[spark.id].nextHistory <= config.server.daysTillHistoryExpire
  var userHistoryArr = usersConnected[spark.id].availableHistory

  var redisScan = function (date, limit) {
    if (limit === 0) {
      limit = 500
    }

    var canGetHistory = usersConnected[spark.id].nextHistory <= (config.server.daysTillHistoryExpire !== '' ? config.server.daysTillHistoryExpire : 7)

    // Stop looking into the past if going too far
    // if (!canGetHistory) {
    //     return
    // }

    // Get all members within the given key, which is a date
    redis.smembers(date, function (err, reply) {
      if (err) {
        log.error(err, reply)
      }

      if (reply !== undefined) {
        if (reply.length === 0) {
          usersConnected[spark.id].nextHistory += 1
        }

        // Check further into the past if nothing found here
        if (reply.length === 0 && canGetHistory) {
          return redisScan(getServerDate(usersConnected[spark.id].nextHistory), limit)
        }

        // Sort and chunkify the history data
        var sorted = []
        var chunked = []

        sorted = reply.sort(function (a, b) { return JSON.parse(a).id - JSON.parse(b).id })

        if (sorted.length > limit) {
          chunked = chunk(sorted, limit)
        }

        // Send the history data to the client and save the rest to the user object
        spark.write(writeMessage('History', usersConnected[spark.id].user, chunked.length === 0 ? sorted : chunked.pop(), date, chunked.length))

        usersConnected[spark.id].availableHistory = chunked

        // No data from this day, we can check yesterday
        if (chunked.length === 0) {
          usersConnected[spark.id].nextHistory++
        }
      }
    })
  }

  if (canGetHistory && userHistoryArr.length === 0) {
    redisScan(getServerDate(usersConnected[spark.id].nextHistory), historyLimit)
  }

  if (userHistoryArr.length !== 0) {
    spark.write(writeMessage('History', usersConnected[spark.id].user, userHistoryArr.pop(), getServerDate(usersConnected[spark.id].nextHistory), userHistoryArr.length))

    if (userHistoryArr.length === 0) {
      usersConnected[spark.id].nextHistory += 1
    }
  }
}

function newUser (name, color) {
  return { user: name, color: color, nextHistory: 0, availableHistory: [] }
}

// Auth based on the host
// Inspiration from Django
primus.authorize(function (req, done) {
  var cServer = config.server

  var hostport = req.headers.host !== undefined ? req.headers.host.split(':') : false
  var protorigin = req.headers.origin !== undefined ? req.headers.origin.split('://') : false
  var hostname = hostport[0]
  var origin = protorigin[1]
  var allowedHosts = (cServer.allowedHost.length === 0 || cServer.allowedHost === '') ? false : cServer.allowedHost
  var allowedOrigins = (cServer.allowedOrigin.length === 0 || cServer.allowedOrigin === '') ? '*' : cServer.allowedOrigin
  var allowOrigin = false

  if (!hostport || (!protorigin && !cServer.allowNoOrigin)) {
    log.error('Received Host or Origin header is undefined!')
    log.error(req.headers)
    return
  }

  if (config.debug) {
    log.info('New connection; Host: ' + req.headers.host + ' | Origin: ' + req.headers.origin)
  }

  if (allowedOrigins[0] === '*') {
    allowOrigin = true
  } else {
    for (var i = 0; i < allowedOrigins.length; i++) {
      switch (allowedOrigins[i]) {
        case origin:
          allowOrigin = true
          break
        case req.headers.origin:
          allowOrigin = true
          break
      }
    }
  }

  if (!allowOrigin) {
    log.warn('Denying connection with origin ' + req.headers.origin + ' - Check the config? - ' + allowedOrigins)
    return
  }

  for (var j = 0; j < allowedHosts.length; j++) {
    switch (allowedHosts[j]) {
      case hostname:
        return done()
      case req.headers.host:
        return done()
    }
  }

  return
})

primus.on('connection', function (spark) {
  var cConfig = config.client

  if (spark.address.ip === (config.bot.host || '::ffff:127.0.0.1')) {
    log.info('Bot connected from ip ' + spark.address.ip)
  } else {
    if (config.debug) {
      usersConnected[spark.id] = newUser('Zergling', '#66023')
    }
  }

  var connectionType = spark.query.type === undefined ? null : spark.query.type
  var key = spark.query.key === undefined ? null : spark.query.key

  if (connectionType == null) {
    log.warn('Someone tried to connect without a connection type! ' + spark.address.ip)
    return spark.end()
  }

  switch (connectionType) {
    case 'bot':

      break
    case 'smf':
      if (!cConfig.smf.allow) {
        return spark.end()
      }

      if (cConfig.smf.key && (key != null || key !== '')) {
        // SMF authing
        request({
          uri: cConfig.smf.authUrl,
          method: 'POST',
          followAllRedirects: true,
          form: { 'key': key }
        }, function (err, res, body) {
          if (!err && res.statusCode === 200 && body !== '') {
            var data = cleanMessage(JSON.parse(body), true)

            if (data == null) {
              log.error('Data was null in smf auth, impossible!', data, spark.query)
              return spark.end()
            }

            data = data.split('|')

            usersConnected[spark.id] = newUser(data[0], data[1])
            getHistory(spark, config.client.smf.loadHistory)
          } else {
            log.error('When trying to authenticate a client' +
              '\nres: ' + res +
              '\n' + err +
              '\n' + body +
              '\n' + key +
              '\n' + spark.query
            )

            return spark.end()
          }
        }) // end request
      }
      break
    case 'blank':
      if (!cConfig.blank.allow) {
        return spark.end()
      }

      getHistory(spark, config.client.blank.loadHistory)
      break
  }

  spark.on('data', function (data) {
    if (usersConnected[spark.id] === undefined && spark.address.ip !== config.bot.host) {
      log.warn('Someone tried to send a message without being authed! ' + spark.address.ip)
      return spark.end()
    }

    var IRC = false
    var ircUser = ''

    switch (data.type) {
      case 'getHistory':
        getHistory(spark, true)
        return
      case 'ircMessage':
        IRC = true
        ircUser = data.user
        break
      case 'newMessage':

        break
    }

    if (data.message !== undefined) {
      var message = data.message.trim()

      if (!isValidMessage(message)) {
        log.warn('Received invalid message!' + data + ' | ' + message)
        return
      }

      var msg = cleanMessage(message, true) == null ? '' : cleanMessage(message, true)
    }

    var newId = nextRedisKey++

    data = {
      'id': newId.toString(),
      'type': IRC ? 'CleanMessageIRC' : 'CleanMessage',
      'color': IRC ? '#697263' : usersConnected[spark.id].color,
      'user': IRC ? ircUser : usersConnected[spark.id].user,
      'time': getServerTime(),
      'date': getServerDate(0),
      'message': msg !== undefined ? msg : 'undf'
    }

    primus.write(data)
    redis.sadd(getServerDate(0), JSON.stringify(data))
    redis.expire(getServerDate(0), config.server.daysTillHistoryExpire * 24 * 60 * 60)
  })

  spark.on('end', function () {
    delete usersConnected[spark.id]
  })
})
