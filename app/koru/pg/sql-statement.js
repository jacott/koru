define((require)=>{
  'use strict';
  const cache$ = Symbol();

  const makeText = (parts, posMap, pos)=>{
    let text = '';
    const last = parts.length - 1;
    ++pos;
    for (let i = 0; i < last; ++i)
      text += parts[i] + '$' + (posMap[parts[++i]] + pos);
    text += parts[last];
    return text;
  };

  const setParams = (pos, parts, paramMap, posMap)=>{
    const last = parts.length-1;
    for (let i = 1; i < last; i+=2) {
      const key = parts[i];
      if (posMap[key] === void 0) {
        posMap[key] = pos;
        paramMap[pos++] = key;
      }
    }
  };


  class SQLStatement {
    constructor(text='') {
      const parts = text.split(/\{\$(\w+)\}/);
      const paramMap = [], posMap = {};
      setParams(0, parts, paramMap, posMap);
      this[cache$] = {paramMap, posMap, parts, text: '', pos: -1};
    }

    convertArgs(params, initial=[]) {
      const cache = this[cache$];
      if (cache.pos != initial.length) {
        cache.text = makeText(cache.parts, cache.posMap, cache.pos = initial.length);
      }
      const {paramMap} = cache;
      for(let i = 0; i < paramMap.length; ++i) {
        initial.push(params[paramMap[i]]);
      }
      return initial;
    }

    get text() {
      const cache = this[cache$];
      if (cache.pos != -1) return cache.text;
      return cache.text = makeText(cache.parts, cache.posMap, cache.pos = 0);
    }

    clone() {
      const clone = new (this.constructor)();

      const cache = this[cache$];
      const ccache = clone[cache$];
      for (const name in cache) {
        ccache[name] = cache[name];
      }

      return clone;
    }

    append(value) {
      const vcache = value[cache$];
      if (vcache === void 0) throw new Error("Illegal argument");
      if (vcache.parts.length == 0) return this;
      const cache = this[cache$];
      const {parts} = cache;
      const last = parts.pop();
      const pos = parts.length;
      parts.push(...vcache.parts);
      parts[pos] = last + parts[pos];
      setParams(pos >> 1, parts, cache.paramMap, cache.posMap);
      cache.pos = -1;
      return this;
    }

    appendText(text) {
      const cache = this[cache$];
      const {parts} = cache;
      parts[parts.length-1] += text;
      cache.pos = -1;
      return this;
    }
  }

  return SQLStatement;
});
