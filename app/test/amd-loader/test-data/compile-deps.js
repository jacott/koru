define(function(require, exports, module) {

  var name = "./other";
  require(name); // not me
  require(['./fuzz']); // not me
  require('./foo', function () {}); // not me
  name.require('./baz'); // not me
  require('./norm-plugin!one/load');
  require('./norm-plugin!one/more/load');
  return require('./compile-deps-1').define('x'); // yes me
});
