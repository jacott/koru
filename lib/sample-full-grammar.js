import defexp from 'mod1';
import {ex1, ex2, ex3 as a1} from 'mod2';
import * as name from 'mod3';
import 'mod4';

const variable1 = 1, variable2 = 2;

export let name1 = 123, name2;
export function functionName(){}
export class ClassName {}

// Export list
export { defexp, a1 };

// Renaming exports
export { variable1 as name10, variable2 as name20 };

// Exporting destructured assignments with renaming
export const { name5, name2: bar } = ex1;

// Default exports
//export default ex2;
//export default function () { } // also class, function*
export default class {  } // also class, function*
//export { name1 as default };

// Aggregating modules
export * from 'mod3'; // does not set the default export
export * as name14 from 'mod2'; // Draft ECMAScript® 2O21
export { a2, a3} from 'mod3';
export { import1 as a6, import2 as a7, } from 'mod4';
//export { default } from 'mod5';

(async function a () {
  const p1 = import('mod5');
  console.log(`import.meta`, import.meta);

  class c1 {
    constructor(a) {
      this.a = a;
    }
    static sm1({a: {b=123}, c}={}, [d, e]) {
      return {...d, ...e};
    }

    m2(a) {
      this.a = a;
    }

    get p2() {return this.a}
    set p2(v) {this.a = /abc/g.test(v) || v}
  }

  const fe = function() {};

  let j;

  for(let i = 0; i < c1.length; ++i) {
    v1 += ++j;
    j++;
  }

  function* i1(...list) {
    for (const n of list) {
      yield* i2(n);
    }
    return list;
  }

  function* i2(n) {
    yield n;
    yield n+1;
  }

  for (const name in c1) {
    const item = c1[name];
  }

  const f1 = (func, ...rest) => {
    func();
    return c1;
  }
  const c2 = class extends f1(() => (c1)) {
    static sp1 = "dbl `'quotes'`";
    p2 = 'single "quotes"';
  }

  var v1;

  let l1 = [1, 2, ...[3, 4]];

  const o1 = {
    [f1(a => c1.name)]: 1 / 2 + (3 % 4) - 5.2e-12 * (2**3),
    k2: 7 & 3 | 2 ^ 1,
    ' 1 ': `abc${v1}` + fe`fdf${c1.name}`
  };

  v1 ??= 123;

  v1 += 1;
  v1 *= 2;
  v1 |= 7;
  v1 &= 3;
  if (v1 === 3) v1 =4;
  if (v1 == 4) {
    v1 = 5;
  } else {
    v1 = 6
  }

  switch(v1) {
  case 1: v1 = 2;
  case 2:
  case 3: {
    const l1 = 123;
    v1 = l1;
    break;
  }
  default: {
  }
  }

  v1 = -v1;


  const cc1 = new c1(v1);
  v1 = typeof v1 === 'number' ? v1 : +v1;

  v1 = null;

  v1?.()

  if (a) v1=(2,1); else {}

  loop: do {
    v1 = 1;
    while (v1 == 1) {
      break loop;
    }
    continue loop;

  } while (true);

  [v1, l1] = [undefined, void 0];

  function *x(a) {yield *a()};

  v1 = {
    *objmethod(a, b) {

    },

    async om2() {},

    af: (a, b=1)=>{

    },
  };

  cc1.abc?.();
  cc1.def?.[4]?.();

  try {
    const a1 = 1234n;
    throw 'err';
  } catch(err) {
  }

  class c3 extends c1 {
    constructor(a) {
      super(a)
    }
    m2(obj) {
      const {a=123, bb: b, c: {d: [f, ...g]}, ...e} = obj;
      super.m2("abc");
    }
    async m3(obj) {
      await this.m2(obj);
    }
    static #sp2 = 123 + 456;
    #p3 = (1, 2, 3);
    static {
      v1 = 5;
    }
  }
})(this);
