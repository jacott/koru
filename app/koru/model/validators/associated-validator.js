define(function(require, exports, module) {
  const util  = require('koru/util');
  const Model = require('../main');
  const Query = require('../query');

  const toMap = list => {
    const ans = {}, {length} = list;
    for(let i = 0; i < length; ++i) ans[list[i]] = true;
    return ans;
  };

  return function (doc, field, options) {
    if (options.changesOnly && ! (field in doc.changes)) return;
    let value = doc[field];
    if (value == null) return;

    const fieldOpts = doc.constructor.$fields && doc.constructor.$fields[field];
    const belongs_to = fieldOpts && fieldOpts.type === 'belongs_to';

    if (belongs_to ? typeof value !== 'string' : ! Array.isArray(value))
      return this.addError(doc,field,'is_invalid');

    if (belongs_to)
      value = [value];

    if (value.length === 0) return;

    switch (typeof options) {
    case 'object':
      var modelName = options.modelName;
      var finder = options.finder;
      var filter = options.filter;
      break;
    case 'string':
      var modelName = options;
      break;
    }
    if (belongs_to && ! modelName) {
      modelName = fieldOpts.model && fieldOpts.model.modelName;
    }

    if (! modelName) {
      var scopeName = util.sansId(field);
      modelName = util.capitalize(scopeName);
    } else {
      var scopeName = util.uncapitalize(modelName);
    }

    finder = finder ||
      doc[scopeName+'Find'] ||
      (values => new Query(Model[modelName]).where('_id', values));



    const orig = doc.attributes[field];
    if (! belongs_to &&
        options.changesOnly && orig != null && orig.length != 0 &&
        value.length != 0) {
      orig.sort();
      value.sort();
      const newIds = [];
      let ki = 0;
      const ol = orig.length, nl = value.length;
      let ni = 0, nv = value[0];
      for(let i = 0; i < ol; ++i) {
        const ov = orig[i];
        while (nv < ov && ++ni < nl) {
          if(newIds.length == 0 || newIds[newIds.length-1] !== nv)
            newIds.push(nv);
          nv = value[ni];
        }
        if (nv === ov) {
          while (nv == ov && ni < nl)
            nv = value[++ni];
          value[ki++] = ov;
        }
      }


      for (let i = ni; i < nl; ++i) newIds.push(value[i]);

      if (filter) {
        finder.call(doc, newIds).fields('_id').forEach(assoc => {
          value[ki++] = assoc._id;
        });
        value.length = ki;
        value.sort();
        if (belongs_to) doc[field] = value[0];
      } else if (finder.call(doc, newIds).count() !== newIds.length) {
        this.addError(doc,field,'not_found');
      } else {
        for(let i = 0; i < newIds.length; ++i) {
           value[ki++] = newIds[i];
        }
        value.length = ki;
        value.sort();
      }
    } else if (filter) {
      const query = finder.call(doc, value.slice()); // stop from being clobbered
      value.length = 0;

      query.fields('_id').forEach(assoc => value.push(assoc._id));
      value.sort();

      if (belongs_to) doc[field] = value[0];
    } else {
      value.sort();
      const vl = value.length;
      let lv = value[0];
      for(let i = 1; i < vl; ++i) {
        const v = value[i];
        if (lv == v) {
          this.addError(doc,field, 'duplicates');
          return;
        }
      }
      if (finder.call(doc, value).count() !== value.length) {
        this.addError(doc,field, 'not_found');
      }

    }
  };
});
