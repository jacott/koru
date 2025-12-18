define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const match           = require('koru/match');

  const match$ = Symbol(), tag$ = Symbol();

  const addToEnum = (en, list) => {
    let i = 0;
    for (const l of list) {
      const [n, ni] = l.split(':');
      if (ni !== undefined) {
        i = +ni;
        if (isNaN(i)) {
          throw new Error(`invalid number at in Enum list at ${l} for ${list.join(', ')}`);
        }
      }

      if (en[i] !== undefined) {
        throw new Error(`entry already taken for ${n}:${i} for ${list.join(', ')}`);
      }

      if (en.MIN === undefined || en.MIN > i) {
        en.MIN = i;
      }

      if (en.MAX === undefined || en.MAX < i) {
        en.MAX = i;
      }

      en[n] = i;
      en[i] = n;
      ++i;
    }
  };

  const completeEnum = (en) => {
    en[tag$] = 1;
    en[koru.__INTERCEPT$__] = Object.prototype[koru.__INTERCEPT$__];
    en[match$] = match((value) => match.integer.test(value) && en[value] !== undefined);
    Object.freeze(en);
  };

  const Enum = (list) => {
    const en = Object.create(null);
    addToEnum(en, list);
    completeEnum(en);
    return en;
  };

  Enum.extend = (base, list) => {
    if (base[tag$] !== 1) {
      throw new Error('base is not an enum');
    }

    const en = Object.create(null);
    for (const prop in base) {
      en[prop] = base[prop];
    }
    addToEnum(en, list);
    completeEnum(en);
    return en;
  };

  Enum.asList = (enumType) => {
    const list = [];
    for (let i = enumType.MIN; i <= enumType.MAX; ++i) {
      if (enumType[i] !== undefined) {
        list.push(enumType[i]);
      }
    }
    return list;
  };

  const ident = (n) => n;

  Enum.asMenuList = (enumType, mapper=ident) => {
    const list = [];
    for (let i = enumType.MIN; i <= enumType.MAX; ++i) {
      if (enumType[i] !== undefined) {
        list.push({_id: i, name: mapper(enumType[i])});
      }
    }
    return list;
  };

  Enum.match = (enumType) => enumType[match$];

  return Enum;
});
