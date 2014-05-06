define(['./core', './assertions'], function (geddon) {
  var gu = geddon._u;
  var ga = geddon.assertions;

  ga.add('same', {
    assert:  function (actual, expected) {
      return actual === expected;
    },

    message: "'{i0}' to be the same as '{i1}'"
  });

  ga.add('equals', {
    assert:  function (actual, expected) {
      return gu.deepEqual(actual, expected);
    },

    message: "{i0} to equal {i1}"
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
      return actual > expected-delta && actual < expected+delta;
    },

    message: "{0} to be near {1} by delta {$delta}"
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

    throw new Error("Matcher (" + gu.format("{i0}", matcher) + ") was not a " +
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
      try {func();}
      catch(ex) {
        this.name = ex.name;
        this.message = ex.message;
        if (name && ex.name !== name) return false;
        if (message && ex.message !== message)  return false;
        return true;
      }
      return false;
    },

    message: "an exception to be thrown: {i$name}, {i$message}"
  });

  ga.add("className", {
    assert: function (element, className) {
      if (typeof element.className == "undefined") {
        return geddon.fail(gu.format("{2} Expected object to have className property", arguments[1]));
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
    assertMessage: "Expected object's className to include '{1}' but was '{$names}'",
    refuteMessage: "Expected object's className not to include '{1}'",
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

      assertMessage: "Expected to find {$htmlClue}",
      refuteMessage: "Expected not to find {$htmlClue}",
    });

    ga.add('dom', {
      assert:  select,

      assertMessage: "Expected to find {$htmlClue}",
      refuteMessage: "Expected not to find {$htmlClue}",
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
            html = selectNode[0].innerHTML;
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
              this.htmlClue = "count:" + options.count + " == "+  elm.length +" for '" + this.htmlClue;
              return false;
            }
            if (elm.length === 0) return false;
            if (options.value != null) {
              var ef = filter(elm, function (i) {return options.value === i.value});
              if (ef.length === 0) {
                this.htmlClue = 'value: "' + options.value + '" == "' + (elm.length ? elm[0].value : '') + '" for ' + this.htmlClue;
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(typeof options.text === 'string') {
              var ef = filter(elm, function (i) {return options.text === i.textContent.trim()});
              if (ef.length === 0) {
                this.htmlClue = 'text: "' + options.text + '" == "' + text(elm) + '" for ' + this.htmlClue;
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if(typeof options.text === 'object') {
              var ef = filter(elm, function (i) {return options.text.test(i.textContent.trim())});
              if (ef.length === 0) {
                this.htmlClue = 'RegExp ' + options.text + ' does not match "' + text(elm) + '" for ' + this.htmlClue;
                return false;
              } else {
                selectNode = elm = ef;
              }
            }
            if ('parent' in options) {
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
      return spy.threw(something);
    },

    message: "{0} to throw an exception"
  });

  function delegate(meth) {
    ga.add(meth, {
      assert:  function (spy) {
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
        var result = spy[meth];
        if (this._asserting === ! result) {
          this.calls = spy.printf("%C");
        }
        return result;
      },

      message: "{0} to be called " + nth + ".\n{$calls}"
    });
  }

});
