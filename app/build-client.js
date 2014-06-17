define(function(require, exports, module) {
  require('koru/client');
  require('koru/user-account');
  require('koru/model');
  require('koru/model/validator!associated:generic:inclusion:length:required:text:unique');
});
