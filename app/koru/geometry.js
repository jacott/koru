define(function(require, exports, module) {

  return {
    combineBox(a, b) {
      a.left = Math.min(a.left, b.left);
      a.top = Math.min(a.top, b.top);
      a.right = Math.max(a.right, b.right);
      a.bottom = Math.max(a.bottom, b.bottom);
      return a;
    },

    combineBoxPoint(box, x, y) {
      if (x < box.left) box.left = x;
      else if (x > box.right) box.right = x;

      if (y < box.top) box.top = y;
      else if (y > box.bottom) box.bottom = y;

      return box;
    },

    tPoint(t, ps, curve) {
      if (curve.length == 2) {
        return [ps[0]+t*(curve[0]-ps[0]), ps[1]+t*(curve[1]-ps[1])];
      } else {
        const r = 1-t, r2 = r*r, r3 = r*r2;
        const t2 = t*t, t3 = t*t2;
        return [
          r3 * ps[0]
            + 3 * r2 * t * curve[0]
            + 3 * r * t2 * curve[2]
            + t3 * curve[4],
          r3 * ps[1]
            + 3 * r2 * t * curve[1]
            + 3 * r * t2 * curve[3]
            + t3 * curve[5],
        ];
      }
    },

    bezierBox: (ps, curve)=>{
      const cs = [curve[0], curve[1]];
      const ce = [curve[2], curve[3]];
      const pe = [curve[4], curve[5]];
      const ms = [Math.min(ps[0], pe[0]), Math.min(ps[1], pe[1])];
      const me = [Math.max(ps[0], pe[0]), Math.max(ps[1], pe[1])];
      const f = (t,i) => {
        const cp = (1-t)**3 * ps[i]
                + 3 * (1-t)**2 * t * cs[i]
                + 3 * (1-t) * t**2 * ce[i]
                + t**3 * pe[i];

        ms[i] = Math.min(ms[i], cp);
        me[i] = Math.max(me[i], cp);
      };

      for(let i = 0; i < 2; ++i) {
        const b = 6 * ps[i] - 12 * cs[i] + 6 * ce[i];
        const a = -3 * ps[i] + 9 * cs[i] - 9 * ce[i] + 3 * pe[i];
        const c = 3 * cs[i] - 3 * ps[i];

        if (a == 0) {
          if (b == 0) continue;
          const t = -c / b;
          if (0 < t && t < 1) {
            f(t,i);
          }
          continue;
        }

        const b2ac = b ** 2 - 4 * c * a;
        if (b2ac >= 0) {
          const t1 = (-b + Math.sqrt(b2ac))/(2 * a);
          if (0 < t1 && t1 < 1) f(t1,i);
          const t2 = (-b - Math.sqrt(b2ac))/(2 * a);
          if (0 < t2 && t2 < 1) f(t2,i);
        }
      };

      return {left: ms[0], top: ms[1], right: me[0], bottom: me[1]};
    },
  };
});
