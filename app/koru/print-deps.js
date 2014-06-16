define(function(require, exports, module) {
  var koru = require('./main');

  exports.both = function (name) {
    return exports.requiredBy(name) + exports.requires(name) +
      '\n"' + name + '" [shape=polygon,sides=4,peripheries=2];';
  },

  exports.all = function () {
    var result = [];
    var map = koru.providerMap;
    for(var curr in map) {
      for (var key in map[curr]) {
        result.push('"'+key+'" -> "'+curr+'";');
      }
    }

    result.push('');
    return result.join("\n");
  },

  exports.requiredBy = function (name) {
    var result = [];
    var map = koru.providerMap;
    var done = {};
    var curr = map[name];

    addDep(curr, name);

    function addDep(curr, name) {
      if (done[name]) return;
      done[name] = true;

      for (var key in curr) {
        result.push('"'+key+'" -> "'+name+'";');
        addDep(map[key], key);
      }
    }

    result.push('');

    return result.join("\n");
  };

  exports.requires = function (name) {
    var exclude = {
      "koru/main": true,
      "koru/util": true,
      "koru/util-base": true,
      "koru/test/main": true,
    };
    var result = [];
    var map = koru.providerMap;
    var inv = {};
    for (var sup in map) {
      var deps = map[sup];
      for (var dep in deps) {
        var curr = inv[dep] || (inv[dep] = {});
        curr[sup] = true;
      }
    }
    var done = {};
    var curr = inv[name];

    addDep(curr, name);

    function addDep(curr, name) {
      if (done[name]) return;
      done[name] = true;

      for (var key in curr) {
        if (exclude[key]) continue;
        result.push('"'+name+'" -> "'+key+'";');
        addDep(inv[key], key);
      }
    }

    result.push('');

    return result.join("\n");
  };
});
