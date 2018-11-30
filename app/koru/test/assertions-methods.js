define((require)=>{
  const format          = require('koru/format');
  const Stubber         = require('koru/test/stubber');
  const util            = require('koru/util');
  const Core            = require('./core');

  const {hasOwn} = util;
  const {ctx$} = require('koru/symbols');
  const empty = ()=>{};

  const {deepEqual} = Core;
  const ga = Core.assertions;

  const performance = isClient ? window.performance : {now() {
    const tm = process.hrtime();
    return tm[0]*1000 + 1e-6 *tm[1];
  }};

  // assert.dom
  let selectNode = null;


  const delegate = meth =>{
    ga.add(meth, {
      assert(spy, ...args) {
        checkSpy(spy);
        this.args = args;
        const result = spy[meth].apply(spy, args);
        if (this._asserting === ! result) {
          this.spy = spy.printf("%n");
          if (this._asserting && spy.callCount < 2) {
            if (spy.callCount === 0) {
              this.calls = "but was not called.";
            } else
              deepEqual(spy.firstCall.args, args, this, 'calls');
          } else
            this.calls = spy.printf("%C");
        }
        return result;
      },

      message: "{$spy} to be " + meth + " {i$args}\n{$calls}"
    });
  };

  const called = nth =>{
    const meth = 'called' + nth;
    ga.add(meth, {
      assert(spy) {
        checkSpy(spy);
        const result = spy[meth];
        if (this._asserting === ! result) {
          this.calls = spy.printf("%C");
        }
        return result;
      },

      message: "{0} to be called " + nth + ".\n{$calls}"
    });
  };

  const formatHTML = html =>{
    const re = /([^<]*)(<([^\s>]+)[^>]*>)/g;
    let m, result = '', indent = '';

    const add = str =>{result += "\n" + indent + str};

    while(m = re.exec(html)) {
      if (/\S/.test(m[1])) add(m[1]);
      switch(m[2][1]) {
      case '!':
        add(m[2]); break;
      case '/':
        indent = indent.slice(0, -2);
        add(m[2]); break;
      default:
        add(m[2]);
        if (! /(input|br|hr|img)/.test(m[3]))
          indent += '  ';
      }
    }

    return result;
  };

  const withinDelta = (
    actual, expected, delta
  )=> actual > expected-delta && actual < expected+delta;

  const checkSpy = spy =>{
    Stubber.isStubbed(spy) ||
      Core.fail("Argument is not a spy/stub");
  };

  Core.assert.benchMark = ({subject, duration=1000, control=empty, setup=empty})=>{
    setup();
    subject();
    setup();
    control();

    let _count = 0, st = 0;
    let result;
    setup();
    let endAt = Date.now()+Math.floor(duration/6);
    st = performance.now();
    while(endAt > Date.now()) {
      result = subject(_count, result);
      ++_count;
    }
    setup();
    const count = _count;
    for(let i = 0; i < count; ++i) {
      result = control(i, result);
    }

    setup();
    st = performance.now();
    for(let i = 0; i < count; ++i) {
      result = control(i, result);
    }
    let control1 = (performance.now()-st)/count;

    setup();
    st = performance.now();
    for(let i = 0; i < count; ++i) {
      result = subject(i, result);
    }

    let subject1 = (performance.now()-st)/count;

    setup();
    st = performance.now();
    for(let i = 0; i < count; ++i) {
      result = control(i, result);
    }
    const control2 = (performance.now()-st)/count;

    setup();
    st = performance.now();
    for(let i = 0; i < count; ++i) {
      result = subject(i, result);
    }
    const subject2 = (performance.now()-st)/count;

    const error = Math.abs(control1 - control2) + Math.abs(subject1 - subject2);

    let rounding = 10**(Math.floor(Math.log(error)/Math.log(10)));
    if (rounding == 0) rounding = 0.00000001;

    const ns = Math.round(1000000 * Math.round(
      (subject1 + subject2 - control1 - control2)*0.5/rounding)*rounding);

    return {
      ns,
      error: Math.round(1000000 * Math.ceil(error*0.5/rounding)*rounding),
      controllNs: Math.round(1000000 * Math.round(
        (control1 + control2)*0.5/rounding)*rounding),

      subjectlNs: Math.round(1000000 * Math.round(
        (subject1 + subject2)*0.5/rounding)*rounding)
    };
  };

  ga.add('same', {
    assert(actual, expected) {
      const result = actual === expected;
      this.eql = result ? '==' : '!=';
      return result;
    },

    message: "to be the same:\n    {i0}\n {$eql} {i1}"
  });

  ga.add('equals', {
    assert(actual, expected) {
      const equal = deepEqual(actual, expected);
      if (! equal === this._asserting) {
        deepEqual(actual, expected, this, 'diff');
      }
      return equal;
    },

    message: "equality but {$diff}"
  });

  ga.add('hasOwn', {
    assert(object, property) {
      return typeof object === 'object' && object !== null &&
        hasOwn(object, property);
    },

    message: "own property {i1}"
  });

  ga.add('isTrue', {
    assert(actual) {
      return actual === true;
    },

    message: "{i0} to be true"
  });

  ga.add('instanceof', {
    assert(object, type) {
      return object instanceof type;;
    },

    message: "{i0} to be instance of {i1}",
  });

  ga.add('isFunction', {
    assert(actual) {
      return typeof actual === 'function';
    },

    message: "{i0} to be a function"
  });

  ga.add('isFalse', {
    assert(actual) {
      return actual === false;
    },

    message: "{i0} to be false"
  });

  ga.add('isNull', {
    assert(actual) {
      return actual == null;
    },

    message: "{i0} to be null or undefined"
  });

  ga.add('near', {
    assert(actual, expected, delta) {
      if (delta !== undefined) this.delta = delta;
      switch(typeof expected) {
      case 'string':
        const expParts = expected.split(/([\d.]+(?:e[+-]\d+)?)/);
        const actParts = actual.split(/([\d.]+(?:e[+-]\d+)?)/);
        for(let i = 0; i < expParts.length; ++i) {
          const e = expParts[i], a = actParts[i];
          if (i%2) {
            const [,f=''] = e.split('.');
            this.delta = delta = 1/Math.pow(10, f.length);

            if (! withinDelta(+a, +e, delta)) {
              this.delta = delta;
              this.va = a; this.ve = `${e} at ${expParts[i-1]}`;
              return false;
            }
          } else {
            if (e !== a) {
              this.va = actual; this.ve = expected;
              this.delta = "n/a";
              return false;
            }
          }
        }
        return true;

      case 'object':
        if (delta === undefined) this.delta = delta = 1;
        for (let key in expected) {
          if (! withinDelta(actual[key], expected[key], delta)) {
            this.va = actual[key]; this.ve = `${expected[key]} at key ${key}`;
            return false;
          }
        }
        return true;
      default:
        if (delta === undefined) this.delta = delta = 1;
        this.va = actual; this.ve = expected;
        return withinDelta(actual, expected, delta);
      }
    },

    message: "{$va} to be near {$ve} by delta {$delta}"
  });

  ga.add('between', {
    assert(sut, from, to) {
      return sut >= from && sut <= to;
    },

    assertMessage: "Expected {0} to be between {1} and {2}",
    refuteMessage: "Expected {0} not to be between {1} and {2}",
  });

  const match = (object, matcher)=>{
    if (matcher && typeof matcher.test === "function") {
      return matcher.test(object);
    }

    switch (typeof matcher) {
    case "function":
      return matcher(object) === true;

    case "string":
      matcher = matcher.toLowerCase();
      const notNull = typeof object === "string" || !!object;
      return notNull && ("" + object).toLowerCase().indexOf(matcher) >= 0;

    case "number":
      return matcher == object;

    case "boolean":
      return matcher === object;

    case "object":
      for (let prop in matcher) {
        if (!match(object[prop], matcher[prop])) {
          return false;
        }
      }

      return true;
    }

    throw new Error("Matcher (" + format("{i0}", matcher) + ") was not a " +
                    "string, a number, a function, a boolean or an object");
  };

  ga.match = match;

  ga.add("match", {
    assert(actual, matcher) {
      return match(actual, matcher);
    },

    message: "{0} to match {1}",
  });

  ga.add('exception', {
    assert(func, name, message) {
      try {
        this.message = (func() || '').toString();
        this.name = 'none was thrown';
      }
      catch(ex) {
        if (typeof name === 'object') {
          let result = true;
          this.message = {};
          for(let key in name) {
            if (! (key in ex)) throw ex;
            if (! deepEqual(ex[key], name[key])) {
              this.message[key] = ex[key];
              result = false;
            }
          }
          if (this._asserting !== result) {
            this.name = 'Got ' + ex.toString() + '\n  expected: ' + util.inspect(name) + '\n  got mismatch for: ';
            this.message = util.inspect(this.message);
          }
          return result;
        }
        this.name = 'Got ' + ex.name;
        this.message = util.inspect(ex.message);
        if (name && ex.name !== name) return false;
        if (message && ex.message !== message)  return false;
        return true;
      }
      return false;
    },

    assertMessage: "Expected an exception: {$name} {$message}",
    refuteMessage: "Did not expect exception: {$name} {$message}",
  });

  ga.add("className", {
    assert(element, className) {
      if (typeof element === 'string' && arguments.length == 1 && selectNode != null) {
        className = element;
        element = selectNode[0];
      }
      if (typeof element.className == "undefined") {
        return Core.fail(format("{1} Expected object to have className property", className));
      }
      this.expected = className;
      const expected = typeof className == "string" ? className.split(" ") : className;
      const actual = element.classList;

      for (let i = 0, l = expected.length; i < l; i++) {
        if (! actual.contains(expected[i])) {
          this.names = actual;
          return false;
        }
      }

      return true;
    },
    assertMessage: `Expected object's className to include "{$expected}" but was "{$names}"`,
    refuteMessage: `Expected object's className not to include "{$expected}"`,
  });

  ga.add('sameHtml', {
    assert(actual, expected) {
      const aElm = document.createElement('div');
      const bElm = document.createElement('div');
      aElm.innerHTML = actual;
      bElm.innerHTML = expected;

      const attrsToList = node =>{
        const result = [];
        util.forEach(node.attributes, a =>{result.push([a.name, a.value])});
        result.sort((a, b)=>{
          a = a[0]; b=b[0];
          return a === b ? 0 : a < b ? -1 : 1;
        });
        return result;
      };

      const compare = (aElm, bElm)=>{
        if (aElm.nodeType === document.TEXT_NODE || bElm.nodeType === document.TEXT_NODE) {
          if (aElm.nodeType !== bElm.nodeType)
            return false;

          return aElm.textContent === bElm.textContent;
        }

        if (aElm.tagName !== bElm.tagName) return false;

        const anodes = aElm.childNodes;
        const alen = anodes.length;
        const bnodes = bElm.childNodes;
        const blen = bnodes.length;
        if (alen !== blen) return false;

        if (! deepEqual(attrsToList(aElm), attrsToList(bElm)))
          return false;

        for(let i = 0; i < alen; ++i) {
          if (! compare(anodes[i], bnodes[i]))
            return false;
        }
        return true;
      };

      return compare(aElm, bElm);
    },
    message: "{i0} to be the same as {i1}",
  });


  ga.add('colorEqual', {
    assert(actual, expected, delta) {
      this.delta = delta = delta || 0.0001;
      this.actual = util.colorToArray(actual);
      this.expected = util.colorToArray(expected);
      if (! this.actual) {
        return ! this.expected;
      }
      const alphaGood = (this.expected.length === 3 && this.actual[3] === 1) ||
            withinDelta(this.actual[3], this.expected[3], delta);
      return deepEqual(this.actual.slice(0,3), this.expected.slice(0,3)) &&
        alphaGood;
    },

    message: "{i0} to equal {i1}; {i$actual} !== {i$expected} within delta {$delta}"
  });

  // assert.cssNear
  ga.add('cssNear', {
    assert(elm, styleAttr, expected, delta, unit) {
      let actual;
      if (typeof elm === 'string') {
        actual = elm;
        unit = delta;
        delta = expected;
        expected = styleAttr;
      } else {
        actual = styleAttr[0] === '-' ? elm.style.getPropertyValue(styleAttr)
          : elm.style[styleAttr];
        this.field = 'css('+styleAttr+')';
      }
      this.actual = actual;
      this.expected = expected;
      delta = this.delta = delta  || 1;
      unit = this.unit = unit || 'px';


      if(!actual || actual.length < unit.length+1) return false;
      const actualUnit = actual.slice(-unit.length);
      actual = actual.slice(0,-unit.length);

      return actualUnit === unit && actual > expected-delta && actual < expected+delta;
    },

    message: "{$field} {$actual} to be near {$expected}{$unit} by delta {$delta}",
  });


  {
    const findAll = (elms, query)=>{
      const directChild = query[0] === '>';

      const result = new Set();
      for(let i = 0; i < elms.length; ++i) {
        const elm = elms[i];
        let se;
        if (directChild) {
          if (elm.id)
            se = elm.querySelectorAll(elm.tagName+'#'+elm.id+query);
          else {
            elm.id = '_querySelector_tempId_';
            se = elm.querySelectorAll(elm.tagName+'#_querySelector_tempId_'+query);
            elm.removeAttribute('id');
          }
        } else {
          se = elms[i].querySelectorAll(query);
        }

        for(let j = 0; j < se.length; ++j) {
          result.add(se[j]);
        }
      }
      return Array.from(result);
    };

    const text = elm => elm.length ? elm[0].textContent.trim() : '';

    function select(elm, options, body) {
      const old = selectNode;
      const setClue = (self, msg)=>{self.htmlClue = msg + ' for ' + self.htmlClue};

      const inner = (self)=>{
        let msg;
        if (typeof elm === "string") {
          msg = elm;
          if (selectNode != null) {
            elm = findAll(selectNode, elm);
          } else {
            elm = document.querySelectorAll(elm);
          }
        } else if (elm == null) {
          self.htmlClue = `an Element; got: ${elm}`;
          return false;
        } else {
          msg = {elm, toString() {return self.elm.innerHTML}};
          if (elm.nodeType != null) elm = [elm];
        }
        self.htmlClue = {toString() {
          if (old != null) {
            let html;
            try {
              html = formatHTML(old[0].innerHTML);
            } catch(e) {
              html = old[0].toString();
            }
            return "'" + msg + "' in:\n[" + html + "]\n";
          } else {
            return "'" + msg + "'";
          }
        }};
        selectNode = elm;
        if (options != null) {
          switch (typeof options) {
          case "function":
            if(elm.length === 0) return false;
            options.call(elm[0], elm[0]);
            break;
          case "object":
            if (options.constructor === RegExp) {
              options = {text: options};
            }
            if (elm.length == 0) {
              return options.count === 0;
            }
            if (options.value != null) {
              const ef = filter(elm, i => deepEqual(i.value, options.value));
              if (ef.length === 0) {
                setClue(self, 'value="' + (elm.length ? elm[0].value : '') + '" to be "' + options.value + '"');
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(typeof options.text === 'string') {
              const ef = filter(elm, i => options.text === i.textContent.trim());
              if (ef.length === 0) {
                setClue(self, 'text "' + text(elm) + '" to be "' + options.text + '"');
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(typeof options.text === 'object') {
              const ef = filter(elm, i => options.text.test(i.textContent.trim()));
              if (ef.length === 0) {
                setClue(self, 'text "' + text(elm) + '" to match ' + options.text);
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(hasOwn(options, 'data')) {
              const hint = {};
              const ef = filter(elm, i => i[ctx$] !== undefined && deepEqual(i[ctx$].data, options.data));
              if (ef.length === 0) {
                if (self._asserting !== false) {
                  Array.prototype.find.call(elm, i => {
                    if (i[ctx$]) {
                      deepEqual(i[ctx$].data, options.data, hint, 'i');
                    }
                    return true;
                  });
                  setClue(self, "data equality; got " + hint.i);
                }
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if (options.count !== undefined && options.count !== elm.length) {
              setClue(self, "count: " +  elm.length + " to be " + options.count);
              return false;
            }

            if (options.parent) {
              if (typeof options.parent === 'number') {
                elm = elm[0];
                for(let num = options.parent; elm && num > 0;--num) {
                  elm = elm.parentNode;
                }
                if (! elm) return false;
                selectNode = elm = [elm];
              } else {
                const pold = selectNode;
                try {
                  selectNode = [elm[0].parentNode];
                  options.parent.call(selectNode[0], selectNode[0]);
                } finally {
                  selectNode = pold;
                }
              }
            }
            break;
          case "string":
            if (elm.length === 0) return false;
            const ef = filter(elm, i => options === i.textContent.trim());
            if (ef.length === 0) {
              setClue(self, '"' + options + '"; found "' + text(elm) + '"');
              return false;
            } else {
              selectNode = elm = ef;
            }
          }
        } else {
          if(elm.length === 0) return false;
        }
        if (typeof body === "function") {
          body.call(elm[0], elm[0]);
        }
        return !!(elm && elm.length != 0);
      };

      try {
        return inner(this);
      } finally {
        selectNode = old;
      }
    };

    ga.add('domParent', {
      assert(elm, options, body /* arguments */) {
        if (! selectNode)
          throw new Error('must be inside a dom assertion');
        const old = selectNode;
        try {
          selectNode = [selectNode[0].parentNode];
          return select.apply(this, arguments);
        } finally {
          selectNode = old;
        }
      },

      assertMessage: "Expected {$htmlClue}",
      refuteMessage: "Did not Expect {$htmlClue}",
    });

    ga.add('dom', {
      assert:  select,

      assertMessage: "Expected {$htmlClue}",
      refuteMessage: "Did not Expect {$htmlClue}",
    });

    const filter = (elms, func)=> Array.prototype.filter.call(elms, func);
  };

  called('');
  called('Once');
  called('Twice');
  called('Thrice');

  delegate('alwaysCalledWith');
  delegate('calledWith');
  delegate('calledWithExactly');

  ga.add('calledOnceWith', {
    assert(spy, ...args) {
      checkSpy(spy);
      this.args = args;
      const result = spy.calledOnce && spy.calledWith.apply(spy, args);
      if (this._asserting === ! result) {
        this.spy = spy.printf("%n");
        this.calls = spy.printf("%C");
      }
      return result;
    },

    message: "{$spy} to be calledOnceWith {i$args}{$calls}"
  });

  ga.add('threw', {
    assert(spy, something) {
      checkSpy(spy);
      return spy.threw(something);
    },

    message: "{0} to throw an exception"
  });

  ga.add('specificAttributes', {
    assert(actual, expected) {
      if (! (actual && expected)) {
        this.actual = actual;
        this.expected = expected;
        return ! this._asserting;
      }
      if (Array.isArray(expected)) {
        this.actual = actual = actual.map((row, i) => util.extractKeys(
          row && row.attributes ? row.attributes : row, expected[i]));

      } else {
        if (actual && actual.attributes)
          actual = actual.attributes;

        this.actual = actual = util.extractKeys(actual, expected);
      }
      this.expected = expected;

      if (! deepEqual(actual, expected, this, 'diff')) {
        return false;
      }

      return true;
    },

    assertMessage: "attributes to be equal but {$diff}",
    refuteMessage: "attributes to be equal",
  });
});
