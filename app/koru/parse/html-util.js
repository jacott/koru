define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom');
  const HTMLParser      = require('koru/parse/html-parser');

  const hl = (text, ht)=>{
    const span = document.createElement('span');
    span.className = ht;
    span.textContent = text;
    return span;
  };

  const mapAttrs = (attrs)=>{
    const ans = [];
    for (const n in attrs) {
      ans.push(' ', hl(n, 'nv'));
      if (attrs[n] !== '') ans.push('=', hl(`"${attrs[n]}"`, 's'));
    }
    return ans;
  };


  return {
    highlight: (code)=>{
      const ans = document.createElement('div');

      ans.className = 'highlight';

      HTMLParser.parse(code, {
        onopentag: (name, attrs)=>{
          ans.appendChild(Dom.h(["<", hl(name, 'nf'), mapAttrs(attrs), ">"]));
        },
        ontext: (c, s, e)=>{
          const text = c.slice(s,e);
          const re = /\&(?:#\d+|[a-z]+);/gi;
          let m = null;
          let i = 0;
          while (m = re.exec(text)) {
            ans.appendChild(Dom.h(text.slice(i, re.lastIndex-m[0].length)));
            i = re.lastIndex;
            ans.appendChild(hl(m[0], 'ss'));
          }
          ans.appendChild(Dom.h(i == 0 ? text : text.slice(i)));
        },
        onclosetag: name =>{
          ans.appendChild(Dom.h(["</", hl(name, 'nf'), ">"]));
        },
      });
      return ans;
    }
  };
});
