var redis = require('redis')
var moment = require('moment')

var Client = function(opt) {
  const {host, port, options} = opt.redis
  client = redis.createClient(host, port, options)
}

var Limiter = function(opt) {
  var match = opt.rate.match(/^(\d+)\s*\/\s*([a-z]+)$/)
  var limit = parseInt(match[1], 10)
  var window = moment.duration(1, match[2]) / 1000
  return (req, callback) => {
    var key = opt.key(req)
    var tempKey = `ratelimittemp:${key}`
    var realKey = `ratelimit:${key}`
    opt.client.multi()
      .setex(tempKey, opts.window, 0)
      .renamenx(tempKey, realKey)
      .incr(realKey)
      .exec((err, results) => {
        if(err) {
          callback(err);
        } else {
          var current = results[2];
          var over = current > limit
          var remaining = over?0:(limit - current)
          callback(null, {
            key,
            current,
            limit,
            window,
            remaining,
            over,
          })
        }
      })
  }
}

export default function(opt) {
  return (req, res, next) => {
    var client = Client(opt.redis)
    var { key, rate } = opt.rule[`${req.route.method} ${req.route.path}`]
    var limiter = Limiter({key, rate, client})
    return limiter(req, (err, rate) => {
      if(err) return next()
      var head = {
        "X-RateLimit-Limit": rate.limit,
        "X-RateLimit-Remaining": rate.remaining
      }
      if (rate.over) {
        res.writeHead(429, head)
        return res.end()
      } else {
        res.writeHead(200, head)
        return next()
      }
    })
  }
}
