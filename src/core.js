/**
 * A terrain object for use with the Three.js library.
 *
 * Usage: `var terrainScene = THREE.Terrain();`
 *
 * @param {Object} [options]
 *   An optional map of settings that control how the terrain is constructed
 *   and displayed. Options include:
 *
 *   - `after`: A function to run after other transformations on the terrain
 *     produce the highest-detail heightmap, but before optimizations and
 *     visual properties are applied. Takes two parameters, which are the same
 *     as those for {@link THREE.Terrain.DiamondSquare}: an array of
 *     `THREE.Vector3` objects representing the vertices of the terrain, and a
 *     map of options with the same available properties as the `options`
 *     parameter for the `THREE.Terrain` function.
 *   - `easing`: A function that affects the distribution of slopes by
 *     interpolating the height of each vertex along a curve. Valid values
 *     include `THREE.Terrain.Linear` (the default), `THREE.Terrain.EaseIn`,
 *     `THREE.Terrain.EaseOut`, `THREE.Terrain.EaseInOut`,
 *     `THREE.Terrain.InEaseOut`, and any custom function that accepts a float
 *     between 0 and 1 and returns a float between 0 and 1.
 *   - `frequency`: For terrain generation methods that support it (Perlin,
 *     Simplex, and Worley) the octave of randomness. This basically controls
 *     how big features of the terrain will be (higher frequencies result in
 *     smaller features). Often running multiple generation functions with
 *     different frequencies and heights results in nice detail, as
 *     the PerlinLayers and SimplexLayers methods demonstrate. (The counterpart
 *     to frequency, amplitude, is represented by the difference between the
 *     `maxHeight` and `minHeight` parameters.) Defaults to 2.5.
 *   - `heightmap`: Either a canvas or pre-loaded image (from the same domain
 *     as the webpage or served with a CORS-friendly header) representing
 *     terrain height data (lighter pixels are higher); or a function used to
 *     generate random height data for the terrain. Valid random functions are
 *     specified in `generators.js` (or custom functions with the same
 *     signature). Ideally heightmap images have the same number of pixels as
 *     the terrain has vertices, as determined by the `xSegments` and
 *     `ySegments` options, but this is not required. If the heightmap is a
 *     different size, vertex height values will be interpolated.) Defaults to
 *     `THREE.Terrain.DiamondSquare`.
 *   - `material`: a THREE.Material instance used to display the terrain.
 *     Defaults to `new THREE.MeshBasicMaterial({color: 0xee6633})`.
 *   - `maxHeight`: the highest point, in Three.js units, that a peak should
 *     reach. Defaults to 100. Setting to `undefined`, `null`, or `Infinity`
 *     removes the cap, but this is generally not recommended because many
 *     generators and filters require a vertical range. Instead, consider
 *     setting the `stretch` option to `false`.
 *   - `minHeight`: the lowest point, in Three.js units, that a valley should
 *     reach. Defaults to -100. Setting to `undefined`, `null`, or `-Infinity`
 *     removes the cap, but this is generally not recommended because many
 *     generators and filters require a vertical range. Instead, consider
 *     setting the `stretch` option to `false`.
 *   - `steps`: If this is a number above 1, the terrain will be paritioned
 *     into that many flat "steps," resulting in a blocky appearance. Defaults
 *     to 1.
 *   - `stretch`: Determines whether to stretch the heightmap across the
 *     maximum and minimum height range if the height range produced by the
 *     `heightmap` property is smaller. Defaults to true.
 *   - `turbulent`: Whether to perform a turbulence transformation. Defaults to
 *     false.
 *   - `xSegments`: The number of segments (rows) to divide the terrain plane
 *     into. (This basically determines how detailed the terrain is.) Defaults
 *     to 63.
 *   - `xSize`: The width of the terrain in Three.js units. Defaults to 1024.
 *     Rendering might be slightly faster if this is a multiple of
 *     `options.xSegments + 1`.
 *   - `ySegments`: The number of segments (columns) to divide the terrain
 *     plane into. (This basically determines how detailed the terrain is.)
 *     Defaults to 63.
 *   - `ySize`: The length of the terrain in Three.js units. Defaults to 1024.
 *     Rendering might be slightly faster if this is a multiple of
 *     `options.ySegments + 1`.
 */
THREE.Terrain = function(options) {
    var defaultOptions = {
        after: null,
        easing: THREE.Terrain.Linear,
        heightmap: THREE.Terrain.DiamondSquare,
        material: null,
        maxHeight: 100,
        minHeight: -100,
        optimization: THREE.Terrain.NONE,
        frequency: 2.5,
        steps: 1,
        stretch: true,
        turbulent: false,
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
    options.material = options.material || new THREE.MeshBasicMaterial({ color: 0xee6633 });

    // Encapsulating the terrain in a parent object allows us the flexibility
    // to more easily have multiple meshes for optimization purposes.
    var scene = new THREE.Object3D();
    // Planes are initialized on the XY plane, so rotate the plane to make it lie flat.
    scene.rotation.x = -0.5 * Math.PI;

    // Create the terrain mesh.
    var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(options.xSize, options.ySize, options.xSegments, options.ySegments),
        options.material
    );

    // Assign elevation data to the terrain plane from a heightmap or function.
    var zs = THREE.Terrain.toArray1D(mesh.geometry.attributes.position.array);
    if (options.heightmap instanceof HTMLCanvasElement || options.heightmap instanceof Image) {
        THREE.Terrain.fromHeightmap(zs, options);
    }
    else if (typeof options.heightmap === 'function') {
        options.heightmap(zs, options);
    }
    else {
        console.warn('An invalid value was passed for `options.heightmap`: ' + options.heightmap);
    }
    THREE.Terrain.fromArray1D(mesh.geometry.attributes.position.array, zs);
    THREE.Terrain.Normalize(mesh, options);

    // lod.addLevel(mesh, options.unit * 10 * Math.pow(2, lodLevel));

    scene.add(mesh);
    return scene;
};

