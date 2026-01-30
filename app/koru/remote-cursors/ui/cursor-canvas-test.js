define((require, exports, module) => {
  'use strict';
  const Dom             = require('koru/dom');
  const Id              = require('koru/id');
  const CursorMessage   = require('koru/remote-cursors/cursor-message');
  const TH              = require('koru/ui/test-helper');

  const {stub, spy, util, match: m} = TH;

  const CursorCanvas = require('./cursor-canvas');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let canvasElm, cbb, me, sender;
    let findClient, findShape, addClientSprite, removeClientSprite, now, cc, canvas_id, getMsg, msg;
    let clientCount = 0;

    const $style = 'position:fixed;top:51px;left:17px;width:600px;height:400px;';

    beforeEach(() => {
      canvasElm = Dom.h({$style});
      document.body.appendChild(canvasElm);
      cbb = canvasElm.getBoundingClientRect();
      me = Id.fromV1('me');
      sender = stub();
      function addClientSprite(id, count) {
        if (this.mySlot === count) {
          return null;
        }

        const elm = Dom.h({class: 'clientSprite', div: [id.toString()]});
        Dom.setCtx(elm);
        Dom.myCtx(elm).data = {_id: id};
        clientCount = count;
        return elm;
      }
      removeClientSprite = (elm, count) => {
        clientCount = count;
        Dom.remove(elm);
      };

      now = util.dateNow();
      cc = new CursorCanvas({
        me,
        sender,
        getDimensions: () => cbb,
        addClientSprite,
        removeClientSprite,
      });
      canvas_id = Id.fromV1('canvas1');
      getMsg = m((m) => msg = m);
    });

    afterEach(() => {
      clientCount = 0;
      TH.domTearDown();
    });

    const domFindId = (id) => ({data: m((d) => id.equals(d._id))});

    const moveRelative = (x, y) => {
      cc.move(cbb.left + (cbb.width * x), cbb.top + (cbb.height * y), now);
    };

    const assignCanvasSlot = (canvas_id, canvasSlot) => {
      cc.receive(CursorMessage.encodeAssignSlot(canvas_id, canvasSlot));
    };

    const newClients = (clients, id = canvas_id) => {
      cc.receive(CursorMessage.encodeNewClients(id, clients));
    };

    const removeClients = (clients, id = canvas_id) => {
      cc.receive(CursorMessage.encodeRemovedClients(id, clients));
    };

    const decodeMove = (data) => {
      const dv = new DataView(data.buffer);
      return {x: dv.getUint16(2, true), y: dv.getUint16(4, true)};
    };

    const encodeMoves = (list) => {
      const u8 = new Uint8Array(CursorMessage.moveArraySize(list.length));
      u8[0] = 109;
      u8[1] = 0;
      let pos = 2;
      for (const [slot, x, y] of list) {
        u8[pos] = slot;
        const emov = CursorMessage.encodeMove(x, y).subarray(2);
        u8.set(emov, pos + 1);
        pos += CursorMessage.MOVE_SIZE;
      }

      return u8;
    };

    const elmToId = (e) => Dom.myCtx(e)?.data._id;

    group('wrong canvas_id', () => {
      test('newClients, assignCanvasSlot', () => {
        cc.monitor(canvasElm, canvas_id);
        const canvas2_id = Id.random();
        const client2 = Id.random();

        assert.same(cc.mySlot, 255);
        assignCanvasSlot(canvas_id, 0);
        assert.same(cc.mySlot, 0);
        newClients([me, client2], canvas2_id);
        assert.equals(cc.clientSlots.map(elmToId), []);

        assignCanvasSlot(canvas2_id, 1);
        assert.same(cc.mySlot, 0);
      });

      test('removedClients', () => {
        cc.monitor(canvasElm, canvas_id);
        const canvas2_id = Id.random();
        const client2 = Id.random();

        assignCanvasSlot(canvas_id, 0);
        newClients([me, client2], canvas_id);

        removeClients([1], canvas2_id);
        assert.equals(cc.clientSlots.map(elmToId), [undefined, client2]);
      });
    });

    test('newClients, assignCanvasSlot', () => {
      cc.monitor(canvasElm, canvas_id);

      refute.called(sender);

      assert.same(cc.canvas_id, canvas_id);
      assert.same(cc.me, me);

      assert.dom(canvasElm, (elm) => {
        moveRelative(.5, .5);

        refute.dom('cursorSprites');

        const client2 = Id.random();
        const client3 = Id.random();

        assignCanvasSlot(cc.canvas_id, 1);
        assert.same(cc.mySlot, 1);
        newClients([client3, me, client2]);

        assert.dom('.clientSprite', {count: 2});
        assert.dom('.clientSprite', client2.toString());
        assert.dom('.clientSprite', client3.toString());

        assert.equals(cc.clientSlots.map(elmToId), [client3, undefined, client2]);
      });
    });

    test('removedClients', () => {
      cc.monitor(canvasElm, canvas_id);
      const client2 = Id.random();
      const client3 = Id.random();
      const client4 = Id.random();
      const client5 = Id.random();
      const client6 = Id.random();

      assignCanvasSlot(cc.canvas_id, 1);
      newClients([client2, me, client3, client4, client5, client6]);

      assert.equals(cc.clientSlots.map(elmToId), [
        client2,
        undefined,
        client3,
        client4,
        client5,
        client6,
      ]);

      assert.dom('.clientSprite', {count: 5});
      assert.same(clientCount, 5);
      removeClients([5, 0, 3]);

      assert.same(clientCount, 3);
      assert.dom('.clientSprite', {count: 2});
      assert.equals(cc.clientSlots.map(elmToId), [client5, undefined, client3]);
    });

    test('remove Clients reposition', () => {
      cc.monitor(canvasElm, canvas_id);
      const client2 = Id.fromV1('client2');
      const client3 = Id.fromV1('client3');
      const client4 = Id.fromV1('client4');
      const client5 = Id.fromV1('client5');
      const client6 = Id.fromV1('client6');

      assignCanvasSlot(cc.canvas_id, 3);
      newClients([client2, client4, client3, me, client5, client6]);
      removeClients([2, 4, 0]);
      assert.equals(cc.clientSlots.map(elmToId), [client6, client4, undefined]);
      assert.same(cc.mySlot, 2);
    });

    test('send move', () => {
      cc.monitor(canvasElm, canvas_id);
      sender.reset();

      moveRelative(.5, .5);
      assert.calledOnceWith(sender, getMsg);

      assert.equals(decodeMove(msg), {x: 32768, y: 32768});
    });

    group('show cursors', () => {
      let client2, client3;

      beforeEach(() => {
        cc.monitor(canvasElm, canvas_id);
        sender.reset();
        client2 = Id.fromV1('client2');
        client3 = Id.fromV1('client3');
        assignCanvasSlot(cc.canvas_id, 3);
        newClients([me, client2, client3, me]);
      });

      test('receive moves', () => {
        cc.receive(encodeMoves([[1, 0.5, 0.5], [0, 0.25, 0.75], [2, 0.8, 0.1], [3, 0.9, 0.9]]));

        assert.dom(canvasElm, (elm) => {
          assert.dom('.clientSprite', {count: 3});
          assert.dom('.clientSprite', domFindId(client2), (elm) => {
            assert.near(
              elm.style.transform,
              'translate3d(calc(-50% + 300px), calc(-50% + 200px), 0px)',
            );
          });
          assert.dom('.clientSprite', domFindId(me), (elm) => {
            assert.near(
              elm.style.transform,
              'translate3d(calc(-50% + 150px), calc(-50% + 300px), 0px)',
            );
          });
          assert.dom('.clientSprite', domFindId(client3), (elm) => {
            assert.near(
              elm.style.transform,
              'translate3d(calc(-50% + 480px), calc(-50% + 40px), 0px)',
            );
          });
        });
      });
    });
  });
});
