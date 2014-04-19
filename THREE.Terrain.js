/**
 * A terrain object for use with the Three.js library.
 *
 * Usage: `var terrainScene = THREE.Terrain();`
 *
 * TODO: Make blended materials work with fog, lighting, envMaps, etc.
 * TODO: Allow scattering other meshes randomly across the terrain
 * TODO: Implement optimization types?
 * TODO: Support infinite terrain?
 *
 * @param {Object} [options]
 *   An optional map of settings that control how the terrain is constructed
 *   and displayed. Options include:
 *
 *   - `easing`: If the terrain is being randomly generated, a function that
 *     affects the distribution of slopes by interpolating the randomness used
 *     to disturb terrain vertices along a curve. (If the terrain is being
 *     loaded from a heightmap, this option does nothing.) Valid values include
 *     `THREE.Terrain.NoEasing` (the default), `THREE.Terrain.EaseInOut`,
 *     `THREE.Terrain.InEaseOut`, and any custom function that accepts a number
 *     between 0 and 1 as its only parameter and returns a number between 0 and
 *     1.
 *   - `heightmap`: Either a pre-loaded image (from the same domain as the
 *     webpage or served with a CORS-friendly header) representing terrain
 *     height data (lighter pixels are higher); or a function used to generate
 *     random height data for the terrain. Valid random functions include
 *     `THREE.Terrain.Corner`, `THREE.Terrain.DiamondSquare` (the default),
 *     `THREE.Terrain.Perlin`, `THREE.Terrain.Simplex`, or a custom function
 *     with the same signature. (Ideally heightmap images have the same number
 *     of pixels as the terrain has vertices, as determined by the `xSegments`
 *     and `ySegments` options, but this is not required: if the heightmap is a
 *     different size, vertex height values will be interpolated.)
 *   - `material`: a THREE.Material instance used to display the terrain.
 *     Defaults to `new THREE.MeshBasicMaterial({color: 0xee6633})`.
 *   - `maxHeight`: the highest point, in Three.js units, that a peak should
 *     reach. Defaults to 300.
 *   - `minHeight`: the lowest point, in Three.js units, that a valley should
 *     reach. Defaults to -50.
 *   - `useBufferGeometry`: a Boolean indicating whether to use
 *     THREE.BufferGeometry instead of THREE.Geometry for the Terrain plane.
 *     Defaults to `true`.
 *   - `xSegments`: The number of segments (rows) to divide the terrain plane
 *     into. (This basically determines how detailed the terrain is) Defaults
 *     to 63.
 *   - `xSize`: The width of the terrain in Three.js units. Defaults to 1024.
 *     Rendering might be slightly faster if this is a multiple of
 *     `options.xSegments + 1`.
 *   - `ySegments`: The number of segments (columns) to divide the terrain
 *     plane into. (This basically determines how detailed the terrain is)
 *     Defaults to 63.
 *   - `ySize`: The length of the terrain in Three.js units. Defaults to 1024.
 *     Rendering might be slightly faster if this is a multiple of
 *     `options.ySegments + 1`.
 */
