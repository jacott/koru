define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const CSSCompiler     = require('koru/css/less-compiler');
  const TemplateCompiler = require('koru/dom/template-compiler-server');
  const session         = require('koru/session');

  module.onUnload(koru.reload);

  return koru;
});
