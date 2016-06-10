define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Random = require('../random');
  var session = require('../session');
  var Val = require('./validation');
  var driver = require('../config!DBDriver');
  var Query = require('./query');
  var makeSubject = require('../make-subject');

  var _support, BaseModel;

  var uniqueIndexes = {}, indexes = {};

  session.registerGlobalDictionaryAdder(module, addToDictionary);

  util.extend(util, {
    get db() {
      var thread = util.thread;
      return thread.db || (thread.db = driver.defaultDb);
    },
    set db(value) {
      value = value || driver.defaultDb;
      var thread = util.thread;
      thread.db = value;
      thread.dbId = value.name;
    },
    get dbId() {return util.db.name},

    clearDbId: function () {util.db = null}
  });

  koru.onunload(module, function () {
    session.deregisterGlobalDictionaryAdder(module);
  });

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

      BaseModel.prototype.$reload = function (full) {
        var model = this.constructor;
        var doc = full ? model.docs.findOne({_id: this._id}) : model.findAttrsById(this._id);

        if (doc) {
          full && model._$docCacheSet(doc);
          this.attributes = doc;
        } else {
          model._$docCacheDelete(this);
          this.attributes = {};
        }
        this.changes = {};
        this._errors = null;
        this._cache = null;

        return this;
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
          if (! model.$fields._id.auto)
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
        var userId = this.userId;
        Val.allowAccessIf(userId);
        Val.assertCheck(id, 'string', {baseName: '_id'});
        Val.assertCheck(modelName, 'string', {baseName: 'modelName'});
        var model = BaseModel[modelName];
        Val.allowIfFound(model);
        model.docs.transaction(function () {
          var doc = model.findById(id);
          if (! doc) {
            doc = new model();
            changes._id = id;
          }

          doc.changes = changes;
          Val.allowAccessIf(doc.authorize);
          doc.authorize(userId);
          doc.$assertValid();
          doc.$save();
        });
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      session.defineRpc("remove", function (modelName, id) {
        var userId = this.userId;
        Val.allowAccessIf(userId);
        Val.ensureString(id);
        Val.ensureString(modelName);
        var model = BaseModel[modelName];
        Val.allowIfFound(model);
        model.docs.transaction(function () {
          var doc = model.findById(id);
          Val.allowIfFound(doc);
          Val.allowAccessIf(doc.authorize);
          doc.authorize(userId, {remove: true});
          doc.$remove();
        });
      });

      util.extend(_support, {
        resetDocs: function (model) {
          if (_resetDocs.hasOwnProperty(model.modelName))
            _resetDocs[model.modelName]();
        },
        bumpVersion: function () {
          _support.performBumpVersion(this.constructor, this._id,this._version);
        },

        transaction: function (model, func) {
          return model.docs.transaction(func);
        },

        remote: function (model, name, func) {
          return function (/* arguments */) {
            var conn = this;
            var args = arguments;
            return model.docs.transaction(function () {
              Val.allowAccessIf(conn.userId);
              return func.apply(conn, args);
            });
          };
        },
      });
    },

    setupModel: function (model) {

      _resetDocs[model.modelName] = function () {
        db = docs = null;
        dbMap = new WeakMap;
      };

      var notifyMap = new WeakMap;
      var anyChange = makeSubject({});

      var docCache = new WeakMap;
      var dbMap = new WeakMap;

      var docs, db;
      util.extend(model, {
        notify: function () {
          var subject = notifyMap.get(model.db);
          if (subject)
            subject.notify.apply(subject, arguments);

          anyChange.notify.apply(subject, arguments);
        },
        onAnyChange: anyChange.onChange,
        onChange: function () {
          var subject = notifyMap.get(model.db);
          subject || notifyMap.set(db, subject = makeSubject({}));

          return subject.onChange.apply(subject, arguments);
        },
        get docs() {
          if (! this.db) return;
          docs = docs || dbMap.get(db);
          if (docs) return docs;

          dbMap.set(db, docs = db.table(model.modelName, model.$fields));
          return docs;
        },
        get db() {
          var tdb = util.db;
          if (tdb !== db) {
            docs = null;
            db = tdb;
          }
          return db;
        },

        _$docCacheGet: function(id) {
          var dc = docCache.get(util.thread);
          var doc = dc && dc[id];
          return doc;
        },

        _$docCacheSet: function (doc) {
          var thread = util.thread;
          var dc = docCache.get(thread);
          dc || docCache.set(thread, dc = Object.create(null));
          dc[doc._id] = doc;
        },

        _$docCacheDelete: function(doc) {
          if (doc._id) {
            var dc = docCache.get(util.thread);
            if (dc)
              delete dc[doc._id];
          }
        },

        _$docCacheClear: function () {
          return docCache.delete(util.thread);
        },
      });
    },

    insert: function (doc) {
      var model = doc.constructor;
      var result = model.docs.insert(doc.attributes, doc.attributes._id ? null : 'RETURNING _id');
      if (Array.isArray(result))
        doc.attributes._id = result[0]._id;

      model._$docCacheSet(doc.attributes);
      BaseModel._callAfterObserver(doc, null);
      model.notify(doc, null);
    },

    _insertAttrs: function (model, attrs) {
      if (! attrs._id && ! model.$fields._id.auto) attrs._id = Random.id();
      model.docs.insert(attrs);
      model._$docCacheSet(attrs);
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
    var doc = this._$docCacheGet(id);
    if (! doc) {
      doc = this.docs.findOne({_id: id});
      doc && this._$docCacheSet(doc);
    }
    return doc;
  }

  function findById(id) {
    var doc = this.findAttrsById(id);
    if (doc) return new this(doc);
  }

  function addToDictionary(adder) {
    for (var mname in BaseModel) {
      adder(mname);
      var model = BaseModel[mname];
      for (var name in model.$fields) {
        adder(name);
      }
    }
  }

  function DocCache() {}

  DocCache.prototype = {};

  return ModelEnv;
});
