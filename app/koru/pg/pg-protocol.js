const net = require('node:net');
const crypto = require('node:crypto');

define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const PgMutex         = require('koru/pg/pg-mutex');
  const PgPortal        = require('koru/pg/pg-portal');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const util            = require('koru/util');
  const {PgMessage, State, simpleCmd, utf8Encode} = require('./pg-util');

  const {private$, inspect$} = require('koru/symbols');

  const listener$ = Symbol(), mutex$ = Symbol();

  const [
    BE_IDLE, BE_IN_TRANSACTION,
    QCMD, pCMD,
  ] = 'ITQp'.split('').map((c) => c.charCodeAt(0));

  const TERMINATE = simpleCmd('X');

  const BECMD = [];

  const addCommand = (char, callback) => {
    BECMD[char.charCodeAt(0)] = callback;
  };

  const SASL_AUTH = Buffer.from('SCRAM-SHA-256');
  const SASL_PRELUDE = Buffer.from('n,,n=*,r=');

  const cmpU8 = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  const ub = new Uint8ArrayBuilder(100);

  const sasl = (pgConn) => {
    ub.length = 0;
    const nonce = pgConn[private$].nonce = Buffer.from(crypto.randomBytes(18).toString('base64'));
    ub.appendByte(pCMD).writeInt32BE(SASL_AUTH.length + 1 + SASL_PRELUDE.length + nonce.length + 4+4);
    ub.append(SASL_AUTH).appendByte(0);
    ub.writeInt32BE(SASL_PRELUDE.length + nonce.length);
    ub.append(SASL_PRELUDE).append(nonce);
    pgConn.socket.write(ub.subarray());
    return true;
  };

  const hmac = (key, x) => crypto.createHmac('sha256', key).update(x).digest();

  const sha256 = (x) => crypto.createHash('sha256').update(x).digest();

  const xor = (a, b) => {
    const length = Math.max(a.length, b.length);
    const buffer = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
      buffer[i] = a[i] ^ b[i];
    }
    return buffer;
  };

  const saslCont = (pgConn, data) => {
    const pv = pgConn[private$];
    const res = data.utf8Slice(4).split(',').reduce((a, v) => (a[v[0]] = v.slice(2), a), {});
    const saltedPassword = crypto.pbkdf2Sync(
      pv.password,
      Buffer.from(res.s, 'base64'),
      parseInt(res.i), 32,
      'sha256',
    );

    const clientKey = hmac(saltedPassword, 'Client Key');

    const auth = 'n=*,r=' + pv.nonce + ',' +
          'r=' + res.r + ',s=' + res.s + ',i=' + res.i +
          ',c=biws,r=' + res.r;

    pv.serverSignature = hmac(hmac(saltedPassword, 'Server Key'), auth).toString('base64');
    ub.length = 0;
    ub.appendByte(pCMD).writeInt32BE(0);
    ub.appendUtf8Str('c=biws,r=' + res.r + ',p=' + xor(clientKey, hmac(sha256(clientKey), auth)).toString('base64'));
    ub.writeInt32BE(ub.length - 1, 1);

    pgConn.socket.write(ub.subarray());
    return true;
  };

  const saslFinal = (pgConn, data) => {
    if (data.utf8Slice(6) === pgConn[private$].serverSignature) return true;
    pgConn[listener$].error(PgMessage.fatal('Invalid password'));
    return false;
  };

  // Authentication
  addCommand('R', (pgConn, data) => {
    // TODO GJ I feel like we should do more here
    const type = data.readInt32BE(0);
    if (type == 0) return true;
    if (type == 10) {
      let i = 4;
      while (true) {
        const np = data.indexOf(0, i);
        if (np == -1 || i == np) break;
        if (cmpU8(SASL_AUTH, data.subarray(i, np))) {
          return sasl(pgConn);
        }
        i = np + 1;
      }
    } else if (type == 11) {
      return saslCont(pgConn, data);
    } else if (type == 12) {
      return saslFinal(pgConn, data);
    }

    pgConn[listener$].error(PgMessage.fatal('Unimplemented Authentication message (' + type + ')'));
    return false;
  });

  // ParameterStatus
  addCommand('S', (pgConn, data) => {
    let i = 0;
    let np = data.indexOf(0);
    const name = data.utf8Slice(i, np);
    i = np + 1;
    np = data.indexOf(0, i);
    const value = data.utf8Slice(i, np);
    pgConn.runtimeParams[name] = value;
    return true;
  });

  // BackendKeyData
  addCommand('K', (pgConn, data) => {
    pgConn.cancel = {
      processId: data.readInt32BE(0),
      secretKey: data.readInt32BE(4),
    };
    return true;
  });

  // NoData
  addCommand('n', util.trueFunc);

  // EmptyQueryResponse
  addCommand('I', (pgConn) => pgConn[listener$].error((PgMessage.error('EmptyQueryResponse'))));

  // CloseComplete
  addCommand('3', (pgConn, data) => pgConn[listener$].closeComplete(data));

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

  // ParameterDescription
  addCommand('t', (pgConn, data) => pgConn[listener$].addParameterDescription(data));

  // DataRow
  addCommand('D', (pgConn, data) => pgConn[listener$].addRow(data));

  // CommandComplete
  addCommand('C', (pgConn, data) => pgConn[listener$].commandComplete(data));

  // CommandComplete
  addCommand('C', (pgConn, data) => pgConn[listener$].commandComplete(data));

  // PortalSuspended
  addCommand('s', (pgConn, data) => pgConn[listener$].portalSuspended(data));

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

    get state() {return this[private$].state}

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

    connect(socket, password) {
      this.socket = socket;
      const pv = this[private$];
      pv.password = password;
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

      const ub = new Uint8ArrayBuilder(100);
      ub.grow(8);
      ub.set(5, 3);
      const {options} = this;
      for (const name in options) {
        ub.appendUtf8Str(`${name}\0${options[name]}\0`);
      }
      ub.set(ub.length, 0);
      ub.writeInt32BE(ub.length, 0);

      const startup = ub.subarray();

      socket.write(startup);
      ub.length = 0;

      let len, pos;

      const checkBuf = (data) => {
        ub.append(data);
        len = ub.length;
        if (len < 5) return;
        pos = 0;
        socket.pause();
        sendNext();
      };

      const close = pv.close = (reason) => {
        if (pv.state === State.CLOSED) return;
        releaseLock();
        pv.state = State.CLOSED;
        error ??= makeCloseError(reason);
        socket.removeListener('data', checkBuf);
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
          const expLen = ub.buffer.readInt32BE(pos + 1);
          if (len - pos < expLen) break;
          const data = ub.subarray(pos + 1+4, expLen + pos + 1);
          const cmdType = ub.buffer[pos];
          const cmd = BECMD[cmdType];
          pos += expLen + 1;
          let more = true;
          if (cmd !== void 0) {
            more = cmd(this, data);
          } else {
            this[listener$].error(PgMessage.error(`Unknown response message: '${String.fromCharCode(cmdType)}'\n`));
          }
          if (! more) return;
        }

        len = ub.length - pos;
        len != 0 && ub.buffer.copy(ub.buffer, 0, pos);
        ub.length = len;
        pos = 0;
        socket.resume();
      };

      socket.on('data', checkBuf);

      return f.promise;
    }

    close(error) {
      this[private$].close?.(error);
    }

    isClosed() {return this[private$].state === State.CLOSED}

    portal(name='') {return new PgPortal(this, name)}

    exec(str) {
      const conn = this;
      const pv = conn[private$];

      let done, nextRow;

      let ccCallback, error;
      let execState = 1;
      let rowDescCallback;

      const initFetch = async (callback) => {
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
            nextRow = void 0;
            return true;
          },
          addRowDesc: (data) => {
            if (error !== void 0) return true;
            return rowDescCallback?.(data) !== false;
          },
          addRow: (data) => {
            if (error !== void 0) return true;
            try {
              return nextRow !== void 0 && nextRow(data) !== false;
            } catch (err) {
              error ??= err;
              return true;
            }
          },
          commandComplete: (data) => {
            if (error !== void 0) return true;
            ccCallback?.(data.utf8Slice(0, data.length - 1));
            done?.(error);
            return true;
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

        const utf8 = Buffer.from(str);

        const u8 = Buffer.allocUnsafe(6 + utf8.length);
        u8[0] = QCMD;
        u8.writeInt32BE(u8.length - 1, 1);
        utf8.copy(u8, 5);
        u8[u8.length - 1] = 0;

        conn.socket.write(u8);

        return fetch(callback);
      };

      const fetch = (callback=util.voidFunc) => {
        if (error !== void 0 || execState < 1) return error;
        if (execState == 1) return initFetch(callback);
        return new Promise(async (resolve) => {
          done = (error) => {
            resolve(error);
          };
          nextRow = callback;
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
        describe: (callback) => {rowDescCallback = callback},
        commandComplete: (callback) => {ccCallback = callback},
        get error() {return error},
      };
    }
  }

  return PgProtocol;
});
