define((require, exports, module) => {
  'use strict';
  const Id              = require('koru/id');
  const Random          = require('koru/random');
  const TH              = require('koru/test-helper');

  const {stub, spy, util, match: m} = TH;

  const CursorMessage = require('./cursor-message');

  const idLen = 13;

  const {u8Id, zipId, unzipId} = util;

  const {MOVE_SIZE} = CursorMessage;

  const Square = 1;
  const Triangle = 2;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    const decodeMove = (data) => {
      const dv = new DataView(data.buffer);
      return {x: dv.getUint16(2, true) / 65535, y: dv.getUint16(4, true) / 65535};
    };

    const decodeAttach = (data) => {
      const obj = decodeMove(data);
      obj.shape = {
        type: data[6],
        id: Id.read(new DataView(data.buffer, data.buffer.byteOffset), 9),
      };
      obj.isAdd = data[7] == 1;
      obj.attachedTo = data[8];
      return obj;
    };

    test('encodeMove', () => {
      const data = CursorMessage.encodeMove(1, .75);
      assert.equals(Array.from(data), [CursorMessage.CURSOR_CMD, 0, 255, 255, 255, 191]);
      assert.equals(decodeMove(data), {x: 1, y: m.near(0.75, 0.00001)});
    });

    group('moves', () => {
      const pc75 = Math.round(.75 * 65535) / 65535;
      const mv1 = CursorMessage.encodeMove(1, pc75);
      const mv2 = CursorMessage.encodeMove(pc75, 1);
      const mv3 = CursorMessage.encodeMove(1, 1);
      const u8 = new Uint8Array(2 + MOVE_SIZE * 5);

      const decodeMoves = (size) => {
        const ans = [];
        for (const n of CursorMessage.decodeClientMoves(u8.subarray(0, size * MOVE_SIZE))) {
          ans.push(Object.assign({}, n));
        }
        return ans;
      };

      test('appendMove', () => {
        CursorMessage.appendMove(u8, mv1, 0, 1);
        assert.equals(decodeMoves(1), [{i: 1, x: 1, y: pc75}]);

        CursorMessage.appendMove(u8, mv2, 1, 5);
        assert.equals(decodeMoves(2), [{i: 1, x: 1, y: pc75}, {i: 5, x: pc75, y: 1}]);
      });

      test('setSlotIndexOnMove', () => {
        CursorMessage.appendMove(u8, mv1, 0, 1);
        CursorMessage.appendMove(u8, mv2, 1, 2);
        CursorMessage.appendMove(u8, mv3, 2, 3);

        CursorMessage.setSlotIndexOnMove(u8, 1, 6);

        assert.equals(decodeMoves(3), [{i: 1, x: 1, y: pc75}, {i: 6, x: pc75, y: 1}, {
          i: 3,
          x: 1,
          y: 1,
        }]);
      });

      test('moveMove', () => {
        CursorMessage.appendMove(u8, mv1, 0, 1);
        CursorMessage.appendMove(u8, mv2, 1, 2);
        CursorMessage.appendMove(u8, mv3, 2, 3);

        assert.equals(CursorMessage.moveMove(u8, 2, 0), 3);

        assert.equals(decodeMoves(2), [{i: 3, x: 1, y: 1}, {i: 2, x: pc75, y: 1}]);
      });
    });

    test('encodeNewClients, decodeClients', () => {
      const msg = CursorMessage.encodeNewClients(
        Id.fromV1('canvas123'),
        ['xuS2FaH1T3I6KSZv9', 'jtHixB53oqvBzNnNb'].map(Id.fromV1),
      );
      assert.same(msg[1], CursorMessage.NewClients);

      assert.equals(CursorMessage.decodeCanvas(msg).toString(), 'canvas123');

      assert.equals(
        Array.from(CursorMessage.decodeClients(msg)),
        ['xuS2FaH1T3I6KSZv9', 'jtHixB53oqvBzNnNb'].map(Id.fromV1),
      );
    });

    group('shapes', () => {
      const t1 = Id.random();

      let t1Data, result;

      beforeEach(() => {
        t1Data = CursorMessage.encodeAttach(Triangle, t1, 1, .75);
        t1Data[8] = 5;
        const detach = CursorMessage.encodeDetach(false);
        const detachNoAnimate = CursorMessage.encodeDetach(true);

        result = new Uint8Array(CursorMessage.shapeArraySize(3));
        CursorMessage.appendShape(result, t1Data, 0, 5);
        CursorMessage.appendShape(result, detachNoAnimate, 1, 0);
        CursorMessage.appendShape(result, detach, 2, 4);
      });

      test('encodeAttach decodeShapes', () => {
        assert.same(t1Data[1], CursorMessage.AttachShape);

        assert.equals(decodeAttach(t1Data), {
          shape: {type: Triangle, id: t1},
          isAdd: true,
          attachedTo: 5,
          x: 1,
          y: m.near(0.75, 0.00001),
        });

        assert.equals(Array.from(CursorMessage.decodeShapes(result)), [
          {isAdd: true, i: 5, x: 1, y: m.near(0.75, 0.00001), type: Triangle, id: t1},
          {isAdd: false, i: 0, noAnimate: true},
          {isAdd: false, i: 4, noAnimate: false},
        ]);
      });

      test('moveShape', () => {
        const details = CursorMessage.moveShape(result, 0, 2);

        assert.equals(details, [Triangle, t1]);

        assert.equals(Array.from(CursorMessage.decodeShapes(result)), [
          {isAdd: true, i: 5, x: 1, y: m.near(0.75, 0.00001), type: Triangle, id: t1},
          {isAdd: false, i: 0, noAnimate: true},
          {isAdd: true, i: 5, x: 1, y: m.near(0.75, 0.00001), type: Triangle, id: t1},
        ]);
      });
    });
  });
});