THREE.Terrain = function(options) {
    var defaultOptions = {
        easing: THREE.Terrain.NoEasing,
        heightmap: THREE.Terrain.DiamondSquare,
        material: null,
        maxHeight: 100,
        maxVariation: 12,
        minHeight: -100,
        optimization: THREE.Terrain.NONE,
        perlinScale: 0.4,
        useBufferGeometry: true,
        xSegments: 63,
        xSize: 1024,
        ySegments: 63,
        ySize: 1024,
    };
    options = options || {};
    for (var opt in defaultOptions) {
        if (defaultOptions.hasOwnProperty(opt)) {
            options[opt] = typeof options[opt] === 'undefined' ? defaultOptions[opt] : options[opt];
        }
    }
    options.unit = (options.xSize / (options.xSegments+1) + options.ySize / (options.ySegments+1)) * 0.5;
    options.material = options.material || new THREE.MeshBasicMaterial({ color: 0xee6633 });

    // Using a scene instead of a mesh allows us to implement more complex
    // features eventually, like adding the ability to randomly scatter plants
    // across the terrain or having multiple meshes for optimization purposes.
    var scene = new THREE.Scene();

    var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(options.xSize, options.ySize, options.xSegments, options.ySegments),
        options.material
    );
    mesh.rotation.x = -0.5 * Math.PI;

    // It's actually possible to pass a canvas with heightmap data instead of an image.
    if (options.heightmap instanceof HTMLCanvasElement || options.heightmap instanceof Image) {
        THREE.Terrain.fromHeightmap(mesh.geometry.vertices, options);
    }
    else if (typeof options.heightmap === 'function') {
        options.heightmap(mesh.geometry.vertices, options);
    }
    else if (window.console && console.warn) {
        console.warn('An invalid value was passed for `options.heightmap`: ' + options.heightmap);
    }
    mesh.geometry.verticesNeedUpdate = true;
    mesh.geometry.normalsNeedUpdate = true;
    mesh.geometry.computeBoundingSphere();

    if (options.useBufferGeometry) {
        mesh.geometry = THREE.BufferGeometryUtils.fromGeometry(mesh.geometry);
    }

    // lod.addLevel(mesh, options.unit * 10 * Math.pow(2, lodLevel));

    scene.add(mesh);
    return scene;
};

/**
 * Optimization types.
 *
 * Note that none of these are implemented right now. They should be done as
 * shaders so that they execute on the GPU, and the resulting scene would need
 * to be updated every frame to adjust to the camera's position.
 *
 * GEOMIPMAP: The terrain plane should be split into sections, each with their
 * own LODs, for screen-space occlusion and detail reduction. Intermediate
 * vertices on higher-detail neighboring sections should be interpolated
 * between neighbor edge vertices in order to match with the edge of the
 * lower-detail section. The number of sections should be around sqrt(segments)
 * along each axis. It's unclear how to make materials stretch across segments.
 *
 * GEOCLIPMAP: The terrain should be composed of multiple donut-shaped sections
 * at decreasing resolution as the radius gets bigger. When the player moves,
 * the sections should morph so that the detail "follows" the player around.
 * There is an implementation of geoclipmapping at
 * https://github.com/CodeArtemis/TriggerRally/blob/unified/server/public/scripts/client/terrain.coffee
 * and a tutorial on morph targets at
 * http://nikdudnik.com/making-3d-gfx-for-the-cinema-on-low-budget-and-three-js/
 *
 * If these do get implemented, here is the option description to add to the
 * `THREE.Terrain` docblock:
 *
 *    - `optimization`: the type of optimization to apply to the terrain. If
 *      an optimization is applied, the number of segments along each axis that
 *      the terrain should be divided into at the most detailed level should
 *      equal (n * 2^(LODs-1))^2 - 1, for arbitrary n, where LODs is the number
 *      of levels of detail desired. Valid values include:
 *
 *          - `THREE.Terrain.NONE`: Don't apply any optimizations. This is the
 *            default.
 *          - `THREE.Terrain.GEOMIPMAP`: Divide the terrain into evenly-sized
 *            sections with multiple levels of detail. For each section,
 *            display a level of detail dependent on how close the camera is.
 *          - `THREE.Terrain.GEOCLIPMAP`: Divide the terrain into donut-shaped
 *            sections, where detail decreases as the radius increases. The
 *            rings then morph to "follow" the camera around so that the camera
 *            is always at the center, surrounded by the most detail.
 */
THREE.Terrain.NONE = 0;
THREE.Terrain.GEOMIPMAP = 1;
THREE.Terrain.GEOCLIPMAP = 2;

/**
 * Randomness interpolation functions.
 */
THREE.Terrain.NoEasing = function(x) {
    return x;
};

