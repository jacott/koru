isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const Future          = require('koru/future');
  const Observable      = require('koru/observable');
  const SessionBase     = require('koru/session/base').constructor;
  const GlobalDict      = require('koru/session/global-dict');
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const SessionVersion  = require('koru/session/session-version');
  const TH              = require('koru/test');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const net             = require('node:net');

  const {stub, spy, util, intercept, match: m, stubProperty} = TH;

  const MultiplexSocket = require('./multiplex-socket');

  const SOCKET_PATH = process.cwd() + '/test/multiplex-test.socket';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let server, callback, initf, f, socket, sess, argsMyServerConnection;

    beforeEach(async () => {
      intercept(koru, 'info', util.nullFunc);
      const gd = new GlobalDict();
      stubProperty(GlobalDict, 'main', {
        get() {
          return gd;
        },
      });
      sess = new SessionBase('test');
      sess.ServerConnection = MyServerConnection;
      sess.conns = {};
      sess.countNotify = new Observable();
      sess.execWrapper = koru.fiberConnWrapper;
      sess.totalSessions = 0;
      callback = stub();
      server = net.createServer();
      initf = new Future();
      await fst.rm_f(SOCKET_PATH);
      server.listen(SOCKET_PATH, 10, initf.resolve);
      server.on('error', (err) => {
        assert.fail(err);
      });
      await initf.promiseAndReset();
    });

    afterEach(() => {
      socket = undefined;
      server.close();
    });

    const sendInit = (socket) => {
      const buffer = message.encodeMessage('\x00', []);
      const bl = Buffer.from('010203040000', 'hex');
      bl.writeUInt32LE(buffer.length + 6);

      socket.write(bl);
      socket.write(buffer);
    };

    class MyServerConnection extends ServerConnection {
      constructor(...args) {
        argsMyServerConnection = args;
        super(...args);
        f.resolve();
      }
    }

    const initConnection = (path = '/ws/6/test', headers = {host: 'test.com'}) => {
      f = new Future();
      const buffer = Buffer.concat([
        Buffer.from('01020304010100', 'hex'),
        Buffer.concat([path, '\0', '127.0.0.1', '\0'].map(Buffer.from)),
        Buffer.concat(Object.keys(headers).map((k) => Buffer.from(`${k}\xff${headers[k]}\0`))),
      ]);
      buffer.writeUInt32LE(buffer.length);

      server.on('connection', (s) => {
        socket = s;
        socket.once('data', (data) => {
          socket.write(buffer);
        });

        sendInit(socket);
      });

      const ms = new MultiplexSocket(SOCKET_PATH, sess);

      after(() => ms.stop());
      ms.connect(2000);

      return ms;
    };

    const readMessages = async (count) => {
      if (socket === undefined) {
        await f.promiseAndReset();
      }

      const data = [];
      while (count > 0) {
        socket.once('data', f.resolve);
        data.push(await f.promiseAndReset());
        --count;
      }
      return data;
    };

    test('kafe connected', async () => {
      sess.version = '1.2.3';
      sess.versionHash = 'h1234';
      GlobalDict.main.addToDict('testing');
      f = new Future();
      server.on('connection', (s) => {
        socket = s;

        socket.on('data', (chunk) => f.resolve(chunk));

        sendInit(socket);
      });

      const ms = new MultiplexSocket(SOCKET_PATH, sess);
      ms.connect(5000);

      const chunk = await f.promiseAndReset();
      assert.equals(
        chunk.toString('hex'),
        '6d00000000000358312e322e33ff6831323334ff63623762616465643663623037613462' +
          '3734326665623862653063653335306538353330316336613033326435653431313530' +
          '35306634653062363734323436ffff110100110101100000000974657374696e67ffff110102',
      );
    });

    test('no server', async () => {
      let f = new Future();
      server.close(f.resolve);
      await f.promiseAndReset();

      stub(koru, 'setTimeout', () => {
        f.resolve();
        return 123;
      });

      const ms = new MultiplexSocket(SOCKET_PATH, sess);
      ms.connect(5000);

      await f.promiseAndReset();

      assert.called(koru.setTimeout, m.func, 5000);

      server = net.createServer();
      initf = new Future();
      await fst.rm_f(SOCKET_PATH);
      server.listen(SOCKET_PATH, 10, initf.resolve);
      server.on('error', (err) => {
        assert.fail(err);
      });
      await initf.promiseAndReset();

      server.on('connection', (s) => {
        socket = s;
        socket.on('data', (chunk) => f.resolve(chunk));
        sendInit(socket);
      });
      koru.setTimeout.yieldAndReset();

      const chunk = await f.promiseAndReset();
      assert.equals(chunk.subarray(0, 5).toString('hex'), '5500000000');
    });

    group('version compare', () => {
      let dictHash;
      beforeEach(() => {
        const gd = GlobalDict.main;
        gd.addToDict('test');
        const gdict = gd.globalDictEncoded();
        dictHash = gd.dictHashStr;
        stubProperty(sess, 'version', {value: 'v1.7.0-60-gd944a692'});
        stubProperty(sess, 'versionHash', {value: '123456'});
      });

      const checkVersion = async (path, expVersion) => {
        initConnection(path, {host: 'test.co.nz'});
        let chunks = await readMessages(1);
        assert.equals(chunks, [Buffer.from([8, 0, 0, 0, 1, 1, 0, expVersion])]);
      };

      test('client connection good dictionary', async () => {
        const path =
          `/ws/${koru.PROTOCOL_VERSION}/${sess.version}/${sess.versionHash}?field=one&dict=${dictHash}`;
        await checkVersion(path, SessionVersion.VERSION_GOOD_DICTIONARY);

        assert.isTrue(sess.conns['75'] instanceof MyServerConnection);
        assert.same(sess.conns['75'].remoteAddress, '127.0.0.1');
        assert.equals(argsMyServerConnection[2].url, path);
      });

      test('client connection bad dictionary', async () => {
        const path =
          `/ws/${koru.PROTOCOL_VERSION}/${sess.version}/${sess.versionHash}?field=one&dict=x${dictHash}`;
        await checkVersion(path, SessionVersion.VERSION_BAD_DICTIONARY);
      });

      test('client connection old version', async () => {
        const path = `/ws/${koru.PROTOCOL_VERSION}/${
          sess.version.replace(/1\.7/, '1.6')
        }/${sess.versionHash}x?field=one&dict=${dictHash}`;
        await checkVersion(path, SessionVersion.VERSION_CLIENT_BEHIND);
      });

      test('client connection future version', async () => {
        const path = `/ws/${koru.PROTOCOL_VERSION}/${
          sess.version.replace(/1\.7/, '1.8')
        }/${sess.versionHash}x?field=one&dict=${dictHash}`;
        await checkVersion(path, SessionVersion.VERSION_CLIENT_AHEAD);
      });

      test('client connection protocol mismatch', async () => {
        const path = `/ws/${
          koru.PROTOCOL_VERSION + 1
        }/${sess.version}/${sess.versionHash}?field=one&dict=${dictHash}`;
        await checkVersion(path, SessionVersion.VERSION_RELOAD);
      });
    });

    test('text command', async () => {
      sess.provide('x', (data) => {
        f.resolve(data);
      });
      initConnection();
      await f.promiseAndReset();

      const buffer = Buffer.from('0101047865666768', 'hex');
      const bl = Buffer.from('0123');
      bl.writeUInt32LE(buffer.length + 4);

      const append = spy(Uint8ArrayBuilder.prototype, 'append').invokes((c) => {
        f.resolve();
        return c.returnValue;
      });

      socket.write(bl);

      await f.promiseAndReset();
      append.restore();

      socket.write(buffer);

      assert.same(await f.promiseAndReset(), 'efgh');
    });

    test('infinite loop bug', async () => {
      let chunk = Buffer.from(
        '500000000400044c443e205b27616464436c69656e74537072697465272c204d6f64656c2e55736572282261646d696e756964676a222c202247656f6666204a61636f6273656e22292c20322c20305d1a000000020004',
        'hex',
      );
      sess.conns[4] = {
        onMessage(data) {
          f.resolve(data.toString());
        },
      }, initConnection();
      await f.promiseAndReset();

      socket.write(chunk);
      assert.equals(await f.promiseAndReset(), chunk.subarray(7, 80).toString());
    });

    test('binary commands', async () => {
      const ans = [];
      sess.provide('x', (data) => {
        ans.push(data);
        ans.length == 3 && f.resolve(ans);
      });
      initConnection();
      await f.promiseAndReset();

      const buffer = message.encodeMessage('x', [1, 2]);
      const bl = Buffer.from('01020304010103', 'hex');
      bl.writeUInt32LE(buffer.length + 7);

      for (let i = 0; i < 3; ++i) {
        socket.write(bl);
        socket.write(buffer);
      }

      assert.equals(await f.promiseAndReset(), [[1, 2], [1, 2], [1, 2]]);
    });

    test('text response', async () => {
      initConnection();
      let chunks = await readMessages(1);
      sess.conns['75'].send('x', 'msg');

      chunks = await readMessages(1);
      assert.same(chunks.length, 1);
      const data = chunks[0];
      assert.same(data.readUint32LE(), 11);
      assert.same(data.readUint16LE(4), 257);
      assert.same(data[6], 4);
      assert.same(data.subarray(7).toString(), 'xmsg');
    });

    test('binary response', async () => {
      initConnection();
      let chunks = await readMessages(1);
      const conn = sess.conns['75'];
      conn.sendBinary('x', [{a: 1, b: 'two'}]);

      chunks = await readMessages(1);
      assert.same(chunks.length, 1);
      const data = chunks[0];
      assert.same(data.readUint32LE(), 27);
      assert.same(data.readUint16LE(4), 257);
      assert.same(data[6], 3); // x
      assert.same(data[7], 120); // x
      assert.equals(message.decodeMessage(data.subarray(8)), [{a: 1, b: 'two'}]);
    });

    test('close', async () => {
      initConnection();

      const closeOb = stub();
      sess.countNotify.add(closeOb);
      let chunks = await readMessages(1);
      const conn = sess.conns['75'];

      assert.same(sess.totalSessions, 1);

      refute.called(closeOb);
      conn.close();

      assert.same(sess.totalSessions, 0);
      assert.calledOnce(closeOb);

      chunks = await readMessages(1);
      assert.same(chunks.length, 1);
      const data = chunks[0];

      assert.same(data.readUint32LE(), 7);
      assert.same(data.readUint16LE(4), 257);
      assert.same(data[6], 1); // close
    });

    test('on close', async () => {
      const ans = [];
      initConnection();
      await f.promiseAndReset();

      const conn = sess.conns['75'];

      conn.ws.on('close', (arg) => {
        f.resolve(arg);
      });

      const buffer = Buffer.from('01020304010101', 'hex');
      buffer.writeUInt32LE(buffer.length);

      socket.write(buffer);

      assert.same(await f.promiseAndReset(), '');

      assert.same(sess.totalSessions, 0);
      assert.same(sess.conns['75'], undefined);
    });
  });
});
