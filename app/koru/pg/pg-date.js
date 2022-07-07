define(() => {
  'use strict';

  const UNIX_EPOCH_JDATE = 2440588; /* == date2j(1970, 1, 1) */
  const POSTGRES_EPOCH_JDATE = 2451545; /* == date2j(2000, 1, 1) */

  const POSTGRES_EPOCH_DATE = 946684800000n;

  const date2j = (date) => {
    let y = date.getUTCFullYear(), m = date.getUTCMonth() + 1;

    let julian, century;

    if (m > 2) {
      m += 1;
      y += 4800;
    } else {
      m += 13;
      y += 4799;
    }

    century = Math.floor(y / 100);
    julian = y * 365 - 32167;
    julian += (y >> 2) - century + (century >> 2);
    julian += ((7834 * m) >> 8) + date.getUTCDate();

    return julian;
  };

  const j2date = (jd) => {
    let year, month, day;

    let julian, quad, extra, y;

    julian = jd;
    julian += 32044;
    quad = Math.floor(julian / 146097);
    extra = (julian - quad * 146097) * 4 + 3;
    julian += 60 + quad * 3 + Math.floor(extra / 146097);
    quad = Math.floor(julian / 1461);
    julian -= quad * 1461;
    y = Math.floor(julian * 4 / 1461);
    julian = ((y != 0) ? ((julian + 305) % 365) : ((julian + 306) % 366)) + 123;
    y += quad * 4;
    quad = (julian * 2141) >> 16;
    return new Date(Date.UTC(y - 4800, (quad + 10) % 12, julian - ((7834 * quad) >> 8)));
  };

  const dd = (v, n=2) => v.toString().padStart(2, '0');

  const date2text = (v) => `${v.getUTCFullYear()}-${dd(v.getUTCMonth() + 1)}-${dd(v.getUTCDate())}`;

  const text2date = (str) => {
    const m = /^(\d{2,4})-(\d\d?)-(\d\d?)/.exec(str);
    if (m === null) return new Date(NaN);
    return new Date(Date.UTC(+ m[1], + m[2] - 1, + m[3]));
  };

  const ts2int8 = (ts) => (ts - POSTGRES_EPOCH_DATE) * 1000n;
  const int82ts = (n) => new Date(Number(POSTGRES_EPOCH_DATE + (n / 1000n)));

  const ts2text = (v) => date2text(v) +
        ` ${dd(v.getUTCHours())}:${dd(v.getUTCMinutes())}:${dd(v.getUTCSeconds())}.${dd(v.getUTCMilliseconds(), 3)}`;
  const text2ts = (str) => {
    const m = /^(\d{2,4})-(\d\d?)-(\d\d?) *(\d\d?):(\d\d?):(\d\d?).(\d\d?\d?)/.exec(str);
    if (m === null) return new Date(NaN);
    return new Date(Date.UTC(+ m[1], + m[2] - 1, + m[3], + m[4], + m[5], + m[6], +m[7].padEnd(3, '0')));
  };

  const coerceToDate = (v) => {
    switch (typeof v) {
    case 'string': return new Date(Date.parse(v));
    case 'number': return new Date(v);
    }
    return v;
  };

  return {
    coerceToDate,

    date2j, j2date,

    register: ({registerName, registerOid}, {setInt32, getInt32, setInt64, getBigInt64, textDecodeInt}) => {
      registerName('date',
                   (buf, v) => setInt32(buf, date2j(coerceToDate(v)) - POSTGRES_EPOCH_JDATE),
                   (v) => j2date(getInt32(v) + POSTGRES_EPOCH_JDATE),
                   (buf, v) => buf.appendUtf8Str(date2text(coerceToDate(v))),
                   (v) => text2date(v.utf8Slice()));

      registerName('timestamp',
                   (buf, v) => setInt64(buf, ts2int8(BigInt.asIntN(64, BigInt(coerceToDate(v).getTime())))),
                   (v) => int82ts(getBigInt64(v)),
                   (buf, v) => buf.appendUtf8Str(ts2text(coerceToDate(v))),
                   (v) => text2ts(v.utf8Slice()));
      registerOid('timestamp', 1114, 1115);
    },
  };
});
