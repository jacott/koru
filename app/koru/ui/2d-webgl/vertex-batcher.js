define((require, exports, module) => {
  'use strict';

  // Helper to extract channels, interpolate, and repack into a 32-bit integer.
  // Assumes 32-bit Little-Endian packed colors (ABGR or RGBA).
  const lerpPackedColor = (cStart, cEnd, u) => {
    const r1 = cStart & 0xFF,
      g1 = (cStart >> 8) & 0xFF,
      b1 = (cStart >> 16) & 0xFF,
      a1 = cStart >>> 24;
    const r2 = cEnd & 0xFF, g2 = (cEnd >> 8) & 0xFF, b2 = (cEnd >> 16) & 0xFF, a2 = cEnd >>> 24;

    const r = r1 + (r2 - r1) * u;
    const g = g1 + (g2 - g1) * u;
    const b = b1 + (b2 - b1) * u;
    const a = a1 + (a2 - a1) * u;

    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  };

  class VertexBatcher {
    constructor(initialVertexCapacity = 1024) {
      this.vertexByteSize = 12; // 2 floats (8 bytes) + 1 Uint32 (4 bytes)
      this.vertexFloatSize = 3;
      this.capacity = initialVertexCapacity;

      this.buffer = new ArrayBuffer(this.capacity * this.vertexByteSize);
      this.positions = new Float32Array(this.buffer);
      this.colors = new Uint32Array(this.buffer);

      this.vertexCount = 0;

      // WebGL references
      this.vertexBuffer = null;
      this.indexBuffer = null;
      this.indexCapacity = 0;
    }

    reset() {
      this.vertexCount = 0;
    }

    ensureCapacity(additionalVertices) {
      const required = this.vertexCount + additionalVertices;
      if (required > this.capacity) {
        while (this.capacity < required) {
          this.capacity *= 2;
        }

        const newBuffer = new ArrayBuffer(this.capacity * this.vertexByteSize);
        new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));

        this.buffer = newBuffer;
        this.positions = new Float32Array(this.buffer);
        this.colors = new Uint32Array(this.buffer);
      }
    }

    getArrayBufferView() {
      return new Uint8Array(this.buffer, 0, this.vertexCount * this.vertexByteSize);
    }

    static packColor(r, g, b, a = 1.0) {
      const R = (r * 255) & 0xFF;
      const G = (g * 255) & 0xFF;
      const B = (b * 255) & 0xFF;
      const A = (a * 255) & 0xFF;
      return (A << 24) | (B << 16) | (G << 8) | R;
    }

    _ensureWebGLBuffers(gl) {
      // 1. Ensure Vertex Buffer exists
      if (!this.vertexBuffer) {
        this.vertexBuffer = gl.createBuffer();
      }

      // 2. Ensure Index Buffer exists and is large enough for current capacity
      const maxQuads = Math.floor(this.capacity / 4);
      const requiredIndices = maxQuads * 6;

      if (!this.indexBuffer || this.indexCapacity < requiredIndices) {
        if (this.indexBuffer) {
          gl.deleteBuffer(this.indexBuffer);
        }

        this.indexCapacity = requiredIndices;

        // Note: Uint16Array limits batches to 65,536 vertices (16,384 quads).
        // If you exceed this in a single batch, WebGL requires Uint32Array
        // and the 'OES_element_index_uint' extension (or WebGL 2).
        const indices = new Uint16Array(this.indexCapacity);

        for (let i = 0, j = 0; i < this.indexCapacity; i += 6, j += 4) {
          indices[i + 0] = j + 0;
          indices[i + 1] = j + 1;
          indices[i + 2] = j + 2;
          indices[i + 3] = j + 0;
          indices[i + 4] = j + 2;
          indices[i + 5] = j + 3;
        }

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      }
    }

    /**
     * Uploads the batched geometry to the GPU and issues the draw call.
     * @param {WebGLRenderingContext} gl
     * @param {Object} locations - Object containing { position: number, color: number }
     */
    render(gl, locations) {
      if (this.vertexCount === 0) return;

      this._ensureWebGLBuffers(gl);

      // 1. Upload packed vertex data
      const vertices = this.getArrayBufferView();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);

      // 2. Bind the static index buffer
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

      // 3. Setup Vertex Pointers
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, this.vertexByteSize, 0);

      gl.enableVertexAttribArray(locations.color);
      gl.vertexAttribPointer(
        locations.color,
        4,
        gl.UNSIGNED_BYTE,
        true, // Must normalize the 0-255 uints back to 0.0-1.0 floats in the shader
        this.vertexByteSize,
        8, // Offset past the 2 position floats
      );

      // 4. Draw
      const quadCount = this.vertexCount / 4;
      const indexCount = quadCount * 6;
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);

      // 5. Reset batcher state for the next frame
      this.reset();
    }

    pushQuad(x0, y0, c0, x1, y1, c1, x2, y2, c2, x3, y3, c3) {
      this.ensureCapacity(4);
      let fIdx = this.vertexCount * this.vertexFloatSize;

      this.positions[fIdx++] = x0;
      this.positions[fIdx++] = y0;
      this.colors[fIdx++] = c0;
      this.positions[fIdx++] = x1;
      this.positions[fIdx++] = y1;
      this.colors[fIdx++] = c1;
      this.positions[fIdx++] = x2;
      this.positions[fIdx++] = y2;
      this.colors[fIdx++] = c2;
      this.positions[fIdx++] = x3;
      this.positions[fIdx++] = y3;
      this.colors[fIdx++] = c3;

      this.vertexCount += 4;
    }

    pushTriangle(x0, y0, c0, x1, y1, c1, x2, y2, c2) {
      this.ensureCapacity(4);
      let fIdx = this.vertexCount * this.vertexFloatSize;

      this.positions[fIdx++] = x0;
      this.positions[fIdx++] = y0;
      this.colors[fIdx++] = c0;
      this.positions[fIdx++] = x1;
      this.positions[fIdx++] = y1;
      this.colors[fIdx++] = c1;
      this.positions[fIdx++] = x2;
      this.positions[fIdx++] = y2;
      this.colors[fIdx++] = c2;
      this.positions[fIdx++] = x2;
      this.positions[fIdx++] = y2;
      this.colors[fIdx++] = c2; // Degenerate

      this.vertexCount += 4;
    }

    bezierDashed(
      ax,
      ay,
      bx,
      by,
      cx1,
      cy1,
      cx2,
      cy2,
      {
        thickness = 3,
        segments = 32,
        dashPattern = [Number.MAX_VALUE],
        startColor,
        endColor,
        startColorAlt = startColor,
        endColorAlt = endColor,
      } = {},
    ) {
      const halfT = thickness * 0.5;
      const segsFrac = 1 / segments;

      // State Machine: 0 = Main Color, 1 = Gap, 2 = Alt Color, 3 = Gap
      let state = 0;
      let pIdx = 0;
      let distLeft = dashPattern.length > 0 ? dashPattern[0] : Number.MAX_VALUE;

      const getColor = (currentState, u) => {
        if (currentState === 0) {
          return lerpPackedColor(startColor, endColor, u);
        } else {
          return lerpPackedColor(startColorAlt, endColorAlt, u);
        }
      };

      let prevPx, prevPy, prevLx, prevLy, prevRx, prevRy, prevU;

      for (let i = 0; i <= segments; i++) {
        const u = i * segsFrac;
        const invU = 1 - u;

        const u2 = u * u;
        const invU2 = invU * invU;

        // Cubic Bezier position
        const px = (invU2 * invU * ax) + (3 * invU2 * u * cx1) + (3 * invU * u2 * cx2) +
          (u2 * u * bx);
        const py = (invU2 * invU * ay) + (3 * invU2 * u * cy1) + (3 * invU * u2 * cy2) +
          (u2 * u * by);

        // Cubic Bezier tangent
        const tx = 3 * invU2 * (cx1 - ax) + 6 * invU * u * (cx2 - cx1) + 3 * u2 * (bx - cx2);
        const ty = 3 * invU2 * (cy1 - ay) + 6 * invU * u * (cy2 - cy1) + 3 * u2 * (by - cy2);

        const len = Math.sqrt(tx * tx + ty * ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;

        const lx = px + nx * halfT;
        const ly = py + ny * halfT;
        const rx = px - nx * halfT;
        const ry = py - ny * halfT;

        if (i > 0) {
          const stepLen = Math.sqrt((px - prevPx) ** 2 + (py - prevPy) ** 2);
          let unconsumedLen = stepLen;

          let subStartLx = prevLx;
          let subStartLy = prevLy;
          let subStartRx = prevRx;
          let subStartRy = prevRy;
          let subStartU = prevU;

          while (unconsumedLen > 1e-5) {
            if (unconsumedLen <= distLeft) {
              if (state === 0 || state === 2) {
                const c0 = getColor(state, subStartU);
                const c1 = getColor(state, u);

                // Quad Winding: TopLeft, TopRight, BottomRight, BottomLeft
                //;fmt-ignore
                this.pushQuad(
                  subStartLx, subStartLy, c0,
                  subStartRx, subStartRy, c0,
                  rx, ry, c1,
                  lx, ly, c1
                );
              }

              distLeft -= unconsumedLen;
              unconsumedLen = 0;
            } else {
              const frac = distLeft / unconsumedLen;
              const midLx = subStartLx + (lx - subStartLx) * frac;
              const midLy = subStartLy + (ly - subStartLy) * frac;
              const midRx = subStartRx + (rx - subStartRx) * frac;
              const midRy = subStartRy + (ry - subStartRy) * frac;
              const midU = subStartU + (u - subStartU) * frac;

              if (state === 0 || state === 2) {
                const c0 = getColor(state, subStartU);
                const c1 = getColor(state, midU);

                // Quad Winding: TopLeft, TopRight, BottomRight, BottomLeft
                //;fmt-ignore
                this.pushQuad(
                  subStartLx, subStartLy, c0,
                  subStartRx, subStartRy, c0,
                  midRx, midRy, c1,
                  midLx, midLy, c1
                );
              }

              unconsumedLen -= distLeft;
              state = (state + 1) % 4;
              pIdx = (pIdx + 1) % dashPattern.length;
              distLeft = dashPattern[pIdx];

              subStartLx = midLx;
              subStartLy = midLy;
              subStartRx = midRx;
              subStartRy = midRy;
              subStartU = midU;
            }
          }
        }

        prevPx = px;
        prevPy = py;
        prevLx = lx;
        prevLy = ly;
        prevRx = rx;
        prevRy = ry;
        prevU = u;
      }
    }

    bezier(
      ax,
      ay,
      bx,
      by,
      cx1,
      cy1,
      cx2,
      cy2,
      {thickness = 3, startColor, endColor, segments = 32},
    ) {
      const halfT = thickness * 0.5;
      let prevLx, prevLy, prevRx, prevRy, prevColor;
      const segsFrac = 1 / segments;
      const isSolid = startColor === endColor;

      for (let i = 0; i <= segments; i++) {
        const u = i * segsFrac;
        const invU = 1 - u;
        const u2 = u * u;
        const invU2 = invU * invU;

        const px = (invU2 * invU * ax) + (3 * invU2 * u * cx1) + (3 * invU * u2 * cx2) +
          (u2 * u * bx);
        const py = (invU2 * invU * ay) + (3 * invU2 * u * cy1) + (3 * invU * u2 * cy2) +
          (u2 * u * by);

        const tx = 3 * invU2 * (cx1 - ax) + 6 * invU * u * (cx2 - cx1) + 3 * u2 * (bx - cx2);
        const ty = 3 * invU2 * (cy1 - ay) + 6 * invU * u * (cy2 - cy1) + 3 * u2 * (by - cy2);

        const len = Math.sqrt(tx * tx + ty * ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;

        const lx = px + nx * halfT;
        const ly = py + ny * halfT;
        const rx = px - nx * halfT;
        const ry = py - ny * halfT;

        const currColor = isSolid ? startColor : lerpPackedColor(startColor, endColor, u);

        if (i > 0) {
          //;fmt-ignore
          this.pushQuad(
            prevLx, prevLy, prevColor,
            prevRx, prevRy, prevColor,
            rx, ry, currColor,
            lx, ly, currColor,
          );
        }

        // Cache for the next segment
        prevLx = lx;
        prevLy = ly;
        prevRx = rx;
        prevRy = ry;
        prevColor = currColor;
      }
    }
  }

  return VertexBatcher;
});
