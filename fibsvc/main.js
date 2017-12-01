var exchange = 'myexchange';
var moment = require('moment');
var p = require('bluebird').promisify;
var retry = require('retry');
var _ = require('lodash');
var q = 'tasks';

var rabbitConnection = process.env.RABBIT_SERVER || 'localhost';
var rabbitUrl = 'amqp://' + rabbitConnection;
console.log('attempt connect: ', rabbitUrl);
 
var amqp = require('amqplib');
var open = amqp.connect(rabbitUrl);
 
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
 
// Publisher
function fibonacci(n) {
  // get nth fibonacci
  if (n==0||n==1) {
    return n;
  } else {
    return fibonacci(n-1) + fibonacci(n-2);
  }
}

var q = 'rpc_queue';

var ftc = p(faultTolerantConnect);
var channel;
ftc()
.then(function(conn) {
  console.log('Connected, createChannel');
  return conn.createChannel();
})
.then(function(ch) {
  channel = ch;
  console.log('channel created, assert Queue');
  return ch.assertQueue(q, {durable:false})
  .then(function(ok) {
    console.log('Queue asserted, await RPC');
    channel.consume(q, function reply(msg) {
      var n = parseInt(msg.content.toString());
      console.log(" [.] fib(%d)", n);
      var r = fibonacci(n);
      channel.sendToQueue(msg.properties.replyTo,
        new Buffer(r.toString()),
        { correlationId: msg.properties.correlationId});
      channel.ack(msg);
    });
  });
})
.catch(function(e) {
  console.error('Rabbit setup failed; bailout!');
  process.exit(1);
});
