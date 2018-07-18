define((require)=>{
  const Dom             = require('koru/dom');

  const CSS = 'position:absolute;left:0;top:-100%;width:100%;height:100%;margin:1px 0 0;'+
        'border:none;opacity:0;pointer-events:none;pointer-events:none;';

  return {
    onWidthResize: (elm, callback) => {
      let frame = document.createElement('iframe');
      frame.style.cssText = CSS;
      elm.appendChild(frame);

      let offsetWidth = 0, waiting = false;
      let cancelRaf = 0;

      const detach = ()=>{
        if (cancelRaf != 0) {
          window.cancelAnimationFrame(cancelRaf);
          cancelRaf = 0;
        }
        frame.contentWindow.onresize = null;
        Dom.remove(frame);
        waiting = false;
      };

      const reset = ()=>{
        if (frame.contentWindow !== null && frame.contentWindow.onresize === null)
          frame.contentWindow.onresize = resize;
        const nw = elm.offsetWidth;
        if (waiting && nw !== offsetWidth)
          callback(elm, nw);
        offsetWidth = nw;
        waiting = false;
      };

      const resize = ()=>{
        if (waiting) return;
        waiting = true;
        if (cancelRaf != 0)
          cancelRaf = window.requestAnimationFrame(reset);
      };

      cancelRaf = window.requestAnimationFrame(reset);
      return {detach, reset, resize};
    },
  };
});
