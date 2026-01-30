define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Observable      = require('koru/observable');
  const GlobalDict      = require('koru/session/global-dict');
  const message         = require('koru/session/message');
  const SessionVersion  = require('koru/session/session-version');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const util            = require('koru/util');
  const net             = require('node:net');

  const T_CONNECT = 0;
  const T_CLOSE = 1;
  const T_BINARY = 3;
  const T_TEXT = 4;

  const closeMsg = Buffer.from([2]);

  const Events = {close: 0, error: 1};

  const send = (socket, sessId, type, msg) => {
    const isText = typeof msg === 'string';
    const lenExtra = 7;
    const header = Buffer.allocUnsafe(lenExtra);
    header[6] = type;
    header.writeUint32LE(msg.length + lenExtra);
    header.writeUint16LE(sessId, 4);
    socket.cork();
    socket.write(header);
    socket.write(msg);
    socket.uncork();
  };

  class UdsRequest {
    #buffer;

    constructor(buf) {
      this.#buffer = buf;

      const n1 = buf.indexOf(0);
      this.url = n1 === -1 ? null : buf.toString('utf8', 0, n1);
      const n2 = n1 === -1 ? -1 : buf.indexOf(0, n1 + 1);
      this.remoteAddress = n2 === -1 ? null : buf.toString('utf8', n1 + 1, n2);

      this.headers = new Proxy({}, {
        get: (_, prop) => {
          if (typeof prop !== 'string') return undefined;
          return this.#findHeader(prop);
        },
        has: (_, prop) => {
          if (typeof prop !== 'string') return false;
          return this.#findHeader(prop) !== undefined;
        },
      });
    }

    get method() {
      return 'GET';
    }
    get httpVersion() {
      return '1.1';
    }

    get connection() {
      return {remoteAddress: this.remoteAddress};
    }

    #findHeader(name) {
      // Search pattern: \0 + name + \xff
      const needle = Buffer.concat([
        Buffer.from([0x00]),
        Buffer.from(name.toLowerCase()),
        Buffer.from([0xff]),
      ]);

      const needlePos = this.#buffer.indexOf(needle);
      if (needlePos === -1) return undefined;

      // Value starts after the needle and ends at the next \0
      const valueStart = needlePos + needle.length;
      const valueEnd = this.#buffer.indexOf(0, valueStart);

      return valueEnd === -1
        ? this.#buffer.toString('utf8', valueStart)
        : this.#buffer.toString('utf8', valueStart, valueEnd);
    }
  }

  class MplexWebSocket {
    constructor(socket, sessId) {
      this.socket = socket;
      this.sessId = sessId;
      this.eventListeners = [null, null];
    }
    on(event, callback) {
      const evIdx = Events[event];
      if (evIdx === undefined) throw new Error('Invalid event name ' + event);
      (this.eventListeners[evIdx] ??= new Observable()).add(callback);
    }
    close() {
      send(this.socket, this.sessId, T_CLOSE, Buffer.from([]));
    }

    send(msg) {
      if (typeof msg === 'string') {
        send(this.socket, this.sessId, T_TEXT, Buffer.from(msg));
      } else {
        send(this.socket, this.sessId, T_BINARY, msg);
      }
    }
  }

  class MultiplexSocket {
    constructor(path = `/var/run/user/${process.geteuid()}/kafe.socket`, session) {
      this.path = path;
      this.session = session;
    }

    stop() {
      if (this.socket !== undefined) {
        this.socket.destroy();
        this.socket = undefined;
      }
    }

    connect(retryInterval = 0) {
      assert(this.socket === undefined, 'connect already called');
      const u8 = new Uint8ArrayBuilder();
      const socket = this.socket = net.createConnection(this.path);

      socket.on('close', () => {
        if (this.socket === undefined) {
          return;
        }

        koru.info('kafe connection closed');
        this.stop();
        koru.info('kafe retry in ' + retryInterval);
        koru.setTimeout(() => {
          this.connect(retryInterval);
        }, retryInterval);
      });

      socket.on('error', (err) => {
        if (this.socket === undefined) return;
        this.stop();
        if (retryInterval == 0) {
          koru.info('kafe connection closed' + err);
        } else {
          koru.info('kafe ' + err + '\n retry in ' + retryInterval);
          koru.setTimeout(() => {
            this.connect(retryInterval);
          }, retryInterval);
        }
      });

      socket.on('readable', () => {
        try {
          let chunk = socket.read();
          if (chunk == null) return;
          const clen = chunk.length;
          if (u8.length == 0) {
            let pos = 0;
            while (clen - pos > 4) {
              const len = chunk.readUInt32LE(pos);
              if (clen - pos >= len) {
                if (clen - pos == len) {
                  this.handleMsg(pos == 0 ? chunk : chunk.subarray(pos));
                  return;
                } else {
                  this.handleMsg(chunk.subarray(pos, pos + len));

                  pos += len;
                }
              } else {
                break;
              }
            }
            if (pos != 0) chunk = chunk.subarray(pos);
          }
          u8.append(chunk);
          while (u8.length > 5) {
            const chunk = u8.subarray();
            const clen = chunk.length;
            if (clen > 4) {
              const len = chunk.readUInt32LE();
              if (clen >= len) {
                if (clen == len) {
                  this.handleMsg(chunk);
                  u8.length = 0;
                  return;
                } else {
                  this.handleMsg(chunk.subarray(0, len));
                  const extra = chunk.subarray(len);
                  u8.setArray(extra);
                  u8.length = extra.length;
                }
              } else {
                break;
              }
            }
          }
        } catch (err) {
          koru.unhandledException(err);
        }
      });
    }

    handleMsg(msg) {
      const sessIdInt = msg.readUInt16LE(4);
      const sessId = sessIdInt.toString(36);
      const {session} = this;
      const cmd = msg[6];
      switch (cmd) {
        case T_CONNECT: {
          if (sessIdInt == 0) {
            let msg2 = message.decodeMessage(msg.subarray(7));
            let encoded = GlobalDict.main.globalDictEncoded();
            let dictHash = GlobalDict.main.dictHashStr;
            send(
              this.socket,
              0,
              T_BINARY,
              message.encodeMessage(
                'X',
                (msg2.length == 1 && msg2[0] === dictHash)
                  ? [session.version, session.versionHash]
                  : [session.version, session.versionHash, encoded, dictHash],
              ),
            );
            return;
          }
          const ws = new MplexWebSocket(this.socket, sessIdInt);
          const ugr = new UdsRequest(msg.subarray(7));
          const {remoteAddress} = ugr;

          const newSession = () => {
            ++session.totalSessions;
            send(
              this.socket,
              sessIdInt,
              T_CONNECT,
              Buffer.from([SessionVersion.comparePathVersion(session, ugr.url)]),
            );
            const conn = session.conns[sessId] = new session.ServerConnection(
              session,
              ws,
              ugr,
              sessId,
              () => {
                ws.close();
                const conn = session.conns[sessId];
                if (conn) {
                  --session.totalSessions;
                  delete session.conns[sessId];
                  session.countNotify.notify(conn, false);
                }
              },
            );
            conn.engine = util.browserVersion(ugr.headers['user-agent'] ?? '');
            conn.remoteAddress = remoteAddress;
          };

          if (session.connectionIntercept) {
            session.connectionIntercept(newSession, ws, ugr, remoteAddress);
          } else {
            newSession();
          }

          return;
        }
        case T_BINARY: {
          session.conns[sessId]?.onMessage(msg.subarray(7), true);
          return;
        }
        case T_TEXT: {
          session.conns[sessId]?.onMessage(msg.subarray(7));
          return;
        }
        default: {
          session.conns[sessId]?.ws.eventListeners[cmd - T_CLOSE]?.notify(
            msg.subarray(7).toString(),
          );
        }
      }
    }
  }

  return MultiplexSocket;
});
