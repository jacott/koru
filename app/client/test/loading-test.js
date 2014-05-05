define(function (require) {
  var session = require('package/bart-session');

  console.log('DEBUG my first test');
  session.send('T', 'OK');
});

console.log('DEBUG loading-test, after def');
