define(function(require, exports, module) {
  const {deepEqual, addItem, removeItem} = require('./util');


  const applyOne = (attrs, key, changes) => {
    const index = key.indexOf(".");

    const nv = changes[key];
    if (index === -1) {
      const ov = attrs[key];

      if (nv === ov || deepEqual(nv, ov))
        delete changes[key];
      else
        changes[key] = ov;

      if (nv === undefined)
        delete attrs[key];
      else
        attrs[key] = nv;

    } else { // update part of attribute
      const parts = key.split(".");
      let curr = attrs;
      let i;
      for(i = 0; i < parts.length - 1; ++i) {
        let part = parts[i];
        if (Array.isArray(curr)) {
          part = +parts[i];
          if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
        }
        curr = curr[part] ||
          (curr[part] = parts[i+1].match(/^\$[+\-]\d+/) ? [] : {});
      }
      let part = parts[i];
      const m = part.match(/^\$([+\-])(\d+)/);
      if (m) {
        if (m[1] === '-')
          removeItem(curr, nv);
        else
          addItem(curr, nv);

        delete changes[key];
        changes[key.replace(
            /\.\$([+\-])(\d+)/, (m, sign, idx) => ".$" + (sign === '-' ? '+' : '-') + idx
        )] = nv;
      } else {
        let ov = curr[part];
        if (nv === ov || deepEqual(nv, ov))
          delete changes[key];
        else
          changes[key] = ov;
        if (Array.isArray(curr)) {
          part = +part;
          if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
          if (nv === undefined)
            curr.splice(part, 1);
          else
            curr[part] = nv;
        } else {
          if (nv === undefined)
            delete curr[parts[i]];
          else {
            curr[parts[i]] = nv;
          }
        }
      }
    }
  };

  return {
    applyAll(attrs, changes) {
      for(const key in changes) applyOne(attrs, key, changes);
      return attrs;
    },

    applyOne,
  };
});
