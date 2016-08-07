define(function(require, exports, module) {
  const marked = requirejs.nodeRequire('marked');
  const koru     = require('koru');
  const Dom      = require('koru/dom');
  const htmlDoc  = require('koru/dom/html-doc');
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
    module(data) {
      return idToLink(data);
    }
  };

  function execTag(tagName, data) {
    const tag = TAGS[tagName];
    return tag ? tag(data) : document.createTextNode(`{@${tagName} ${data}}`);
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
      const {subject, newInstance, properties, methods, protoMethods} = json[id];
      const requireLine = Dom.h({class: 'jsdoc-require', div: [`const ${subject.name} = require('`, idToLink(id),`');`]});

      const idIdx = subject.ids.indexOf(id);

      let functions = [];
      util.isObjEmpty(methods) ||
        (functions = functions.concat(buildMethods(id, subject, methods, requireLine)));
      util.isObjEmpty(protoMethods) ||
        (functions = functions.concat(buildMethods(id, subject, protoMethods, requireLine, 'proto')));

      links.appendChild(idToLink(id));
      pages.appendChild(Dom.h({
        id: id,
        class: "",
        section: [
          {h2: subject.name},
          {abstract: jsdocToHtml(subject.abstracts[idIdx])},
          {div: [
            newInstance && buildConstructor(id, subject, newInstance, requireLine),
            properties && buildProperties(id, subject, properties),
            functions && {div: [
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

  function buildProperties(id, subject, properties) {
    const rows = [];
    addRows(properties);

    function addRows(properties) {
      const argMap = {};
      for (const name in properties) {
        const property = properties[name];
        const info = jsdocToHtml(property.info, argMap, id);
        rows.push({tr: [
          {td: name},
          {td: info}
        ]});

        property.properties && addRows(property.properties);
      }
    }

    return {div: [
      {h5: 'Properties'},
      {table: {tbody: rows}}
    ]};
  }

  function buildConstructor(id, subject, {sig, intro, calls}, requireLine) {
    const {args, argMap} = mapArgs(sig, calls);
    const examples = calls.length && {div: [
      {h6: "Example"},
      {class: 'jsdoc-example', pre: [
        requireLine.cloneNode(true),
        ...calls.map(call => Dom.h({
          div: newSig(subject.name, call[0]),
        }))
      ]},
    ]};
    return {div: [
      {h5: sig},
      {abstract: jsdocToHtml(intro, argMap, id)},
      buildParams(args, argMap),
      examples,
    ]};
  }

  function newSig(name, args) {
    return `new ${name}(${args.map(arg => valueToText(arg)).join(", ")});`;
  }

  function buildMethods(id, subject, methods, requireLine, proto) {
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
        const examples = calls.length && {div: [
          {h6: "Example"},
          {class: 'jsdoc-example', pre: [
            requireLine.cloneNode(true),
            ...calls.map(call => Dom.h({
              div: Array.isArray(call) ?
                [...initInst(),
                 {class: 'jsdoc-example-call', div: [
                   {span: `${inst}.${name}(${call[0].map(arg => valueToText(arg)).join(", ")});`},
                   call[1] && {class: 'jsdoc-returns', span: ` // returns ${valueToLink(call[1])}`}
                 ]}
                ]
              : codeToHtml(call.body),
            })),
          ]}
        ]};

        return {
          div: [
            {h5: `${subject.name}${sigJoin}${sig}`},
            {abstract: jsdocToHtml(intro, argMap, id)},
            buildParams(args, argMap),
            examples,
          ]
        };
    });
  }

  function codeToHtml(codeIn) {
    if (! codeIn) return;
    var ast = parse(codeIn);
    const {code} = generate(ast, {
      comments: true,
      compact: false,
      sourceMaps: false,
    }, []);
    return {div: code};
  }

  function mapArgs(sig, calls) {
    sig = /^function\b/.test(sig) ? `(${sig}{})()` : '__'+sig;
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
        path.shouldSkip = true;
        args = path.node.arguments.map((arg, i) => {
          if (arg.type === 'Identifier') {
            argMap[arg.name] = argProfile(calls, i, arg);
            return arg.name;
          }
        });
      }
    });
    return {args, argMap};
  }

  function buildParams(args, argMap) {
    return args && args.length && {class: "jsdoc-args", div: [
      {h6: "Parameters"},
      {table: {tbody: args.map(arg => {
        const am = argMap[arg];
        return {
          class: "jsdoc-arg", tr: [
            {td: am.optional ? `[${arg}]` : arg},
            {td: {a: am.type, $href: am.href}},
            {td: am.info}
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
              case 'O': value = 'object'; break;
              case 'F': value = 'function'; break;
              default: value = entry[entry.length-1];
              }
              types[`${entry[0]}:${entry[entry.length-1]}`] = value;
            } else {
              types[typeof entry] = typeof entry;
            }
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
    const href = `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/${util.capitalize(type)}`;
    return {optional, i, types, type, href};
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

  function jsdocToHtml(text, argMap, apiId) {
    const div = document.createElement('div');
    const [info, ...meta] = (text||'').split(/[\n\r]\s*@(?=\w+)/);

    if (meta.length) {
      const params = meta
              .filter(row => /^param\b/.test(row))
              .forEach(row => {
                const m = /^param\s*({[^}]+})?\s*(\[)?(\w+)\]?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
                if (! m)
                  koru.error(`Invalid param for api: ${apiId} line @${row}`);
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
            div.appendChild(execTag(m[1], m[2]));
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

  function idToLink(id) {
    return Dom.h({a: id, class: "jsdoc-idLink", $href: '#'+id});
  }
});
