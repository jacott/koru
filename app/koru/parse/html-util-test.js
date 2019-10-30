define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy, util} = TH;

  const HtmlUtil = require('./html-util');

  const norm = text => text.replace(/<span class="(..?)">/g, '~$1#')
        .replace(/<\/span>/g, '#');
  const markup = node => '\n'+norm(node.outerHTML).replace(/^<div.*?>/, '').slice(0, -6);

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("highlight", ()=>{
      assert.equals(markup(HtmlUtil.highlight(`
<section id="id123" disabled>
  middle &quot;text&lt;
  <b>bold</b>
</section>`)),
                    `\n<br>&lt;~nf#section# ~nv#id#=~s#"id123"# ~nv#disabled#&gt;`+
                    `<br>  middle ~ss#&amp;quot;#text~ss#&amp;lt;#`+
                    `<br>  &lt;~nf#b#&gt;bold&lt;/~nf#b#&gt;`+
                    `<br>&lt;/~nf#section#&gt;`);

    });
  });
});
