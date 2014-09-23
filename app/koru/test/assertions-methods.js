define(['./core', '../format', './assertions'], function (geddon, format) {
  var gu = geddon._u;
  var ga = geddon.assertions;

  var util = geddon.util;

  ga.add('same', {
    assert:  function (actual, expected) {
      return actual === expected;
    },

    message: "{i0} to be the same as {i1}"
  });

  ga.add('equals', {
    assert:  function (actual, expected) {
      return gu.deepEqual(actual, expected, this, 'diff');
    },

    message: "{i0} to equal {i1}\nDiff at\n -> {i$diff}"
  });

  ga.add('isTrue', {
    assert:  function (actual) {
      return actual === true;
    },

    message: "{i0} to be true"
  });

  ga.add('isFunction', {
    assert:  function (actual) {
      return typeof actual === 'function';
    },

    message: "{i0} to be a function"
  });

  ga.add('isFalse', {
    assert:  function (actual) {
      return actual === false;
    },

    message: "{i0} to be false"
  });

  ga.add('isNull', {
    assert:  function (actual) {
      return actual == null;
    },

    message: "{i0} to be null or undefined"
  });

  ga.add('near', {
    assert:  function (actual, expected, delta) {
      delta = this.delta = delta || 1;
      return withinDelta(actual, expected, delta);
    },

    message: "{0} to be near {1} by delta {$delta}"
  });

  ga.add('between', {
    assert: function (sut, from, to) {
      return sut >= from && sut <= to;
    },

    assertMessage: "Expected {0} to be between {1} and {2}",
    refuteMessage: "Expected {0} not to be between {1} and {2}",
  });

  function match(object, matcher) {
    if (matcher && typeof matcher.test === "function") {
      return matcher.test(object);
    }

    switch (typeof matcher) {
    case "function":
      return matcher(object) === true;

    case "string":
      matcher = matcher.toLowerCase();
      var notNull = typeof object === "string" || !!object;
      return notNull && ("" + object).toLowerCase().indexOf(matcher) >= 0;

    case "number":
      return matcher == object;

    case "boolean":
      return matcher === object;

    case "object":
      for (var prop in matcher) {
        if (!match(object[prop], matcher[prop])) {
          return false;
        }
      }

      return true;
    }

    throw new Error("Matcher (" + format("{i0}", matcher) + ") was not a " +
                    "string, a number, a function, a boolean or an object");
  }

  ga.match = match;

  ga.add("match", {
    assert: function (actual, matcher) {
      return match(actual, matcher);
    },

    message: "{0} to match {1}",
  });

  ga.add('exception', {
    assert:  function (func, name, message) {
      try {
        this.message = (func() || '').toString();
        this.name = 'but function did not throw';
      }
      catch(ex) {
        if (typeof name === 'object') {
          var result = true;
          this.name = ex.toString();
          this.message = {};
          for(var key in name) {
            if (! ex.hasOwnProperty(key)) throw ex;
            if (name[key] != ex[key]) {
              this.message[key] = ex[key];
              result = false;
            }
          }
          return result;
        }
        this.name = ex.name;
        this.message = ex.message;
        if (name && ex.name !== name) return false;
        if (message && ex.message !== message)  return false;
        return true;
      }
      return false;
    },

    message: "an exception to be thrown: {i$name} {i$message}"
  });

  ga.add("className", {
    assert: function (element, className) {
      if (typeof element.className == "undefined") {
        return geddon.fail(format("{2} Expected object to have className property", arguments[1]));
      }

      var expected = typeof className == "string" ? className.split(" ") : className;
      var actual = element.className.split(" ");

      this.names = element.className;

      for (var i = 0, l = expected.length; i < l; i++) {
        if (actual.indexOf(expected[i]) < 0) {
          return false;
        }
      }

      return true;
    },
    assertMessage: "Expected object's className to include {i1} but was {i$names}",
    refuteMessage: "Expected object's className not to include {i1}",
  });

  ga.add('colorEqual', {
    assert:  function (actual, expected, delta) {
      this.delta = delta = delta || 0.0001;
      this.actual = util.colorToArray(actual);
      this.expected = util.colorToArray(expected);
      return gu.deepEqual(this.actual.slice(0,3), this.expected.slice(0,3)) &&
        withinDelta(this.actual[3], this.expected[3], delta);
    },

    message: "{i0} to equal {i1}; {i$actual} !== {i$expected} within delta {$delta}"
  });

   ga.add('cssUnitNear', {
    assert:  function (unit, actual, expected, delta) {
      this.delta = delta = delta || 1;
      if (typeof actual !== 'string' || ! actual || ! expected)
        return actual === expected;
      var ure = new RegExp(util.regexEscape(unit)+"$");
      var exNum = typeof expected === 'number';
      if (! (ure.test(actual) && (exNum || ure.test(expected)))) return false;
      return withinDelta(+actual.slice(0, -unit.length),
                         exNum ? expected : +expected.slice(0, -unit.length),
                         delta);
    },

    message: "{i1} to be near {i2} within delta {$delta} with unit of {i0}"
  });

  // assert.dom
  (function () {
    var selectNode = null;

    ga.add('domParent', {
      assert:  function(elm, options, body /* arguments */) {
        if (! selectNode)
          throw new Error('must be inside a dom assertion');
        var old = selectNode;
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

    function filter(elms, func) {
      return Array.prototype.filter.call(elms, func);
    }

    function findAll(elms, query) {
      var directChild = query[0] === '>';

      var result = [];
      for(var i = 0; i < elms.length; ++i) {
        var elm = elms[i];
        if (directChild) {
          if (elm.id)
            var se = elm.querySelectorAll(elm.tagName+'#'+elm.id+query);
          else {
            elm.id = '_querySelector_tempId_';
            var se = elm.querySelectorAll(elm.tagName+'#_querySelector_tempId_'+query);
            elm.removeAttribute('id');
          }
        } else {
          var se = elms[i].querySelectorAll(query);
        }

        result.push.apply(result, se);
      }
      return result;
    }

    function text(elm) {
      return elm.length ? elm[0].textContent.trim() : '';
    }

    function select(elm, options, body /* arguments */) {
      var msg, old = selectNode, orig = elm;
      try {
        if (typeof elm === "string") {
          msg = elm;
          if (selectNode != null) {
            elm = findAll(selectNode, elm);
          } else {
            elm = document.querySelectorAll(elm);
          }
        } else {
          if (elm.nodeType) elm = [elm];
          msg = elm[0].innerHTML;
        }
        if (selectNode != null) {
          var html;
          try {
            html = formatHTML(selectNode[0].innerHTML);
          } catch(e) {
            html = selectNode[0].toString();
          }
          this.htmlClue = "'" + msg + "' in:\n[" + html + "]\n";
        } else {
          this.htmlClue = "'" + msg + "'";
        }
        selectNode = elm;
        if (options != null) {
          switch (typeof options) {
          case "function":
            if(elm.length === 0) return false;
            options.call(elm[0]);
            break;
          case "object":
            if (options.constructor === RegExp) {
              options = {text: options};
            }
            if (options.count != null && options.count !== elm.length) {
              this.htmlClue = "count: " +  elm.length + " to be " + options.count + " for '" + this.htmlClue;
              return false;
            }
            if (elm.length === 0) return false;
            if (options.value != null) {
              var ef = filter(elm, function (i) {return options.value === i.value});
              if (ef.length === 0) {
                this.htmlClue = 'value="' + (elm.length ? elm[0].value : '') + '" to be "' + options.value + '" for ' + this.htmlClue;
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(typeof options.text === 'string') {
              var ef = filter(elm, function (i) {return options.text === i.textContent.trim()});
              if (ef.length === 0) {
                this.htmlClue = 'text "' + text(elm) + '" to be "' + options.text + '" for ' + this.htmlClue;
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(typeof options.text === 'object') {
              var ef = filter(elm, function (i) {return options.text.test(i.textContent.trim())});
              if (ef.length === 0) {
                this.htmlClue = 'text "' + text(elm) + '" to match ' + options.text + ' for ' + this.htmlClue;
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if (options.parent) {
              if (typeof options.parent === 'number') {
                elm = elm[0];
                for(var num = options.parent; elm && num > 0;--num) {
                  elm = elm.parentNode;
                }
                if (! elm) return false;
                selectNode = elm = [elm];
              } else {
                var pold = selectNode;
                try {
                  selectNode = [elm[0].parentNode];
                  options.parent.call(selectNode[0]);
                } finally {
                  selectNode = pold;
                }
              }
            }
            break;
          case "string":
            if (elm.length === 0) return false;
            var ef = filter(elm, function (i) {return options === i.textContent.trim()});
            if (ef.length === 0) {
              this.htmlClue = '"' + options + '"; found "' + text(elm) + '" for ' + this.htmlClue;
              return false;
            } else {
              selectNode = elm = ef;
            }
          }
        } else {
          if(elm.length === 0) return false;
        }
        if (typeof body === "function") {
          body.call(elm[0]);
        }
        return !!(elm && elm.length != 0);
      }

      finally {
        selectNode = old;
      };
    }
  })();

  called('');
  called('Once');
  called('Twice');
  called('Thrice');

  delegate('alwaysCalledWith');
  delegate('calledWith');
  delegate('calledWithExactly');

  ga.add('calledOnceWith', {
    assert:  function (spy /* arguments */) {
      checkSpy(spy);
      var args = this.args = Array.prototype.slice.call(arguments, 1);
      var result = spy.calledOnce && spy.calledWith.apply(spy, args);
      if (this._asserting === ! result) {
        this.spy = arguments[0].printf("%n");
        this.calls = arguments[0].printf("%C");
      }
      return result;
    },

    message: "{$spy} to be calledOnceWith {i$args}{$calls}"
  });

  ga.add('threw', {
    assert:  function (spy, something) {
      checkSpy(spy);
      return spy.threw(something);
    },

    message: "{0} to throw an exception"
  });

  function delegate(meth) {
    ga.add(meth, {
      assert:  function (spy) {
        checkSpy(spy);
        var args = this.args = Array.prototype.slice.call(arguments, 1);
        var result = spy[meth].apply(spy, args);
        if (this._asserting === ! result) {
          this.spy = spy.printf("%n");
          this.calls = spy.printf("%C");
        }
        return result;
      },

      message: "{$spy} to be " + meth + " {i$args}{$calls}"
    });
  }

  function called(nth) {
    var meth = 'called' + nth;
    ga.add(meth, {
      assert:  function (spy) {
        checkSpy(spy);
        var result = spy[meth];
        if (this._asserting === ! result) {
          this.calls = spy.printf("%C");
        }
        return result;
      },

      message: "{0} to be called " + nth + ".\n{$calls}"
    });
  }

  function formatHTML(html) {
    var re = /([^<]*)([^>]*>)/g, m;

    var result = '';
    var indent = '';

    function add(str) {
      result += "\n" + indent + str;
    }

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
        indent += '  ';
      }
    }

    return result;
  }

  function withinDelta(actual, expected, delta) {
    return actual > expected-delta && actual < expected+delta;
  }

  function checkSpy(spy) {
    (spy && spy.hasOwnProperty('called')) ||
      geddon.fail("Argument is not a spy/stub");
  }
});
