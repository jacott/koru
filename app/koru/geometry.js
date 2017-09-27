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
        const xo = ps[0], yo = ps[1];
        return [xo+t*(curve[0]-xo), yo+t*(curve[1]-yo)];
      } else {
        const r = 1-t, r2 = r*r, r3 = r*r2;
        const t2 = t*t, t3 = t*t2;
        // P*(1-t)^3 + Q*3*t(1-t)^2 + 3*R*t^2*(1-t) + S*t^3
        return [
          r3 * ps[0] +
            3 * r2 * t * curve[0] +
            3 * r * t2 * curve[2] +
            t3 * curve[4],
          r3 * ps[1] +
            3 * r2 * t * curve[1] +
            3 * r * t2 * curve[3] +
            t3 * curve[5],
        ];
      }
    },

    tTangent(t, ps, curve) {
      if (curve.length == 2) {
        const x = curve[0]-ps[0], y = curve[1]-ps[1];
        const norm = Math.sqrt(x*x+y*y);
        return [x/norm, y/norm];
      } else {
        const x0 = ps[0], y0 = ps[1];
        const x1 = curve[0], y1 = curve[1];
        const x2 = curve[2], y2 = curve[3];
        const x3 = curve[4], y3 = curve[5];

        if (t == 0 && x0 == x1 && y0 == y1)
          t = 0.00001;
        else if (t == 1 && x2 == x3 && y2 == y3)
          t = 0.99999;

        const r = 1-t, r2 = r*r;
        const t2 = t*t;

          // -3 P (1 - t)^2 + Q(3 (1 - t)^2 - 6 (1 - t) t) + R(6 (1 - t) t - 3 t^2) + 3 S t^2

        const x = -3 * x0*r2 +
                x1*(3*r2 - 6*r*t) +
                x2*(6*r*t - 3*t2) +
                x3*3*t2,
              y = -3 * y0*r2 +
                y1*(3*r2 - 6*r*t) +
                y2*(6*r*t - 3*t2) +
                y3*3*t2;

        const norm = Math.sqrt(x*x+y*y);
        return [x/norm, y/norm];
      }
    },

    splitBezier(t, ps, curve) {
      const ls = [ps[0], ps[1]], lc = [0,0, 0,0, 0,0];
      const rs = [0, 0], rc = [0,0, 0,0, curve[4],curve[5]];

      for(let i = 0; i < 2; ++i) {
        const s1 = ps[i], s2 = curve[i], s3 = curve[i+2], s4 = curve[i+4];
        const s12 = lc[i] = (s2-s1)*t+s1;
        const s23 = (s3-s2)*t+s2;
        const s34 = rc[i+2] = (s4-s3)*t+s3;
        const s123 = lc[i+2] = (s23-s12)*t+s12;
        const s234 = rc[i] = (s34-s23)*t+s23;
        rs[i] = lc[i+4] = (s234-s123)*t+s123;
      }

      return {left: {ps: ls, curve: lc}, right: {ps: rs, curve: rc}};
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
