var files = {};

requirejs.onResourceLoad = function (context, map, depArray) {
  files[map.name] = depArray;

  if (map.name === 'package/bart')
    MAP = arguments;
}

console.log('DEBUG bart');

define(['package/bart-session'], function(session) {
  return {files: files};
});
