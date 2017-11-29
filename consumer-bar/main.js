var p = require('bluebird').promisify;
var retry = require('retry');
var q = 'processbar';

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
  return ch.assertQueue(q)
  .then(function(ok) {
    console.log('queue asserted into existence', q);
    console.log('next, bind q to exchange');
    return ch.bindQueue(q, 'myexchange', 'user.created.bar');
  })
  .then(function() {
    console.log('queue bound');
    console.log('consume...');
    return ch.consume(q, function(msg) {
      if (msg !== null) {
        console.log('bar received: ' + msg.content.toString());
        ch.ack(msg);
      }
    });
  });
})
.catch(function(e) {
  console.error('Rabbit setup failed; bailout!');
  process.exit(1);
});
