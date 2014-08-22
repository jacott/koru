define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Random = require('../random');
  var session = require('../session/base');
  var Val = require('./validation');
  var mongoDb = require('../mongo/driver');
  var Query = require('./query');

  var save, _support, BaseModel;

  var modelEnv = {
    $save: function(force) {
      var doc = this;
      doc.$isValid();
      if (force === 'force' || !doc._errors)
        return save(doc);

      return false;
    },

    $$save: function() {
      var doc = this;
      doc.$assertValid();

      return save(doc);
    },

    destroyModel: function (model, drop) {
      if (! model) return;
      if (drop === 'drop')
        mongoDb.defaultDb.dropCollection(model.modelName);
      model.docs = null;
    },

    init: function (_BaseModel, _baseSupport, modelProperties) {
      BaseModel = _BaseModel;
      _support = _baseSupport;
      modelProperties.findById = findById;

      modelProperties.addUniqueIndex = addUniqueIndex;
      modelProperties.addIndex = addIndex;

      BaseModel.prototype.$remove =  function () {
        BaseModel._callBeforeObserver('beforeRemove', this);
        return new Query(this.constructor).onId(this._id).remove();
      };

      save = function (doc) {
        if (util.isObjEmpty(doc.changes)) return doc;
        var model = doc.constructor;
        var _id = doc._id;
        var changes = doc.changes;
        var now = util.newDate();
        doc.changes = {};

        BaseModel._updateTimestamps(changes, model.updateTimestamps, now);
        if(doc.attributes._id == null) {
          changes._id = changes._id || Random.id();
          BaseModel._addUserIds(changes, model.userIds, util.thread.userId);
          BaseModel._updateTimestamps(changes, model.createTimestamps, now);

          changes = util.extend(doc.attributes, changes);
          _support.performInsert(doc);
        } else {
          var copy = util.deepCopy(changes);
          _support.performUpdate(doc, changes);

          // This a bit of a hack; should we bother?
          util.applyChanges(doc.attributes, copy);
        }

        return doc;
      };

      session.defineRpc("save", function (modelName, id, changes) {
        Val.ensureString(id);
        Val.ensureString(modelName);
        var model = BaseModel[modelName];
        Val.allowIfFound(model);
        var doc = model.findById(id);
        if (! doc) {
          doc = new model();
          changes._id = id;
        }

        doc.changes = changes;
        Val.allowAccessIf(this.userId && doc.authorize);
        doc.authorize(this.userId);
        doc.$assertValid();
        doc.$save();
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      session.defineRpc("remove", function (modelName, id) {
        Val.ensureString(id);
        Val.ensureString(modelName);
        var model = BaseModel[modelName];
        Val.allowIfFound(model);
        var doc = model.findById(id);
        Val.allowIfFound(doc);
        Val.allowAccessIf(this.userId && doc.authorize);
        doc.authorize(this.userId, {remove: true});
        doc.$remove();
      });

      util.extend(_support, {
        bumpVersion: function () {
          _support.performBumpVersion(this.constructor, this._id,this._version);
        },

        remote: function (name, func) {
          return function (/* arguments */) {
            Val.allowAccessIf(this.userId);
            return func.apply(this,arguments);
          };
        },
      });
    },

    setupModel: function (model) {
      var docs;
      Object.defineProperty(model, 'docs', {
        get: function () {
          return docs = docs || mongoDb.defaultDb.collection(model.modelName);
        }
      });
    },

    insert: function (doc) {
      var model = doc.constructor;
      model.docs.insert(doc.attributes);
      BaseModel._callAfterObserver(doc, null);
      model.notify(doc, null);
    },

    _insertAttrs: function (model, attrs) {
      model.docs.insert(attrs);
    },
  };

  function addUniqueIndex() {
    ensureIndex(this, arguments, {unique : true, sparse: true});
  }

  function ensureIndex(model, args, opts) {
    if (util.Fiber.current) ensureIndex();
    else util.Fiber(ensureIndex).run();

    function ensureIndex() {
      model.docs.ensureIndex(buidlKeys(args), opts);
    }
  }

  function addIndex() {
    ensureIndex(this, arguments);
  }

  function buidlKeys(args) {
    var keys = {};
    for(var i = 0; i < args.length; ++i) {
      var name = args[i];
      if (typeof args[i + 1] === 'number')
        keys[name] = args[++i];
      else
        keys[name] = 1;
    }
    return keys;
  }

  function findById(id) {
    if (! id) return;
    if (typeof id !== 'string') throw new Error('invalid id: '+ id);
    var doc = this.docs.findOne({_id: id});
    if (doc) return new this(doc);
  }

  return modelEnv;
});
