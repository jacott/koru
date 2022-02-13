define((require) => {
  'use strict';
  const ModelMap        = require('koru/model/map');
  const util            = require('koru/util');
  const Query           = require('../query');

  const {original$} = require('koru/symbols');

  const toMap = (list) => {
    const ans = {}, {length} = list;
    for (let i = 0; i < length; ++i) ans[list[i]] = true;
    return ans;
  };

  const changesOnlyCheckCount = (self, count, newIds, doc, field, value, ki) => {
    if (count !== newIds.length) {
      self.addError(doc, field, 'not_found');
    } else {
      for (let i = 0; i < newIds.length; ++i) {
        value[ki++] = newIds[i];
      }
      value.length = ki;
      value.sort();
    }
  };

  return {associated(doc, field, options, {type, changesOnly, model}) {
    let value = doc[field];
    if (value == null) return;

    const belongs_to = type === 'belongs_to';

    if (belongs_to ? typeof value !== 'string' : ! Array.isArray(value)) {
      return this.addError(doc, field, 'is_invalid');
    }

    if (belongs_to) {
      value = [value];
    }

    if (value.length == 0) return;

    let finder, filter, scopeName;
    switch (typeof options) {
    case 'object':
      finder = options.finder;
      filter = options.filter;
      break;
    default:
      if (options !== true) {
        throw new Error('invalid associated value');
      }
    }

    if (! model) {
      scopeName = util.sansId(field);
      model = ModelMap[util.capitalize(scopeName)];
    } else {
      scopeName = util.uncapitalize(model.modelName);
    }

    finder = finder ?? doc[scopeName + 'Find'] ?? ((values) => model.where('_id', values));

    const orig = (original$ in doc) ? doc[original$] : doc.attributes;
    const oValue = orig === undefined ? undefined : orig[field];
    if (! belongs_to &&
        changesOnly && Array.isArray(oValue) && oValue.length != 0 &&
        value.length != 0) {
      oValue.sort();
      value.sort();

      const newIds = [];
      let ki = 0;
      const ol = oValue.length, nl = value.length;
      let ni = 0, nv = value[0];
      for (let i = 0; i < ol; ++i) {
        const ov = oValue[i];
        while (nv < ov && ++ni <= nl) {
          if (newIds.length == 0 || newIds[newIds.length - 1] !== nv) {
            newIds.push(nv);
          }
          if (ni == nl) break;
          nv = value[ni];
        }
        if (nv === ov) {
          while (nv == ov && ni < nl) {
            nv = value[++ni];
          }
          value[ki++] = ov;
        }
      }

      for (let i = ni; i < nl; ++i) newIds.push(value[i]);

      if (filter) {
        const p = finder.call(doc, newIds).fields('_id').forEach((assoc) => {
          value[ki++] = assoc._id;
        });
        if (p instanceof Promise) {
          return p.then(() => {
            value.length = ki;
            value.sort();
            if (belongs_to) doc[field] = value[0];
          });
        }

        value.length = ki;
        value.sort();
        if (belongs_to) doc[field] = value[0];
      } else {
        const p = finder.call(doc, newIds).count();
        if (p instanceof Promise) {
          return p.then((count) => changesOnlyCheckCount(this, count, newIds, doc, field, value, ki));
        }
        changesOnlyCheckCount(this, p, newIds, doc, field, value, ki);
      }
    } else if (filter) {
      const query = finder.call(doc, value.slice()); // stop from being clobbered
      value.length = 0;

      const p = query.fields('_id').forEach((assoc) => value.push(assoc._id));
      const finish = () => {
        value.sort();

        if (belongs_to) doc[field] = value[0];
      };
      if (p instanceof Promise) {
        return p.then(finish);
      }

      finish();
    } else {
      value.sort();
      const vl = value.length;
      let lv = value[0];
      for (let i = 1; i < vl; ++i) {
        const v = value[i];
        if (lv == v) {
          this.addError(doc, field, 'duplicates');
          return;
        }
      }
      const ans = finder.call(doc, value).count();
      if (ans instanceof Promise) {
        return ans.then((count) => {
          if (count !== value.length) {
            this.addError(doc, field, 'not_found');
          }
        });
      }
      if (ans !== value.length) {
        this.addError(doc, field, 'not_found');
      }
    }
  }};
});
