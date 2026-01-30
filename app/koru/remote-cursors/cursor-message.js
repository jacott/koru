define((require) => {
  'use strict';
  const Id              = require('koru/id');
  const util            = require('koru/util');

  const idLen = 16;

  const moveResult = {i: 0, x: 0, y: 0};

  const CURSOR_CMD = '>'.charCodeAt(0);

  const COORD_SIZE = 4;
  const MOVE_SIZE = COORD_SIZE + 1;
  const SHAPE_SIZE = COORD_SIZE + 3 + idLen;

  const moveArraySize = (n) => 2 + MOVE_SIZE * n;
  const shapeArraySize = (n) => 2 + SHAPE_SIZE * n;

  const fromFrac = 65535, toFrac = 1 / fromFrac;

  const Move = 0;
  const AttachShape = 1;
  const NewClients = 2;
  const RemovedClients = 3;
  const AssignSlot = 4;

  const ndv = (u8) => new DataView(u8.buffer, u8.byteOffset);
  const readId = (u8, offset) => Id.read(ndv(u8), offset);

  const encodeCommonPos = (type, extra, x, y) => {
    const u8 = new Uint8Array(COORD_SIZE + extra);
    const dv = ndv(u8);
    u8[0] = CURSOR_CMD;
    u8[1] = type;
    dv.setUint16(2, Math.round(x * fromFrac), true);
    dv.setUint16(4, Math.round(y * fromFrac), true);
    return u8;
  };

  const setSlotIndexOnShape = (dest, idx, slot) => {
    dest[8 + idx * SHAPE_SIZE] = slot;
  };
  const setSlotIndexOnMove = (dest, idx, slot) => {
    dest[2 + idx * MOVE_SIZE] = slot;
  };

  const CursorMessage = {
    CURSOR_CMD,
    MOVE_SIZE,
    SHAPE_SIZE,
    Move,
    AttachShape,
    NewClients,
    RemovedClients,
    AssignSlot,

    moveArraySize,
    shapeArraySize,

    encodeMove: (x, y) => encodeCommonPos(Move, 2, x, y),

    *decodeClientMoves(u8) {
      const dv = ndv(u8);
      let len = u8.length;
      for (let pos = 2; pos < len; pos += MOVE_SIZE) {
        moveResult.i = u8[pos];
        moveResult.x = dv.getUint16(pos + 1, true) * toFrac;
        moveResult.y = dv.getUint16(pos + 3, true) * toFrac;
        yield moveResult;
      }
    },

    encodeAttach: (shapeType, shapeId, x, y) => {
      const u8 = encodeCommonPos(AttachShape, 5 + idLen, x, y);
      u8[6] = shapeType;
      u8[7] = 1;
      u8[8] = 0;
      shapeId.write(ndv(u8), 9);
      return u8;
    },

    encodeDetach(noAnimate = false) {
      const u8 = encodeCommonPos(AttachShape, 5 + idLen, 0, 0);
      u8[7] = noAnimate ? 2 : 0;
      u8[8] = 0;
      return u8;
    },

    shapeTypeAndId: (u8) => {
      return [u8[6], readId(u8, 9), u8[7] == 1];
    },

    appendShape: (dest, src, lastIdx, pcIdx) => {
      dest.set(src.subarray(2, 2 + SHAPE_SIZE), 2 + lastIdx * SHAPE_SIZE);
      setSlotIndexOnShape(dest, lastIdx, pcIdx);
    },

    moveShape: (dest, fromIdx, toIdx) => {
      const pos = 2 + fromIdx * SHAPE_SIZE;
      const src = dest.subarray(pos, pos + SHAPE_SIZE);
      dest.set(src, 2 + toIdx * SHAPE_SIZE);
      return [src[4], readId(src, 7)];
    },

    setSlotIndexOnShape,
    setSlotIndexOnMove,

    appendMove: (dest, src, lastIdx, slot) => {
      dest[2 + lastIdx * MOVE_SIZE] = slot;
      dest.set(src.subarray(2, 2 + COORD_SIZE), 3 + lastIdx * MOVE_SIZE);
    },

    moveMove: (dest, size, toIdx) => {
      const pos = 2 + size * MOVE_SIZE;
      const src = dest.subarray(pos, pos + MOVE_SIZE);
      const pcIdx = src[0];
      dest.set(src, 2 + toIdx * MOVE_SIZE);
      return pcIdx;
    },

    *decodeShapes(u8) {
      const dv = ndv(u8);
      for (let i = 2; i < u8.length; i += SHAPE_SIZE) {
        if (u8[i + 5] == 1) {
          yield {
            isAdd: true,
            i: u8[i + 6],
            x: dv.getUint16(i, true) * toFrac,
            y: dv.getUint16(i + 2, true) * toFrac,
            type: u8[i + 4],
            id: Id.read(dv, i + 7),
          };
        } else {
          yield {isAdd: false, i: u8[i + 6], noAnimate: u8[i + 5] == 2};
        }
      }
    },

    encodeNewClient(client_id, canvas_id) {
      return CursorMessage.encodeNewClients(canvas_id, [client_id]);
    },

    encodeNewClients: (canvas_id, clients) => {
      const u8 = new Uint8Array((1 + clients.length) * idLen + 2);
      const dv = ndv(u8);
      u8[0] = CURSOR_CMD;
      u8[1] = NewClients;
      canvas_id.write(dv, 2);
      let pos = idLen + 2;
      for (const id of clients) {
        id.write(dv, pos);
        pos += idLen;
      }
      return u8;
    },

    encodeRemovedClients(canvas_id, clientSlots) {
      const u8 = new Uint8Array(clientSlots.length + idLen + 2);
      const dv = ndv(u8);
      u8[0] = CURSOR_CMD;
      u8[1] = RemovedClients;
      canvas_id.write(dv, 2);
      let pos = idLen + 2;
      for (const slot of clientSlots) {
        u8[pos++] = slot;
      }
      return u8;
    },

    encodeAssignSlot(canvas_id, canvasSlot) {
      const u8 = new Uint8Array(2 + idLen + 1);
      const dv = ndv(u8);
      u8[0] = CURSOR_CMD;
      u8[1] = AssignSlot;
      canvas_id.write(dv, 2);
      let pos = idLen + 2;
      u8[idLen + 2] = canvasSlot;
      return u8;
    },

    *decodeClients(u8) {
      const dv = ndv(u8);
      for (let i = 2 + idLen; i < u8.length; i += idLen) {
        yield Id.read(dv, i);
      }
    },

    *decodeRemoves(u8) {
      let start = 2 + idLen;
      for (let i = u8.length - 1; i >= start; --i) {
        yield u8[i];
      }
    },

    decodeAssignedSlot(u8) {
      return u8[2 + idLen];
    },

    decodeCanvas: (u8) => {
      return Id.read(ndv(u8), 2);
    },
  };

  return CursorMessage;
});