// x = [0, 1], x^2(3-2x)
// Nearly identical alternatives: 0.5+0.5*cos(x*pi-pi), x^a/(x^a+(1-x)^a) (where a=1.6 seems nice)
// For comparison: http://www.wolframalpha.com/input/?i=x^1.6%2F%28x^1.6%2B%281-x%29^1.6%29%2C+x^2%283-2x%29%2C+0.5%2B0.5*cos%28x*pi-pi%29+from+0+to+1
THREE.Terrain.EaseInOut = function(x) {
    return x*x*(3-2*x);
};

// x = [0, 1], 0.5*(2x-1)^3+0.5
THREE.Terrain.InEaseOut = function(x) {
    var y = 2*x-1;
    return 0.5 * y*y*y + 0.5;
};

(function() {

/**
 * Generate a material that blends together textures based on vertex height.
 *
 * Inspired by http://www.chandlerprall.com/2011/06/blending-webgl-textures/
 *
 * Usage:
 *
 *    // Assuming the textures are already loaded
 *    var material = THREE.Terrain.generateBlendedMaterial([
 *      {texture: THREE.ImageUtils.loadTexture('img1.jpg')},
 *      {texture: THREE.ImageUtils.loadTexture('img2.jpg'), levels: [-80, -35, 20, 50]},
 *      {texture: THREE.ImageUtils.loadTexture('img3.jpg'), levels: [20, 50, 60, 85]},
 *      {texture: THREE.ImageUtils.loadTexture('img4.jpg'), glsl: '1.0 - smoothstep(65.0 + smoothstep(-256.0, 256.0, vPosition.x) * 10.0, 80.0, vPosition.z)'},
 *    ]);
 *
 * @param {Object[]} textures
 *   An array of objects specifying textures to blend together and how to blend
 *   them. Each object should have a `texture` property containing a
 *   `THREE.Texture` instance. There must be at least one texture and the first
 *   texture does not need any other properties because it will serve as the
 *   base, showing up wherever another texture isn't blended in. Other textures
 *   must have either a `levels` property containing an array of four numbers
 *   or a `glsl` property containing a single GLSL expression evaluating to a
 *   float between 0.0 and 1.0. For the `levels` property, the four numbers
 *   are, in order: the height at which the texture will start blending in, the
 *   height at which it will be fully blended in, the height at which it will
 *   start blending out, and the height at which it will be fully blended out.
 *   The `vec3 vPosition` variable is available to `glsl` expressions; it
 *   contains the coordinates in Three-space of the texel currently being
 *   rendered.
 */
THREE.Terrain.generateBlendedMaterial = function(textures, scene) {
    var uniforms = {}, assign = '', declare = '';
    if (scene && scene.fog) {
        uniforms = {
            fogColor:   { type: 'c', value: scene.fog.color },
            fogDensity: { type: 'c', value: scene.fog.density },
            fogNear:    { type: 'f', value: scene.fog.near },
            fogFar:     { type: 'f', value: scene.fog.far }
        };
    }
    for (var i = 0, l = textures.length; i < l; i++) {
        textures[i].wrapS = textures[i].wrapT = THREE.RepeatWrapping;
        uniforms['texture_' + i] = {
            type: 't',
            value: textures[i].texture,
        };
        declare += '    uniform sampler2D texture_' + i + ';\n';
        if (i !== 0) {
            var v = textures[i].levels,
                p = textures[i].glsl,
                le = typeof v !== 'undefined';
            if (le) {
                // Must fade in; can't start and stop at the same point.
                if (v[1] - v[0] < 1) v[0] -= 1;
                if (v[3] - v[2] < 1) v[3] += 1;
                // Convert levels to floating-point numbers as strings
                for (var j = 0; j < v.length; j++) {
                    var n = v[j];
                    v[j] = n|0 === n ? n+'.0' : n+'';
                }
            }
            assign += '        color = mix( texture2D( texture_' + i + ', vUv ), color, max(min(' + (!le ? p : '1.0 - smoothstep(' + v[0] + ', ' + v[1] + ', vPosition.z) + smoothstep(' + v[2] + ', ' + v[3] + ', vPosition.z)') + ', 1.0), 0.0));\n';
        }
    }
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: textFromComment(vertexShader),
        fragmentShader: textFromComment(fragmentShader, {
            assignTextures: assign,
            declareTextures: declare,
            fog_fragment: scene && scene.fog ? THREE.ShaderChunk.fog_fragment : '',
            fog_pars_fragment: scene && scene.fog ? THREE.ShaderChunk.fog_pars_fragment : '',
        }),
        fog: true,
    });
};

