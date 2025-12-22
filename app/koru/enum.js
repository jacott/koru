define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const match           = require('koru/match');
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

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

  function inspect() {
    let prev = -1;
    return `Enum(${util.inspect(Enum.asList(this, (n, i) => {
      if (++prev == i) {
        return n;
      } else {
        prev = i;
        return `${n}:${i}`;
      }
    }))})`;
  }

  const completeEnum = (en) => {
    en[tag$] = 1;
    if (isTest) {
      en[koru.__INTERCEPT$__] = function (...args) {
        return Object.prototype[koru.__INTERCEPT$__].apply(this, args);
      }
    }

    en[match$] = match((value) => match.integer.test(value) && en[value] !== undefined);
    en[inspect$] = inspect;
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

  Enum.asList = (enumType, mapper=util.identityFunc) => {
    const list = [];
    for (let i = enumType.MIN; i <= enumType.MAX; ++i) {
      if (enumType[i] !== undefined) {
        list.push(mapper(enumType[i], i));
      }
    }
    return list;
  };

  Enum.asMenuList = (enumType, mapper=util.capHumanize) => Enum.asList(
    enumType, (n, i) => ({_id: i, name: mapper(n)}));

  Enum.asSortedMenuList = (enumType, mapper=util.titleize) => Enum.asMenuList(enumType, mapper)
                                                              .sort(util.compareByName);

  Enum.match = (enumType) => enumType[match$];

  return Enum;
});
