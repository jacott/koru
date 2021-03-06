define((require)=>{
  'use strict';
  const koru = require('koru');
  const Dom  = require('koru/dom');
  const util = require('koru/util');

  const offset$ = Symbol();

  const ZoomDrag = {
    start(options) {
      const {
        event, target=event.target, targetGeometry=target.getBoundingClientRect()
      } = options;

      const dim = {
        scale: 1,
        midX: event.clientX - targetGeometry.left, midY: event.clientY - targetGeometry.top,
        adjustX: 0, adjustY: 0,
      };

      switch(event.type) {
      case 'wheel': return wheelZoom(options, dim, targetGeometry);
      case 'touchstart': return touchZoom(options, dim, targetGeometry);
      default: return pointerZoom(options, dim, targetGeometry);
      }
    },
  };

  const wheelZoom = (options, dim, targetGeometry)=>{
    const {
      event, target=event.target, onChange, onComplete, constrainZoom,
      updateDelay=200,
    } = options;
    const {isFinished} = options;

    const {left, top} = targetGeometry;

    let pendingMove = 0;
    let x = 0, y = 0, delta = 0;
    let endTime = 0, afTimeout = null;

    const recordPos = event=>{
      x = event.clientX - left;
      y = event.clientY - top;

      if (pendingMove == 0)
        pendingMove = window.requestAnimationFrame(reportMove);
    };


    const wheel = event=>{
      Dom.stopEvent(event);
      recordPos(event);

      const mult = event.deltaMode == 0 ? 1 : 79.5/3;
      delta -= event.deltaY*mult;


      endTime = util.dateNow() + updateDelay;

      if (afTimeout === null && checkFinished === complete)
        afTimeout = koru.afTimeout(finishZoom, updateDelay);
    };

    const finishZoom = ()=>{
      const now = util.dateNow();
      if (now < endTime)
        afTimeout = koru.afTimeout(finishZoom, endTime - now);
      else {
        afTimeout = null;
        complete();
      }
    };

    const reportMove = ()=>{
      pendingMove = 0;
      dim.midX = x;
      dim.midY = y;
      dim.scale = Math.pow(Math.E, delta/400);
      onChange(dim);
    };

    const complete = ()=>{
      if (pendingMove != 0) {
        window.cancelAnimationFrame(pendingMove);
        reportMove();
      }
      stop();
      onComplete(dim, {});
    };

    const checkFinished = typeof isFinished === 'function' ? event => {
      Dom.stopEvent(event);
      if (isFinished(event)) {
        complete();
      } else if (typeof event.clientX === 'number') {
        recordPos(event);
      }
    } : complete;

    document.addEventListener('wheel', wheel, Dom.captureEventOption);
    window.addEventListener('keyup', checkFinished, Dom.captureEventOption);
    document.addEventListener('pointermove', checkFinished, Dom.captureEventOption);

    wheel(event);

    const stop = ()=>{
      document.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keyup', checkFinished, true);
      document.removeEventListener('pointermove', checkFinished, true);
      if (pendingMove != 0) {
        window.cancelAnimationFrame(pendingMove);
        pendingMove = 0;
      }
      if (afTimeout !== null) {
        afTimeout();
        afTimeout = null;
      }
    };

    return {stop};
  };


  const touchZoom = (options, dim, targetGeometry)=>{
    const {
      event, target=event.target, onChange, onComplete,
      constrainZoom, threshold=100,
    } = options;

    Dom.stopEvent(event);

    const {left, top} = targetGeometry;

    const t0 = {x: 0, y: 0}, t1 = {x: 0, y: 0};

    let pendingMove = 0, sMag = 1;

    const {touches} = event;

    const x0 = t0.x = touches[0].clientX - left;
    const y0 = t0.y = touches[0].clientY - top;

    const x1 = t1.x = touches.length == 1 ? t0.x : touches[1].clientX - left;
    const y1 = t1.y = touches.length == 1 ? t0.y : touches[1].clientY - top;

    const dx = x1 - x0, dy = y1 - y0;

    sMag = constrainZoom === 'x' ? Math.abs(dx)
      : constrainZoom === 'y' ? Math.abs(dy) : Math.sqrt(dx*dx + dy*dy);
    dim.midX = x0 + dx/2;
    dim.midY = y0 + dy/2;

    const touchmove = event =>{
      Dom.stopEvent(event);
      const {touches} = event;
      t0.x = touches[0].clientX - left;
      t0.y = touches[0].clientY - top;

      t1.x = touches.length == 1 ? t0.x : touches[1].clientX - left;
      t1.y = touches.length == 1 ? t0.y : touches[1].clientY - top;

      if (pendingMove == 0)
        pendingMove = window.requestAnimationFrame(reportMove);
    };

    const reportMove = ()=>{
      pendingMove = 0;
      const x0 = t0.x, x1 = t1.x;
      const y0 = t0.y, y1 = t1.y;
      const dx = x1 - x0, dy = y1 - y0;
      const cx = x0 + dx/2, cy = y0 + dy/2;

      dim.adjustX = cx - dim.midX; dim.adjustY = cy - dim.midY;
      dim.scale = sMag == 0 ? 1 : (
        constrainZoom === 'x' ? Math.abs(dx) : constrainZoom === 'y'
          ? Math.abs(dy) : Math.sqrt(dx*dx + dy*dy)
      ) / sMag;

      onChange(dim);
    };

    const touchend = event =>{
      if (pendingMove != 0) {
        window.cancelAnimationFrame(pendingMove);
        reportMove();
      }
      if (event.type === 'touchend' && event.touches.length >= 2) return;

      stop();
      onComplete(dim, {click: false});
    };

    const stop = ()=>{
      if (pendingMove != 0) {
        window.cancelAnimationFrame(pendingMove);
        pendingMove = 0;
      }

      document.removeEventListener('touchmove', touchmove, Dom.captureEventOption);
      document.removeEventListener('touchend', touchend, Dom.captureEventOption);
      document.removeEventListener('touchcancel', touchend, Dom.captureEventOption);
    };


    document.addEventListener('touchmove', touchmove, Dom.captureEventOption);
    document.addEventListener('touchend', touchend, Dom.captureEventOption);
    document.addEventListener('touchcancel', touchend, Dom.captureEventOption);

    return {
      stop,
    };
  };

  const pointerZoom = (options, dim, targetGeometry)=>{
    const {
      event, target=event.target, onChange, onComplete,
      constrainZoom, threshold=100,
    } = options;


    const {left, top} = targetGeometry;

    const pri = {id: undefined, x: 0, y: 0}, sec = {id: undefined, x: 0, y: 0};
    const findPointer = id=> id == pri.id ? pri : id == sec.id ? sec: undefined;

    let moved = false, count = 0, pendingMove = 0, sMag = 1;

    const pointerdown = event =>{
      if (count == 2) return;
      const id = event.pointerId;

      if (findPointer(id) !== undefined) return;
      target.setPointerCapture(id);
      ++count;
      const pointer = pri.id == undefined ? pri : sec;
      pointer.id = id;
      pointer.x = event.clientX - left;
      pointer.y = event.clientY - top;
      if (count == 2) {
        moved = true;
        const x0 = pri.x, x1 = sec.x;
        const y0 = pri.y, y1 = sec.y;
        const dx = x1 - x0, dy = y1 - y0;

        sMag = constrainZoom === 'x' ? Math.abs(dx)
          : constrainZoom === 'y' ? Math.abs(dy) : Math.sqrt(dx*dx + dy*dy);
        dim.midX = x0 + dx/2;
        dim.midY = y0 + dy/2;
      }
    };

    const pointermove = event =>{
      const x = event.clientX - left;
      const y = event.clientY - top;
      const pointer = findPointer(event.pointerId);
      if (! moved) {
        const dx = pointer.x - x;
        const dy = pointer.y - y;
        if (dx*dx + dy*dy < threshold) return;
      }
      moved = true;
      if (pointer === undefined) return;

      pointer.x = x;
      pointer.y = y;
      if (pendingMove == 0)
        pendingMove = window.requestAnimationFrame(reportMove);
    };

    const reportMove = ()=>{
      pendingMove = 0;
      if (count == 1) {
        const pointer = sec.id == undefined ? pri : sec;
        dim.adjustX = pointer.x - dim.midX;
        dim.adjustY = pointer.y - dim.midY;
      } else {
        const x0 = pri.x, x1 = sec.x;
        const y0 = pri.y, y1 = sec.y;
        const dx = x1 - x0, dy = y1 - y0;
        const cx = x0 + dx/2, cy = y0 + dy/2;

        dim.adjustX = cx - dim.midX; dim.adjustY = cy - dim.midY;
        dim.scale = (
          constrainZoom === 'x' ? Math.abs(dx) : constrainZoom === 'y'
            ? Math.abs(dy) : Math.sqrt(dx*dx + dy*dy)
        ) / sMag;
      }

      onChange(dim);
    };

    const pointerup = event =>{
      if (pendingMove != 0) {
        window.cancelAnimationFrame(pendingMove);
        reportMove();
      }

      const pointer = findPointer(event.pointerId);
      if (pointer === undefined) return;
      target.releasePointerCapture(pointer.id);
      pointer.id = undefined;
      if (--count == 1 && event.type !== 'lostpointercapture') return;
      stop();
      onComplete(dim, {click: ! moved, cancelled: event.type === 'lostpointercapture'});
    };

    const stop = ()=>{
      if (pendingMove != 0) {
        window.cancelAnimationFrame(pendingMove);
        pendingMove = 0;
      }
      pri.id == undefined || target.releasePointerCapture(pri.id);
      sec.id == undefined || target.releasePointerCapture(sec.id);

      pri.id = sec.id = undefined;

      target.removeEventListener('pointerdown', pointerdown, Dom.captureEventOption);
      target.removeEventListener('pointermove', pointermove, Dom.captureEventOption);
      target.removeEventListener('pointerup', pointerup, Dom.captureEventOption);
      target.removeEventListener('lostpointercapture', pointerup, Dom.captureEventOption);
    };


    target.addEventListener('pointerdown', pointerdown, Dom.captureEventOption);
    target.addEventListener('pointermove', pointermove, Dom.captureEventOption);
    target.addEventListener('pointerup', pointerup, Dom.captureEventOption);
    target.addEventListener('lostpointercapture', pointerup, Dom.captureEventOption);

    pointerdown(event);

    return {
      stop,
    };
  };


  return ZoomDrag;
});
