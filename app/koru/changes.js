define(function(require, exports, module) {
  const {deepEqual, addItem, removeItem} = require('./util');

  const valueUndefined = {value: undefined};


  const applyOne = (attrs, key, changes) => {
    const index = key.indexOf(".");

    const nv = Object.getOwnPropertyDescriptor(changes, key);
    if (index === -1) {
      const ov = Object.getOwnPropertyDescriptor(attrs, key);

      if (ov && deepEqual(nv.value, ov.value))
        delete changes[key];
      else
        Object.defineProperty(changes, key, ov || valueUndefined);

      if (nv.value === undefined)
        delete attrs[key];
      else
        Object.defineProperty(attrs, key, nv);

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
          removeItem(curr, nv.value);
        else
          addItem(curr, nv.value);

        delete changes[key];
        Object.defineProperty(changes, key.replace(
            /\.\$([+\-])(\d+)/, (m, sign, idx) => ".$" + (sign === '-' ? '+' : '-') + idx
        ), nv);
      } else {
        let ov = Object.getOwnPropertyDescriptor(curr, part);
        if (ov && deepEqual(nv.value, ov.value))
          delete changes[key];
        else
          Object.defineProperty(changes, key, ov || valueUndefined);
        if (Array.isArray(curr)) {
          part = +part;
          if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
          if (nv.value === undefined)
            curr.splice(part, 1);
          else
            curr[part] = nv.value;
        } else {
          if (nv.value === undefined)
            delete curr[parts[i]];
          else {
            Object.defineProperty(curr, parts[i], nv);
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
