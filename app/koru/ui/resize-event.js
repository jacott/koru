define(function(require, exports, module) {
  const Dom = require('koru/dom');

  const WIDTH_RESIZE_ELM = Dom.h({
    div: [{
      div: {div: '', $style: 'width:200%;height:100%'},
      $style: 'position:absolute;left:0;width:100%;height:20px;overflow-x:scroll',
    }, {
      div: {div: '', $style: 'width:200vw;height:100%'},
      $style: 'position:absolute;left:0;width:100%;height:20px;overflow-x:scroll',
    }],
    class: 'resize-detector',
    $style: 'position:relative;width:100%;height:0;pointer-events:none;visibility:hidden;',
  });

  exports.onWidthResize = function (elm, callback) {
    const resizer = WIDTH_RESIZE_ELM.cloneNode(true);
    elm.appendChild(resizer);
    let offsetWidth, waiting = true;
    window.requestAnimationFrame(fire);

    resizer.firstChild.addEventListener('scroll', scrolled);
    resizer.lastChild.addEventListener('scroll', scrolled);

    detach.reset = fire;

    return detach;

    function detach() {
      resizer.firstChild.removeEventListener('scroll', scrolled);
      resizer.lastChild.removeEventListener('scroll', scrolled);
      Dom.remove(resizer);
      waiting = false;
    }

    function fire() {
      var nw = elm.offsetWidth;
      if (waiting === callback && nw !== offsetWidth)
        callback(elm, nw);
      offsetWidth = nw;
      resizer.firstChild.scrollLeft = resizer.lastChild.scrollLeft = 10000;
      waiting = false;
    }

    function scrolled(event) {
      if (waiting) return;
      waiting = callback;
      window.requestAnimationFrame(fire);
    }
  };
});
