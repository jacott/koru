define((require)=>{
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

  const setParams = (i, parts, paramMap, posMap)=>{
    const last = (parts.length-1) >> 1;
    for (let i = 0; i < last; ++i) {
      const key = parts[i*2+1];
      if (posMap[key] === void 0) {
        posMap[key] = i;
        paramMap[i] = key;
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
  }

  return SQLStatement;
});
