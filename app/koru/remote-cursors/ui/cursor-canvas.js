define((require, exports, module) => {
  'use strict';
  const Dom             = require('koru/dom');
  const Id              = require('koru/id');
  const CursorMessage   = require('koru/remote-cursors/cursor-message');

  const {myCtx} = Dom;

  const dimCache$ = Symbol();

  const {original$} = require('koru/symbols');

  const smallFrac = 0.000000001;

  const Actions = [];
  Actions[CursorMessage.Move] = function (data) {
    const dim = this.getClientSpritesPos(Date.now());
    for (const mv of CursorMessage.decodeClientMoves(data)) {
      if (mv.i >= this.clientSlots.length) {
        continue;
      }
      const client = this.clientSlots[mv.i];
      client.deltaX = mv.x - client.x;
      client.x = mv.x;
      client.deltaY = mv.y - client.y;
      client.y = mv.y;
      this.clientMoved(client, dim);
    }
  };

  Actions[CursorMessage.AttachShape] = function (data) {
    // const {width, height} = this.clientSprites.getBoundingClientRect();
    // const pfontSize = +window.getComputedStyle(this.clientSprites).getPropertyValue('font-size')
    //   .slice(0, -2);
    // for (const shape of CursorMessage.decodeShapes(data)) {
    //   const clientElm = this.clientSlots[shape.i];
    //   if (clientElm === undefined) continue;
    //   if (shape.isAdd) {
    //     this.removeShape(clientElm);
    //     const doc = this.findShape(shape.type, shape.id);
    //     if (doc === undefined) continue;
    //     const shapeElm = doc.findElement();
    //     const cs = window.getComputedStyle(shapeElm);
    //     const shapeDim = shapeElm.getBoundingClientRect();
    //     const mv = Dom.myCtx(clientElm)?.move;
    //     if (mv === undefined || shapeElm === undefined) continue;
    //     doc.$noAnimate(true);
    //     const x = 100 * ((width * shape.x) - (width * mv.x - 12)) / shapeDim.width;
    //     const y = 100 * ((height * shape.y) - (height * mv.y - 12)) / shapeDim.height;

    //     shapeElm.classList.add('ui-cursor-attached');
    //     const copy = shapeElm.cloneNode(true);
    //     Dom.myCtx(copy)[original$] = shapeElm;
    //     const {style} = copy;
    //     style.removeProperty('left');
    //     style.removeProperty('top');
    //     style.setProperty(
    //       'font-size',
    //       (100 * +cs.getPropertyValue('font-size').slice(0, -2) / pfontSize) + '%',
    //     );

    //     style.setProperty('transform', `translate(${x}%, ${y}%)`);

    //     clientElm.insertBefore(copy, clientElm.firstChild);
    //   } else {
    //     this.removeShape(clientElm, shape.noAnimate);
    //   }
    // }
  };

  const correctId = (canvas, data) => canvas.canvas_id.equals(CursorMessage.decodeCanvas(data));

  Actions[CursorMessage.NewClients] = function (data) {
    if (!correctId(this, data)) {
      return;
    }

    for (const id of CursorMessage.decodeClients(data)) {
      const elm = this.addClientSprite(id, this.clientSlots.length);
      this.clientSlots.push({
        elm,
        x: smallFrac,
        y: smallFrac,
        deltaX: smallFrac,
        deltaY: smallFrac,
      });
      if (elm != null) {
        this.clientSprites.appendChild(elm);
      }
    }
  };

  Actions[CursorMessage.RemovedClients] = function (data) {
    if (!correctId(this, data)) {
      return;
    }
    let last = this.clientSlots.length - 1;
    for (const slot of CursorMessage.decodeRemoves(data)) {
      if (last < 0) {
        continue;
      }

      const client = this.clientSlots[slot];
      if (slot !== last) {
        this.clientSlots[slot] = this.clientSlots[last];
        if (last === this.mySlot) {
          this.mySlot = slot;
        }
      }
      this.removeClientSprite(client, last);
      --last;
    }
    this.clientSlots.length = last + 1;
  };

  Actions[CursorMessage.AssignSlot] = function (data) {
    if (correctId(this, data)) {
      this.mySlot = CursorMessage.decodeAssignedSlot(data);
    }
  };

  class CursorCanvas {
    clientSlots = [];
    lastMove = 0;
    lastReport = 0;
    clientSprites = null;
    canvas_id = Id.nullId();
    clientSprites = null;
    mySlot = 255;
    [dimCache$] = {left: 0.1, top: 0.1, width: 0.1, height: 0.1, xfrac: 0.1, yfrac: 0.1};

    constructor({me, sender, addClientSprite, removeClientSprite, getDimensions, clientMoved}) {
      this.me = me;
      this.send = sender;
      this.addClientSprite = addClientSprite;
      this.removeClientSprite = removeClientSprite;
      this.getDimensions = getDimensions;
      this.clientMoved = clientMoved;
    }

    monitor(clientSprites, canvas_id = Id.nullId()) {
      this.clientSprites = clientSprites ?? null;
      this.canvas_id = canvas_id;
      this.lastMove = 0;
      this.clientSlots.length = 0;
    }

    isMonitoring() {
      return this.clientSprites !== null;
    }

    receive(msg) {
      if (this.clientSprites != null) {
        Actions[msg[1]]?.call(this, msg);
      }
    }

    getClientSpritesPos(now) {
      const dimCache = this[dimCache$];

      if (this.lastMove + 200 < now) {
        const dim = this.getDimensions();
        if (
          dim.left !== dimCache.left ||
          dim.top !== dimCache.top ||
          dim.width !== dimCache.width ||
          dim.height !== dimCache.height
        ) {
          dimCache.left = dim.left;
          dimCache.top = dim.top;
          dimCache.width = dim.width;
          dimCache.height = dim.height;
          dimCache.xfrac = 1.000000000001 / dimCache.width;
          dimCache.yfrac = 1.000000000001 / dimCache.height;
        }
        this.lastMove = now;
      }
      return dimCache;
    }

    move(x, y, now) {
      const dimCache = this.getClientSpritesPos(now);
      this.lastReport = now;

      this.send(
        CursorMessage.encodeMove(
          Math.max(0, Math.min(1, (x - dimCache.left) * dimCache.xfrac)),
          Math.max(0, Math.min(1, (y - dimCache.top) * dimCache.yfrac)),
        ),
      );
    }
  }

  return CursorCanvas;
});
