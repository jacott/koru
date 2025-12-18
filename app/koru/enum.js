define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const match           = require('koru/match');

  const match$ = Symbol();

  const Enum = (list) => {
    const en = Object.create(null);
    list.forEach((n, i) => {
      en[n] = i;
      en[i] = n;
    });
    en.MIN = 0;
    en.MAX = list.length - 1;
    en[koru.__INTERCEPT$__] = Object.prototype[koru.__INTERCEPT$__];
    en[match$] = match((value) => match.integer.test(value) && value >= en.MIN && value <= en.MAX);
    Object.freeze(en);
    return en;
  };

  Enum.asList = (enumType) => {
    const list = [];
    for (let i = enumType.MIN; i <= enumType.MAX; ++i) {
      list.push(enumType[i]);
    }
    return list;
  };

  const ident = (n) => n;

  Enum.asMenuList = (enumType, mapper=ident) => {
    const list = [];
    for (let i = enumType.MIN; i <= enumType.MAX; ++i) {
      list.push({_id: i, name: mapper(enumType[i])});
    }
    return list;
  };

  Enum.match = (enumType) => enumType[match$];

  return Enum;
});
