define(function(require, exports, module) {
  const koru   = require('koru');
  const md5sum = require('koru/md5sum');
  const sha256 = require('koru/srp/sha256');

  const {isObjEmpty,
         deepEqual, deepCopy, elemMatch,
         addItem, removeItem} = require('koru/util');

  const original$ = Symbol();

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

      undo.push('$replace', ov === undefined ? null : ov);

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
      undo.push('$patch', [0, nv.length, null]);
    },

    $append(attrs, key, nv, undo) {
      const ov = attrs[key];
      if (typeof ov === 'string') {
        attrs[key] += nv;
      } else if (ov != null && ov.constructor === Array) {
        attrs[key] = attrs[key].concat(nv);
      } else
        throw new koru.Error(400, {[key]: 'wrong_type'});
      if (undo.length > 0 && undo[undo.length-2] === '$patch')
        undo[undo.length-1].push(-nv.length, nv.length, null);
      else
        undo.push('$patch', [-nv.length, nv.length, null]);
    },
    $patch(attrs, key, patch, undo) {
      if (undo.$patch !== undefined)
        throw new koru.Error(400, {[key]: 'invalid_update'});

      let ov = attrs[key];
      const undoPatch = [];
      let si = 0;
      for(let i = 0; i < patch.length; i += 3) {
        const ds = patch[i], dl = patch[i+1], content = patch[i+2];
        const clen = content == null ? 0 : content.length;
        if (ds < 0) {
          if (patch.length - 3 !== i) throw new koru.Error(
            400, {[key]: 'negative delta may only be in the last patch block'});
          si = ov.length + ds;
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

        undoPatch.push(
          ds < 0 ? ds - clen + urep.length : ds,
          clen, urep.length == 0 ? null : urep
        );
      }
      attrs[key] = ov;
      undo.push('$patch', undoPatch);
    },

    $add(attrs, key, items, undo) {
      const ov = attrs[key], itemLen = items.length;

      if (ov == null) {
        attrs[key] = items.slice();
        undo.push('$remove', items.slice());
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
        undo.push('$remove', undoItems);
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
        undo.push('$add', undoItems);
      }
    },
  };

  const applyPartial = (attrs, key, actions, undo)=>{
    for(let i = 0; i < actions.length; ++i) {
      const field = actions[i];
      const cmd = COMMANDS[field];
      if (cmd === undefined) {
        const changes = {[field]: actions[++i]};
        const ov = attrs[key];
        applyOne(
          ov == null ?
            (attrs[key] = typeof field === 'string' ? {} : []) : ov,
          field,
          changes);

        if (ov == null)
          undo.push('$replace', null);
        else if (undo[0] !== '$replace') {
          for (const field in changes) {
            undo.push(field, changes[field]);
          }
        }
      } else
        cmd(attrs, key, actions[++i], undo);
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


  return {
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
          topUndo[key] = changes[key];
          applySimple(attrs, key, topUndo);
        } else {
          throw new Error("update format not recognized");
        }
      }
      return topUndo;
    },

    applyOne,
    applyPartial,

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

    has(undo, field) {
      return undo == null ? false :
        undo.hasOwnProperty(field) || (
          undo.$partial !== undefined && undo.$partial.hasOwnProperty(field));
    }
  };
});
