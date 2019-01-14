define((require, exports, module)=>{
  const koru            = require('koru');
  const moduleGraph     = require('koru/module-graph');
  const jsParser        = require('koru/parse/js-parser');
  const {stubName$}     = require('koru/symbols');
  const util            = require('koru/util');
  const TH              = require('./main');

  const onEnd$ = Symbol(),
        level$ = Symbol(), currentTest$ = Symbol(), callLength$ = Symbol(), tcInfo$ = Symbol();

  const {hasOwn} = util;
  const {ctx} = module;

  const {inspect$} = require('koru/symbols');

  const Element = (isClient ? window : global).Element || {};

  const relType = (orig, value)=> orig === value ? 'O' : orig instanceof value ? 'Oi' : 'Os';

  let count = 0;

  const onTestEnd = (api, func)=>{
    if (api.target !== void 0) api.target.test = getTestLevel();
    if (api[onEnd$] === void 0) {
      const foo = count++;
      const onEnd = api[onEnd$] = ()=>{
        if (api[onEnd$] !== onEnd) return;
        api[onEnd$] = void 0;
        api.target === void 0 || extractBodyExample(api.target, api.target.test);
        const {callbacks} = onEnd;
        onEnd.callbacks = [];
        callbacks.forEach(cb => cb());
        api.target = void 0;
      };
      onEnd.callbacks = [];
      TH.onEnd(onEnd);
    }

    func === void 0 || api[onEnd$].callbacks.push(func);
  };

  const createSubjectName = (subject, tc)=>{
    switch (typeof subject) {
    case 'function': return subject.name;
    case 'string': return subject;
    }
    const mods = ctx.exportsModule(subject);
    if (mods) {
      const id = tc && toId(tc);
      const mod = mods.find(mod => id === mod.id) || mods[0];
      return fileToCamel(mod.id);
    }
  };

  const toId = tc => tc.moduleId.replace(/-test$/, '');

  const extractFnBody = body =>{
    if (typeof body === 'string')
      return jsParser.shiftIndent(body);

    body = body.toString();

    const m = /^\([^)]*\)\s*=>\s*(?=[^{\s])/.exec(body);

    if (m) return body.slice(m[0].length);

    return jsParser.shiftIndent(body.replace(/^.*{(\s*\n)?/, '').replace(/}\s*$/, ''));
  };

  const funcToSig = (func, name)=>{
    const sig = jsParser.extractCallSignature(func);
    return (name === undefined || name === func.name)
      ? sig : name+sig.slice(func.name.length);
  };

  const fileToCamel = fn => fn
        .replace(/-(\w)/g, (m, l)=> l.toUpperCase()).replace(/^.*\//, '')
        .replace(/^[a-z]/, m => m.toUpperCase());

  const cache = (API, value, orig, result)=>{
    if (value !== orig)
      API._objCache.set(value, ['C', result[1], result[2]]);
    API._objCache.set(orig, result);
    return result;
  };

  const serializeCalls = (api, calls)=> calls.map(row => {
    if (Array.isArray(row))
      return serializeCall(api, row);

    row.calls = serializeCalls(api, row.calls);
    return row;
  });

  const serializeCall = (api, [args, ans, comment])=>{
    args = args.map(arg => api.serializeValue(arg));
    if (comment)
      return [args, ans === undefined ? [''] : api.serializeValue(ans), comment];

    if (ans === undefined)
      return [args];
    else
      return [args, api.serializeValue(ans)];
  };

  const serializeProperties = (api, properties)=>{
    for (let name in properties) {
      const property = properties[name];
      if (property.value !== undefined)
        property.value = api.serializeValue(property.value);
      if (property.calls)
        property.calls = serializeCalls(api, property.calls);
      if (property.test) property.test = property.test.name,

      property.properties &&
        serializeProperties(api, property.properties);
    }
  };

  const property = (api, field, subject, name, options)=>{
    api[level$] = getTestLevel();
    if (name == null) name = extractTestName(api, subject);

    const inner = (subject, name, options, properties)=>{
      const property = properties[name] || (properties[name] = {});

      const hasValueOpt =
            typeof options === 'object' && options !== null && hasOwn(options, 'value');

      const desc = subject && ! hasValueOpt
            ? Object.getOwnPropertyDescriptor(subject, name) : undefined;

      let savedValue = desc == null || desc.get == null ? subject[name] : undefined;

      if (hasValueOpt) {
        property.value = api.valueTag(options.value);
      } else if (desc == null || desc.get || desc.set) {
        const calls = property.calls || (property.calls = []);
        api.target = property;
        util.setProperty(subject, name, {
          get() {
            const entry = [[], null];
            addComment(api, entry);
            calls.push(entry);
            const ans = desc ? desc.get.call(this) : savedValue;
            entry[1] = api.valueTag(ans);
            return ans;
          },
          set(value) {
            const entry = [[api.valueTag(value)], undefined];
            addComment(api, entry);
            calls.push(entry);
            savedValue = value;
            desc && desc.set.call(this, value);
          }
        });

        onTestEnd(api, () => {
          if (desc)
            Object.defineProperty(subject, name, desc);
          else
            delete subject[name];
        });

      } else {
        property.value = api.valueTag(savedValue);
      }
      switch (typeof options) {
      case 'string':
        property.info = options;
        break;
      case 'function':
        property.info = options(savedValue);
        break;
      case 'object':
        if (options != null) {
          if (options.info) property.info = options.info;
          if (options.intro) property.info = options.intro;
          if (options.properties) {
            const properties = property.properties ||
                    (property.properties = {});
            for (let name in options.properties) {
              inner(savedValue, name, options.properties[name], properties);
            }
          }
          break;
        }
      case 'undefined':
        break;
      default:
        throw new Error("invalid options supplied for property "+name);
      }
      if (property.info === undefined) {
        property.info = docComment(api);
      }
    };

    inner(subject, name, options, api[field] || (api[field] = {}));
  };

  const getTestLevel = ()=>{
    const {test} = TH;
    if (test === undefined) return;
    const {mode} = test;
    if (mode === 'running') {
      return  test;
    } else {
      return TH.Core.currentTestCase;
    }
  };

  const extractTestName = (api, subject)=>{
    const {test} = TH;
    const {mode} = test;
    const start = mode === 'running' ? test : TH.Core.currentTestCase;
    for (let level = start; level != null; level = level.tc) {
      const name = level === test
            ? test.name.replace(/^.*test ([^\s.]+).*$/, '$1')
            : level.name;
      if (hasOwn(subject, name)) {
        api[level$] = level;
        return name;
      }
    }
    return start.name.replace(/^.*test ([^\s.]+).*$/, '$1');
  };

  const addBody = (details, body, isNew=true)=>{
    if (body === '') return;
    let calls = details.calls.slice(details[callLength$]);
    details.calls.length = Math.min(details[callLength$] || 0, details.calls.length);

    body = jsParser.shiftIndent(body.replace(/^\s*\n/, '')).replace(/ +$/, '');
    if (details.calls.length !== 0 && ! isNew) {
      const last = details.calls[details.calls.length-1];
      details.calls.length -= 1;
      if (last.body !== void 0) {
        body = last.body + body;
      }
      if (last.calls.length != 0) {
        calls.length != 0 && last.calls.push(...calls);
          calls = last.calls;
      }
    }
    details.calls.push({body, calls});
    details[callLength$] = details.calls.length;
  };

  const example = (api, body, isNew)=>{
    try {
      return typeof body === 'function' && body();
    } finally {
      if (api.target !== void 0) {
        addBody(api.target,  extractFnBody(body), isNew);
      }
    }
  };

  const extractBodyExample = (details, fromTest)=>{
    if (details === undefined) return;

    const currentTest = fromTest || details[currentTest$];
    if (fromTest === undefined) {
      const {test} = TH;
      if (test === currentTest) return;

      details[currentTest$] = test;
      if (currentTest === undefined) return;
    }

    const raw = currentTest.body.toString().replace(/\/\*\*[\s\S]*?\*\*\//, '');
    const re = /\/\/\[([\s\S]+?)\/\/\]/g;
    let m = re.exec(raw);
    if (m == null) {
      const m = /^[\s\S]*?\bapi\.(?:method|protoMethod).*\n([\s\S]*)}[^}]*$/.exec(raw);
      if (m != null) addBody(details, m[1], true);
      return;
    }

    let body = '', isNew = true;
    while (m !== null) {
      const sec = m[1];
      if (sec[0] === '#') {
        isNew = false;
        body += sec.slice(1);
      } else {
        addBody(details, body, isNew);
        isNew = true;
        body = sec;
      }
      m = re.exec(raw);
    }
    addBody(details, body, isNew);
  };

  const method = (api, methodKey, obj, intro, methods)=>{
    api[level$] = getTestLevel();
    if (methodKey == null) methodKey = extractTestName(api, obj);

    const func = obj[methodKey];
    if (func == undefined)
      throw new Error(`method "${methodKey}" not found`);

    let methodName = methodKey.toString();
    if (typeof methodKey === 'symbol') {
      const m = /^Symbol\((Symbol\..*?)\)$/.exec(methodName);
      if (m !== null) methodName = m[1];
      methodName = '['+methodName+']';
    }

    let details = methods[methodName];
    const calls = details ? details.calls : [];
    if (details === undefined) {
      let sig = funcToSig(func).replace(/^function\s*(?=\()/, methodName);
      const isGenerator = sig[0] === '*';
      if (isGenerator)
        sig = sig.replace(/^\*\s*/, '*');

      details = methods[methodName] = {
        sig,
        intro: typeof intro === 'string' ? intro : docComment(intro || api),
        subject: api.valueTag(api.subject),
        calls,
        [currentTest$]: undefined,
        [callLength$]: 0,
      };
    }
    api.target = details;

    const desc = util.setProperty(obj, methodKey, {
      value(...args) {
        const {calls} = details;
        if (calls === undefined) return func.apply(this, args);
        const entry = [
          args.map(obj => api.valueTag(obj)),
          undefined,
        ];
        addComment(api, entry);
        calls.push(entry);

        const ans = func.apply(this, args);
        entry[1] = api.valueTag(ans);
        return ans;
      }
    });

    onTestEnd(api, () => {
      if (desc) {
        Object.defineProperty(obj, methodKey, desc);
      } else {
        delete obj[methodKey];
      }
    });
  };

  const addComment = (api, entry)=>{
    const {currentComment} = api;
    if (currentComment) {
      entry.push(currentComment);
      api.currentComment = null;
    }
  };

  const inspect = (obj)=>{
    if (typeof obj !== 'object' || obj === null ||
        obj[inspect$] || ('outerHTML' in obj) || obj.nodeType === 3)
      return util.inspect(obj, 4, 150);

    const coreDisplay = obj && API._coreDisplay.get(obj.constructor);
    if (coreDisplay !== undefined) {
      return typeof coreDisplay === 'function' ? coreDisplay(obj) : coreDisplay;
    }

    let keys = Object.keys(obj).sort();
    if (keys.length > 20)
      keys = keys.slice(0, 20);

    const display = keys.map(key => {
      const item = obj[key];
      if (/[^$\w]/.test(key))
        key = JSON.stringify(key);
      const resolveFunc = item && API._resolveFuncs.get(item.constructor);
      if (typeof resolveFunc === 'function')
        return `${key}: ${resolveFunc('Oi', item)[1]}`;
      if (typeof item === 'function' && item.name === key)
        return `${key}(){}`;

      return `${key}: ${util.inspect(item, 3, 150)}`;});
    return `{${display.join(", ").slice(0, 150)}}`;
  };

  const docComment = func =>{
    if (func instanceof API) {
      const tl  = func[level$];
      if (tl != null) {
        func = tl.body;
      } else
        func = null;
    }
    if (func == null) {
      const tl = getTestLevel();
      if (tl === undefined) return;
      func = tl.body;
      if (func === undefined) return;
    }
    const code = func.toString();
    let m = /\)\s*(?:=>)?\s*{\s*/.exec(code);
    if (m == null) return;
    let re = /\/\*\*\s*([\s\S]*?)\s*\*?\*\//y;
    re.lastIndex = m.index+m[0].length;
    m = re.exec(code);
    return m == null ? undefined : m[1].slice(2).replace(/^\s*\* ?/mg, '');
  };

  class API {
    constructor(parent, moduleOrSubject, subjectName, testModule, abstract) {
      this.parent = parent;
      if (parent) {
        this.module = undefined;
        this.subject = moduleOrSubject;
      } else {
        this.module = moduleOrSubject;
        this.subject = moduleOrSubject && moduleOrSubject.exports;
      }
      this.subjectName = subjectName;
      this.testModule = testModule || (this.parent && this.parent.testModule);
      this.abstract = abstract || docComment(this.testModule && this.testModule.body);

      this.newInstance =
        this.properties = this.protoProperties =
        this.currentComment = this.target =
        this.propertyName = this.initInstExample =
        this.initExample = undefined;

      this.methods = Object.create(null);
      this.protoMethods = Object.create(null);
      this.innerSubjects = Object.create(null);
      this.customMethods = Object.create(null);
    }

    static reset() {
      this._instance = null;
      this._moduleMap = new Map;
      this._subjectMap = new Map;
      this._objCache = new Map;
    }

    static module({subjectModule, subjectName, pseudoModule, initExample, initInstExample}={}) {
      const tc = TH.Core.currentTestCase;
      if (pseudoModule !== void 0) {
        subjectModule = new module.constructor(ctx, toId(tc));
        subjectModule.exports = pseudoModule;
      } else
        subjectModule = subjectModule || ctx.modules[toId(tc)];
      const subject = subjectModule.exports;
      if (! this.isRecord) {
        this._instance.tc = tc;
        this._instance.subject = subject;
        return this._instance;
      }
      subjectName = subjectName || createSubjectName(subject, tc);

      this._instance = this._moduleMap.get(subjectModule);
      if (this._instance == null) {
        TH.onEnd(()=>{this._instance = null});

        this._mapSubject(subject, subjectModule);
        this._moduleMap.set(
          subjectModule, this._instance = new this(
            null, subjectModule,
            subjectName,
            ctx.modules[tc.moduleId]
          )
        );
        if (initExample)
          this._instance.initExample = initExample;

        if (initInstExample)
          this._instance.initInstExample = initInstExample;
      }
      if (tc[tcInfo$] === undefined) {
        tc[tcInfo$] = true;
        if (this._instance.abstract === undefined) {
          const module = ctx.modules[tc.moduleId];
          if (module !== undefined)
            this._instance.abstract = docComment(module.body);
        }
      }

      return this._instance;
    }

    static innerSubject(subject, subjectName, options) {return this.instance.innerSubject(subject, subjectName, options)}
    static class(options) {return this.instance.class(options)}
    static custom(func, options) {return this.instance.custom(func, options)}
    static customIntercept(object, options) {return this.instance.customIntercept(object, options)}
    static property(name, options) {this.instance.property(name, options)}
    static protoProperty(name, options, subject) {this.instance.protoProperty(name, options, subject)}
    static comment(comment) {this.instance.comment(comment)}
    static topic(options) {return this.instance.topic(options)}
    static example(body) {return this.instance.example(body)}
    static exampleCont(body) {return this.instance.exampleCont(body)}
    static method(methodName, options) {this.instance.method(methodName, options)}
    static protoMethod(methodName, options) {this.instance.protoMethod(methodName, options)}
    static done() {this.instance.done()}
    static skip() {this.instance.skip()}

    static get instance() {return this._instance || this.module()}

    static resolveObject(value, displayName, orig=value) {
      if (value === null || value === Object)
        return ['O', displayName];

      const resolveFunc = this._resolveFuncs.get(value);
      if (resolveFunc)
        return resolveFunc(relType(orig, value), orig);

      if (this._coreTypes.has(value))
        return [relType(orig, value), displayName, this._specialNames.get(value) || value.name];

      let api = this.valueToApi(value);
      if (api) {
        return cache(this, value, orig, [relType(orig, value), displayName, api.moduleName]);
      }

      let cValue = this._objCache.get(value);
      if (cValue) {
        if (cValue[0] === 'C' || orig !== value)
          return cache(this, orig, orig, [relType(orig, value), displayName, cValue[2]]);
        return cValue;
      }

      if (typeof value === 'function') {
        const proto = Object.getPrototypeOf(value);
        if (! proto)
          return ['O', displayName];

        let api = this.valueToApi(proto);
        if (api) {
          return cache(this, value, orig, ['Os', displayName, api.moduleName]);
        }

        return this.resolveObject(proto, displayName, orig);
      }
      if (! value.constructor || value.constructor === value)
        return ['O', displayName];
      value = value.constructor;
      return this.resolveObject(value, displayName, orig);
    }

    static valueToApi(value) {
      const entry = this._subjectMap.get(value);
      if (! entry)
        return;

      const item = entry[0];
      if (item instanceof API)
        return item;
      return this._moduleMap.get(item);
    }

    static functionBody(func) {return extractFnBody(func)}

    static _mapSubject(subject, module) {
      const smap = this._subjectMap.get(subject);

      if (smap) {
        if (smap[0] === module)
          return;
        this._subjectMap.set(subject, [module, smap]);
      } else
        this._subjectMap.set(subject, [module, null]);
    }

    get moduleName() {
      if (this.module)
        return this.module.id;
      const {parent} = this;
      return parent && parent.moduleName +
        (parent.properties && this.propertyName ?
         '.'+this.propertyName : '::'+this.subjectName);
    }

    innerSubject(subject, subjectName, options={}) {
      let propertyName;
      if (typeof subject === 'string') {
        propertyName = subject;
        if (! (this.properties && this.properties[subject]))
          this.property(subject, options);
        if (! subjectName)
          subjectName = subject;
        subject = this.subject[subject];
      }
      subjectName = subjectName || createSubjectName(subject);

      if (! subjectName)
        throw new Error("Don't know the name of the subject!");

      const ThisAPI = this.constructor;

      let ans = this.innerSubjects[subjectName];
      if (ans === void 0) {
        this.innerSubjects[subjectName] = ans =
          new ThisAPI(this, subject, subjectName);
        ThisAPI._moduleMap.set(
          {id: `${this.id}${propertyName ? '.' : '::'}${subjectName}`}, ans);
        ThisAPI._mapSubject(subject, ans);
      }

      if (propertyName) ans.propertyName = propertyName;

      if (options.abstract !== void 0) {
        ans.abstract = typeof options.abstract === 'string' ?
          options.abstract :
          docComment(options.abstract);
      } else {
        ans.abstract = docComment();
      }

      if (options.initExample !== void 0)
        ans.initExample = options.initExample;

      if (options.initInstExample !== void 0)
        ans.initInstExample = options.initInstExample;

      return ans;
    }

    class({sig, intro}={}) {
      const calls = [];

      switch(typeof sig) {
      case 'function':
        this.subject = sig;
      case 'undefined':
        if (typeof this.subject !== 'function' || Object.getPrototypeOf(this.subject) == null)
          throw new Error("this.new called on non function");

        sig = funcToSig(this.subject).replace(/^[^(]*/, 'constructor');
        break;
      }


      if (! this.newInstance) {
        this.newInstance = {
          sig,
          intro: typeof intro === 'string' ? intro : docComment(intro),
          calls
        };
      }

      this.target = this.newInstance;

      onTestEnd(this);

      const api = this;


      return class extends api.subject {
        constructor(...args) {
          super(...args);
          const {calls} = api.target;
          if (calls === undefined) {
            return;
          }
          extractBodyExample(api.target);
          const entry = [
            args.map(obj => api.valueTag(obj)),
            undefined,
          ];
          calls.push(entry);
          entry[1] = api.valueTag(this);
        };
      };
    }

    custom(func=this.subject, {name=func.name, sig, intro}={}) {
      let sigPrefix;
      if (sig === undefined) {
        sig = funcToSig(func, name);
      } else {
        const m = /^([^=(]*?[.#:])/.exec(sig);
        if (m != null) {
          sigPrefix = m[1];
          if (sigPrefix === sig)
            sig = funcToSig(func, name);
          else
            sig = sig.slice(m[1].length);
        }
      }
      const api = this;
      if (typeof func !== 'function')
        throw new Error("api.custom called with non function");

      if (! name)
        throw new Error("Can't derive name of function");

      const calls = [];

      let details = api.customMethods[name];
      if (! details) details = api.customMethods[name] = {
        sigPrefix,
        sig,
        intro: typeof intro === 'string' ? intro : docComment(intro),
        calls
      };
      api.target = details;

      onTestEnd(api);

      return proxy;

      function proxy(...args) {
        const {calls} = details;
        if (calls === undefined) return func.apply(this, args);
        extractBodyExample(details);
        const entry = [
          args.map(obj => api.valueTag(obj)),
          undefined,
        ];
        calls.push(entry);
        const ans = func.apply(this, args);
        entry[1] = api.valueTag(ans);
        return ans;
      };
    }

    customIntercept(func, {name=func.name, sig, intro}={}) {
      const orig = func[name];
      TH.intercept(func, name, this.custom(orig, {name, sig, intro}));
      return orig;
    }

    protoProperty(name, options, subject=this.subject.prototype) {
      property(this, 'protoProperties', subject, name, options);
    }

    property(name, options) {
      property(this, 'properties', this.subject, name, options);
    }

    topic({name, intro}={}) {
      const test = this[level$] = getTestLevel();
      if (name === void 0) name = test.name.replace(/^.*test (.*?)\.?$/, '$1');
      const topics = this.topics || (this.topics = {});

      this.target = topics[name] = {
        intro: typeof intro === 'string' ? intro : docComment(intro || this),
        calls: [],
        [currentTest$]: test,
        [callLength$]: 0,
      };
      onTestEnd(this);
      return {target: this.target, addBody(body, isNew) {addBody(this.target, body, isNew)}};
    }
    example(body) {return example(this, body)}
    exampleCont(body) {return example(this, body, false)}
    exampleNoExec(body, isNew) {addBody(this.target, body, isNew)}
    comment(comment) {this.currentComment = comment}

    method(methodName, {subject, intro}={}) {
      method(this, methodName, subject || this.subject, intro, this.methods);
    }

    protoMethod(methodName, {subject, intro}={}) {
      method(this, methodName, subject || this.subject.prototype, intro, this.protoMethods);
    }

    done() {
      this[onEnd$] && this[onEnd$]();
    }

    skip() {
      const {target} = this;
      if (target === undefined) return;
      const {calls} = target;

      target.calls = undefined;
      TH.onEnd(()=>{target.calls = calls});
    }

    [inspect$]() {
      return `API(${this.subjectName})`;
    }

    serialize() {
      const {methods, protoMethods, customMethods, abstract, topics} = this;

      const procMethods = list => {
        for (let methodName in list) {
          const row = list[methodName];

          list[methodName] = {
            test: row.test.name,
            sigPrefix: row.sigPrefix,
            sig: row.sig,
            intro: row.intro,
            calls: serializeCalls(this, row.calls),
          };
        }
      };

      procMethods(methods);
      procMethods(protoMethods);
      procMethods(customMethods);

      if (topics !== void 0) {
        procMethods(topics);
      }

      const id = this.testModule.id.replace(/-test$/, '');

      const ans = {
        id,
        subject: {
          name: this.subjectName,
          abstract,
        },
        methods,
        protoMethods,
        customMethods,
        topics,
      };

      if (this.initExample) ans.initExample = extractFnBody(this.initExample);
      if (this.initInstExample) ans.initInstExample = extractFnBody(this.initInstExample);

      const {newInstance, properties, protoProperties} = this;
      if (newInstance) {
        newInstance.test = newInstance.test.name;
        newInstance.calls = serializeCalls(this, newInstance.calls);
        ans.newInstance = newInstance;
      }
      if (properties) {
        serializeProperties(this, properties);
        ans.properties = properties;
      }
      if (protoProperties) {
        serializeProperties(this, protoProperties);
        ans.protoProperties = protoProperties;
      }

      if (this.module) {
        if (this.module._requires)
          ans.requires = Object.keys(this.module._requires).sort();

        let otherMods = this.constructor._subjectMap.get(this.subject);
        if (otherMods) {
          const otherIds = [];
          for (; otherMods; otherMods = otherMods[1]) {
            if (! (otherMods[0] instanceof API) &&
                otherMods[0].id && otherMods[0].id !== id)
              otherIds.push(otherMods[0].id);
          }
          if (otherIds) {
            const modifies = [], modifiedBy = [];
            const {modules} = this.module.ctx;
            otherIds.forEach(oId => {
              const oMod = modules[oId];
              if (oMod && moduleGraph.isRequiredBy(oMod, this.module))
                modifies.push(oId);
              else if (oMod && moduleGraph.isRequiredBy(this.module, oMod))
                modifiedBy.push(oId);
            });
            if (modifies.length)
              ans.modifies = modifies.sort();
            if (modifiedBy.length)
              ans.modifiedBy = modifiedBy.sort();
          }
        }
      }

      return ans;
    }

    valueTag(obj, recurse=true) {
      const mods = ctx.exportsModule(obj);
      if (mods)
        return ['M', obj];
      switch (typeof obj) {
      case 'function':
        return ['F', obj, obj[stubName$] || obj.name || funcToSig(obj)];
      case 'object':
        if (obj === null)
          return obj;
        if (recurse && obj.constructor === Object) {
          const parts = {};
          for (const id in obj) {
            parts[id] = this.valueTag(obj[id], false);
          }
          return ['P', parts];
        }
        let resolveFunc = this.constructor._resolveFuncs.get(obj) ||
              this.constructor._resolveFuncs.get(obj.constructor);
        return ['O', obj, resolveFunc ? resolveFunc('O', obj)[1] : inspect(obj)];
      default:
        return obj;
      }
    }

    serializeValue(value) {
      if (Array.isArray(value)) {
        let api;
        const v1 = value[1];
        switch(value[0]) {
        case 'M':
          return ['M', this.bestId(v1)];
        case 'F':
          if (Object.getPrototypeOf(v1) === Function.prototype)
            return ['F', value[2]];
        case 'O':
          api =  this.constructor.valueToApi(v1);
          if (api)
            return ['M', api.moduleName];

          return this.constructor.resolveObject(v1, value[2]);
        case 'P': {
          const ans = {};
          for (const id in v1) {
            ans[id] = this.serializeValue(v1[id]);
          }
          return ['P', ans];
        } default:
          return [value[0], value[2]];
        }
      }

      if (value === undefined)
        return ['U', 'undefined'];

      if (typeof value === 'symbol')
        return ['S', 'symbol'];

      return value;
    }

    bestId(value) {
      return ctx.exportsModule(value)[0].id;
    }
  }

  const Generator = (function *() {})().constructor;

  API._coreTypes = new Set([
    Array,
    ArrayBuffer,
    Boolean,
    Date,
    Element,
    Error,
    EvalError,
    Generator,
    Float32Array,
    Float64Array,
    Function,
    Int16Array,
    Int32Array,
    Int8Array,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RangeError,
    ReferenceError,
    RegExp,
    Set,
    String,
    Symbol,
    SyntaxError,
    TypeError,
    Uint16Array,
    Uint32Array,
    Uint8Array,
    Uint8ClampedArray,
    URIError,
    WeakMap,
    WeakSet,
  ]);

  API._coreDisplay = new Map([
    [Promise, 'Promise()'],
    [RegExp, obj => ''+obj],
  ]);

  API._specialNames = new Map([
    [Generator, 'Generator'],
  ]);

  const resolveModule = (type, value)=>{
    if (type === 'Oi')
      return [type, `{Module:${value.id}}`, 'Module'];
    return [type, value.name, 'Module'];
  };

  API._resolveFuncs = new Map([
    [TH.MockModule, resolveModule],

    [module.constructor, resolveModule],

    [Array, (type, value) => {
      if (type === 'Oi') {
        if (value.length > 20)
          value = value.slice(0, 20);
        const display = value.map(item => {

          const resolveFunc = item != null && typeof item === 'object'
                ? API._resolveFuncs.get(item.constructor) : undefined;
          if (resolveFunc !== undefined)
            return resolveFunc('Oi', item)[1];
          else
            return inspect(item);
        });
        return [type, `[${display.join(", ").slice(0, 150)}]`, 'Array'];
      }
      return [type, 'Array', 'Array'];
    }],
  ]);

  API.reset();

  API.isRecord = module.config().record;

  const STUB_TOPIC = {addBody() {}};


  class APIOff extends API {
    class({sig, intro}={}) {
      const func = typeof sig === 'function'
            ? sig
            : (this.tc === TH.Core.currentTestCase || API.module(), this.subject);
      return class extends func {
        constructor(...args) {
          super(...args);
        }
      };
    }
    property() {}
    comment() {}
    topic() {return STUB_TOPIC}
    example(body) {return typeof body === 'function' && body();}
    exampleCont(body) {return typeof body === 'function' && body();}
    method() {}
    protoMethod() {}
    protoProperty() {}
    done() {}
    custom(func=(this.tc === TH.Core.currentTestCase || API.module(), this.subject)) {return func}
  }

  if (! API.isRecord) {
    API._instance = new APIOff();
  } else {
    TH.Core.onEnd(module, ()=>{
      if (API.isRecord) {
        API._record();
        API.reset();
      }
    });

    TH.Core.onTestEnd(test=>{API._instance = null});
  }

  API._docComment = docComment;
  require('koru/env!./api')(API);

  return API;
});
