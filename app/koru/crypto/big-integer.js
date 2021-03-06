/**
 *
 * Copyright (c) 2003-2005  Tom Wu
 * All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS-IS" AND WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS, IMPLIED OR OTHERWISE, INCLUDING WITHOUT LIMITATION, ANY
 * WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
 *
 * IN NO EVENT SHALL TOM WU BE LIABLE FOR ANY SPECIAL, INCIDENTAL,
 * INDIRECT OR CONSEQUENTIAL DAMAGES OF ANY KIND, OR ANY DAMAGES WHATSOEVER
 * RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER OR NOT ADVISED OF
 * THE POSSIBILITY OF DAMAGE, AND ON ANY THEORY OF LIABILITY, ARISING OUT
 * OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * In addition, the following condition applies:
 *
 * All redistributions must retain an intact copy of this copyright notice
 * and disclaimer.
 **/

define(()=>{
  if (typeof BigInt === 'function') {
    const fromString = (a, b)=>{
      if (b == 16) return BigInt("0x"+a);
      else if (b == 2) return BigInt("0b"+a);
      return BigInt(a);
    };

    const BZero = BigInt(0);
    const BOne = BigInt(1);
    const BTwo = BigInt(2);
    const BNegOne = BigInt(-1);

    class BigInteger {
      constructor(a,b) {
        this.value = a instanceof BigInt
          ? a
          : (a == null ? BZero : fromString(a,b));
      }

      toString(b) {return this.value.toString(b)}

      isNegative() {return this.value < BZero}
      add(a) {return new BigInteger(this.value + a.value)}
      subtract(a) {return new BigInteger(this.value - a.value)}
      multiply(a) {return new BigInteger(this.value * a.value)}
      mod(m) {return new BigInteger(this.value % m.value)}

      // (public) this^e % m (HAC 14.85)
      modPow(e,m) {
        let exp = e.value;
        const mod = m.value;
        if (mod === BZero) throw new Error("Cannot take modPow with modulus 0");
        let r = BOne,
            base = this.value % mod;
        if (exp < BZero) {
          exp = exp.multiply(BNegOne);
          base = base.modInv(mod);
        }
        while (exp > BZero) {
          if (base === BZero) return new BigInteger(BZero);
          if (exp % BTwo === BOne) r = (r * base) % mod;
          exp = exp / BTwo;
          base = (base * base) % mod;
        }
        return new BigInteger(r);
      }
    }

    return BigInteger;
  } else {
    // bits per digit
    const dbits = 28;
    // return new, unset BigInteger

    const DB = dbits;
    const DM = ((1<<dbits)-1);
    const DV = (1<<dbits);

    const BI_FP = 52;
    const FV = Math.pow(2,BI_FP);
    const F1 = BI_FP-dbits;
    const F2 = 2*dbits-BI_FP;

    // Digit conversions
    const BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
    const BI_RC = new Array();
    let rr,vv;
    rr = "0".charCodeAt(0);
    for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
    rr = "a".charCodeAt(0);
    for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
    rr = "A".charCodeAt(0);
    for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

    const int2char = n => BI_RM.charAt(n);
    const intAt = (s,i)=>{
      const c = BI_RC[s.charCodeAt(i)];
      return (c==null)?-1:c;
    };

    // returns bit length of the integer x
    const nbits = x =>{
      let r = 1, t;
      if((t=x>>>16) != 0) { x = t; r += 16; }
      if((t=x>>8) != 0) { x = t; r += 8; }
      if((t=x>>4) != 0) { x = t; r += 4; }
      if((t=x>>2) != 0) { x = t; r += 2; }
      if((t=x>>1) != 0) { x = t; r += 1; }
      return r;
    };
    // (protected) copy this to r
    const copyTo = (self, r)=>{
      for(let i = self.t-1; i >= 0; --i) r[i] = self[i];
      r.t = self.t;
      r.s = self.s;
    };

    // (protected) set from integer value x, -DV <= x < DV
    const fromInt = (self, x)=>{
      self.t = 1;
      self.s = (x<0)?-1:0;
      if(x > 0) self[0] = x;
      else if(x < -1) self[0] = x+DV;
      else self.t = 0;
    };

    // (protected) set from string and radix
    const fromString = (self, s, b)=>{
      let k;
      if(b == 16) k = 4;
      else if(b == 8) k = 3;
      else if(b == 256) k = 8; // byte array
      else if(b == 2) k = 1;
      else if(b == 32) k = 5;
      else if(b == 4) k = 2;
      else { self.fromRadix(s,b); return; }
      self.t = 0;
      self.s = 0;
      let i = s.length, mi = false, sh = 0;
      while(--i >= 0) {
        const x = (k==8)?s[i]&0xff:intAt(s,i);
        if(x < 0) {
          if(s.charAt(i) == "-") mi = true;
          continue;
        }
        mi = false;
        if(sh == 0)
          self[self.t++] = x;
        else if(sh+k > DB) {
          self[self.t-1] |= (x&((1<<(DB-sh))-1))<<sh;
          self[self.t++] = (x>>(DB-sh));
        }
        else
          self[self.t-1] |= x<<sh;
        sh += k;
        if(sh >= DB) sh -= DB;
      }
      if(k == 8 && (s[0]&0x80) != 0) {
        self.s = -1;
        if(sh > 0) self[self.t-1] |= ((1<<(DB-sh))-1)<<sh;
      }
      clamp(self);
      if(mi) BigInteger.ZERO.subTo(self,self);
    };

    // (protected) clamp off excess high words
    const clamp = (self)=>{
      const c = self.s&DM;
      while(self.t > 0 && self[self.t-1] == c) --self.t;
    };

    // (protected) convert to radix string
    const toRadix = (self, b)=>{
      if(b == null) b = 10;
      if(self.signum() == 0 || b < 2 || b > 36) return "0";
      var cs = self.chunkSize(b);
      var a = Math.pow(b,cs);
      var d = nbv(a), y = nbi(), z = nbi(), r = "";
      self.divRemTo(d,y,z);
      while(y.signum() > 0) {
        r = (a+z.intValue()).toString(b).substr(1) + r;
        y.divRemTo(d,y,z);
      }
      return z.intValue().toString(b) + r;
    };

    class BigInteger {
      constructor(a,b) {
        if(a != null) {
          if (typeof a === 'number') fromInt(this, a);
          else fromString(this, a, b);
        }
      }

      // am: Compute w_j += (x*this_i), propagate carries,
      // c is initial carry, returns final carry.
      // c < 3*dvalue, x < 2*dvalue, this_i < dvalue
      // We need to select the fastest one that works in this environment.

      // Alternately, set max digit bits to 28 since some
      // browsers slow down when dealing with 32-bit numbers.
      am(i,x,w,j,c,n) {
        const xl = x&0x3fff, xh = x>>14;
        while(--n >= 0) {
          let l = this[i]&0x3fff;
          const h = this[i++]>>14;
          const m = xh*l+h*xl;
          l = xl*l+((m&0x3fff)<<14)+w[j]+c;
          c = (l>>28)+(m>>14)+xh*h;
          w[j++] = l&0xfffffff;
        }
        return c;
      }
      clone() { const r = nbi(); copyTo(this, r); return r; }

      // (public) return string representation in given radix
      toString(b) {
        if(this.s < 0) return "-"+this.negate().toString(b);
        let k;
        if(b == 16) k = 4;
        else if(b == 8) k = 3;
        else if(b == 2) k = 1;
        else if(b == 32) k = 5;
        else if(b == 4) k = 2;
        else return toRadix(this, b);
        const km = (1<<k)-1;
        let d, m = false, r = "", i = this.t;
        let p = DB-(i*DB)%k;
        if(i-- > 0) {
          if(p < DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
          while(i >= 0) {
            if(p < k) {
              d = (this[i]&((1<<p)-1))<<(k-p);
              d |= this[--i]>>(p+=DB-k);
            }
            else {
              d = (this[i]>>(p-=k))&km;
              if(p <= 0) { p += DB; --i; }
            }
            if(d > 0) m = true;
            if(m) r += int2char(d);
          }
        }
        return m?r:"0";
      }
      // (public) 0 if this == 0, 1 if this > 0
      signum() {
        if(this.s < 0) return -1;
        else if(this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
        else return 1;
      }

      // (public) -this
      negate() { const r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

      // (public) |this|
      abs() { return (this.s<0)?this.negate():this; }

      // (public) return + if this > a, - if this < a, 0 if equal
      compareTo(a) {
        let r = this.s-a.s;
        if(r != 0) return r;
        let i = this.t;
        r = i-a.t;
        if(r != 0) return r;
        while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
        return 0;
      }

      // (public) return the number of bits in "this"
      bitLength() {
        if(this.t <= 0) return 0;
        return DB*(this.t-1)+nbits(this[this.t-1]^(this.s&DM));
      }

      // (protected) r = this << n*DB
      dlShiftTo(n,r) {
        let i;
        for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
        for(i = n-1; i >= 0; --i) r[i] = 0;
        r.t = this.t+n;
        r.s = this.s;
      }

      // (protected) r = this >> n*DB
      drShiftTo(n,r) {
        for(let i = n; i < this.t; ++i) r[i-n] = this[i];
        r.t = Math.max(this.t-n,0);
        r.s = this.s;
      }

      // (protected) r = this << n
      lShiftTo(n,r) {
        const bs = n%DB;
        const cbs = DB-bs;
        const bm = (1<<cbs)-1;
        const ds = Math.floor(n/DB);
        let c = (this.s<<bs)&DM;
        for(let i = this.t-1; i >= 0; --i) {
          r[i+ds+1] = (this[i]>>cbs)|c;
          c = (this[i]&bm)<<bs;
        }
        for(let i = ds-1; i >= 0; --i) r[i] = 0;
        r[ds] = c;
        r.t = this.t+ds+1;
        r.s = this.s;
        clamp(r);
      }

      // (protected) r = this >> n
      rShiftTo(n,r) {
        r.s = this.s;
        const ds = Math.floor(n/DB);
        if(ds >= this.t) { r.t = 0; return; }
        const bs = n%DB;
        const cbs = DB-bs;
        const bm = (1<<bs)-1;
        r[0] = this[ds]>>bs;
        for(let i = ds+1; i < this.t; ++i) {
          r[i-ds-1] |= (this[i]&bm)<<cbs;
          r[i-ds] = this[i]>>bs;
        }
        if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
        r.t = this.t-ds;
        clamp(r);
      }

      // (protected) r = this - a
      subTo(a,r) {
        let i = 0, c = 0, m = Math.min(a.t,this.t);
        while(i < m) {
          c += this[i]-a[i];
          r[i++] = c&DM;
          c >>= DB;
        }
        if(a.t < this.t) {
          c -= a.s;
          while(i < this.t) {
            c += this[i];
            r[i++] = c&DM;
            c >>= DB;
          }
          c += this.s;
        }
        else {
          c += this.s;
          while(i < a.t) {
            c -= a[i];
            r[i++] = c&DM;
            c >>= DB;
          }
          c -= a.s;
        }
        r.s = (c<0)?-1:0;
        if(c < -1) r[i++] = DV+c;
        else if(c > 0) r[i++] = c;
        r.t = i;
        clamp(r);
      }

      // (protected) r = this * a, r != this,a (HAC 14.12) "this" should be the larger one if appropriate.
      multiplyTo(a,r) {
        const x = this.abs(), y = a.abs();
        let i = x.t;
        r.t = i+y.t;
        while(--i >= 0) r[i] = 0;
        for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
        r.s = 0;
        clamp(r);
        if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
      }

      // (protected) r = this^2, r != this (HAC 14.16)
      squareTo(r) {
        const x = this.abs();
        let i = r.t = 2*x.t;
        while(--i >= 0) r[i] = 0;
        for(i = 0; i < x.t-1; ++i) {
          const c = x.am(i,x[i],r,2*i,0,1);
          if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= DV) {
            r[i+x.t] -= DV;
            r[i+x.t+1] = 1;
          }
        }
        if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
        r.s = 0;
        clamp(r);
      }

      // (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
      // r != q, this != m.  q or r may be null.
      divRemTo(m,q,r) {
        const pm = m.abs();
        if(pm.t <= 0) return;
        const pt = this.abs();
        if(pt.t < pm.t) {
          if(q != null) fromInt(q, 0);
          if(r != null) copyTo(this, r);
          return;
        }
        if(r == null) r = nbi();
        const y = nbi(), ts = this.s, ms = m.s;
        const nsh = DB-nbits(pm[pm.t-1]);	// normalize modulus
        if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
        else { copyTo(pm, y); pt.copyTo(r); }
        const ys = y.t;
        const y0 = y[ys-1];
        if(y0 == 0) return;
        const yt = y0*(1<<F1)+((ys>1)?y[ys-2]>>F2:0);
        const d1 = FV/yt, d2 = (1<<F1)/yt, e = 1<<F2;
        let i = r.t, j = i-ys, t = (q==null)?nbi():q;
        y.dlShiftTo(j,t);
        if(r.compareTo(t) >= 0) {
          r[r.t++] = 1;
          r.subTo(t,r);
        }
        BigInteger.ONE.dlShiftTo(ys,t);
        t.subTo(y,y);	// "negative" y so we can replace sub with am later
        while(y.t < ys) y[y.t++] = 0;
        while(--j >= 0) {
          // Estimate quotient digit
          let qd = (r[--i]==y0)?DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
          if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
            y.dlShiftTo(j,t);
            r.subTo(t,r);
            while(r[i] < --qd) r.subTo(t,r);
          }
        }
        if(q != null) {
          r.drShiftTo(ys,q);
          if(ts != ms) BigInteger.ZERO.subTo(q,q);
        }
        r.t = ys;
        clamp(r);
        if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
        if(ts < 0) BigInteger.ZERO.subTo(r,r);
      }


      // (public) return value as integer
      intValue() {
        if(this.s < 0) {
          if(this.t == 1) return this[0]-DV;
          else if(this.t == 0) return -1;
        }
        else if(this.t == 1) return this[0];
        else if(this.t == 0) return 0;
        // assumes 16 < DB < 32
        return ((this[1]&((1<<(32-DB))-1))<<DB)|this[0];
      }

      // (protected) return x s.t. r^x < DV
      chunkSize(r) { return Math.floor(Math.LN2*DB/Math.log(r)); }

      // (protected) convert from radix string
      fromRadix(s,b) {
        fromInt(this, 0);
        if(b == null) b = 10;
        const cs = this.chunkSize(b);
        const d = Math.pow(b,cs);
        let mi = false;
        let j = 0, w = 0;
        for(let i = 0; i < s.length; ++i) {
          const x = intAt(s,i);
          if(x < 0) {
            if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
            continue;
          }
          w = b*w+x;
          if(++j >= cs) {
            this.dMultiply(d);
            this.dAddOffset(w,0);
            j = 0;
            w = 0;
          }
        }
        if(j > 0) {
          this.dMultiply(Math.pow(b,j));
          this.dAddOffset(w,0);
        }
        if(mi) BigInteger.ZERO.subTo(this,this);
      }

      // (protected) r = this + a
      addTo(a,r) {
        let i = 0, c = 0;
        const m = Math.min(a.t,this.t);
        while(i < m) {
          c += this[i]+a[i];
          r[i++] = c&DM;
          c >>= DB;
        }
        if(a.t < this.t) {
          c += a.s;
          while(i < this.t) {
            c += this[i];
            r[i++] = c&DM;
            c >>= DB;
          }
          c += this.s;
        }
        else {
          c += this.s;
          while(i < a.t) {
            c += a[i];
            r[i++] = c&DM;
            c >>= DB;
          }
          c += a.s;
        }
        r.s = (c<0)?-1:0;
        if(c > 0) r[i++] = c;
        else if(c < -1) r[i++] = DV+c;
        r.t = i;
        clamp(r);
      }

      // (public) this + a
      add(a) { const r = nbi(); this.addTo(a,r); return r; }

      // (public) this - a
      subtract(a) { const r = nbi(); this.subTo(a,r); return r; }

      // (public) this * a
      multiply(a) { const r = nbi(); this.multiplyTo(a,r); return r; }

      // (protected) this *= n, this >= 0, 1 < n < DV
      dMultiply(n) {
        this[this.t] = this.am(0,n-1,this,0,0,this.t);
        ++this.t;
        clamp(this);
      }

      // (protected) this += n << w words, this >= 0
      dAddOffset(n,w) {
        while(this.t <= w) this[this.t++] = 0;
        this[w] += n;
        while(this[w] >= DV) {
          this[w] -= DV;
          if(++w >= this.t) this[this.t++] = 0;
          ++this[w];
        }
      }

      // (protected) divide this by m, quotient and remainder to q, r (HAC 14.20) r != q, this != m.  q or r  (public) this mod a
      mod(a) {
        const r = nbi();
        this.abs().divRemTo(a,null,r);
        if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
        return r;
      }

      // (protected) return "-1/this % 2^DB"; useful for Mont. reduction
      // justification:
      //         xy == 1 (mod m)
      //         xy =  1+km
      //   xy(2-xy) = (1+km)(1-km)
      // x[y(2-xy)] = 1-k^2m^2
      // x[y(2-xy)] == 1 (mod m^2)
      // if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
      // should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
      // JS multiply "overflows" differently from C/C++, so care is needed here.
      invDigit() {
        if(this.t < 1) return 0;
        const x = this[0];
        if((x&1) == 0) return 0;
        let y = x&3;		// y == 1/x mod 2^2
        y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
        y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
        y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
        // last step - calculate inverse mod DV directly;
        // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
        y = (y*(2-x*y%DV))%DV;		// y == 1/x mod 2^dbits
        // we really want the negative inverse, and -DV < y < DV
        return (y>0)?DV-y:-y;
      }

      // (protected) true iff this is even
      isEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

      isNegative() {return this.s < 0}

      // (public) this^e % m (HAC 14.85)
      modPow(e,m) {
        let i = e.bitLength(), k, r = nbv(1), z;
        if(i <= 0) return r;
        else if(i < 18) k = 1;
        else if(i < 48) k = 3;
        else if(i < 144) k = 4;
        else if(i < 768) k = 5;
        else k = 6;
        if(i < 8)
          z = new Classic(m);
        else if(m.isEven())
          z = new Barrett(m);
        else
          z = new Montgomery(m);

        // precomputation
        const g = new Array(), km = (1<<k)-1;
        let n = 3, k1 = k-1;
        g[1] = z.convert(this);
        if(k > 1) {
          const g2 = nbi();
          z.sqrTo(g[1],g2);
          while(n <= km) {
            g[n] = nbi();
            z.mulTo(g2,g[n-2],g[n]);
            n += 2;
          }
        }

        let j = e.t-1, w, is1 = true, r2 = nbi(), t;
        i = nbits(e[j])-1;
        while(j >= 0) {
          if(i >= k1) w = (e[j]>>(i-k1))&km;
          else {
            w = (e[j]&((1<<(i+1))-1))<<(k1-i);
            if(j > 0) w |= e[j-1]>>(DB+i-k1);
          }

          n = k;
          while((w&1) == 0) { w >>= 1; --n; }
          if((i -= n) < 0) { i += DB; --j; }
          if(is1) {	// ret == 1, don't bother squaring or multiplying it
            copyTo(g[w], r);
            is1 = false;
          }
          else {
            while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
            if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
            z.mulTo(r2,g[w],r);
          }

          while(j >= 0 && (e[j]&(1<<i)) == 0) {
            z.sqrTo(r,r2); t = r; r = r2; r2 = t;
            if(--i < 0) { i = DB-1; --j; }
          }
        }
        return z.revert(r);
      }
    }

    const nbi = ()=> new BigInteger(null);
    // return bigint initialized to value
    const nbv = i => new BigInteger(i);

    // "constants"
    BigInteger.ZERO = nbv(0);
    BigInteger.ONE = nbv(1);


    // Modular reduction using "classic" algorithm
    class Classic {
      constructor(m) {this.m = m }
      convert(x) {
        if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
        else return x;
      }
      revert(x) {return x}
      reduce(x) {x.divRemTo(this.m,null,x)}
      mulTo(x,y,r) {x.multiplyTo(y,r); this.reduce(r)}
      sqrTo(x,r) {x.squareTo(r); this.reduce(r)}
    }

    // Montgomery reduction
    class Montgomery {
      constructor(m) {
        this.m = m;
        this.mp = m.invDigit();
        this.mpl = this.mp&0x7fff;
        this.mph = this.mp>>15;
        this.um = (1<<(DB-15))-1;
        this.mt2 = 2*m.t;
      }
      // xR mod m
      convert(x) {
        const r = nbi();
        x.abs().dlShiftTo(this.m.t,r);
        r.divRemTo(this.m,null,r);
        if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
        return r;
      }

      // x/R mod m
      revert(x) {
        const r = nbi();
        copyTo(x, r);
        this.reduce(r);
        return r;
      }

      // x = x/R mod m (HAC 14.32)
      reduce(x) {
        while(x.t <= this.mt2)	// pad x so am has enough room later
          x[x.t++] = 0;
        for(let i = 0; i < this.m.t; ++i) {
          // faster way of calculating u0 = x[i]*mp mod DV
          let j = x[i]&0x7fff;
          const u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&DM;
          // use am to combine the multiply-shift-add into one call
          j = i+this.m.t;
          x[j] += this.m.am(0,u0,x,i,0,this.m.t);
          // propagate carry
          while(x[j] >= DV) { x[j] -= DV; x[++j]++; }
        }
        clamp(x);
        x.drShiftTo(this.m.t,x);
        if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
      }

      // r = "x^2/R mod m"; x != r
      sqrTo(x,r) { x.squareTo(r); this.reduce(r); }

      // r = "xy/R mod m"; x,y != r
      mulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
    }

    // Barrett modular reduction
    class Barrett {
      constructor(m) {
        // setup Barrett
        this.r2 = nbi();
        this.q3 = nbi();
        BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
        this.mu = this.r2.divide(m);
        this.m = m;
      }

      convert(x) {
        if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
        else if(x.compareTo(this.m) < 0) return x;
        else { const r = nbi(); copyTo(x, r); this.reduce(r); return r; }
      }

      revert(x) { return x; }

      // x = x mod m (HAC 14.42)
      reduce(x) {
        x.drShiftTo(this.m.t-1,this.r2);
        if(x.t > this.m.t+1) { x.t = this.m.t+1; clamp(x); }
        this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
        this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
        while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
        x.subTo(this.r2,x);
        while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
      }

      // r = x^2 mod m; x != r
      sqrTo(x,r) { x.squareTo(r); this.reduce(r); }

      // r = x*y mod m; x,y != r
      mulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
    }

    return BigInteger;
  }
});
