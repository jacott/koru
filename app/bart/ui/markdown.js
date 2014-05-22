define(function(require, exports, module) {
  var util = require('../util');

  var output, needspace, Markdown;

  return Markdown = {
    fromHtml: function (html) {
      output = []; needspace = false;
      html && outputChildNodes(html, '*');
      var result = output.join('');
      output = null;
      return result;
    },

    toHtml: function (md, wrapper) {
      md = md || '';
      var hypherlinks = Markdown.findHyperLinks(md);
      var mdlen = md.length;
      var index = 0;
      var lookfor = [];
      var frag = wrapper ? document.createElement(wrapper) : document.createDocumentFragment();
      var elm = frag;
      var token, mention;
      var hlidx =  0;
      var hlStart = hypherlinks.length ? hypherlinks[0][0] : mdlen;
      var hlEnd = null;
      while (index < mdlen) {

        // End of <a> textContent
        if (hlEnd === index) {
          var href = hypherlinks[hlidx][2];
          if (mention) {
            elm.setAttribute('data-'+ (mention === '@' ? 'a' : 'h'), href);
            elm.setAttribute('contenteditable', 'false');
          } else {
            elm.setAttribute('href', href);
          }
          index += href.length + 3;
          if (index === mdlen) break;
          elm = elm.parentNode;
          hlEnd = null;
          mention = null;
          hlStart = ++hlidx < hypherlinks.length ? hypherlinks[hlidx][0] : mdlen;
        }

        // Start of <a> textContent
        if (hlStart === index) {
          var link = document.createElement(mention ? 'span' : 'a');
          ++index;
          hlEnd = hlStart + hypherlinks[hlidx][1].length + 1;
          elm.appendChild(link);
          elm = link;
        }

        switch(md[index]) {
        case '\\':
          ++index;
          textContent();
          break;
          // <b> and <i>
        case '*': case '_':
          if ((index !== 0 && md[index - 1].match(/[A-Za-z0-9*_]/) && (lookfor.length === 0 || (md[index + 1]||'').match(/[A-Za-z0-9]/)))) {
            textContent();
            break;
          }
          token = md[index];
          if (md[++index] === token) {
            ++index;
            token = token+token;
          }

          if (lookfor.length && lookfor[lookfor.length - 1] == token) {
            --lookfor.length;
            elm = elm.parentNode;
          } else {
            var i = document.createElement(token.length === 1 ? 'i' : 'b');
            elm.appendChild(i);
            elm = i;
            lookfor.push(token);
          }
          break;

          // <br> and <div>
        case '\n':
          ++index;
          if (elm.nodeType === document.DOCUMENT_FRAGMENT_NODE || elm.tagName === 'DIV') {
            var div =  document.createElement('div');
            var cur = (elm.parentNode || elm);
            if (! elm.firstChild)
              elm.appendChild(document.createElement('br'));
            cur.appendChild(div);
            elm = div;
          } else {
            elm.appendChild(document.createElement('br'));
          }
          break;

        default:
          textContent();
        }
      }
      return frag;

      function textContent() {
        var len = (hlEnd || hlStart);
        for(var i = index + 1; i < len && ! md[i].match(/[\\*_\n]/); ++i) {}

        var atHash = false;

        if (i > 0 && i === hlStart && md[i-1].match(/[@#]/)) {
          atHash = true;
          mention = md[i-1];
        }

        if (i > index) {
          if (elm.lastChild && elm.lastChild.nodeType === document.TEXT_NODE) {
            elm.lastChild.textContent += md.slice(index, atHash ? i-1 : i);
          } else {
            var tn = document.createTextNode(md.slice(index, atHash ? i-1 : i));
            elm.appendChild(tn);
          }
          index = i;
        }
      }
    },

    getMentionIds: function (md) {
      var hypherlinks = this.findHyperLinks(md);

      for(var i = 0; i < hypherlinks.length; ++i) {
        hypherlinks[i] = hypherlinks[i][2];
      }

      return hypherlinks;
    },

    findHyperLinks: function(md) {
      var m, re = /\[([\s\S]*?)\]\(([^)]*)\)/g;
      var m2, re2 = /[\[\]]/g;
      var result = [];
      while ((m = re.exec(md)) !== null) {
        re2.lastIndex = 0;
        var nest = 1;
        var lstart = m.index;
        var mi = 0;
        while ((m2 = re2.exec(m[1])) !== null) {
          if (m2[0] === ']') nest > 0 && --nest;
          else if (++nest === 1) {
            mi = re2.lastIndex;
            lstart += mi;
          }
        }
        result.push([lstart, mi ? m[1].slice(mi) : m[1], m[2]]);
      }
      return result;
    },
  };

  function fromHtml(html, flag) {
    switch(html.nodeType) {
    case document.TEXT_NODE:
      spaceIfNeeded(html.textContent);
      output.push(html.textContent.replace(/ /g, ' ').replace(/([^\w*])([\\_*[])/, '$1\\$2'));
      break;
    case document.ELEMENT_NODE:
      switch(html.tagName) {

      case 'B': case 'STRONG':
        stressText(html, flag + flag);
        break;

      case 'I': case 'EM':
        stressText(html, flag);
        break;

      case 'SPAN':
        var id = html.getAttribute('data-a');
        if (id) {
          output.push('@[');
        } else {
          id = html.getAttribute('data-h');
          id &&  output.push('#[');
        }
        if (id) {
          outputChildNodes(html, flag);
          output.push('](' + id + ')');
          break;
        }
        outputChildNodes(html, flag);
        break;

      case 'BR':
        if (! (html.parentNode && html.parentNode.lastChild === html))
          output.push('\n');
        break;

      case 'A':
        output.push('[');
        outputChildNodes(html, flag);
        output.push('](' + html.getAttribute('href') + ')');
        break;

      case 'DIV':
        output.push('\n');
        if (html.firstChild && html.firstChild.tagName === 'BR' && html.firstChild === html.lastChild) {
        } else {
          outputChildNodes(html, flag);
        }
        break;
      case 'P':
        output.push('\n\n');
        outputChildNodes(html, flag);
        break;
      default:
        outputChildNodes(html, flag);
        break;
      }
    }
  }

  function spaceIfNeeded(text) {
    needspace && text.match(/^\S/) && output.push(' ');
    needspace = false;
  }

  function stressText(html, flags) {
    if (output.length && output[output.length -1].match(/\S$/))
      output.push(' ');

    needspace = false;
    var flag = flags[0];
    output.push(flags);
    outputChildNodes(html, flipFlag(flag));
    output.push(flags);
    needspace = true;
  }

  function outputChildNodes(html, flag) {
    var children = html.childNodes;

    for(var i = 0; i < children.length; ++i) {
      var row = children[i];
      fromHtml(row, flag);
    }
  }

  function flipFlag(flag) {
    return flag === '*' ? '_' : '*';
  }
});
