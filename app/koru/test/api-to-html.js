define(function(require, exports, module) {
  const marked = requirejs.nodeRequire('marked');
  const koru     = require('koru');
  const Dom      = require('koru/dom');
  const htmlDoc  = require('koru/dom/html-doc');
  const jsParser = require('koru/parse/js-parser');
  const util     = require('koru/util');
  const generate = requirejs.nodeRequire('babel-generator').default;
  const traverse = requirejs.nodeRequire('babel-traverse').default;
  const {parse}  = requirejs.nodeRequire('babylon');

  const meta = noContent('meta');
  const link = noContent('link');
  const script = noContent('script');
  const async = 'async';

  const tagRe = /(\{@\w+\s*[^}]*\})/;
  const tagPartsRe = /\{@(\w+)\s*([^}]*)\}/;

  const TAGS = {
    module(api, data) {
      return idToLink(data);
    },

    method(api, data) {
      return Dom.h({a: data+'()', $href: `#${api.id}:${data}`});
    }
  };

  const hrefMap = {
    Module: 'https://www.npmjs.com/package/yaajs#api_Module',
  };


  function execTag(api, tagName, data) {
    const tag = TAGS[tagName];
    return tag ? tag(api, data) : document.createTextNode(`{@${tagName} ${data}}`);
  }

  function noContent(tag) {
    return function (opts) {
      const attrs = {[tag]: ''};
      for (const attr in opts)
        attrs['$'+attr] = opts[attr];
      return Dom.h(attrs);
    };
  }

  module.exports = toHtml;

  function toHtml(title, json, sourceHtml) {
    const index = document.createElement();

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

    Object.keys(json).sort().forEach(id => {
      const api = json[id]; api.id = id;
      const {subject, newInstance, properties, methods, protoMethods} = api;
      const requireLine = Dom.h({class: 'jsdoc-require highlight', div: [
        hl('const', 'kd'), ' ', hl(subject.name, 'nx'), ' ', hl('=', 'o'), ' ',
        hl('require', 'k'), '(', hl(`"${id}"`, 's'), ');'
      ]});

      const idIdx = subject.ids.indexOf(id);

      const constructor = newInstance && buildConstructor(api, subject, newInstance, requireLine);
      let functions = [];
      util.isObjEmpty(methods) ||
        (functions = functions.concat(buildMethods(api, subject, methods, requireLine)));
      util.isObjEmpty(protoMethods) ||
        (functions = functions.concat(buildMethods(api, subject, protoMethods, requireLine, 'proto')));

      links.appendChild(Dom.h({class: 'jsdoc-nav-module', div: [
        idToLink(id),
        {nav: [constructor, ...functions].map(func => func && Dom.h({a: func.$name, $href: '#'+func.id}))},
      ]}));
      pages.appendChild(Dom.h({
        id: id,
        class: "jsdoc-module",
        section: [
          {class: 'jsdoc-module-title', h2: subject.name},
          {abstract: jsdocToHtml(api, subject.abstracts[idIdx])},
          {div: [
            constructor,
            properties && buildProperties(api, subject, properties),
            functions.length && {class: 'jsdoc-methods', div: [
              {h4: "Methods"},
              {div: functions},
            ]},
          ]},
          // {pre: JSON.stringify(json, null, 2)}
        ],
      }));
    });

    return index.innerHTML;
  };

  function buildProperties(api, subject, properties) {
    const rows = [];
    addRows(properties);

    function addRows(properties) {
      const argMap = {};
      for (const name in properties) {
        const property = properties[name];
        const info = jsdocToHtml(api, property.info, argMap);
        rows.push({tr: [
          {td: name},
          {td: info}
        ]});

        property.properties && addRows(property.properties);
      }
    }

    return {class: 'jsdoc-properties', div: [
      {h5: 'Properties'},
      {table: {tbody: rows}}
    ]};
  }

  function buildConstructor(api, subject, {sig, intro, calls}, requireLine) {
    const {args, argMap} = mapArgs(sig, calls);
    const examples = calls.length && {div: [
      {h6: "Example"},
      {class: 'jsdoc-example highlight', pre: [
        requireLine.cloneNode(true),
        ...calls.map(call => Dom.h({
          div: Array.isArray(call) ?
            newSig(subject.name, call[0]) : codeToHtml(call.body)
        }))
      ]},
    ]};
    return section(api, {$name: 'constructor', div: [
      {h4: sig},
      {abstract: jsdocToHtml(api, intro, argMap)},
      buildParams(api, args, argMap),
      examples,
    ]});
  }

  function newSig(name, args) {
    return `new ${name}(${args.map(arg => valueToText(arg)).join(", ")});`;
  }

  function buildMethods(api, subject, methods, requireLine, proto) {
    if (proto) {
      var needInit = true;
      var initInst = function () {
        if (! needInit) return [];
        needInit = false;
        return [
          {div: `const ${inst} = ${newSig(subject.name, subject.newInstance ? subject.newInstance.calls[0][0] : [])}`}
        ];
      };
      var inst = subject.instanceName || subject.name[0].toLowerCase() + subject.name.slice(1);
      var sigJoin = '#';
    } else {
      var initInst = () => [];
      var inst = subject.name;
      var sigJoin = '.';
    }
    return Object.keys(methods).map(name => {
      const {sig, intro, calls} = methods[name];
      const {args, argMap} = mapArgs(sig, calls);
      const examples = calls.length && {
        div: [
          {h6: "Example"},
          {class: 'jsdoc-example', pre: [
            requireLine.cloneNode(true),
            ...calls.map(call => Array.isArray(call) ? {div: [
              ...initInst(),
              {class: 'jsdoc-example-call highlight', div: [
                {div: [hl(inst, 'nx'), '.', hl(name, 'na'),
                       '(', ...hlArgList(call[0]), ');']},
                call[1] && {class: 'jsdoc-returns c1',
                            span: [' // returns ', valueToHtml(call[1])]}
              ]}
            ]} : {class: 'jsdoc-example-call', div: codeToHtml(call.body)}),
          ]}
        ]};

      return section(api, {$name: proto ? '#'+name : name, div: [
          {h5: `${subject.name}${sigJoin}${sig}`},
          {abstract: jsdocToHtml(api, intro, argMap)},
          buildParams(api, args, argMap),
          examples,
        ]
      });
    });
  }

  function section(api, div) {
    div.id = `${api.id}:${div.$name}`;
    div.class = `${div.class||''} jsdoc-module-section`;
    return div;
  }

  function codeToHtml(codeIn) {
    return jsParser.highlight(codeIn);
  }

  function mapArgs(sig, calls) {
    sig = '_x_'+sig.replace(/^function\s*/, '');
    try {
      var ast = parse(sig);
    } catch(ex) {
      const msg = `Error parsing ${sig}`;
      if (ex.name === 'SyntaxError')
        throw new Error(`${msg}:\n${ex}`);
      koru.error(msg);
      throw ex;
    }
    let args;
    const argMap = {};
    traverse(ast, {
      CallExpression (path) {
        args = path.node.arguments.map((arg, i) => {
          switch (arg.type) {
          case 'AssignmentExpression':
            arg = arg.left;
            if (arg.type !== 'Identifier')
              throw new Error("Unsupported arg in "+ sig );
          case 'Identifier':
            argMap[arg.name] = argProfile(calls, i, arg);
            return arg.name;
          default:
            koru.info(`unsupported node in `+sig, util.inspect(arg));

            throw new Error("Unsupported arg in "+ sig );
          }
        });
      }
    });
    return {args, argMap};
  }

  function buildParams(api, args, argMap) {
    return args && args.length && {class: "jsdoc-args", div: [
      {h6: "Parameters"},
      {table: {tbody: args.map(arg => {
        const am = argMap[arg];
        const types = [];
        for (const type in am.types) {
          if (types.length)
            types.push(' or ');
          types.push({a: am.types[type], $href: am.href(type)});
        }
        return {
          class: "jsdoc-arg", tr: [
            {td: am.optional ? `[${arg}]` : arg},
            {td: types},
            {td: jsdocToHtml(api, am.info)}
          ]
        };
      })}},
    ]};
  }

  function argProfile(calls, i, arg) {
    let optional = false;
    let types = {};

    function iterCalls(calls) {
      calls.forEach(call => {
        if (Array.isArray(call)) {
          const entry = call[0][i];
          if (entry === undefined) {
            optional = true;
          } else {
            if (Array.isArray(entry)) {
              let value;
              switch (entry[0]) {
              case 'O':
                value = entry[1] === 'null' ? 'null' : 'object';
                break;
              case 'F': value = 'function'; break;
              default:
                value = entry[entry.length-1];
                types[`<${entry[0]}>${entry[entry.length-1]}`] = value;
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
          iterCalls(call.calls);
      });
    }

    iterCalls(calls);

    for (let typeId in types) {
      var type = types[typeId];
      break;
    }
    return {optional, i, types, type, href: typeHRef};
  }

  function typeHRef(type) {
    if (type[0] === '<') {
      const [tag, value] = type.split('>');
      return hrefMap[value] || '#'+value;
    }

    return `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/${util.capitalize(type)}`;
  }

  function valueToHtml(arg) {
    const text = valueToText(arg);
    return hl(text, arg == null ? 'kc' : jsParser.HL_MAP[typeof arg] || 'ge nx');
  }

  function hlArgList(list) {
    const ans = [];
    list.forEach(arg => {
      if (ans.length !== 0)
        ans.push(", ");
      ans.push(valueToHtml(arg));
    });
    return ans;
  }

  function valueToText(arg) {
    if (Array.isArray(arg))
      return arg[1];
    else
      return JSON.stringify(arg);
  }

  function valueToLink(arg) {
    return valueToText(arg);
  }

  function jsdocToHtml(api, text, argMap) {
    const div = document.createElement('div');
    const [info, ...meta] = (text||'').split(/[\n\r]\s*@(?=\w+)/);

    if (meta.length && argMap) {
      const params = meta
              .filter(row => /^param\b/.test(row))
              .forEach(row => {
                const m = /^param\s*({[^}]+})?\s*(\[)?(\w+)\]?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
                if (! m)
                  koru.error(`Invalid param for api: ${api.id} line @${row}`);
                const profile = argMap[m[3]] || (argMap[m[3]] = {});
                if (m[4]) profile.info = m[4];
                if (m[2]) profile.optional = true;
                if (m[1]) profile.type = m[1].slice(1,-1);
              });
    }

    info.split(/(<[^>]*>)/).forEach(part => {
      if (part[0] === '<' && part[part.length-1] === '>')
        div.appendChild(Dom.h({span: part.slice(1,-1), class: 'jsdoc-param'}));
      else {
        part.split(tagRe).forEach(p2 => {
          const m = tagPartsRe.exec(p2);
          if (m) {
            div.appendChild(execTag(api, m[1], m[2]));
          } else
            markdown(div, p2);
        });
      }
    });
    return div;
  }

  toHtml.markdown = markdown;

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  function markdown(div, text) {
    if (! text) return;

    if (text.endsWith('\n'))
      text=text.slice(0, -1)+' \n';
    const tokens = marked.lexer('x '+text, {});
    const oneToken = tokens.length === 1;
    const html = '<p>'+marked.parser(tokens).slice(5);
    const nodes = oneToken ? [Dom.html(html)] : Dom.html(`<div>${html}</div>`).childNodes.slice(0);

    const fcs = nodes[0].childNodes.slice(0);
    if (fcs[0] && fcs[0].textContent)
      div.appendChild(fcs[0]);
    for(let i = 1; i < fcs.length; ++i) {
      div.appendChild(fcs[i]);
    }

    for(let i = 1; i < nodes.length; ++i) {
      div.appendChild(nodes[i]);
    }
  }

  function hl(text, hl) {
    const span = document.createElement('span');
    span.className = hl;
    span.textContent = text;
    return span;
  }

  function idToLink(id) {
    return Dom.h({a: id, class: "jsdoc-idLink", $href: '#'+id});
  }
});
