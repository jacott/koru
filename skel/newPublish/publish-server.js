define(function(require, exports, module) {
  const publish = require('koru/session/publish');

  const $$modelName$$ = require('models/$$modelModule$$');

  publish(module, '$$publishName$$', function () {
    const sendUpdate = this.sendUpdate.bind(this);

    $$modelName$$.onChange(sendUpdate);
    $$modelName$$.query.forEach(doc => sendUpdate(doc));
  });
});
