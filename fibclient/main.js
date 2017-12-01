var q = 'processfoo';
var p = require('bluebird').promisify;
var retry = require('retry');

var rabbitConnection = process.env.RABBIT_SERVER || 'localhost';
var rabbitUrl = 'amqp://' + rabbitConnection;
console.log('attempt connect: ', rabbitUrl);

var open = require('amqplib').connect(rabbitUrl);

function faultTolerantConnect(cb) {
  var operation = retry.operation({
    retries: 3,
    factor: 2,
    minTimeout: 1 * 1000, 
    maxTimeout: 10 * 1000,
    randomize: true,
  });

  operation.attempt(function(currentAttempt) {
    open.then(function(conn) {
      cb(null, conn);
    })
    .catch(function(err) {
      if (operation.retry(err)) {
        return;
      }
      cb(operation.mainError());
    });
  });
}

// Consumer
var ftc = p(faultTolerantConnect);
ftc()
.then(function(conn) {
  console.log('Connected, create channel');
  return conn.createChannel();
})
.then(function(ch) {
  console.log('channel created, assert queue');
  return ch.assertQueue('', {exclusive: true})
  .then(function(q) {
    console.log('queue asserted into existence', q);
    console.log('consume...');
    ch.consume(q.queue, function(msg) {
      console.log(' [.] %s: Got %s', msg.properties.correlationId, msg.content.toString());
      // setTimeout(function() { conn.close(); process.exit(0) }, 500);
    }, {noAck: true});
    var corr;
    var num;
    setInterval(function() {
      corr = require('uuid/v4')();
      num = Math.floor(Math.random()*20);
      console.log(' [x] Request fib(%d)', num, corr);
      ch.sendToQueue('rpc_queue',
        new Buffer(num.toString()),
        { correlationId: corr, replyTo: q.queue });
    }, 2000);
  });
})
.catch(function(e) {
  console.error('Rabbit setup failed; bailout!');
  process.exit(1);
});
