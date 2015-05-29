define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Random = require('../random');
  var session = require('../session/base');
  var Val = require('./validation');
  var driver = require('../config!DBDriver');
  var Query = require('./query');
  var WeakIdMap = require('../weak-id-map');

  var _support, BaseModel;

  var uniqueIndexes = {}, indexes = {};

  var ModelEnv = {
    destroyModel: function (model, drop) {
      if (! model) return;
      if (drop === 'drop')
        model.db.dropTable(model.modelName);
      model.db = model.docs = null;

      delete uniqueIndexes[model.modelName];
      delete indexes[model.modelName];
    },

    init: function (_BaseModel, _baseSupport, modelProperties) {
      BaseModel = _BaseModel;
      _support = _baseSupport;
      modelProperties.findById = findById;
      modelProperties.findAttrsById = findAttrsById;
      modelProperties._$setWeakDoc = setWeakDoc;
      modelProperties._$getWeakDoc = getWeakDoc;
      modelProperties.addUniqueIndex = addUniqueIndex;
      modelProperties.addIndex = addIndex;

      function addUniqueIndex() {
        prepareIndex(uniqueIndexes, this, arguments);
      }

      function ensureIndex(model, args, opts) {
        if (util.Fiber.current) ensureIndex();
        else util.Fiber(ensureIndex).run();

        function ensureIndex() {
          model.docs.ensureIndex(buidlKeys(args), opts);
        }
      }

      function addIndex() {
        prepareIndex(indexes, this, arguments);
      }

      function prepareIndex(type, model, args) {
        var name = model.modelName;
        var queue = type[name] || (type[name] = []);
        queue.push(args);
      }

      function _ensureIndexes(type, options) {
        for(var name in type) {
          var queue = type[name];
          var model = BaseModel[name];
          util.forEach(queue, function (args) {
            ensureIndex(model, args, options);
          });
        }
      }

      function ensureIndexes () {
        _ensureIndexes(uniqueIndexes, {unique : true, sparse: true});
        _ensureIndexes(indexes);
      }

      Object.defineProperty(BaseModel, 'ensureIndexes', {enumerable: false, value: ensureIndexes});

      BaseModel.prototype.$remove =  function () {
        return new Query(this.constructor).onId(this._id).remove();
      };

      ModelEnv.save = function (doc) {
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
      };

      ModelEnv.put = function (doc, updates) {
        session.rpc('put', doc.constructor.modelName, doc._id, updates);
      };

      session.defineRpc("save", function (modelName, id, changes) {
        Val.assertCheck(id, 'string', {baseName: '_id'});
        Val.assertCheck(modelName, 'string', {baseName: 'modelName'});
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
        resetDocs: function (model) {
          if (_resetDocs.hasOwnProperty(model.modelName))
            _resetDocs[model.modelName]();
        },
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
      model._$wm = new WeakIdMap();
      model._$removeWeakDoc = function(doc, force) {
        model._$wm.delete(doc._id);
      };

      _resetDocs[model] = function () {docs = null};

      var docs, db;
      util.extend(model, {
        get docs() {
          return docs = docs || this.db.table(model.modelName, model.$fields);
        },
        get db() {
          return db = db || driver.defaultDb;
        },
      });
    },

    insert: function (doc) {
      var model = doc.constructor;
      model.docs.insert(doc.attributes);
      model._$setWeakDoc(doc.attributes);
      BaseModel._callAfterObserver(doc, null);
      model.notify(doc, null);
    },

    _insertAttrs: function (model, attrs) {
      model.docs.insert(attrs);
      model._$setWeakDoc(attrs);
    },
  };

  var _resetDocs = {};

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

  function findAttrsById(id) {
    if (! id) return;
    if (typeof id !== 'string') throw new Error('invalid id: '+ id);
    var doc = this._$getWeakDoc(id);
    if (! doc) {
      doc = this.docs.findOne({_id: id});
      doc && this._$setWeakDoc(doc);
    }
    return doc;
  }

  function findById(id) {
    var doc = this.findAttrsById(id);
    if (doc) return new this(doc);
  }

  function getWeakDoc(id) {
    return this._$wm.get(id);
  }

  function setWeakDoc(doc) {
    this._$wm.set(doc);
  }

  return ModelEnv;
});
