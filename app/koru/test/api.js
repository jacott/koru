define(function(require, exports, module) {
  const koru    = require('koru');
  const util    = require('koru/util');
  const TH      = require('./main');

  const ctx = module.ctx;

  class API {
    constructor(testCase, subject, subjectName, subjectModules) {
      this.testCase = testCase;
      this.subject = subject;
      this.subjectName = subjectName;
      this.subjectModules = subjectModules;
      this.methods = {};
    }

    static reset() {
      this.__afterTestCase = new WeakSet;
      this._apiMap = new Map;
      this._instance = null;
    }

    static module(subject, subjectName, subjectModules) {
      const tc = TH.test._currentTestCase;
      if (subject === undefined) {
        subject = ctx.modules[tc.moduleId.replace(/-test$/, '')].exports;
      }

      this._instance = this._apiMap.get(subject);
      if (this._instance) return;

      const afterTestCase = this.__afterTestCase;
      afterTestCase.has(tc) || tc.after(testCaseFinished.bind(this));
      afterTestCase.add(tc);

      this._apiMap.set(subject, this._instance =
                       new API(tc, subject, subjectName || createSubjectName(subject),
                               subjectModules || ctx.exportsModule(subject)));
      return this._instance;
    }

    static method(methodName) {this.instance.method(methodName)}
    static done() {this.instance.done()}

    static get instance() {return this._instance || this.module()}

    method(methodName) {
      const api = this;
      const test = TH.test;
      const calls = [];
      const func = api.subject[methodName];

      let details = api.methods[methodName];
      if (! details) {
        details = api.methods[methodName] = {
          test,
          sig: func.toString().replace(/\s*{[\s\S]*$/, ''),
          intro: docComment(test.func),
          subject: api.valueTag(api.subject),
          calls
        };
      }


      const orig = koru.replaceProperty(api.subject, methodName, {
        value: function (...args) {
          const entry = [
            args.map(obj => api.valueTag(obj)),
            undefined,
          ];
          calls.push(entry);
          const ans = func.apply(this, args);
          entry[1] = api.valueTag(ans);
          return ans;
        }
      });

      test.onEnd(api._onEnd = () => {
        if (! api._onEnd) return;
        api._onEnd = null;
        if (orig) {
          Object.defineProperty(api.subject, methodName, orig);
        } else {
          delete api.subject[methodName];
        }
      });
    }

    done() {
      this._onEnd && this._onEnd();
    }

    testCaseFinished() {
    }

    serialize() {
      const ids = (this.subjectModules||[]).map(m => m.id);
      const abstracts = ids.map(id => {
        const mod = ctx.modules[id+'-test'];
        if (mod && mod.body)
          return docComment(mod.body);
      });
      const methods = {};
      for (const methodName in this.methods) {
        const row = this.methods[methodName];
        methods[methodName] = {
          test: row.test.name,
          sig: row.sig,
          intro: row.intro,
          calls: row.calls.map(([args, ans]) => {
            args = args.map(arg => this.serializeValue(arg));
            if (ans)
              return [args, this.serializeValue(ans)];
            else
              return [args];
          }),
        };
      }
      return {
        subject: {
          ids,
          name: this.subjectName,
          abstracts,
        },
        methods,
      };
    }

    valueTag(obj) {
      const mods = ctx.exportsModule(obj);
      if (mods)
        return ['M', obj];
      switch (typeof obj) {
      case 'function':
        return ['F', obj, obj.name];
      case 'object':
        return ['O', obj, util.inspect(obj)];
      default:
        return obj;
      }
    }

    serializeValue(value) {
      if (Array.isArray(value))
        return [value[0], value[0] === 'M' ? this.bestId(value[1]): value[2]];

      return value;
    }

    bestId(value) {
      return ctx.exportsModule(value)[0].id;
    }
  }

  API.reset();

  TH.geddon.onEnd(module, function () {
    API._record();
    API.reset();
  });

  function createSubjectName(subject) {
    const mods = ctx.exportsModule(subject);
    if (mods) {
      return fileToCamel(mods[mods.length-1].id);
    }
  }

  function fileToCamel(fn) {
    return fn.replace(/-(\w)/g, (m, l) => l.toUpperCase())
      .replace(/^.*\//, '');
  }

  function docComment(func) {
    let m = /\/\*\*\s*([\s\S]*?)\s*\*\*\//.exec(func.toString());
    return m && m[1].slice(2).replace(/^\s*\*\s/mg, '');
  }

  function testCaseFinished() {
    if (this._instance) {
      this._instance.testCaseFinished();
      this._instance = null;
    }
  }

  module.exports = API;
  require('koru/env!./api')(API);
});