function textFromComment(fn, vars) {
    var s = (fn + '').match(/^[\s\S]*?\/\*!?\s*([\s\S]+?)\s*\*\/$/m)[1];
    if (typeof vars !== 'undefined') {
        var keys = Object.keys(vars).sort(function(a, b) { return b.length - a.length; });
        for (var i = 0, l = keys.length; i < l; i++) {
            var key = keys[i], val = vars[key];
            s = s.split('$' + key).join(val);
        }
    }
    return s;
}

function vertexShader() {
    /*!
    varying vec2 vUv;
    varying vec3 vPosition;
    void main( void ) {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1);
    }
    */
    var z; // prevent UglifyJS from removing the above comment
}

function fragmentShader() {
    /*!
    $fog_pars_fragment
    varying vec2 vUv;
    varying vec3 vPosition;
$declareTextures
    void main() {
        vec4 color = texture2D( texture_0, vUv ); // base
$assignTextures
        gl_FragColor = color;
        $fog_fragment
    }
    */
    var z; // prevent UglifyJS from removing the above comment
}

})();

/**
 * Convert an image-based heightmap into vertex-based height data.
 *
 * @param {THREE.Vector3[]} g
 *   The vertex array for plane geometry to modify with heightmap data. This
 *   method sets the `z` property of each vertex.
 * @param {Object} options
 *    An optional map of settings that control how the terrain is constructed
 *    and displayed. Valid values are the same as those for the `options`
 *    parameter of {@link THREE.Terrain}().
 */
THREE.Terrain.fromHeightmap = function(g, options) {
    var canvas = document.createElement('canvas'),
        context = canvas.getContext('2d'),
        rows = options.ySegments + 1,
        cols = options.xSegments + 1,
        spread = options.maxHeight - options.minHeight;
    canvas.width = cols;
    canvas.height = rows;
    context.drawImage(options.heightmap, 0, 0, canvas.width, canvas.height);
    var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var i = row * cols + col,
                idx = i * 4;
            g[i].z = (data[idx] + data[idx+1] + data[idx+2]) / 765 * spread;
        }
    }
};

/**
 * Convert a terrain plane into an image-based heightmap.
 *
 * Parameters are the same as for {@link THREE.Terrain.fromHeightmap} except
 * that if `options.heightmap` is a canvas element then the image will be
 * painted onto that canvas; otherwise a new canvas will be created.
 *
 * NOTE: this method performs an operation on an array of vertices, which
 * aren't available when using `BufferGeometry`. So, if you want to use this
 * method, make sure to set the `useBufferGeometry` option to `false` when
 * generating your terrain.
 *
 * @return {HTMLCanvasElement}
 *   A canvas with the relevant heightmap painted on it.
 */
THREE.Terrain.toHeightmap = function(g, options) {
    var canvas = options.heightmap instanceof HTMLCanvasElement ? options.heightmap : document.createElement('canvas'),
        context = canvas.getContext('2d'),
        rows = options.ySegments + 1,
        cols = options.xSegments + 1,
        spread = options.maxHeight - options.minHeight;
    canvas.width = cols;
    canvas.height = rows;
    var d = context.createImageData(canvas.width, canvas.height),
        data = d.data;
    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var i = row * cols + col,
            idx = i * 4;
            data[idx] = data[idx+1] = data[idx+2] = Math.round(((g[i].z - options.minHeight) / spread) * 255);
            data[idx+3] = 255;
        }
    }
    context.putImageData(d, 0, 0);
    return canvas;
};

