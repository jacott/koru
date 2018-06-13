define(function(require, exports, module) {
  const koru            = require('koru');
  const dbBroker        = require('koru/model/db-broker');
  const util            = require('koru/util');

  const {hasOwn} = util;

  const timer$ = Symbol(), retryInterval$ = Symbol(),
        action$ = Symbol(), dbs$ = Symbol(), queue$ = Symbol();

  const DEFAULT_INTERVAL = 60*1000;

  const TABLE_SCHEMA = `
CREATE TABLE "_message_queue" (
    _id bigint NOT NULL,
    name text COLLATE pg_catalog."C" NOT NULL,
    "dueAt" timestamp without time zone,
    message jsonb
);

CREATE SEQUENCE "_message_queue__id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY "_message_queue" ALTER COLUMN _id
  SET DEFAULT nextval('_message_queue__id_seq'::regclass),
  ADD CONSTRAINT "_message_queue_pkey" PRIMARY KEY (_id);


CREATE UNIQUE INDEX "_message_queue_name_dueAt__id" ON "_message_queue"
  USING btree (name, "dueAt", _id);
`;

  const fields = {
    _id: 'bigserial',
    name: 'text',
    dueAt: 'timestamp',
    message: 'jsonb',
  };

  const action = mq=>{
    const {name, [timer$]: timer,
           mqdb: {[action$]: actions, [retryInterval$]: retryIntervals}} = mq;
    timer.handle = -1; timer.ts = 0;
    mq.error = undefined;
    try {
      const rec = mq.peek(1, util.newDate())[0];
      if (rec !== undefined) {
        actions[name]({_id: rec._id, dueAt: rec.dueAt, message: rec.message}, mq);
        mq.remove(rec._id);
      }

      queueNext(mq);
    } catch(ex) {
      const retryInterval = typeof ex.retryAfter === 'number'
            ? ex.retryAfter : retryIntervals[name] || DEFAULT_INTERVAL;
      if (ex.stack) koru.unhandledException(ex);
      if (retryInterval !== -1) {
        timer.handle = 0;
        queueFor(mq, new Date(util.dateNow()+retryInterval));
        mq.error = ex;
      }
    }
  };

  const queueNext = (mq, minStart)=>{
    const {mqdb: {table}, name, [timer$]: timer} = mq;

    const nrec = table._client.query(`
select "dueAt" from "${table._name}" where name = $1
  order by "dueAt",_id limit 1;
`, [name])[0];

    timer.handle = 0;
    if (nrec !== undefined) {
      queueFor(mq, minStart === undefined ? nrec.dueAt : Math.max(+minStart, +nrec.dueAt));
    }
  };

  const queueFor = (mq, dueAt)=>{
    if (mq.error !== undefined) return;
    const ts = +dueAt;
    if (ts !== ts || ts <= 0) throw new Error("Invalid dueAt");
    const timer = mq[timer$];
    if (timer.handle !== 0) {
      if (timer.ts > ts) {
        koru.clearTimeout(timer.handle);
        timer.handle = 0;
      } else
        return;
    }
    if (timer.handle === 0) {
      timer.ts = ts;
      timer.handle = koru.setTimeout(()=>{
        dbBroker.db = mq.mqdb.table._client;
        action(mq);
      }, Math.min(util.DAY, Math.max(0, +dueAt-util.dateNow())));
    }
  };

  class MQ {
    constructor(mqdb, name) {
      this.mqdb = mqdb;
      this.name = name;
      this[timer$] = {handle: 0, dueAt: 0};
      this.error = undefined;
      const retryInterval = this.mqdb[retryInterval$][name];
      queueNext(this, (retryInterval === undefined ? DEFAULT_INTERVAL : retryInterval) + util.dateNow());
    }

    deregister() {
      const {name} = this;
      const {[action$]: actions, [retryInterval$]: retryIntervals} = this.mqdb;
      const timer = this[timer$];

      if (timer.handle !== 0) {
        koru.clearTimeout(timer.handle);
        timer.handle = 0;
      }

      if (hasOwn(actions, name)) {
        delete actions[name];
        if (hasOwn(retryIntervals, name)) delete retryIntervals[name];
      }

      delete this.mqdb[queue$][name];
    }

    purge() {
      this.deregister();
      this.mqdb.table.remove({name: this.name});
    }

    add({dueAt=util.newDate(), message}) {
      const {mqdb, name} = this;
      const now = util.dateNow();
      mqdb.table.insert({name, dueAt, message});
      mqdb.table._client.onCommit(()=>{queueFor(this, dueAt)});
    }

    peek(maxResults=1, dueBefore) {
      const extra = dueBefore === undefined ? '' : `and "dueAt" <= '${dueBefore.toISOString()}'`;
      const {table} = this.mqdb;
      return table._client.query(`
select _id,"dueAt",message from "${table._name}"
  where name = $1 ${extra}
  order by "dueAt",_id limit ${maxResults};
`, [this.name]);
    }

    remove(_id) {
      const {table} = this.mqdb;
      table._client.query(`delete from "${table._name}" where _id = $1`, [_id]);
    }
  }

  class MQDB {
    constructor(tableName, actions, retryIntervals) {
      const {db} = dbBroker;
      this[action$] = Object.create(actions);
      this[retryInterval$] = Object.create(retryIntervals);
      const table = this.table = db.table(tableName, fields);
      table._ensureTable();
      if (table._columns.length == 0) {
        db.query(TABLE_SCHEMA.replace(/_message_queue/g, tableName));
      }

      this[queue$] = {};
    }
    getQueue(name) {
      if (this[action$][name] === undefined) return;
      return this[queue$][name] || (this[queue$][name] = new MQ(this, name));
    }

    stop() {
      const queue = this[queue$];
      for (const name in queue) {
        const timers = queue[name][timer$];
        if (timers.handle !== 0) {
          koru.clearTimeout(timers.handle);
          timers.handle = timers.ts = 0;
        }
      }
    }

    registerQueue({name, action, retryInterval}) {
      const {[action$]: actions, [retryInterval$]: retryIntervals} = this;
      if (hasOwn(actions, name))
        throw new Error(`Message queue '${name}' already registered`);
      actions[name] = action;
      if (retryInterval !== undefined)
        retryIntervals[name] = retryInterval;
    }
  }

  class MQFactory {
    constructor(tableName) {
      this.tableName = tableName;
      this[dbs$] = dbBroker.makeFactory(
        MQDB,
        tableName,
        this[action$] = Object.create(null),
        this[retryInterval$] = Object.create(null)
      );
    }

    start() {
      const mqdb = this[dbs$].current;
      for (const name in mqdb[action$]) {
        mqdb.getQueue(name);
      }
    }

    stopAll() {
      this[dbs$].stop();
    }

    registerQueue({module, name, action, retryInterval, local=false}) {
      if (local) {
        this[dbs$].current.registerQueue({name, action, retryInterval});
      } else {
        if (this[action$][name] !== undefined)
          throw new Error(`MessageQueue '${name}' already registered`);
        this[action$][name] = action;
        if (retryInterval !== undefined)
          this[retryInterval$][name] = retryInterval;
        module === undefined || module.onUnload(()=>{this.deregisterQueue(name)});
      }
    }

    deregisterQueue(name) {
      delete this[action$][name];
      delete this[retryInterval$][name];
    }

    getQueue(name) {
      return this[dbs$].current.getQueue(name);
    }
  };

  return MQFactory;
});
