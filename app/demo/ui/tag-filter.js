define(function(require, exports, module) {
  var Dom = require('koru/dom');
  require('koru/ui/each');
  var Query = require('koru/model/query');

  var Todo =    require('models/todo');

  var Tpl = Dom.newTemplate(require('koru/html!./tag-filter'));
  var Tag = Tpl.Tag;

  var $ = Dom.current;

  Tpl.$helpers({
    tags() {
      if (! this.list) return;
      if (! this.tag) this.tag = 'All Items';

      var total = 0;
      var tagSummary = {};
      new Query(Todo).where({list_id: this.list._id}).forEach(function (doc) {
        var tags = doc.tags;
        ++total;
        for(var i = 0; i < tags.length; ++i) {
          var tag = tags[i];
          if (! tagSummary.hasOwnProperty(tag))
            tagSummary[tag] = 1;
          else
            ++tagSummary[tag];
        }
      });

      var frag = document.createDocumentFragment();
      frag.appendChild(Tag.$autoRender({tag_text: "All Items", count: total}));
      var names = Object.keys(tagSummary).sort();
      for(var i = 0; i < names.length; ++i) {
        var tag = names[i];
        frag.appendChild(Tag.$autoRender({tag_text: tag, count: tagSummary[tag]}));
      }
      return frag;
    },
  });

  Tag.$helpers({
    selected() {
      Dom.setClass('selected', $.ctx.parentCtx.data.tag === this.tag_text);
    },
  });

  Tpl.$events({
    'click .tag'(event) {
      Dom.stopEvent();
      var itemListCtx = Dom.getCtxById('item-list');
      $.ctx.data.tag = $.data(this).tag_text;
      itemListCtx.data.filter = $.ctx.data.tag === 'All Items' ? null: $.ctx.data.tag;
      $.ctx.updateAllTags();
      itemListCtx.updateAllTags();
    },
  });

  return Tpl;
});
