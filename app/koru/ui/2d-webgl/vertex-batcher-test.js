define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, match: m} = TH;

  const VertexBatcher = require('./vertex-batcher');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('constructor', () => {
      /**
       * Create a new VertexBatcher with an optional initial capacity.
       */
      api.class();

      const defaultBatcher = new VertexBatcher();
      assert.equals(defaultBatcher.capacity, 1024);
      assert.equals(defaultBatcher.vertexByteSize, 12);
      assert.equals(defaultBatcher.buffer.byteLength, 1024 * 12);
      assert.equals(defaultBatcher.vertexCount, 0);

      const customBatcher = new VertexBatcher(500);
      assert.equals(customBatcher.capacity, 500);
      assert.equals(customBatcher.buffer.byteLength, 500 * 12);
    });

    test('reset', () => {
      /**
       * Reset the vertex count to 0 without reallocating the array buffer.
       */
      api.protoMethod();
      const sut = new VertexBatcher();
      sut.vertexCount = 100;

      sut.render = stub(); // Prevent WebGL buffer deletion in mock
      sut.reset();

      assert.equals(sut.vertexCount, 0);
      assert.equals(sut.capacity, 1024); // Capacity should not change
    });

    test('ensureCapacity', () => {
      /**
       * Grow the underlying ArrayBuffer if the required capacity exceeds the current capacity.
       */
      api.protoMethod();
      const sut = new VertexBatcher(2);
      assert.equals(sut.buffer.byteLength, 24); // 2 vertices * 12 bytes

      // Require 3 more vertices (total 3). Current capacity is 2.
      // It should double (2 * 2 = 4).
      sut.ensureCapacity(3);
      assert.equals(sut.capacity, 4);
      assert.equals(sut.buffer.byteLength, 48);
      assert.equals(sut.positions.length, 12); // 4 * 3 floats

      // Require 10 more vertices (total 10). Current capacity is 4.
      // It should double until it fits: 4 -> 8 -> 16.
      sut.vertexCount = 0;
      sut.ensureCapacity(10);
      assert.equals(sut.capacity, 16);
      assert.equals(sut.buffer.byteLength, 192); // 16 * 12 bytes
    });

    test('packColor', () => {
      /**
       * Convert floats (0.0-1.0) into a single little-endian ABGR Uint32 integer.
       */
      api.method();
      // Red: R=255, G=0, B=0, A=255
      const red = VertexBatcher.packColor(1, 0, 0, 1);
      // Bitwise shift returns signed, so use >>> 0 to compare to Uint32Array output
      const expectedRed = ((255 << 24) | (0 << 16) | (0 << 8) | 255) >>> 0;
      assert.equals(red >>> 0, expectedRed);

      // Semi-transparent Green: R=0, G=255, B=0, A=127
      const greenHalf = VertexBatcher.packColor(0, 1, 0, 0.5);
      const expectedGreen = ((127 << 24) | (0 << 16) | (255 << 8) | 0) >>> 0;
      assert.equals(greenHalf >>> 0, expectedGreen);
    });

    test('pushQuad and getArrayBufferView', () => {
      /**
       * Add a single quad (4 vertices) to the batcher using packed color data.
       */
      api.protoMethod();
      const sut = new VertexBatcher(5);

      const c0 = VertexBatcher.packColor(1, 0, 0, 1);
      const c1 = VertexBatcher.packColor(0, 1, 0, 1);
      const c2 = VertexBatcher.packColor(0, 0, 1, 1);
      const c3 = VertexBatcher.packColor(1, 1, 1, 1);

      sut.pushQuad(10, 20, c0, 30, 40, c1, 50, 60, c2, 70, 80, c3);

      assert.equals(sut.vertexCount, 4);

      const view = sut.getArrayBufferView();
      // 4 vertices * 12 bytes = 48 bytes
      assert.equals(view.byteLength, 48);
      assert.isTrue(view instanceof Uint8Array);

      // Verify data using the typed array views directly
      assert.equals(sut.positions[0], 10); // V0 x
      assert.equals(sut.positions[1], 20); // V0 y
      assert.equals(sut.colors[2], c0 >>> 0); // V0 color (offset 2 in Uint32Array)

      assert.equals(sut.positions[9], 70); // V3 x
      assert.equals(sut.positions[10], 80); // V3 y
      assert.equals(sut.colors[11], c3 >>> 0); // V3 color
    });

    test('pushTriangle (Degenerate Quads)', () => {
      /**
       * Ensure triangles are converted to degenerate quads (4 vertices) to align with the index buffer.
       */
      api.protoMethod();
      const sut = new VertexBatcher(5);
      const c = VertexBatcher.packColor(1, 0, 0, 1);

      sut.pushTriangle(10, 20, c, 30, 40, c, 50, 60, c);

      // Should have consumed 4 vertex slots
      assert.equals(sut.vertexCount, 4);

      // Vertex 2 (index 6, 7)
      assert.equals(sut.positions[6], 50);
      assert.equals(sut.positions[7], 60);

      // Vertex 3 should be an exact duplicate of Vertex 2 (index 9, 10)
      assert.equals(sut.positions[9], 50);
      assert.equals(sut.positions[10], 60);
    });

    test('bezierDashed', () => {
      /**
       * Generate quads for a dashed cubic Bezier curve stroke, cycling through
       * main and alternate colors based on a dash pattern.
       */
      api.protoMethod();
      const sut = new VertexBatcher();

      const startColor = VertexBatcher.packColor(1, 0, 0, 1); // Red
      const endColor = VertexBatcher.packColor(0, 0, 1, 1); // Blue
      const startColorAlt = VertexBatcher.packColor(0, 1, 0, 1); // Green
      const endColorAlt = VertexBatcher.packColor(1, 1, 0, 1); // Yellow

      //[
      //;fmt-ignore
      sut.bezierDashed(
        0, 0, // ax, ay
        100, 0, // bx, by
        33.333, 0, // cx1, cy1
        66.666, 0, // cx2, cy2
        {
          thickness: 4,
          segments: 1, // 1 segment ensures a single 100px evaluation for predictable math
          dashPattern: [40, 20, 40], // 40px Color1, 20px Gap, 40px Color2
          startColor, endColor,
          startColorAlt, endColorAlt,
        },
      );

      // The 100px line is divided by the dash pattern:
      // 0-40px: Main Color Quad (u=0 to 0.4)
      // 40-60px: Gap (no quad pushed) (u=0.4 to 0.6)
      // 60-100px: Alt Color Quad (u=0.6 to 1.0)
      // Total = 2 quads = 8 vertices.
      assert.equals(sut.vertexCount, 8);

      const view = sut.getArrayBufferView();
      assert.equals(view.length, 8 * sut.vertexByteSize);

      // --- Quad 1: Main Color (u=0 to 0.4) ---

      // First vertex (u=0)
      assert.equals(sut.colors[2], startColor >>> 0);

      // Third vertex (u=0.4)
      // R fades from 1.0 down to 0.6, B rises from 0.0 to 0.4
      const expectedQ1EndColor = VertexBatcher.packColor(0.6, 0, 0.4, 1) >>> 0;
      const currROffset = 8; // V2 color offset in Uint32Array (V0: 2, V1: 5, V2: 8)
      assert.equals(sut.colors[currROffset], expectedQ1EndColor);

      // --- Quad 2: Alt Color (u=0.6 to 1.0) ---

      // First vertex of second quad (V4 in overall buffer, u=0.6)
      // R rises from 0.0 to 0.6, G stays at 1.0
      const expectedQ2StartColor = VertexBatcher.packColor(0.6, 1, 0, 1) >>> 0;
      const nextLOffset = 14; // V4 color offset (V3: 11, V4: 14)
      assert.equals(sut.colors[nextLOffset], expectedQ2StartColor);

      // Third vertex of second quad (V6, u=1.0)
      const nextROffset = 20; // V6 color offset (V4: 14, V5: 17, V6: 20)
      assert.equals(sut.colors[nextROffset], endColorAlt >>> 0);
      //]
    });

    test('bezierDashed matches bezier geometry', () => {
      /**
       * Verify that bezierDashed computes the exact same geometry and colors
       * as the standard bezier method when rendering a continuous line.
       */
      const sut1 = new VertexBatcher();
      const sut2 = new VertexBatcher();

      const startColor = VertexBatcher.packColor(1, 0.5, 0, 1);
      const endColor = VertexBatcher.packColor(0, 0.5, 1, 1);

      // Define a pronounced curve to test tangent and normal calculations
      const ax = 10, ay = 20;
      const bx = 150, by = 200;
      const cx1 = 50, cy1 = 250;
      const cx2 = 200, cy2 = 50;

      sut1.bezier(ax, ay, bx, by, cx1, cy1, cx2, cy2, {
        thickness: 6,
        startColor,
        endColor,
        segments: 16,
      });

      sut2.bezierDashed(ax, ay, bx, by, cx1, cy1, cx2, cy2, {
        thickness: 6,
        startColor,
        endColor,
        startColorAlt: startColor,
        endColorAlt: endColor,
        segments: 16,
        dashPattern: [Number.MAX_VALUE], // Ensure it never splits for a gap
      });

      // 16 segments = 16 quads = 64 vertices
      assert.equals(sut1.vertexCount, sut2.vertexCount);
      assert.equals(sut1.vertexCount, 64);

      // Because the underlying math is functionally identical,
      // the float and uint outputs should be bit-for-bit exact.
      // (Using a fallback just in case you renamed subarray to getArrayBufferView)
      const view1 = sut1.getArrayBufferView ? sut1.getArrayBufferView() : sut1.subarray();
      const view2 = sut2.getArrayBufferView ? sut2.getArrayBufferView() : sut2.subarray();

      assert.equals(Array.from(view1), Array.from(view2));
    });

    test('bezier', () => {
      /**
       * Generate quads for a cubic Bezier curve stroke.
       */
      api.protoMethod();
      const sut = new VertexBatcher();

      const startColor = VertexBatcher.packColor(1, 0, 0, 1);
      const endColor = VertexBatcher.packColor(0, 0, 1, 1);
      //[
      //;fmt-ignore
      sut.bezier(
        0, 0, // ax, ay
        100, 100, // bx, by
        0, 100, // cx, cy
        100, 0, // dx, dy
        {thickness: 4, startColor, endColor, segments: 2},
      );

      // segments = 2 means the loop runs 3 times (i=0, 1, 2)
      // i=0 calculates initial points.
      // i=1 pushes 1 quad (4 vertices).
      // i=2 pushes 1 quad (4 vertices).
      // Total vertices = 8.
      assert.equals(sut.vertexCount, 8);

      const view = sut.getArrayBufferView();
      assert.equals(view.length, 8 * sut.vertexByteSize); // 96 bytes

      // Test color interpolation on the first quad's first vertex (prevL / V0)
      // It should match the startColor
      assert.equals(sut.colors[2], startColor >>> 0); // V0 color

      // Test color interpolation on the first quad's third vertex (currR / V2)
      // It should match the mid-point color (0.5, 0, 0.5)
      const currROffset = 8; // V2 color offset in Uint32Array (V0: 2, V1: 5, V2: 8)
      const expectedMidColor = VertexBatcher.packColor(0.5, 0, 0.5, 1) >>> 0;
      assert.equals(sut.colors[currROffset], expectedMidColor);
      //]
    });

    test('render issues drawElements and resets', () => {
      /**
       * Ensure rendering automatically handles webgl buffer syncing and executes correctly.
       */
      api.protoMethod();
      const sut = new VertexBatcher();
      sut.pushQuad(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      sut.pushQuad(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

      assert.equals(sut.vertexCount, 8);

      const canvas = {
        getContext: () => ({
          createBuffer: stub().returns({id: 'buffer'}),
          deleteBuffer: stub(),
          bindBuffer: stub(),
          bufferData: stub(),
          enableVertexAttribArray: stub(),
          vertexAttribPointer: stub(),
          drawElements: stub(),
          ELEMENT_ARRAY_BUFFER: 0x8893,
          ARRAY_BUFFER: 0x8892,
          STATIC_DRAW: 0x88E4,
          STREAM_DRAW: 0x88E0,
          FLOAT: 0x1406,
          UNSIGNED_BYTE: 0x1401,
          UNSIGNED_SHORT: 0x1403,
          TRIANGLES: 0x0004,
        }),
      };

      //[
      const gl = canvas.getContext('webgl', {alpha: true, antialias: true});
      const locations = {position: 0, color: 1};

      sut.render(gl, locations);
      //]

      // Ensure vertex attributes are pointed correctly with strides and offsets
      assert.calledWith(gl.vertexAttribPointer, locations.position, 2, gl.FLOAT, false, 12, 0);
      assert.calledWith(gl.vertexAttribPointer, locations.color, 4, gl.UNSIGNED_BYTE, true, 12, 8);

      // 8 vertices = 2 quads. 2 quads * 6 indices = 12 elements drawn.
      assert.calledWith(gl.drawElements, gl.TRIANGLES, 12, gl.UNSIGNED_SHORT, 0);

      // Ensure batcher resets after drawing
      assert.equals(sut.vertexCount, 0);
    });
  });
});
