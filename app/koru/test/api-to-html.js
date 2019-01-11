define((require)=>{
  const marked = requirejs.nodeRequire('marked');
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const htmlDoc         = require('koru/dom/html-doc');
  const jsParser        = require('koru/parse/js-parser');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const return$ = Symbol(), name$ = Symbol(), node$ = Symbol(), parent$ = Symbol(), id$ = Symbol();

  const noContent = (tag)=> opts =>{
    const attrs = {[tag]: ''};
    for (let attr in opts)
      attrs['$'+attr] = opts[attr];
    return Dom.h(attrs);
  };

  const sortKeys = (a,b)=>{
    if (a === 'main') a = '';
    if (b === 'main') b = '';
    return a === b ? 0 : a < b ? -1 : 1;
  };

  const makeTree = (json)=>{
    const tree = {[parent$]: null, [name$]: ''};

    for (const id in json) {
      let node = tree;
      for (const part of id.split('/')) {
        node = node[part] || (node[part] = {[parent$]: node, [name$]: part});
      }
      const api = json[id];
      api.id = id; api.top = json;
      api[node$] = node;
      node[id$] = id;
    }

    return tree;
  };

  const apiToHtml = (title, json, sourceHtml)=>{
    const index = document.createElement('div');

    index.innerHTML = sourceHtml;

    const tags = {};

    Dom.walkNode(index, node => {
      switch(node.nodeType) {
      case document.TEXT_NODE: case document.COMMENT_NODE:
        return false;
      default:
        const tag = node.getAttribute('data-api');
        if (tag) tags[tag] = node;
      }
    });

    const {header, links, pages} = tags;
    const linkModules = [];

    const tree = makeTree(json);

    const renderNode = (node, id) => {
      const api = json[id];
      const {subject, newInstance, methods, customMethods, protoMethods, innerSubjects} = api;

      const aside = [];

      const addModuleList = (heading, list)=>{
        if (list) {
          aside.push({div: [
            {h1: heading},

            {class: 'jsdoc-list', div: list.map(id => {
              const m = id.split('!');
              if (m.length === 2) {
                if (m[0] === 'koru/env') {
                  const idc = m[1]+'-client';
                  const ids = m[1]+'-server';
                  return {span: [
                    {class: 'jsdoc-link', a: idc, $href: '#'+idc},
                    {br: ''},
                    {class: 'jsdoc-link', a: ids, $href: '#'+ids},
                  ]};
                }
                return id;
              }
              return {class: 'jsdoc-link', a: id, $href: '#'+id};
            })},
          ]});
        }
      };
      //      addModuleList('Modules required', api.requires);
      addModuleList('Modifies modules', api.modifies);
      addModuleList('Modified by modules', api.modifiedBy);

      const idParts = /^([^:.]+)([.:]*)(.*)$/.exec(id);
      const reqParts = [
        hl('const', 'kd'), ' ', hl(subject.name, 'no'), ' ', hl('=', 'o'), ' ',
        hl('require', 'k'), '(', hl(`"${idParts[1]}"`, 's'), ')'
      ];
      switch (idParts[2]) {
      case '.':
        reqParts.push('.', hl(idParts[3], 'na'));
        break;
      case '::':
        const ref = json[idParts[1]];
        if (ref)
          reqParts[2].textContent = ref.subject.name;
      }
      reqParts.push(';');
      const requireLine = Dom.h({class: 'jsdoc-require highlight', div: reqParts});

      const functions = newInstance ? [buildConstructor(
        api, subject, newInstance, requireLine
      )] : [];

      util.isObjEmpty(customMethods) ||
        util.append(functions, buildMethods(api, subject, customMethods, requireLine, 'custom'));
      util.isObjEmpty(methods) ||
        util.append(functions, buildMethods(api, subject, methods, requireLine));
      util.isObjEmpty(protoMethods) ||
        util.append(functions, buildMethods(api, subject, protoMethods, requireLine, 'proto'));

      const linkNav = {nav: functions.map(
        func => func && Dom.h({a: func.$name, $href: '#'+func.id})
      )};

      linkModules.push([id, linkNav]);
      const abstractMap = {};
      const abstract = jsdocToHtml(api, subject.abstract, abstractMap);
      const configMap = abstractMap[':config:'];
      let config;
      if (configMap) {
        config = {class: 'jsdoc-config', table: [
          {tr: {$colspan: 2, td: {h1: 'Config'}}},
          ...Object.keys(configMap).sort().map(key => Dom.h({
            class: 'jsdoc-config-item',
            tr: [{td: key}, {td: configMap[key]}]
          }))
        ]};
      }

      let properties = util.isObjEmpty(api.properties) ? [] :
            buildProperties(api, subject, api.properties);

      util.isObjEmpty(api.protoProperties) ||
        (properties = properties.concat(buildProperties(api, subject, api.protoProperties, 'proto')));

      pages.appendChild(Dom.h({
        id,
        '$data-env': env(api),
        class: /::/.test(id) ? "jsdoc-module jsdoc-innerSubject" : "jsdoc-module",
        section: [
          {class: 'jsdoc-module-path', a: id, $href: '#'+id},
          {class: 'jsdoc-module-title searchable', h1: subject.name},
          {abstract},
          {class: 'jsdoc-module-sidebar', aside},
          {div: [
            config,
            properties.length && {class: 'jsdoc-properties', div: [
              {h1: 'Properties'},
              {table: {tbody: properties}}
            ]},
            functions.length && {class: 'jsdoc-methods', div: [
              {h1: "Methods"},
              {div: functions},
            ]},
            innerSubjects && buildInnerSubjects(api, innerSubjects, linkNav),
          ]},
          // {pre: JSON.stringify(json, null, 2)}
        ],
      }));
    };

    const walkNode = (node, level=0)=>{
      for (const dir of Object.keys(node).sort(sortKeys)) {
        const child = node[dir];
        const id = child[id$];
        if (id !== undefined) {
          try {
            renderNode(child, id);
          } catch(ex) {
            ex.message += `\nWhile processing ${id}`;
            throw ex;
          }
        }
        walkNode(child, level+1);
      }
    };

    walkNode(tree);

    buildLinks(links, linkModules);

    return index.innerHTML;
  };

  const buildInnerSubjects = (parent, innerSubjects, linkNav)=> ({
    class: 'jsdoc-inner-subjects',
    div: Object.keys(innerSubjects).sort().map(name => {
      const api = innerSubjects[name];
    }),
  });

  const buildProperties = (api, subject, properties, proto)=>{
    const rows = [];

    const addRows = (properties)=>{
      const argMap = {};
      Object.keys(properties).sort().forEach(name => {
        const property = properties[name];
        const value = Dom.h({class: 'jsdoc-value', code: valueToText(property.value)});
        const info = property.info ? jsdocToHtml(
          api,
          property.info
            .replace(/\$\{value\}/, '[](#jsdoc-value)'),
          argMap,
          property
        ) : value;
        if (property.info) {
          const vref = findHref(info, '#jsdoc-value', true);
          if (vref)
            vref.parentNode.replaceChild(value, vref);
        }
        const ap = extractTypes(
          property.calls ?
            argProfile(property.calls, call => call[0].length ? call[0][0] : call[1])
          : argProfile([[property.value]], value => value[0])
        );

        rows.push({tr: [
          {class: "searchable", td: proto ? '#'+name : name},
          {td: ap},
          {class: 'jsdoc-info', '$data-env': env(property),
           td: info
           }
        ]});

        property.properties && addRows(property.properties);
      });
    };
    addRows(properties);

    return rows;
  };

  const env = (obj)=> obj.env || 'server';

  const mdRenderer = new marked.Renderer();
  const mdOptions = {
    renderer: mdRenderer,
    highlight: (code, lang)=>{
      switch(lang) {
      case 'js': case 'javascript':
        return jsParser.highlight(jsParser.indent(code)).outerHTML;
      }
    },
  };

  const CORE_TYPES = {
    Array: true,
    ArrayBuffer: true,
    Boolean: true,
    Date: true,
    Element: 'Web/API',
    Error: true,
    EvalError: true,
    Generator: true,
    Float32Array: true,
    Float64Array: true,
    Function: true,
    Int16Array: true,
    Int32Array: true,
    Int8Array: true,
    Map: true,
    Math: true,
    Null: true,
    Number: true,
    Object: true,
    Primitive: 'Glossary',
    Promise: true,
    RangeError: true,
    ReferenceError: true,
    RegExp: true,
    Set: true,
    String: true,
    Symbol: true,
    SyntaxError: true,
    TypeError: true,
    Uint16Array: true,
    Uint32Array: true,
    Uint8Array: true,
    Uint8ClampedArray: true,
    Undefined: true,
    URIError: true,
    WeakMap: true,
    WeakSet: true,
  };

  const BLOCK_TAGS = {
    deprecated: (api, row, argMap, div)=>{
      const ans = jsdocToHtml(api, row.slice(11), {});
      ans.classList.add('jsdoc-deprecated');
      ans.insertBefore(Dom.h({h1: 'Deprecated'}), ans.firstChild);
      div.appendChild(ans);
    },
    param: (api, row, argMap)=>{
      const m = /^\w+\s*({[^}]+})?\s*(\[)?([\w.]+)\]?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid param for api: ${api.id} line @${row}`);
      const name = m[3], dotIdx = name.indexOf(".");
      let profile = argMap[name] || (argMap[name] = {});
      if (dotIdx != -1) {
        const pName = name.slice(0, dotIdx);
        const opts = argMap[pName] || (argMap[pName] = {});
        const optNames = opts.optNames || (opts.optNames = {});
        optNames[name] = true;
        if (opts.subArgs !== undefined) {
          profile.types = opts.subArgs[name.slice(dotIdx+1)];
        }
      }
      if (m[4]) profile.info = m[4];
      if (m[2]) profile.optional = true;
      if (m[1]) overrideTypes(profile, m[1].slice(1,-1));
    },
    config: (api, row, argMap)=>{
       const m = /^\w+\s*(\S+)(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid config for api: ${api.id} line @${row}`);
      const profile = argMap[':config:'] || (argMap[':config:'] = {});
      profile[m[1]] = jsdocToHtml(api, m[2], argMap);
    },
    returns: (api, row, argMap)=>{
      const m = /^\w+\s*({[^}]+})?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid returns for api: ${api.id} line @${row}`);
      const profile = argMap[return$] || (argMap[return$] = {});
      if (m[2]) profile.info = m[2];
      if (m[1]) overrideTypes(profile, m[1].slice(1,-1));
    },
  };

  BLOCK_TAGS.arg = BLOCK_TAGS.param;
  BLOCK_TAGS.argument = BLOCK_TAGS.param;
  BLOCK_TAGS.return = BLOCK_TAGS.returns;

  const hrefMap = {
    Module: 'https://www.npmjs.com/package/yaajs#api_Module',
  };

  const overrideTypes = (profile, typeArg)=>{
    const oldTypes = profile.types;
    const types = profile.types = {};
    typeArg.split('|').forEach(type => {
      types[type] = (oldTypes && oldTypes[type]) || type;
    });
  };

  const expandLink = (node, text)=>{
    let suffix = text;
    while (node !== null && suffix.startsWith("../")) {
      suffix = suffix.slice(3);
      if (node[parent$] === null) throw new Error("invalid link: "+text+" in "+node[id$]);
      node = node[parent$];
    }
    let prefix = '';
    while (node !== null && node[name$] !== '') {
      prefix = node[name$]+"/"+prefix;
      node = node[parent$];
    }
    return {node, fullPath: prefix+suffix};
  };

  const execInlineTag = (api, text)=>{
    if (/^\.\.?\//.test(text)) {
      const {node, fullPath} = expandLink(api[node$], text[1] === "/" ? text.slice(2) : text);
      text = fullPath;
    }
    let [mod, type, method=''] = text.split(/([.#:]+)/);
    let href = text.replace(/\(.*$/, '');
    if (mod) {
      const destMod = mod && api.top && api.top[mod];
      if (destMod)
        mod = mod.replace(/\/[^/]*$/, '/'+destMod.subject.name);
      text = `${mod}${type||''}${method}`;
    } else {
      href = api.id+href;
      text = method;
    }

    return Dom.h({class: 'jsdoc-link', a: idToText(text), $href: '#'+href});
  };

  const buildConstructor = (api, subject, {sig, intro, calls}, requireLine)=>{
    const {args, argMap} = mapArgs(sig, calls);
    let bodyExample = false;
    const examples = calls.length && {div: [
      {h1: "Example"},
      {class: 'jsdoc-example highlight', pre: [
        requireLine.cloneNode(true),
        ...calls.map(call =>{
          if (Array.isArray(call)) {
            if (! bodyExample)
              return Dom.h({div: codeToHtml(newSig(subject.name, call[0]))});;
          } else {
            bodyExample = true;
            return Dom.h({div: codeToHtml(call.body)});
          }
        })
      ]},
    ]};
    return section(api, {$name: 'constructor', section: [
      {class: "searchable", h1: defToHtml(sig)},
      {abstract: jsdocToHtml(api, intro, argMap)},
      buildParams(api, args, argMap),
      examples,
    ]});
  };

  const newSig = (name, args)=> `new ${name}(${args.map(arg => valueToText(arg)).join(", ")});`;

  const buildMethods = (api, subject, methods, requireLine, type)=>{
    return Object.keys(methods).sort().map(name => {
      const method = methods[name];
      const {sigPrefix, sig, intro, calls} = method;
      let initInst, needInit = false, sigJoin, inst;
      if (type === 'proto') {
        needInit = calls.reduce((s, i)=> s || i.body === undefined, false);
        initInst = ()=>{
          if (! needInit) return [];
          needInit = false;
          const mu = codeToHtml(
            api.initInstExample || `const ${inst} = ${newSig(subject.name, subject.newInstance ? subject.newInstance.calls[0][0] : [])}`
          );
          mu.classList.add('jsdoc-inst-init');
          return [mu];
        };
        inst = subject.instanceName || subject.name[0].toLowerCase() + subject.name.slice(1);
        sigJoin = '#';
      } else {

        if (api.initExample) {
          needInit = true;
          initInst = () => {
            if (! needInit) return [];
            needInit = false;
            const mu = codeToHtml(api.initExample);
            mu.classList.add('jsdoc-init');
            return [mu];
          };
        } else
          initInst = () => [];
        inst = subject.name;
        sigJoin = type !== 'custom' && '.';
      }
      const {args, argMap} = mapArgs(sig, calls);
      const ret = argProfile(calls, call => call[1]);
      if (! util.isObjEmpty(ret.types))
        argMap[return$] = ret;

      let bodyExample = false;

      const examples = calls.length && {div: [
        {h1: "Example"},
        {class: 'jsdoc-example', pre: [
          requireLine.cloneNode(true),
          ...initInst(),
          ...calls.map(call => {
            if (Array.isArray(call)) {
              if (! bodyExample) return [
                {class: 'jsdoc-example-call highlight', div: [
                  {div: [hl(inst, 'nx'), '.', hl(name, 'na'),
                         '(', ...hlArgList(call[0]), ');']},
                  (call[2] || call[1]) === undefined || {
                    class: 'jsdoc-returns c1',
                    span: call[2] ? ` // ${call[2]}` : [' // returns ', valueToHtml(call[1])]}
                  ]}
              ];
            } else {
              bodyExample = true;
              return {class: 'jsdoc-example-call jsdoc-code-block', div: codeToHtml(call.body)};
            }
          }),
        ]}
      ]};


      const abstract = jsdocToHtml(api, intro, argMap);
      const params = buildParams(api, args, argMap);

      return section(api, {
        '$data-env': env(method),
        $name: (type === 'proto' ? '#'+name : name), section: [
          {class: "searchable", h1: sigJoin ? [`${subject.name}${sigJoin}`, defToHtml(sig)] : (
            sigPrefix ? [sigPrefix, defToHtml(sig)] : defToHtml(sig))},
          {abstract},
          params,
          examples,
        ]
      });
    });
  };

  const section = (api, div)=>{
    div.id = `${api.id}${div.$name[0]==='#' ? '' : '.'}${div.$name}`;
    div.class = `${div.class||''} jsdoc-module-section`;
    return div;
  };

  const defToHtml = (sig)=>{
    try {
      const isGenerator = sig[0] === '*';
      const elm = jsParser.highlight(
        `function _${isGenerator ? sig.slice(1) : sig} {}`,
        'span');
      elm.removeChild(elm.firstChild);
      elm.removeChild(elm.firstChild);
      elm.firstChild.textContent = (isGenerator ? '*' : '')+elm.firstChild.textContent.slice(1);
      elm.lastChild.textContent = elm.lastChild.textContent.slice(0, -3);
      return elm;
    } catch (ex) {
      return document.createTextNode(sig);
    }
  };


  const codeToHtml = codeIn => {
    try {
      return jsParser.highlight(codeIn.trim());
    } catch(ex) {
      throw ex;
      return document.createTextNode(codeIn);
    }
  };

  const mapArgs = (sig, calls)=>{
    let args;
    try {
      args = jsParser.extractParams(sig);
    } catch(ex) {
      args = [];
    }
    const argMap = {};
    let i = 0;
    let nested = 0;
    args = args.filter(arg => {
      if (arg === '{') {
        ++nested;
      } else if (arg === '}') {
        --nested;
      } else if (nested != 0) {
        argMap[arg] = argProfile(calls, call => {
          const p = call[0][i];
          if (Array.isArray(p) && p[0] === 'P') {
            return p[1][arg];
          }
        });
        return true;
      } else {
        argMap[arg] = argProfile(calls, call => call[0][i]);
        ++i;
        return true;
      }

    });
    return {args, argMap};
  };

  const buildParams = (api, args, argMap)=>{
    const ret = argMap[return$];

    if (args.length === 0 && ret === undefined)
      return;

    const retTypes = ret && ret.types && extractTypes(ret);

    const eachParam = arg => {
      const am = argMap[arg];
      if (am.optNames === undefined) {
        const types = extractTypes(am);
        return {
          class: "jsdoc-arg", tr: [
            {td: am.optional ? `[${arg}]` : arg},
            {td: types},
            {class: 'jsdoc-info', td: jsdocToHtml(api, am.info)}
          ]
        };
      } else {
        return Dom.h(Object.keys(am.optNames).map(eachParam));
      }
    };

    return {class: "jsdoc-args", div: [
      {h1: "Parameters"},
      {table: {
        tbody: [
          ...args.map(eachParam),
          ret && retTypes && {
            class: "jsdoc-method-returns", tr: [
              {td: {h1: 'Returns'}},
              {td: retTypes},
              {class: 'jsdoc-info', td: jsdocToHtml(api, ret.info)}
            ]
          }
        ],
      }},
    ]};
  };

  const extractTypes = ({types, href})=>{
    const ans = [];
    const typeMap = {};
    for (let type in types) {
      if (typeMap[types[type]]) continue;
      typeMap[types[type]] = true;
      if (ans.length != 0)
        ans.push('\u200a/\u200a');
      ans.push(targetExternal({a: idToText(types[type]), $href: (href || typeHRef)(type)}));
    }
    return ans;
  };

  const idToText = (id)=> id.replace(/\/main(?=$|\.)/, '').replace(/^.*\//, '');

  const argProfile = (calls, extract)=>{
    let optional = false, ignoreP = false;
    let types = {};
    let subArgs;

    const iterCalls = calls =>{
      calls.forEach(call => {
        if (Array.isArray(call)) {
          const entry = extract(call);
          if (entry === undefined) {
            optional = true;
          } else {
            ignoreP = false;
            if (Array.isArray(entry)) {
              let value;
              switch (entry[0]) {
              case 'O':
                value = entry[1] === 'null' ? 'null' : 'object';
                break;
              case 'P':
                value = 'object';
                const args = entry[1];
                for (const id in args) {
                  if (subArgs === undefined) subArgs  = {};
                  const sc = subArgs[id] || (subArgs[id] = {});
                  Object.assign(sc, argProfile([[]], () => args[id]).types);
                }
                break;
              case 'F': value = 'function'; break;
              case 'U': value = 'undefined'; break;
              default:
                types[`<${entry[0]}>${entry[entry.length-1]}`] = entry[entry.length-1];
                return;
              }
              types[value] = value;
              return;
            }
            if (entry === null)
              types['null'] = 'null';
            else
              types[typeof entry] = typeof entry;
          }
        } else
          call == null || iterCalls(call.calls);
      });
    };

    iterCalls(calls);

    if (ignoreP) return;

    const ans = {optional, types, type: undefined, href: typeHRef};
    if (subArgs !== undefined)
      ans.subArgs = subArgs;
    return ans;
  };

  const typeHRef = (type)=>{
    if (type[0] === '<') {
      type = type.replace(/^[^>]*>(?:\.{3})?/, '');
      let ans = hrefMap[type];
      if (ans) return ans;
    }

    if (type.startsWith('...'))
      type = type.slice(3);

    const m = /^\[([-\w]+)(?:,\.\.\.)\]$/.exec(type);
    if (m)
      type = m[1];

    let ans = hrefMap[type];
    if (ans) return ans;
    const cType = util.capitalize(type);

    const ct = CORE_TYPES[cType] || type === 'any-type';
    if (ct)
      return 'https://developer.mozilla.org/en-US/docs/'+
      (ct === true ? 'Web/JavaScript/Reference/Global_Objects/' : ct+'/') +
      (type === 'any-type' ? '' : cType);
    return '#'+type;
  };

  const valueToHtml = (arg)=>{
    const text = valueToText(arg);
    return hl(text, arg == null ? 'kc' : jsParser.HL_MAP[typeof arg] || 'ge nx');
  };

  const hlArgList = (list)=>{
    const ans = [];
    list.forEach(arg => {
      if (ans.length !== 0)
        ans.push(", ");
      ans.push(valueToHtml(arg));
    });
    return ans;
  };

  const valueToText = arg =>{
    if (Array.isArray(arg)) {
      if (arg[0] !== 'P') return arg[1];
      else {
        let ans = '{';
        const parts = arg[1];
        for (const name in parts) {
          if (ans !== '{')
            ans += ", ";
          ans += util.qlabel(name) + ": "+valueToText(parts[name]);
        }
        return ans+"}";
      }
    }
    else return JSON.stringify(arg);
  };

  const valueToLink = (arg)=> valueToText(arg);

  const targetExternal = (a)=> a.$href.indexOf("http") == 0 ? (a.$target="_blank", a) : a;

  const findTopic = (api, args)=>{
    const path = args.length == 1 ? "." : args[0];
    const name = args[args.length - 1];
    if (path !== ".") {
      const {node, fullPath} = expandLink(api[node$], path);
      api = api.top[fullPath];
    }
    const sapi = api.topics[name];
    if (sapi === void 0) throw new Error("Can't find topic "+path+":"+name+" in "+api.id+
                                         "\nFound:\n"+Object.keys(api.topics).join(", "));
    sapi[node$] = api[node$];
    sapi.top = api.top;
    return sapi;
  };


  const TEMPLATE_ACTION = {
    topic: (args, api, argMap)=>{
      const sapi = findTopic(api, args);
      return jsdocToHtml(sapi, sapi.intro, argMap).innerHTML;
    },

    example: (args, api, argMap)=>{
      const idx = +(args.pop());
      if (args.length > 0) {
        api = findTopic(api, args);
      }
      const call = api.calls[+idx];
      if (call === void 0) throw new Error("Can't find example "+idx+" in "+(api.id||api.test));
      return Dom.h({
        class: 'jsdoc-example highlight',
        pre: codeToHtml(call.body)}).outerHTML;
    },
  };

  const jsdocToHtml = (api, text, argMap, env=api)=>{
    const div = document.createElement('div');
    const [info, ...blockTags] = (text||'').split(/[\n\r]\s*@(?=\w+)/);

    mdRenderer.link = (href, title, text)=>{
      switch (href) {
      case '#jsdoc-tag':
        return execInlineTag(api, text).outerHTML;
      default:
        const a = {a: text, $href: href};
        if (title) a.$title = title;
        return Dom.h(targetExternal(a)).outerHTML;
      }
    };

    const md = marked.parse(
      info.replace(/\{#([^}{]*)\}/g, '[$1](#jsdoc-tag)'),

      mdOptions
    );

    div.innerHTML = md.replace(/\{\{.*?\}\}/g, (m)=>{
      if (m[2] === '{')
        return m.slice(1);
      const [cmd, ...args] = m.slice(2,-2).split(':');
      const action = TEMPLATE_ACTION[cmd];
      if (action === void 0)
        return m;
      else
        return action(args, env, argMap);
    });

    if (blockTags.length && argMap) {
      blockTags.forEach(row => {
        const tag = /^\w+/.exec(row);
        if (tag) {
          const tagFunc = BLOCK_TAGS[tag[0]];
          tagFunc && tagFunc(api, row, argMap, div);
        }
      });
    }

    return div;
  };

  const hl = (text, hl)=>{
    const span = document.createElement('span');
    span.className = hl;
    span.textContent = text;
    return span;
  };

  const buildLinks = (parent, list)=>{
    let prevId = '', nodeModule;

    const idToLink = (id)=>{
      let text = id.replace(/\/main(?=\.|::|$)/, '').split(/([\/\.]|::)/);
      prevId = prevId.replace(/\/main(?=\.|::|$)/, '').split(/([\/\.]|::)/);
      const len = Math.min(text.length, prevId.length);
      let i = 0;
      for(; i < len; ++i) {
        if (text[i] !== prevId[i]) break;
      }
      if (i === 0) {
        text = text.join('');
      } else {
        switch (text[i]) {
        case '::': case '.':
          return {a: text.slice(i).join(''), class: "jsdoc-idLink", $href: '#'+id};
        case '/': ++i;
        default:
          text = Dom.h({span: [
            {class: 'jsdoc-nav-spacer', span: new Array(i).join("\xa0")},
            text.slice(i).join('')
          ]});
        }
      }

      return Dom.h({a: text, class: "jsdoc-idLink", $href: '#'+id});
    };

    list.forEach(([id, linkNav]) => {
      const link = idToLink(id);
      (link.nodeType ? parent : nodeModule)
        .appendChild(nodeModule = Dom.h({class: 'jsdoc-nav-module', div: [
          link,
          linkNav,
        ]}));
      prevId = id;
    });
  };

  const findHref = (node, href, returnOnFirst)=>{
    let ans = returnOnFirst ? undefined : [];
    Dom.walkNode(node, node => {
      switch(node.nodeType) {
      case document.TEXT_NODE: case document.COMMENT_NODE:
        return false;
      default:
        if (node.tagName === 'A' && node.getAttribute('href') === href) {
          if (returnOnFirst) {
            ans = node;
            return true;
          } else
            ans.push(node);
        }
      }
    });

    return ans;
  };

  apiToHtml.jsdocToHtml = jsdocToHtml;
  apiToHtml.makeTree = makeTree;

  apiToHtml[private$] = {
    parent$,
    node$,
  };

  return apiToHtml;
});
