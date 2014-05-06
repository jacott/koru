define(['./sinon', './stacktrace'], function(sinon, stacktrace) {
  var geddon = {
    sinon: sinon,

    _testCases: {},

    _init: function () {
      this.testCount = this.skipCount = this.assertCount = 0;
    },

    _u: {
      isElement: function(elm) {
        return elm != null && typeof elm === 'object' && typeof elm.isSameNode === 'function';
      },
      stacktrace: stacktrace,
    },

    extractError: function (ex) {
      return ex.toString() + "\n" + stacktrace(ex).join("\n");

    },

    inspect: function(o){
      return inspect(o).toString();
    },
  };

  geddon._init();

  return geddon;

  function inspect(o, i) {
    if (i <0 || o == null) return typeof o;
    switch(typeof o) {
    case 'function':
      return 'function ' + o.name;
    case 'object':
      if (o instanceof Array)
        return "[" + o.map(function (o2) {
          return inspect(o2, i-1);
        }).join(", ") + "]";

      var r=[];
      for (var p in o){
        r.push(p.toString() + ": " + inspect(o[p], i-1));
      }
      return "{" + r.join(", ") +"}";
    case 'String':
      return '"'+o+'"';
    default:
      return o.toString();
    }
  }
});
