const net = require('node:net');

define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const PgMutex         = require('koru/pg/pg-mutex');
  const PgPortal        = require('koru/pg/pg-portal');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const util            = require('koru/util');
  const {PgMessage, PgRow, State, simpleCmd, utf8Encode} = require('./pg-util');

  const {private$, inspect$} = require('koru/symbols');

  const listener$ = Symbol(), mutex$ = Symbol();

  const [
    BE_IDLE, BE_IN_TRANSACTION,
    QCMD,
  ] = 'ITQ'.split('').map((c) => c.charCodeAt(0));

  const TERMINATE = simpleCmd('X');

  const BECMD = [];

  const addCommand = (char, callback) => {
    BECMD[char.charCodeAt(0)] = callback;
  };

  // Authentication
  addCommand('R', (pgConn, data) => {
    // TODO GJ I feel like we should do more here
    return true;
  });

  // ParameterStatus
  addCommand('S', (pgConn, data) => {
    let i = 0;
    let np = data.indexOf(0);
    const name = data.subarray(i, np).toString();
    i = np + 1;
    np = data.indexOf(0, i);
    const value = data.subarray(i, np).toString();
    pgConn.runtimeParams[name] = value;
    return true;
  });

  // BackendKeyData
  addCommand('K', (pgConn, data) => {
    const dv = new DataView(data.buffer, data.byteOffset);
    pgConn.cancel = {
      processId: dv.getInt32(0),
      secretKey: dv.getInt32(4),
    };
    return true;
  });

  // NoData
  addCommand('n', util.trueFunc);

  // ReadyForQuery
  addCommand('Z', (pgConn, [ts]) => {
    const state = pgConn[private$].state = ts === BE_IDLE
          ? State.READY
          : ts === BE_IN_TRANSACTION ? State.READY_IN_TRANSACTION : State.READY_IN_ROLLBACK;
    return pgConn[listener$].ready(state);
  });

  // ErrorResponse
  addCommand('E', (pgConn, data) => pgConn[listener$].error(PgMessage.readFields(data)));

  // NoticeResponse
  addCommand('N', (pgConn, data) => (pgConn[private$].onNoticeCallback?.(PgMessage.readFields(data)), true));

  // ParseComplete
  addCommand('1', (pgConn) => pgConn[listener$].parseComplete());

  // BindComplete
  addCommand('2', (pgConn) => pgConn[listener$].bindComplete());

  // RowDescription
  addCommand('T', (pgConn, data) => pgConn[listener$].addRowDesc(data));

  // DataRow
  addCommand('D', (pgConn, data) => pgConn[listener$].addRow(data));

  // CommandComplete
  addCommand('C', (pgConn, data) => pgConn[listener$].commandComplete(data));

  const makeCloseError = (message) => (message instanceof PgMessage)
        ? message
        : new PgMessage({message: message ?? 'connection closed'});

  class PgProtocol {
    constructor(options) {
      this.options = options;
      this.runtimeParams = {};
      this[private$] = {state: State.NEW_CONN, sendNext: void 0};
      this[listener$] = null;
      (this[mutex$] = new PgMutex()).lock();
    }

    async lock(listener) {
      const error = await this[mutex$].lock();
      if (error !== void 0) return error;
      this[private$].state = State.EXECUTING;
      this[listener$] = listener;
    }

    unlock(listener) {
      this[listener$] = void 0;
      this[mutex$].unlock();
    }

    onNotice(callback) {
      const pv = this[private$];
      const oldCallback = pv.onNoticeCallback;
      pv.onNoticeCallback = callback;
      return oldCallback;
    }

    connect(socket) {
      this.socket = socket;
      const pv = this[private$];
      assert(pv.state === State.NEW_CONN, 'Invalid use of connect');
      pv.state = State.CONNECTING;
      const f = new Future();
      let locked = true;
      let error;

      const releaseLock = () => {
        if (locked) {
          locked = false;
          this.unlock(error);
        }
      };

      const buf = new Uint8ArrayBuilder(40);
      buf.grow(8);
      buf.set(5, 3);
      const {options} = this;
      for (const name in options) {
        buf.appendUtf8Str(`${name}\0${options[name]}\0`);
      }
      buf.set(buf.length, 0);

      const startup = buf.subarray();
      let dv = new DataView(startup.buffer, startup.byteOffset);
      dv.setInt32(0, startup.length);

      socket.write(startup);
      buf.length = 0;

      let msgs, len, pos;

      const onData = (data) => {
        buf.append(data);
        checkBuf(buf.subarray());
      };

      const close = pv.close = (reason) => {
        if (pv.state === State.CLOSED) return;
        releaseLock();
        pv.state = State.CLOSED;
        error ??= makeCloseError(reason);
        socket.removeListener('data', onData);
        socket.write(TERMINATE);
        if (f.isResolved) {
          const listener = this[listener$];
          if (listener !== void 0) {
            listener.error(error);
          }
        } else {
          f.reject(makeCloseError(error));
        }
      };

      this[listener$] = {
        ready: () => {
          releaseLock();
          f.resolve(this);
          return true;
        },
        error: close,
      };

      const sendNext = pv.sendNext = () => {
        while (len - pos > 4) {
          const expLen = dv.getInt32(pos + 1);
          if (len - pos < expLen) break;
          const data = msgs.subarray(pos + 1+4, expLen + pos + 1);
          const cmdType = msgs[pos];
          const cmd = BECMD[cmdType];
          pos += expLen + 1;
          let more = true;
          if (cmd !== void 0) {
            more = cmd(this, data);
          } else {
            this[listener$].error({
              severity: 'FATAL',
              message: `Unknown response message: '${String.fromCharCode(cmdType)}'\n`});
          }
          if (! more) return;
        }

        dv = void 0;
        const rem = buf.subarray(pos);
        buf.length = 0;
        buf.append(rem);
        socket.resume();
      };

      const checkBuf = (input) => {
        len = buf.length;
        if (len < 5) return;
        pos = 0;
        dv = new DataView(input.buffer, input.byteOffset);
        msgs = input;
        socket.pause();
        sendNext();
      };

      socket.on('data', onData);

      return f.promise;
    }

    close(error) {
      this[private$].close?.(error);
    }

    isClosed() {return this[private$].state === State.CLOSED}

    portal(name='') {
      return new PgPortal(this, name);
    }

    exec(str) {
      const conn = this;
      const pv = conn[private$];

      let done, nextRow;

      let complete, error, lastRow;
      let execState = 1;

      const initFetch = async (callback) => {
        const raw = {desc: void 0, row: void 0};

        const ready = () => {
          conn.unlock();
          execState = 0;
          done?.(error);
          return true;
        };

        await conn.lock({
          ready,
          error: (err) => {
            error ??= err;
            if (err.severity == 'FATAL') {
              ready();
              return;
            }
            return true;
          },
          addRowDesc: (data) => {
            if (error !== void 0) return true;
            raw.columns = void 0;
            raw.desc = data;
            return true;
          },
          addRow: (data) => {
            if (error !== void 0) return true;
            try {
              lastRow ??= new PgRow(raw);
              raw.row = data;
              return nextRow !== void 0 && nextRow(lastRow) !== false;
            } catch (err) {
              error ??= err;
              return true;
            }
          },
          commandComplete: (data) => {
            if (error !== void 0) return true;
            complete = data;
            nextRow = void 0;
            lastRow = null;
            done?.(error);
            return false;
          },
        });

        if (execState < 1) {
          if (execState != 0) {
            conn.unlock();
          }
          execState = -1;
          return error;
        }

        execState = 2;

        const utf8 = utf8Encode(str);

        const u8 = new Uint8Array(6 + utf8.length);
        u8[0] = QCMD;
        const dv = new DataView(u8.buffer, u8.byteOffset);
        dv.setInt32(1, u8.length - 1);
        u8.set(utf8, 5);

        conn.socket.write(u8);

        return fetch(callback);
      };

      const fetch = (callback) => {
        if (error !== void 0 || execState < 1) return error;
        if (execState == 1) return initFetch(callback);
        if (lastRow === null) {
          lastRow = void 0;
          return error;
        }
        return new Promise(async (resolve) => {
          done = (error) => {
            done = void 0;
            resolve(error);
          };
          nextRow = callback;
          if (lastRow !== void 0) {
            try {
              if (callback(lastRow) === false) return;
            } catch (err) {
              error ??= err;
            }
          }
          pv.sendNext();
        });
      };

      return {
        fetch,

        close: (err) => {
          error ??= err;
          if (execState != 2) {
            if (execState != 0) execState = -1;
            return error;
          }

          execState = -1;

          return new Promise((res) => {
            done = (error) => {
              if (execState == 0) {
                res(error);
              } else {
                pv.sendNext();
              }
            };
            pv.sendNext();
          });
        },

        get isExecuting() {return execState != 0},
        getCompleted: () => {
          const result = complete && complete.subarray(0, -1).toString();
          execState > 0 && pv.sendNext();
          return result;
        },
        get error() {return error},
      };
    }
  }

  return PgProtocol;
});
