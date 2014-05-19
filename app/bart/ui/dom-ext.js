Bart.autoUpdate = function (ctx, options) {
  options = options || {};
  var subject = options.subject || ctx.data;
  if (! subject || ! subject._id) return;
  ctx.onDestroy(subject.constructor.Index.observe(function (doc, old) {
    if (! doc) {
      old._id === subject._id && options.removed && options.removed();
    } else if (doc._id === subject._id) {
      subject.$reload();
      ctx.updateAllTags();
    }
  }));
};