/**
 * Generate random terrain using the Corner method.
 *
 * This looks much more like random noise than realistic terrain.
 *
 * @param {THREE.Vector3[]} g
 *   The vertex array for plane geometry to modify with heightmap data. This
 *   method sets the `z` property of each vertex.
 * @param {Object} options
 *    An optional map of settings that control how the terrain is constructed
 *    and displayed. Valid values are the same as those for the `options`
 *    parameter of {@link THREE.Terrain}().
 */
THREE.Terrain.Corner = function(g, options) {
    var maxVar = options.maxVariation,
        maxVarHalf = maxVar * 0.5;
    for (var i = 0, xl = options.xSegments + 1; i < xl; i++) {
        for (var j = 0; j < options.ySegments + 1; j++) {
            var k = j*xl + i, // Vertex index
                s = (j-1)*xl + i, // Bottom vertex index
                t = j*xl + i-1, // Left vertex index
                l = s < 0 ? g[k].z : g[s].z, // Height of bottom vertex
                b = t < 0 ? g[k].z : g[t].z, // Height of left vertex
                r = Math.random(),
                v = (r < 0.2 ? l : (r < 0.4 ? b : l + b)) * 0.5, // Neighbors
                m = options.easing(Math.random()) * maxVar - maxVarHalf; // Disturb distance
            g[k].z += THREE.Math.clamp(
                v + m,
                options.minHeight,
                options.maxHeight
            );
        }
    }
};

/**
 * Generate random terrain using the Diamond-Square method.
 *
 * Based on https://github.com/srchea/Terrain-Generation/blob/master/js/classes/TerrainGeneration.js
 *
 * Parameters are the same as those for {@link THREE.Terrain.Corner}.
 */
THREE.Terrain.DiamondSquare = function(g, options) {
    // Set the segment length to the smallest power of 2 that is greater than
    // the number of vertices in either dimension of the plane
    var segments = Math.max(options.xSegments, options.ySegments) + 1, n;
    for (n = 1; Math.pow(2, n) < segments; n++) {}
    segments = Math.pow(2, n);

    // Initialize heightmap
    var size = segments + 1,
        heightmap = [],
        smoothing = (options.maxHeight - options.minHeight),
        i,
        j,
        xl = options.xSegments + 1,
        yl = options.ySegments + 1;
    for (i = 0; i <= segments; i++) {
        heightmap[i] = [];
        for (j = 0; j <= segments; j++) {
            heightmap[i][j] = 0;
        }
    }

    // Generate heightmap
    for (var l = segments; l >= 2; l /= 2) {
        var half = Math.round(l*0.5), whole = Math.round(l), x, y, avg, d, e;
        smoothing /= 2;
        // square
        for (x = 0; x < segments; x += whole) {
            for (y = 0; y < segments; y += whole) {
                d = options.easing(Math.random()) * smoothing * 2 - smoothing;
                avg = heightmap[x][y] +    // top left
                      heightmap[x+whole][y] +  // top right
                      heightmap[x][y+whole] +  // bottom left
                      heightmap[x+whole][y+whole]; // bottom right
                avg *= 0.25;
                heightmap[x+half][y+half] = avg + d;
            }
        }
        // diamond
        for (x = 0; x < segments; x += half) {
            for (y = (x+half) % l; y < segments; y += l) {
                d = options.easing(Math.random()) * smoothing * 2 - smoothing;
                avg = heightmap[(x-half+size)%size][y] + // middle left
                      heightmap[(x+half)%size][y] +      // middle right
                      heightmap[x][(y+half)%size] +      // middle top
                      heightmap[x][(y-half+size)%size];  // middle bottom
                avg *= 0.25;
                avg += d;
                heightmap[x][y] = avg;
                // top and right edges
                if (x === 0) heightmap[segments][y] = avg;
                if (y === 0) heightmap[x][segments] = avg;
            }
        }
    }

    // Apply heightmap
    for (i = 0; i < xl; i++) {
        for (j = 0; j < yl; j++) {
            g[j * xl + i].z += THREE.Math.clamp(
                heightmap[i][j],
                options.minHeight,
                options.maxHeight
            );
        }
    }
};

