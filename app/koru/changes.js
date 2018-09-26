define((require, exports, module)=>{
  const koru   = require('koru');
  const md5sum = require('koru/md5sum');
  const sha256 = require('koru/srp/sha256');
  const util   = require('koru/util');

  const {original$} = require('koru/symbols');

  const {isObjEmpty, diffString,
         deepEqual, deepCopy, elemMatch,
         addItem, removeItem} = require('koru/util');

  const {hasOwn} = util;

  const same = (a,b)=>a==b;

  const merge = (to, from)=>{
    let tp = to.$partial;
    const fp = from.$partial;
    for (const key in to) {
      if (key === '$partial') continue;
      if (hasOwn(from, key)) {
        to[key] = from[key];
        if (hasOwn(tp, key))
          delete tp[key];

      } else if (hasOwn(fp, key))
        applyPartial(to, key, fp[key]);
    }

    for (const key in fp) {
      if (hasOwn(to, key)) continue;
      if (tp === undefined) tp = to.$partial = {};
      if (hasOwn(tp, key))
        tp[key].push(...fp[key]);
      else
        tp[key] = fp[key];
    }

    for (const key in from) {
      if (key === '$partial') continue;
      if (tp !== undefined && hasOwn(tp, key)) {
        delete tp[key];
      }
      to[key] = from[key];
    }

    return to;
  };


  const diffArray = (oldSeq, newSeq, equal=same)=>{
    const lo = oldSeq.length-1, ln = newSeq.length-1;
    const minLast = Math.min(lo, ln);
    let s = 0, e = 0;
    while(s <= minLast && equal(oldSeq[s], newSeq[s])) ++s;
    if (lo == ln && s == minLast+1) return;
    while(s <= minLast - e && equal(oldSeq[lo-e], newSeq[ln-e])) ++e;

    return [s, 1+lo-(e+s), newSeq.slice(s, e === 0 ? undefined : -e)];
  };

  // surrogate1stRE = /[\uD800-\uDBFF]/;
  // surrogate2ndRE = /[\uDC00-\uDFFF]/;

  const diffSeq = (oldSeq, newSeq, equal)=>{
    if (typeof oldSeq === 'string') {
      const ans = diffString(oldSeq, newSeq);
      if (ans !== undefined) {
        ans[2] = newSeq.slice(ans[0], ans[0]+ans[2]);
      }
      return ans;
    } else
      return diffArray(oldSeq, newSeq, equal);
  };


  const applyPatch = (ov, patch, key, undoPatch)=>{
    let si = 0, i = 0;
    if (ov == null) {
      if (patch.length < 3 || patch[0] != 0 || patch[1] != 0)
        throw new koru.Error(400, 'invalid patch');

      ov = patch[2];
      i = 3;
      si = ov.length;
      undoPatch !== undefined && undoPatch.push(0, si, null);
    }
    for(;i < patch.length; i += 3) {
      let ds = patch[i];
      const dl = patch[i+1], content = patch[i+2];
      const clen = content == null ? 0 : content.length;
      if (ds < 0) {
        const nsi = ov.length + ds;
        ds = nsi - si;
        si = nsi;

      } else {
        si += ds;
      }
      const ei = si+dl;
      const urep = ov.slice(si, ei);
      if (typeof ov === 'string')
        ov = `${ov.slice(0, si)}${clen == 0 ? '' : content}${ov.slice(ei)}`;
      else
        ov.splice(si, ei - si, ...(content == null ? [] : content));
      si += clen;

      undoPatch !== undefined && undoPatch.push(
        ds,
        clen, urep.length == 0 ? null : urep
      );
    }
    return ov;
  };


  const applySimple = (attrs, key, changes)=>{
    const nv = changes[key];
    const ov = attrs[key];

    if (nv === ov || deepEqual(nv, ov)) {
      delete changes[key];
      return;
    }
    changes[key] = ov === undefined ? null : ov;
    if (attrs.constructor === Array) {
      key = +key;
      if (nv == null)
        attrs.splice(key, 1);
      else
        attrs[key] = nv;
      return;
    }

    if (nv == null)
      delete attrs[key];
    else
      attrs[key] = nv;
  };

  const applyOne = (attrs, key, changes) => {
    if (typeof key === 'number' || key.indexOf(".") === -1) {
      applySimple(attrs, key, changes);
      return;
    }

    const nv = changes[key];
    let changesUpdated = false;
    const parts = key.split(".");
    const partial = key.endsWith('.$partial');
    const partLen = partial ? parts.length-1 : parts.length;
    let curr = attrs;
    let i;
    for(i = 0; i < partLen - 1; ++i) {
      let part = parts[i];
      if (Array.isArray(curr)) {
        part = +parts[i];
        if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
      }

      if (curr[part] == null) {
        if (! changesUpdated) {
          changesUpdated = true;
          delete changes[key];
          key = parts.slice(0, i+1).join(".");
          changes[key] = null;
        }
        curr = curr[part] = parts[i+1].match(/^\d+$/) ? [] : {};
      } else {
        curr = curr[part];
      }
    }
    let part = parts[i];

    if (partial) {
      const undo = [];
      applyPartial(curr, part, nv, undo);
      if (! changesUpdated)
        changes[key] = undo;
      return;
    }

    let ov = curr[part];
    if (! changesUpdated) {
      if (nv === ov || deepEqual(nv, ov))
        delete changes[key];
      else
        changes[key] = ov;
    }
    if (Array.isArray(curr)) {
      part = +part;
      if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
      if (nv == null)
        curr.splice(part, 1);
      else
        curr[part] = nv;
    } else {
      if (nv == null)
        delete curr[part];
      else {
        curr[part] = nv;
      }
    }
  };

  const COMMANDS = {
    $match(attrs, key, expected) {
      if (typeof expected === 'object' && expected !== null) {
        if (typeof expected.md5 === 'string') {
          if (md5sum(attrs[key]).startsWith(expected.md5)) return;
        } else if (typeof expected.sha256 === 'string') {
          if (sha256(attrs[key]).startsWith(expected.sha256)) return;
        } else if (deepEqual(attrs[key], expected)) return;
      } else if (deepEqual(attrs[key], expected)) return;

      throw new koru.Error(409, {[key]: 'not_match'});
    },

    $replace(attrs, key, nv, undo) {
      const ov = attrs[key];

      if (nv === ov || deepEqual(nv, ov))
        return;

      undo !== undefined && undo.push('$replace', ov === undefined ? null : ov);

      if (nv == null)
        delete attrs[key];
      else
        attrs[key] = nv;
    },

    $prepend(attrs, key, nv, undo) {
      const ov = attrs[key];
      if (typeof ov === 'string') {
        attrs[key] = nv + ov;
      } else if (ov != null && ov.constructor === Array) {
        attrs[key] = nv.concat(ov);
      } else
        throw new koru.Error(400, {[key]: 'wrong_type'});
      undo !== undefined && undo.push('$patch', [0, nv.length, null]);
    },

    $append(attrs, key, nv, undo) {
      const ov = attrs[key];
      if (typeof ov === 'string') {
        attrs[key] += nv;
      } else if (ov != null && ov.constructor === Array) {
        attrs[key] = attrs[key].concat(nv);
      } else
        throw new koru.Error(400, {[key]: 'wrong_type'});
      if (undo !== undefined) {
        undo.push('$patch', [-nv.length, nv.length, null]);
      }
    },
    $patch(attrs, key, patch, undo) {
      if (undo !== undefined && undo.$patch !== undefined)
        throw new koru.Error(400, {[key]: 'invalid_update'});

      let ov = attrs[key];
      const undoPatch = [];
      attrs[key] = applyPatch(ov, patch, key, undoPatch);
      if (undo !== undefined) {
        undo.push('$patch', undoPatch);
      }
    },

    $add(attrs, key, items, undo) {
      const ov = attrs[key], itemLen = items.length;

      if (ov == null) {
        attrs[key] = items.slice();
        undo !== undefined && undo.push('$remove', items.slice());
        return;
      }
      const ovLen = ov.length;
      const undoItems = [];
      nextItem: for(let j = 0; j < itemLen; ++j) {
        const item = items[j];
        for(let i = 0; i < ovLen; ++i) {
          if (deepEqual(ov[i], item))
            continue nextItem;
        }
        ov.push(item);
        undoItems.push(item);
      }
      if (undoItems.length != 0) {
        undo !== undefined && undo.push('$remove', undoItems);
      }
    },

    $remove(attrs, key, items, undo) {
      const ov = attrs[key];
      if (ov == null) {
        return;
      }
      const itemLen = items.length, ovLen = ov.length;
      const undoItems = [];
      const filtered = attrs[key].filter(oi => {
        for(let j = 0; j < itemLen; ++j) {
          const item = items[j];
          if (elemMatch(item, oi)) {
            undoItems.push(oi);
            return false;
          }
        }
        return true;
      });
      if (undoItems.length != 0) {
        attrs[key] = filtered;
        undo !== undefined && undo.push('$add', undoItems);
      }
    },
  };

  const applyPartial = (attrs, key, actions, undo)=>{
    for(let i = 0; i < actions.length; i+=2) {
      const field = actions[i], nv = actions[i+1];
      const cmd = COMMANDS[field];
      if (cmd === undefined) {
        const ov = attrs[key];
        const changes = {[field]: nv};
        applyOne(
          ov == null ? (attrs[key] = typeof field === 'string' ? {} : []) : ov,
          field, changes);

        if (undo !== undefined) {
          if (ov == null)
            undo.push('$replace', null);
          else if (undo[0] !== '$replace') {
            for (const field in changes) {
              undo.push(field, changes[field]);
            }
          }
        }
      } else
        cmd(attrs, key, nv, undo);
    }
    if (undo !== undefined && undo.length > 2) {
      const ei = undo.length - 1, len = undo.length >> 1;

      for(let i = 0; i < len; i+=2) {
        const tc = undo[i], ta = undo[i+1];
        undo[i] = undo[ei - i - 1];
        undo[i+1] = undo[ei - i];

        undo[ei - i - 1] = tc;
        undo[ei - i] = ta;
      }
    }
  };

  const diff = (from, to)=>{
    const ft = typeof from, tt = typeof to;
    if (ft === 'string' && tt === 'string')
      return diffSeq(from, to);
    if ((from != null && to != null &&
         (ft !== 'object' || tt !== 'object' ||
          to.constructor !== from.constructor)) ||
        from == null && to == null)
      return to;

    switch((from == null ? to : from).constructor) {
    case Object: {
      if (from === to) return {};
      if (from == null) from = {};
      else if (to == null) to = {};
      const diff = {};
      for (const key in from) {
        if (! hasOwn(to,key)) diff[key] = null;
      }
      for (const key in to) {
        const value = to[key];
        if (! deepEqual(from[key], value))
          diff[key] = value;
      }
      return isObjEmpty(diff) ? undefined : diff;
    } break;
    case Array: {
      if (from === to) return [];
      if (from == null) from = [];
      else if (to == null) to = [];
      return diffSeq(from, to, deepEqual);
    } break;
    }
    return to;
  };

  const nestedDiff = (from, to, depth=0)=> _nestedDiff([], '', from, to, depth)[1];

  const _nestedDiff = (ans, field, from, to, depth)=>{
    const ft = typeof from, tt = typeof to;
    if (ft === 'string' && tt === 'string') {
      ans.push(field+'.$partial', ['$patch', diffSeq(from, to)]); return ans;
    }
    if ((from != null && to != null &&
         (ft !== 'object' || tt !== 'object' ||
          to.constructor !== from.constructor)) ||
        from == null && to == null) {
      ans.push(field, to); return ans;
    }

    switch((from == null ? to : from).constructor) {
    case Object: {
      if (from === to) return ans;
      if (from == null) {
        ans.push(field, to);
        return ans;
      };
      if (to == null) {
        ans.push(field, null);
        return ans;
      };
      const partial = [];
      for (const key in from) {
        if (! hasOwn(to, key)) partial.push(key, null);
      }
      for (const key in to) {
        const old = from[key], value = to[key];
        if (! deepEqual(old, value)) {
          if (depth == 0) partial.push(key, value);
          else {
            _nestedDiff(partial, key, old, value, depth-1);
          }
        }
      }
      if (partial.length !== 0) ans.push(field+'.$partial', partial);
      return ans;
    } break;
    case Array: {
      if (from === to) return ans;
      if (from == null) {
        ans.push(field, to);
        return ans;
      }
      if (to == null) {
        ans.push(field, null);
        return ans;
      }
      const ds = diffSeq(from, to, deepEqual);
      ds === undefined || ans.push(field+'.$partial', ['$patch', ds]);
      return ans;
    } break;
    }
    ans.push(field, to);
    return ans;
  };

  const has = (changes, field)=>{
    return changes == null ? false :
      hasOwn(changes, field) || (
        changes.$partial !== undefined && hasOwn(changes.$partial, field));
  };

  const fromTo = (fields, from, to)=>{
    const len = fields.length;
    const cFrom = fieldDiff(fields[0], to, from);
    to = fieldDiff(fields[0], from, to);
    from = cFrom;
    for(let i = 1; i < len; ++i) {
      const field = fields[i];
      from = from !== null && typeof from === 'object' ? from[field] : null;
      to = to !== null && typeof to === 'object' ? to[field] : null;
    }
    return {from, to};
  };

  const fieldDiff = (field, from, to)=>{
    if (from == null) {
      if (to == null) return;
      if (to.$partial !== undefined) throw new Error("illegal arguments");
      return to[field];
    }
    if (to == null) {
      if (from.$partial !== undefined) throw new Error("illegal arguments");
      const ovalue = from[field];
      if (ovalue == null || typeof ovalue !== 'object')
        return;
      return diff(ovalue, {});
    }

    if (from.$partial !== undefined) {
      if (to.$partial !== undefined) throw new Error("illegal arguments");

      const partial = from.$partial[field];
      if (partial === undefined) return;
      const cvalue = to[field];

      from = {[field]: deepCopy(cvalue)};
      applyPartial(from, field, partial);
      return diff(from[field], cvalue);
    }
    if (to.$partial !== undefined) {
      const partial = to.$partial[field];
      if (partial === undefined) return;
      const ovalue = from[field];
      to = {[field]: deepCopy(ovalue)};
      applyPartial(to, field, partial);
      return diff(ovalue, to[field]);
    }

    const cvalue = to[field];
    const ovalue = from[field];
    return diff(from[field], to[field]);
  };

  const toString = o => ''+o;

  const arrayToMap = (list, hash=toString)=>{
    if (list == null) return {};
    const map = {}, {length} = list;
    for(let i = 0; i < length; ++i) {
      const entry = list[i];
      map[hash(entry)] = entry;
    }
    return map;
  };

  const applyAsDiff = (attrs, key, value, undo)=>{
    const oldValue = attrs[key];
    if (value != null && oldValue != null) {
      if ((value.constructor === Object && oldValue.constructor === Object) ||
          (Array.isArray(value) && Array.isArray(oldValue))) {
        const dif = nestedDiff(oldValue, value, 20);
        if (dif === undefined) return;
        const u = [];
        applyPartial(attrs, key, dif, u);
        const partial = undo.$partial || (undo.$partial = {});
        partial[key] = u;
        return;
      }
    }

    undo[key] = value;
    applySimple(attrs, key, undo);
  };


  return {
    KEYWORDS: [
      '$partial', '$patch', '$replace',
      '$append', '$prepend', '$add', '$remove',
      '$match'
    ],

    applyAll(attrs, changes) {
      const topUndo = {[original$]: changes};
      const match = changes.$match;
      if (match !== undefined) {
        for (const key in match) {
          COMMANDS.$match(attrs, key, match[key]);
        }
      }
      const partial = changes.$partial;
      for (const key in partial) {
        const cmd = partial[key];
        if ((cmd == null || cmd.constructor !== Array) &&
            key.indexOf(".") === -1) {
          delete partial[key];
          changes[key] = cmd;
        } else {
          const undo = [];
          applyPartial(attrs, key, cmd, undo);
          if (undo.length != 0) {
            (topUndo.$partial === undefined ? (
              topUndo.$partial = {}
            ) : topUndo.$partial)[key] = undo;
          }
        }
      }

      for(const key in changes) {
        if (key[0] === '$') continue;
        if (key.indexOf(".") === -1) {
          applyAsDiff(attrs, key, changes[key], topUndo);
        } else {
          throw new Error("update format not recognized");
        }
      }
      return topUndo;
    },

    applyOne,
    applyPartial,
    applyPatch,

    topLevelChanges(attrs, changes) {
      const ans = {};
      for (const key in changes) {
        if (key === '$partial') {
          const partial = changes.$partial;
          for (const key in partial) {
            ans[key] = deepCopy(attrs[key]);
            const undo = [];
            applyPartial(ans, key, partial[key], undo);
            if (undo.length == 0)
              delete ans[key];
            else if (ans[key] === undefined)
              ans[key] = null;
          }
        } else {
          const value = changes[key];
          ans[key] = value === undefined ? null : value;
        }
      }
      return ans;
    },

    extractChangeKeys(attrs, changes) {
      const ans = {};
      for (const key in changes) {
        if (key === '$partial') {
          const partial = changes.$partial;
          for (const key in partial) {
            const value = attrs[key];
            ans[key] = value === undefined ? null : value;
          }
        } else {
          const value = attrs[key];
          ans[key] = value === undefined ? null : value;
        }
      }
      return ans;
    },

    updateCommands(commands, modified, original) {
      const partial = commands.$partial;
      for (const key in modified) {
        if (! deepEqual(modified[key], original[key])) {
          commands[key] = modified[key];

          if (partial !== undefined && partial[key] !== undefined)
            delete partial[key];
        }
      }

      for (const key in original) {
        if (modified[key] === undefined) {
          if (commands[key] !== undefined) delete commands[key];
          if (partial !== undefined && partial[key] !== undefined) delete partial[key];
        }
      }
      if (isObjEmpty(partial))
        delete commands.$partial;
    },

    original(undo) {return undo[original$]},
    setOriginal(undo, orig) {undo[original$] = orig},

    arrayChanges(after, before, hash) {
      const am = arrayToMap(after, hash), bm = arrayToMap(before, hash);

      const added = [], removed = [];

      for (const key in am) hasOwn(bm, key) || added.push(am[key]);
      for (const key in bm) hasOwn(am, key) || removed.push(bm[key]);

      return {added, removed};
    },

    merge,

    has,
    diff,
    nestedDiff,
    fieldDiff,
    fromTo,
    diffSeq,
  };
});
