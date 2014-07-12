define(function() {
  return function (model) {
    model.addUniqueIndex = function () {
      var fields = arguments;
      var len = fields.length;
      var leadLen = len - 1;
      var idx = {};

      var _tmpModel = new model();

      function tmpModel(doc, changes) {
        _tmpModel.attributes = doc;
        _tmpModel.changes = changes;
        return _tmpModel;
      }

      model.onChange(function (doc, old) {
        if (doc) {
          if (old) {
            for(var i = 0; i < len; ++i) {
              var field = fields[i];
              if (old.hasOwnProperty(field) && doc[field] != old[field]) {
                // make a temporary old version
                deleteEntry(idx, tmpModel(doc, old), 0);
                break;
              }
            }
            if (i === len) return;
          }
          var tidx = idx;
          for(var i = 0; i < leadLen; ++i) {
            var value = doc[fields[i]];
            tidx = tidx[value] || (tidx[value] = {});
          }
          var value = doc[fields[leadLen]];
          tidx[value] = doc._id;
        } else if (old) {
          deleteEntry(idx, old, 0);
        }
      });

      var uIndex = function (keys) {
        var ret = idx;
        for(var i = 0; ret && i < len; ++i) {
          if (! keys.hasOwnProperty(fields[i])) return ret;
          ret = ret[keys[fields[i]]];
        }
        return ret;
      };

      uIndex.fetch = function (keys) {
        var resultIndex = uIndex(keys) || {};

        var docs = model.docs;
        var results = [];
        pushResults(docs, results, resultIndex);
        return results;
      };

      function deleteEntry(tidx, doc, count) {
        var value  = doc[fields[count]];
        if (! tidx) return true;
        if (count === leadLen) {
          if (tidx[value] !== doc._id) return false;
        } else if (! deleteEntry(tidx[value], doc, count+1)) {
          return false;
        }
        delete tidx[value];
        for(var noop in tidx) return false;
        return true;
      }

      return uIndex;
    };

    function pushResults(docs, results, index) {
      for(var key in index) {
        var value = index[key];
        if (typeof value === 'string')
          results.push(docs[value]);
        else
          pushResults(docs, results, value);
      }
    }
  };
});
