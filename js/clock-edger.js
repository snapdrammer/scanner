(function (root, factory) {
  // eslint-disable-line
  if (typeof define === "function" && define.amd) {
    // AMD. Register as an anonymous module.
    define([], function () {
      return factory.call(root);
    });
  } else {
    // Browser globals
    root.scannerUtils = factory.call(root);
  }
})(this, function () {
  "use strict";

  const topWindow = this;

  const vertexShaderSource = `
  // an attribute will receive data from a buffer
    attribute vec4 a_position;

    // all shaders have a main function
    void main() {

      // gl_Position is a special variable a vertex shader
      // is responsible for setting
      gl_PointSize = 10.0;
      gl_Position = a_position;

    }
  `;

  const fragmentShaderSource = `
  // fragment shaders don't have a default precision so we need
  // to pick one. mediump is a good default
  precision mediump float;

  void main() {
    // gl_FragColor is a special variable a fragment shader
    // is responsible for setting
    gl_FragColor = vec4(1, 0, 0.5, 1); // return redish-purple
  }`;

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
      return shader;
    }

    gl.deleteShader(shader);
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
      return program;
    }

    gl.deleteProgram(program);
  }

  function startScan() {
    removeButtons();
    clearText();

    // check for timer sources
    probeForTimerResolution();
    presentScoringButton();
  }

  function presentScoringButton() {
    const baseDiv = document.getElementById("introPara");
    const button = document.createElement("button");
    button.id = "scoreButton";
    button.type = "button";
    button.innerHTML = "Calculate my resilience score";
    button.onclick = presentOptimisticScore;
    baseDiv.appendChild(button);
  }

  function clearText() {
    const title = document.getElementById("welcomeText");
    title.textContent = "";
    const linkElement = document.createElement("a");
    const link = document.createTextNode("Find out more");
    linkElement.appendChild(link);

    linkElement.title = "Link to MSc Disseration";
    linkElement.href = "../thesis.pdf";
    linkElement.class = "image fit";
    linkElement.src = "../thesis.pdf";

    
//     <a href="pdfs/ProjMarr_slides.pdf" class="image fit"><img src="images/marr_pic.jpg" alt=""></a>
    const existingText = document.getElementById("introPara");
    existingText.textContent = "";
    title.appendChild(linkElement);
  }

  function probeForTimerResolution() {
    // create div element to report resoluts
    const webGLPara = document.createElement("div");
    webGLPara.id = "webGlResult";
    const webGL2Para = document.createElement("div");
    webGL2Para.id = "webGl2Result";
    // These parameters affect the draw calls we issue in the WebGL and WbGL2
    // contexts
    let timerCount = 0;
    var offset = 0;
    var count = 20000000;

    // create cavanses for the rendering contexts
    const glCanvas = document.createElement("canvas");
    const gl2Canvas = document.createElement("canvas");

    // get WebGl constext
    var gl = glCanvas.getContext("webgl2");

    if (gl) {
      console.log("got webgl context");

      initialiseContext(gl, vertexShaderSource, fragmentShaderSource);

      // check for extension that supports explicit timers with nanosecond
      // resolutions
      try {
        checkForSynchronousTimerExtension(gl);
      } catch (err) {
        const wegGLPanicText = document.createTextNode(
          "WebGL: PANIC - the timing phase failed because the explicit timers are available."
        );
        webGLPara.appendChild(wegGLPanicText);
        return;
      }
      const WebGlAllClearText = document.createTextNode(
        `WebGL: No vulnerable extensions were detected in WebGL context `
      );
      webGLPara.appendChild(WebGlAllClearText);
    }

    //  get WebGl2 context
    const gl2 = gl2Canvas.getContext("webgl2");

    if (gl2) {
      console.log("got webgl2 context");

      var primitiveType = gl2.POINTS;
      initialiseContext(gl2, vertexShaderSource, fragmentShaderSource);

      // these measurements can be noisy so we aggregate measurements
      // and use the average number of 'ticks' we can count from a clock edge
      // as a coefficient to get the granularity of our timer
      const resolutionCoefficient = runAsynchronousTimerInContext(
        gl2,
        timerCount,
        primitiveType,
        offset,
        count
      );

      // create div to display timing results

      if (resolutionCoefficient > 100000) {
        const resultText = document.createTextNode(
          "WebGL2: Asynchronous timers resolve to sub 10 nanosecond resolutions - not good"
        );
        webGL2Para.appendChild(resultText);
      } else {
        const resolution = ((1 / resolutionCoefficient) * 1000000).toFixed(2);
        const resultText = document.createTextNode(
          `WebGL2: Asynchronous timers resolve in ${resolution} ns. - we think that's fine`
        );
        webGL2Para.appendChild(resultText);
      }

      const exisingPara = document.getElementById("introPara");
      document.body.insertBefore(webGL2Para, exisingPara);
      document.body.insertBefore(webGLPara, webGL2Para);
    }
  }

  function checkForSynchronousTimerExtension(context) {
    // The timers we are worried about are:
    // - TIME_ELAPSED_EXT (elapsed time since start of rendering ops in nanoseconds)
    // - TIMESTAMP_EXT (current time in nanoseconds)
    // They are both available through the EXT_disjoint_timerQuery object
    // that extensions should just *not* be available
    const disjointTimerExt = context.getExtension("EXT_disjoint_timer_query");

    if (!disjointTimerExt) {
      // give the all clear
      console.log("could not find explicit GPU timestamp");
    } else {
      throw "This is a dangerous browser & you should change it immediately";
    }
  }

  function runAsynchronousTimerInContext(
    context,
    timerCount,
    primitiveType,
    offset,
    count
  ) {
    nextEdge();
    const [exp, pre, start] = nextEdge();
    context.flush(); // make sure the sync command is read
    context.drawArrays(primitiveType, offset, count);

    callbackOnSync(
      context,
      () => {
        const [remain, stop, post] = nextEdge();
        const duration = stop - start + (exp - remain) / exp;
      },
      timerCount
    );

    const measurements = [];
    const data = [];
    for (let i = 0; i < 100; i++) {
      const [ticks, tickStart, tickStop] = nextEdge();
      data.push({ ticks: ticks, tickStart: tickStart, tickStop: tickStop });
      measurements.push(ticks);
    }

    const measurementTotals = measurements.reduce((a, b) => {
      return a + b;
    }, 0);

    return measurementTotals / measurements.length;
  }

  function nextEdge() {
    const edgeStart = performance.now();
    let edgeStop = edgeStart;
    let edgeTick = 0;
    while (edgeStart == edgeStop) {
      edgeStop = performance.now();
      edgeTick++;
    }
    return [edgeTick, edgeStart, edgeStop];
  }

  function callbackOnSync(gl, callback) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    const timeout = 0; // 0 = just check the status
    const bitflags = 0;
    setTimeout(checkSync);

    function checkSync() {
      const status = gl.clientWaitSync(sync, bitflags, timeout);
      while (status == gl.TIMEOUT_EXPIRED) {
        return setTimeout(checkSync);
      }

      callback();
    }
  }

  function presentOptimisticScore() {
    hideScoringButton();
    // get crean size & OS fingerprint metadata
    const { w, h } = getScreenSize();
    const os = isLinuxPlatform();
    const chipsetProbability = estimateChipsetProbability(w, h, os);
    const titleDiv = document.getElementById("welcomeText");
    const webGLDiv = document.getElementById("webGlResult");
    const webGL2Div = document.getElementById("webGl2Result");
    const timingIsCoarse = timingTestPassed(webGLDiv, webGL2Div);

    if (timingIsCoarse) {
      switch (chipsetProbability) {
        case 0.1:
          setLowProbabillityScore(webGL2Div);
          break;
        case 0.5:
          setMediumProbabilityScore(webGL2Div);
          break;
        case 0.6:
          setHigherThanAverageScore(webGL2Div);
          break;
      }
    } else {
      setPanicText(titleDiv);
    }
  }

  function hideScoringButton() {
    const scoreButton = document.getElementById("scoreButton");
    scoreButton.remove();
  }

  function timingTestPassed(webGLDiv, webGL2Div) {
    if (
      webGLDiv.textContent.match(
        /PANIC/ || webGL2Div.textContent.match(/not good/)
      )
    )
      return false;

    return true;
  }

  function setPanicText() {
    const resultDiv = createResultDivForProbability("");
    resultDiv.textContent =
      "Something is seriously wrong with your browser environment. Change your browser immedaitely. Then come back to this page and read my dessertation.";
    webGLDiv.appendChild(resultDiv);
    document.insertBefore(resultDiv, webGLDiv);
  }

  function createResultDivForProbability(probability) {
    const resultDiv = document.createElement("div");

    const resultText = document.createTextNode(
      `Overall, the chances of your device being vulnerable are: ${probability}`
    );
    resultDiv.appendChild(resultText);
    return resultDiv;
  }

  function setLowProbabillityScore(webGLDiv) {
    const resultDiv = createResultDivForProbability("Low");
    webGLDiv.appendChild(resultDiv);
    document.insertBefore(resultDiv, webGLDiv);
  }

  function setMediumProbabilityScore() {
    const resultDiv = createResultDivForProbability("Medium");
    webGLDiv.appendChild(resultDiv);
    document.insertBefore(resultDiv, webGLDiv);
  }

  function setHigherThanAverageScore() {
    const resultDiv = createResultDivForProbability(
      "Higher than average - you might want to read my dissertation"
    );
    webGLDiv.appendChild(resultDiv);
    document.insertBefore(resultDiv, webGLDiv);
  }

  function getScreenSize() {
    return { w: screen.width, h: screen.height };
  }

  function isLinuxPlatform() {
    if (navigator.appVersion.indexOf("Linux") != -1) return true;

    return false;
  }

  function estimateChipsetProbability(screenWidth, screenHeight, isLinux) {
    const estimatedChipsetValuesBasedOnResolution =
      isKnownVulnerableDimensions(screenWidth, screenHeight) && isLinux;
    if (estimatedChipsetValuesBasedOnResolution) {
      return estimatedChipsetValuesBasedOnResolution;
    }
    return 0.1;
  }

  function getPositionArray(attribNumber) {
    let newArray = [];

    let baseArray = [0, 0, 0, 0.5, 0.7, 0];
    for (let i = 0; i < attribNumber; i++) {
      newArray.push(baseArray[i % attribNumber]);
    }
    return newArray;
  }

  function removeButtons() {
    const startButton = document.getElementById("start-button");
    const noButton = document.getElementById("no-button");
    startButton.remove();
    noButton.remove();
  }

  function pixelToOffset(x, y, textureWidth, tileWidth, tileHeight) {
    var widthInTiles = gettextureWidthInTiles(textureWidth, tileWidth);

    const tileXIndex = Math.floor(x / tileWidth);

    const tileYIndex = Math.floor(y / tileHeight);

    var inTileX = x % tileWidth;
    var inTileY = y % tileHeight;

    return (
      (tileYIndex * widthInTiles + tileXIndex) * (tileWidth * tileHeight) +
      inTileY * tileWidth +
      inTileX
    );
  }

  function offsetToPixel(offset, textureWidth, tileWidth, tileHeight) {
    const widthInTiles = gettextureWidthInTiles(textureWidth, tileWidth);
    const tileSize = tileWidth * tileHeight;

    const tileIndex = Math.floor(offset / tileSize);
    const tileXIndex = tileIndex % widthInTiles;
    const tileYIndex = Math.floor(offset / (widthInTiles * tileSize));

    const inTileX = offset % tileWidth;
    const inTileY = Math.floor((offset % tileSize) / tileWidth);

    const x = tileXIndex * tileWidth + inTileX;
    const y = tileYIndex * tileHeight + inTileY;

    return [x, y];
  }

  function gettextureWidthInTiles(textureWidth, tileWidth) {
    return Math.floor((textureWidth + tileWidth - 1) / tileWidth);
  }

  function initialiseContext(
    context,
    vertexShaderSource,
    fragmentShaderSource
  ) {
    var vertexShader = createShader(
      context,
      context.VERTEX_SHADER,
      vertexShaderSource
    );
    var fragmentShader = createShader(
      context,
      context.FRAGMENT_SHADER,
      fragmentShaderSource
    );

    const glProgram = createProgram(context, vertexShader, fragmentShader);
    // look up where the vertex data needs to go.
    var positionAttributeLocation = context.getAttribLocation(
      glProgram,
      "a_position"
    );

    // Create a buffer and put three 2d clip space points in it
    var positionBuffer = context.createBuffer();

    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
    const [minSize, maxSize] = context.getParameter(
      context.ALIASED_POINT_SIZE_RANGE
    );

    let positions = getPositionArray(20000000 * 2);

    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array(positions),
      context.STATIC_DRAW
    );
    // Link the two shaders into a program
    var program = createProgram(context, vertexShader, fragmentShader);

    // Tell WebGL how to convert from clip space to pixels
    context.viewport(0, 0, context.canvas.width, context.canvas.height);

    // Clear the canvas
    context.clearColor(0, 0, 0, 0);
    context.clear(context.COLOR_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    context.useProgram(program);

    // Turn on the attribute
    context.enableVertexAttribArray(positionAttributeLocation);

    // Bind the position buffer.
    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);

    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    var size = 2; // 2 components per iteration
    var type = context.FLOAT; // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0; // start at the beginning of the buffer
    context.vertexAttribPointer(
      positionAttributeLocation,
      size,
      type,
      normalize,
      stride,
      offset
    );
  }

  function isKnownVulnerableDimensions(width, height) {
    const dimensions = [
      { w: 720, h: 1280 },
      { w: 1600, h: 2560 },
      { w: 1080, h: 1440 },
      { w: 960, h: 1280 },
    ];
    if (dimensions.find((f) => f.w === width && f.height === height)) {
      return 0.5;
    } else if (width === 1080 && height === 1920) {
      return 0.6;
    }
    return false;
  }

  return {
    pixelToOffset: pixelToOffset,
    offsetToPixel: offsetToPixel,
    startScan: startScan,
    removeButtons: removeButtons,
    vertexShaderSource: vertexShaderSource,
    fragmentShaderSource: fragmentShaderSource,
  };
});
