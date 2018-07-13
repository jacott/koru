define((require)=>{
  const Dom             = require('../dom');

  Dom.autoUpdate = (ctx, options)=>{
    options = options || {};
    const subject = options.subject || ctx.data;
    if (! subject || ! subject._id) return;
    ctx.onDestroy(subject.constructor.onChange((doc, was) => {
      if (! doc) {
        was === subject && options.removed && options.removed();
      } else if (doc === subject) {
        subject.$reload();
        ctx.updateAllTags();
      }
    }));
  };

  return Dom;
});
