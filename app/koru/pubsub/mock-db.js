define((require, exports, module)=>{
  'use strict';
  const Changes         = require('koru/changes');
  const makeSubject     = require('koru/make-subject');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const TH              = require('koru/test-helper');

  const {stub, onEnd} = TH;

  const noIndex = makeSubject({});

  class MockModel {
    constructor(attrs) {
      this._id = attrs._id;
      this.attributes = attrs;
    }

    get name() {return this.attributes.name}
    get state() {return this.attributes.state}
    get updatedAt() {return this.attributes.updatedAt}

    $invertChanges(beforeChange) {
      return Changes.extractChangeKeys(this.attributes, beforeChange);
    }
    $clearCache() {}

    static get _indexUpdate() {return noIndex}

    static create(opts) {
      const _id = this.modelName.toLowerCase()+(++this.seq);
      let name, attrs;
      if (typeof opts !== 'object') {
        name = opts;
        attrs = {_id, name};
      } else {
        attrs = opts;
        name = attrs.name;
        if (attrs._id === void 0) attrs._id = _id;
      }
      if (attrs.name === void 0) attrs.name = this.modelName+' '+this.seq;
      const doc = this.docs[_id] = new this(attrs);
      this.notify(DocChange.add(doc));
      return doc;
    }
  }

  class MockDB {
    constructor(models) {
      this.origModels = {};
      this.models = {};
      for (const name of models) {
        this.origModels[name] = ModelMap[name];
        const model = class extends MockModel {};
        model.modelName = name;
        model.docs = {};
        makeSubject(model);
        model.seq = 0;
        model.query = {
          forEach: func =>{
            for (const _id in model.docs) {
              func(model.docs[_id]);
            }
          }
        };

        this.models[name] = ModelMap[name] = model;
      }

      onEnd(()=>{
        for (const name of models) {
          const orig = this.origModels[name];
          if (orig === void 0)
            delete ModelMap[name];
          else
            ModelMap[name] = orig;
        }
      });
    }

    change(doc) {
      const undo = {name: doc.name};
      const name = doc.attributes.name = "name change";
      ModelMap[doc.constructor.modelName].notify(DocChange.change(doc, undo));
      return {doc, changes: {name}};
    }

    remove(doc) {
      const model = ModelMap[doc.constructor.modelName];
      delete model.docs[doc._id];
      model.notify(DocChange.delete(doc));
    }
  }

  return MockDB;
});
