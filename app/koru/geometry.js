define(function(require, exports, module) {
  const IGR = 2/(Math.sqrt(5) + 1) ;

  const DTR = Math.PI/180;

  const tPoint = (t, ps, curve)=>{
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
  };

  const dist2 = (p1, p2)=>{
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    return dx*dx+dy*dy;
  };

  return {
    rotatePoints(points, angle) {
      const ans = points.slice(), plen = points.length;
      switch (angle) {
      case 0: return ans;
      case -180: case 180:
        for(let i = 0; i < plen; i += 2) {
          const x = ans[i], y = ans[i+1];
          if (x != 0) ans[i] = -x;
          if (y != 0) ans[i+1] = -y;
        }
        return ans;
      case 90:
        for(let i = 0; i < plen; i += 2) {
          const x = ans[i], y = ans[i+1];
          ans[i] = y == 0 ? 0 : -y;
          ans[i+1] = x;
        }
        return ans;
      case -90:
        for(let i = 0; i < plen; i += 2) {
          const x = ans[i], y = ans[i+1];
          ans[i] = y;
          ans[i+1] = x == 0 ? 0 : -x;
        }
        return ans;
      default:
        const t = DTR*angle;
        const sint = Math.sin(t), cost = Math.cos(t);

        for(let i = 0; i < plen; i += 2) {
          const x = ans[i], y = ans[i+1];
          ans[i] = x*cost-y*sint;
          ans[i+1] = x*sint+y*cost;
        }
        return ans;
      }
    },

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

    tPoint,

    tTangent(t, ps, curve) {
      let x, y;
      const x0 = ps[0], y0 = ps[1];
      const x1 = curve[0], y1 = curve[1];
      if (curve.length == 2) {
        x = x1-x0; y = y1-y0;
      } else {
        const x2 = curve[2], y2 = curve[3];
        const x3 = curve[4], y3 = curve[5];

        if (t == 0) {
          if (x0 == x1 && y0 == y1) {
            x = x2-x0; y = y2-x0;
          } else {
            x = x1-x0; y = y1-y0;
          }
        } else if (t == 1) {
          if (x2 == x3 && y2 == y3) {
            x = x3-x1; y = y3-y1;
          } else {
            x = x3-x2; y = y3-y2;
          }
        } else {
          const r = 1-t, r2 = r*r;
          const t2 = t*t;

          // -3 P (1 - t)^2 + Q(3 (1 - t)^2 - 6 (1 - t) t) + R(6 (1 - t) t - 3 t^2) + 3 S t^2

          x = -3 * x0*r2 +
            x1*(3*r2 - 6*r*t) +
            x2*(6*r*t - 3*t2) +
            x3*3*t2;
          y = -3 * y0*r2 +
            y1*(3*r2 - 6*r*t) +
            y2*(6*r*t - 3*t2) +
            y3*3*t2;
        }
      }

      const norm = Math.sqrt(x*x+y*y);
      return [x/norm, y/norm];
    },

    closestT(point, ps, curve, tol=0.00001) {
      if (curve.length == 2) {
        const xo = ps[0], yo = ps[1];
        const a1 = point[0] - xo, a2 = point[1] - yo;
        const b1 = curve[0] - xo, b2 = curve[1] - yo;
        // t = a·b/b·b
        return Math.min(Math.max(0, (a1*b1+a2*b2)/(b1*b1+b2*b2)), 1);
      } else {
        // numerical method using Golden-section-search
        let sb = .33, mt = 0, md = dist2(point, tPoint(0, ps, curve));
        for(let sa = 0; sa < 1 ; sa = sb, sb += .33) {
          let a = sa, b = sb > 1 ? 1 : sb;
          let c = b - (b - a)*IGR,
              d = a + (b - a)*IGR;
          while (Math.abs(c - d) > tol) {
            if (dist2(point, tPoint(c, ps, curve)) < dist2(point, tPoint(d, ps, curve)))
              b = d;
            else
              a = c;

            c = b - (b - a)*IGR;
            d = a + (b - a)*IGR;
          }
          const t = .5*(b + a);
          const td = dist2(point, tPoint(t, ps, curve));

          if (td < md) {
            mt = t; md = td;
          }
        }

        return (dist2(point, tPoint(1, ps, curve)) < md) ? 1 : mt;
      }
    },

    splitBezier(t, ps, curve) {
      const ls = [ps[0], ps[1]], lc = curve;
      const rc = [0,0, 0,0, curve[4],curve[5]];

      for(let i = 0; i < 2; ++i) {
        const s1 = ps[i], s2 = curve[i], s3 = curve[i+2], s4 = curve[i+4];
        const s12 = lc[i] = (s2-s1)*t+s1;
        const s23 = (s3-s2)*t+s2;
        const s34 = rc[i+2] = (s4-s3)*t+s3;
        const s123 = lc[i+2] = (s23-s12)*t+s12;
        const s234 = rc[i] = (s34-s23)*t+s23;
        lc[i+4] = (s234-s123)*t+s123;
      }

      return rc;
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
