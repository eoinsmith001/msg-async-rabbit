var exchange = 'myexchange';
var moment = require('moment');
var p = require('bluebird').promisify;
var retry = require('retry');
var _ = require('lodash');
var q = 'tasks';

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
 
// Publisher
var topics = [ 
  'user.created.foo',
  'user.created.bar',
];
var ftc = p(faultTolerantConnect);
ftc()
.then(function(conn) {
  console.log('Connected, createChannel');
  return conn.createChannel();
})
.then(function(ch) {
  console.log('channel created, assert Queue');
  return ch.assertExchange(exchange, 'topic')
  .then(function(ok) {
    console.log('publish to exchange');
    var msg;
    setInterval(function() { 
      msg = moment().format('YMMDD-HHmmss')
      var topic = _.sample(topics);
      ch.publish(exchange, topic, new Buffer(msg));
    }, 3000);
  });
})
.catch(function(e) {
  console.error('Rabbit setup failed; bailout!');
  process.exit(1);
});