/**
 * Normalize the terrain after applying a heightmap or filter.
 *
 * This applies turbulence, steps, and height clamping; calls the `after`
 * callback; updates normals and the bounding sphere; and marks vertices as
 * dirty.
 *
 * @param {THREE.Mesh} mesh
 *   The terrain mesh.
 * @param {Object} options
 *   A map of settings that control how the terrain is constructed and
 *   displayed. Valid options are the same as for {@link THREE.Terrain}().
 */
THREE.Terrain.Normalize = function(mesh, options) {
    var zs = THREE.Terrain.toArray1D(mesh.geometry.attributes.position.array);
    if (options.turbulent) {
        THREE.Terrain.Turbulence(zs, options);
    }
    if (options.steps > 1) {
        THREE.Terrain.Step(zs, options.steps);
        THREE.Terrain.Smooth(zs, options);
    }

    // Keep the terrain within the allotted height range if necessary, and do easing.
    THREE.Terrain.Clamp(zs, options);

    // Call the "after" callback
    if (typeof options.after === 'function') {
        options.after(zs, options);
    }
    THREE.Terrain.fromArray1D(mesh.geometry.attributes.position.array, zs);

    // Mark the geometry as having changed and needing updates.
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeVertexNormals();
};

/**
 * Optimization types.
 *
 * Note that none of these are implemented right now. They should be done as
 * shaders so that they execute on the GPU, and the resulting scene would need
 * to be updated every frame to adjust to the camera's position.
 *
 * Further reading:
 * - http://vterrain.org/LOD/Papers/
 * - http://vterrain.org/LOD/Implementations/
 *
 * GEOMIPMAP: The terrain plane should be split into sections, each with their
 * own LODs, for screen-space occlusion and detail reduction. Intermediate
 * vertices on higher-detail neighboring sections should be interpolated
 * between neighbor edge vertices in order to match with the edge of the
 * lower-detail section. The number of sections should be around sqrt(segments)
 * along each axis. It's unclear how to make materials stretch across segments.
 * Possible example (I haven't looked too much into it) at
 * https://github.com/felixpalmer/lod-terrain/tree/master/js/shaders
 *
 * GEOCLIPMAP: The terrain should be composed of multiple donut-shaped sections
 * at decreasing resolution as the radius gets bigger. When the player moves,
 * the sections should morph so that the detail "follows" the player around.
 * There is an implementation of geoclipmapping at
 * https://github.com/CodeArtemis/TriggerRally/blob/unified/server/public/scripts/client/terrain.coffee
 * and a tutorial on morph targets at
 * http://nikdudnik.com/making-3d-gfx-for-the-cinema-on-low-budget-and-three-js/
 *
 * POLYGONREDUCTION: Combine areas that are relatively coplanar into larger
 * polygons as described at http://www.shamusyoung.com/twentysidedtale/?p=142.
 * This method can be combined with the others if done very carefully, or it
 * can be adjusted to be more aggressive at greater distance from the camera
 * (similar to combining with geomipmapping).
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
THREE.Terrain.POLYGONREDUCTION = 3;

/**
 * Get a 1D array of heightmap values from a 1D array of plane vertices.
 *
 * @param {Float32Array} vertices
 *   A 1D array containing the vertex positions of the geometry representing the
 *   terrain.
 * @param {Object} options
 *   A map of settings defining properties of the terrain. The only properties
 *   that matter here are `xSegments` and `ySegments`, which represent how many
 *   vertices wide and deep the terrain plane is, respectively (and therefore
 *   also the dimensions of the returned array).
 *
 * @return {Float32Array}
 *   A 1D array representing the terrain's heightmap.
 */
THREE.Terrain.toArray1D = function(vertices) {
    var tgt = new Float32Array(vertices.length / 3);
    for (var i = 0, l = tgt.length; i < l; i++) {
        tgt[i] = vertices[i * 3 + 2];
    }
    return tgt;
};

/**
 * Set the height of plane vertices from a 1D array of heightmap values.
 *
 * @param {Float32Array} vertices
 *   A 1D array containing the vertex positions of the geometry representing the
 *   terrain.
 * @param {Number[]} src
 *   A 1D array representing a heightmap to apply to the terrain.
 */
THREE.Terrain.fromArray1D = function(vertices, src) {
    for (var i = 0, l = Math.min(vertices.length / 3, src.length); i < l; i++) {
        vertices[i * 3 + 2] = src[i];
    }
};

/**
 * Randomness interpolation functions.
 */
THREE.Terrain.Linear = function(x) {
    return x;
};