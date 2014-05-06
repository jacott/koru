define(['./sinon', './stacktrace'], function(sinon, stacktrace) {
  return {
    sinon: sinon,
    _u: {
      isElement: function(elm) {
        return elm != null && typeof elm === 'object' && typeof elm.isSameNode === 'function';
      },
      stacktrace: stacktrace,
    },

    _tests: [],

    testCount: 0,
    skipCount: 0,
    assertCount: 0,

    extractError: function (ex) {
      return ex.toString() + "\n" + stacktrace(ex).join("\n");

    },

    inspect: function(o){
      return inspect(o).toString();
    },
  };

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