if (window.noise && window.noise.perlin) {
    /**
     * Generate random terrain using the Perlin Noise method.
     *
     * Parameters are the same as those for {@link THREE.Terrain.Corner}.
     */
    THREE.Terrain.Perlin = function(g, options) {
        noise.seed(Math.random());
        var range = options.maxHeight - options.minHeight * 0.5,
            divisor = (Math.min(options.xSegments, options.ySegments) + 1) * options.perlinScale;
        for (var i = 0, xl = options.xSegments + 1; i < xl; i++) {
            for (var j = 0, yl = options.ySegments + 1; j < yl; j++) {
                g[j * xl + i].z += THREE.Math.clamp(
                    options.easing(noise.perlin(i / divisor, j / divisor)) * range,
                    options.minHeight,
                    options.maxHeight
                );
            }
        }
    };
}

if (window.noise && window.noise.simplex) {
    /**
     * Generate random terrain using the Simplex Noise method.
     *
     * Parameters are the same as those for {@link THREE.Terrain.Corner}.
     */
    THREE.Terrain.Simplex = function(g, options) {
        noise.seed(Math.random());
        var range = (options.maxHeight - options.minHeight) * 0.5,
            divisor = (Math.min(options.xSegments, options.ySegments) + 1) * options.perlinScale * 2;
        for (var i = 0, xl = options.xSegments + 1; i < xl; i++) {
            for (var j = 0, yl = options.ySegments + 1; j < yl; j++) {
                g[j * xl + i].z += THREE.Math.clamp(
                    options.easing(noise.simplex(i / divisor, j / divisor)) * range,
                    options.minHeight,
                    options.maxHeight
                );
            }
        }
    };
}

/**
 * A utility for generating heightmap functions by composition.
 *
 * This modifies `options.maxHeight` and `options.minHeight` while running, so
 * it is NOT THREAD SAFE for operations that use those values.
 *
 * @param {THREE.Vector3[]} g
 *   The vertex array for plane geometry to modify with heightmap data. This
 *   method sets the `z` property of each vertex.
 * @param {Object} options
 *    An optional map of settings that control how the terrain is constructed
 *    and displayed. Valid values are the same as those for the `options`
 *    parameter of {@link THREE.Terrain}().
 * @param {Object[]} passes
 *   Determines which heightmap functions to compose to create a new one.
 *   Consists of an array of objects with a `method` property containing
 *   something that will be passed around as an `options.heightmap` (a
 *   heightmap-generating function or a heightmap image).
 */
THREE.Terrain.MultiPass = function(g, options, passes) {
    var GRANULARITY = 0.1,
        maxHeight = options.maxHeight,
        minHeight = options.minHeight;
    for (var i = 0, l = passes.length; i < l; i++) {
        if (i !== 0) {
            var gran = typeof passes[i].granularity === 'undefined' ? 1 : passes[i].granularity,
                move = (options.maxHeight - options.minHeight) * 0.5 * GRANULARITY * gran;
            options.maxHeight -= move;
            options.minHeight += move;
        }
        passes[i].method(g, options);
    }
    options.maxHeight = maxHeight;
    options.minHeight = minHeight;
};

/**
 * Generate random terrain using the Perlin and Diamond-Square methods composed.
 *
 * Parameters are the same as those for {@link THREE.Terrain.Corner}.
 */
THREE.Terrain.PerlinDiamond = function(g, options) {
    THREE.Terrain.MultiPass(g, options, [
        {method: THREE.Terrain.Perlin},
        {method: THREE.Terrain.DiamondSquare, granularity: -2},
    ]);
};

/**
 * Generate random terrain using the Simplex and Corner methods composed.
 *
 * Parameters are the same as those for {@link THREE.Terrain.Corner}.
 */
THREE.Terrain.SimplexCorner = function(g, options) {
    THREE.Terrain.MultiPass(g, options, [
        {method: THREE.Terrain.Simplex},
        {method: THREE.Terrain.Corner, granularity: 2},
    ]);
};
