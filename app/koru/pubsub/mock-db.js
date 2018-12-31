define((require, exports, module)=>{
  const Changes         = require('koru/changes');
  const makeSubject     = require('koru/make-subject');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const TH              = require('koru/test-helper');

  const {stub, onEnd} = TH;

  class MockModel {
    constructor(_id, name) {
      this._id = _id;
      this.attributes = {name};
    }

    get name() {return this.attributes.name}

    $invertChanges(beforeChange) {
      return Changes.extractChangeKeys(this.attributes, beforeChange);
    }

    static create(name) {
      const _id = this.modelName.toLowerCase()+(++this.seq);
      const doc = this.docs[_id] = new this(_id, name || this.modelName+' '+this.seq);
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
          if (orig === undefined)
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
