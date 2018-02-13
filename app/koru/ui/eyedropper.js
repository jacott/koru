define(function(require, exports, module) {
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const Geometry        = require('koru/geometry');
  const SelectMenu      = require('koru/ui/select-menu');
  const util            = require('koru/util');
  const uColor          = require('koru/util-color');

  const glassPane = Dom.h({class: 'glassPane'});

  const Eyedropper = {
    options: null,
    pick(callback) {
      const cancelEventListener = ()=>{
        document.removeEventListener('pointerdown', pointerdown, true);
      };

      const cancel = ()=>{
        cancelEventListener();
        document.body.classList.remove('eyedropper-active');
        glassPane.remove();
      };

      const pointerdown = event=>{
        cancelEventListener();
        Dom.stopEvent(event);
        glassPane.remove();

        try {
          Eyedropper.getPointColors(event.clientX, event.clientY, (err, colors)=>{
            if (err) {
              koru.unhandledException(err);
              callback(err);
              return;
            }

            const list = [];

            const addColor = name=>{
              const color = colors[name];
              if (color == null) return;
              for(let i = 0; i < list.length; ++i) {
                if (util.deepEqual(color, colors[list[i][0]]))
                  return;
              }

              list.push([name, Dom.h({div: {
                style: `background-color:${uColor.toRgbStyle(color)};`, div: []
              }})]);
            };

            addColor('imageColor');
            if (list.length == 0) {
              addColor('backgroundColor');
              addColor('borderColor');
              addColor('textColor');
            }

            if (list.length < 2) {
              cancel();
              callback(null, list.length == 0 ? null : uColor.toRgbStyle(colors[list[0][0]]));
              return;
            }

            SelectMenu.popup(null, {
              classes: 'eyedropper-chooser',
              boundingClientRect: {left: Math.max(0, event.x - 20), top: event.clientY},
              list,
              onClose: cancel,
              onSelect(elm) {
                const color = colors[Dom.myCtx(elm).data._id];
                callback(null, uColor.toRgbStyle(color));
                return true;
              }
            }, 'on');

          });
        } catch(ex) {
          cancel();
          koru.unhandledException(ex);
          callback(ex);
        }
      };

      document.addEventListener('pointerdown', pointerdown, true);
      document.body.classList.add('eyedropper-active');
      document.body.appendChild(glassPane);
    },

    getPointColors(x, y, callback) {
      const stack = [];
      let color = null, textColor = null, borderColor = null;
      const {body} = document;

      let image;
      while (true) {
        let elm = document.elementFromPoint(x, y);
        if (elm == null) break;

        const cs = window.getComputedStyle(elm);

        if (elm.namespaceURI === Dom.SVGNS) {
          if (elm.tagName === 'svg') {
            color = uColor.toRGB(cs.getPropertyValue('background-color'));
            if (image === undefined) image = elm;
          } else {
            const fv = cs.getPropertyValue('fill'), sv = cs.getPropertyValue('stroke');
            if (fv !== 'none') color = uColor.toRGB(fv);
            if (sv !== 'none' && textColor === null) textColor = uColor.toRGB(sv);

            if (fv !== 'none' && color.a >= .1 && callback !== undefined) {
              image = elm.closest('svg');
              break;
            }
          }
        } else {
          color = uColor.toRGB(cs.getPropertyValue('background-color'));

          if (borderColor === null && cs.getPropertyValue('border-width') !== '0px') {
            borderColor =  uColor.toRGB(cs.getPropertyValue('border-color'));
          }
          if (textColor === null) {
            const range = (document.caretPositionFromPoint
                           ? document.caretPositionFromPoint(x, y)
                           : document.caretRangeFromPoint(x,y));
            if (range !== null && range.startContainer.nodeType === document.TEXT_NODE) {
              textColor = uColor.toRGB(cs.getPropertyValue('color'));
            }
          }
          const bi = cs.getPropertyValue('background-image');
          if (bi !== 'none') {
            if (color != null && color.a < .1) color = null;
            image = elm;
            break;
          }

        }
        if ((color != null && color.a >= .1) || elm === body)
          break;

        color = null;

        const {style} = elm;
        stack.push([style, style.getPropertyValue('visibility')]);
        style.setProperty('visibility', 'hidden');
      }
      for(let i = stack.length-1; i >= 0; --i) {
        const row = stack[i];
        row[0].setProperty('visibility', row[1]);
      }

      const colors = {textColor, backgroundColor: color, imageColor: undefined};
      if (borderColor !== null)
        colors.borderColor = borderColor;

      if (callback !== undefined) {
        if (image !== undefined)
          Eyedropper.getColorFromImage(image, x, y, (err, imageColor)=>{
            colors.imageColor = imageColor;
            callback(err, colors);
          });
        else
          callback(null, colors);
      }

      return colors;
    },

    getColorFromImage(image, x, y, callback) {
      const ics = window.getComputedStyle(image);
      const {left, top} = image.getBoundingClientRect();
      const owidth = +ics.getPropertyValue('width').slice(0,-2);
      const oheight = +ics.getPropertyValue('height').slice(0,-2);

      const matrixStr = ics.getPropertyValue('transform');
      const matrix = matrixStr === 'none' ? null : matrixStr.split(/([-\d.]+)/)
            .filter(m => /^[-\d.]/.test(m)).map(m => +m);
      const origin = matrix === null
            ? null : ics.getPropertyValue('transform-origin').split(' ').map(m => +(m.slice(0,-2)));

      x -= left; y -= top;

      let url;

      if(image.tagName === 'svg') {
        const imageClone = image.cloneNode(true);
        const {style} = imageClone;
        style.removeProperty('transform');
        style.removeProperty('transform-origin');
        style.setProperty('overflow', 'visible');
        style.setProperty('position', 'absolute');
        style.setProperty('left', 0);
        style.setProperty('top', 0);
        style.setProperty('margin', 0);

        if (Eyedropper.options != null && Eyedropper.options.setupSvg != null)
          Eyedropper.options.setupSvg(imageClone, x, y, image);

        const data = `<svg xmlns="${Dom.SVGNS}" ${imageClone.outerHTML.slice(4)}`;
        const blob = new window.Blob([data], {type: 'image/svg+xml'});
        url = window.URL.createObjectURL(blob);
      } else {
        url = image.style.getPropertyValue('background-image').replace(/^url\(['"]?|['"]?\)$/g, '');
      }

      const img = new window.Image(owidth, oheight);
      img.crossOrigin = "anonymous";

      img.onerror = err =>{
        window.URL.revokeObjectURL(url);
        callback(null, null);
      };

      img.onload = ()=>{
        try {
          Dom.remove(Dom('canvas'));
          const canvas = Dom.h({canvas: [], width: 1, height: 1});

          const ctx = canvas.getContext('2d');

          if (matrix !== null) {
            let {left: ox, top: oy} = Geometry.topLeftTransformOffset(
              {width: owidth, height: oheight}, matrix);
            ctx.translate(ox-x, oy-y);
            ctx.transform(...matrix);
          } else {
            ctx.translate(-x, -y);
          }

          ctx.drawImage(img, 0, 0, owidth, oheight);
          window.URL.revokeObjectURL(url);
          const c = ctx.getImageData(0, 0, 1, 1).data;

          callback(null, c[3] == 0 ? null : {r: c[0], g: c[1], b: c[2], a: c[3]/255});
        } catch(ex) {
          koru.unhandledException(ex);
          callback(ex);
        }
      };

      img.src = url;
    },
  };

  return Eyedropper;
});
