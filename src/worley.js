(function() {
    /*
     * A set of functions to calculate the 2D distance between two vectors.
     *
     * The other alternatives are distanceTo (Euclidean) and distanceToSquared
     * (Euclidean squared).
     */
    THREE.Vector2.prototype.distanceToManhattan = function(b) {
        return Math.abs(this.x - b.x) + Math.abs(this.y - b.y);
    };
    THREE.Vector2.prototype.distanceToChebyshev = function(b) {
        var c = Math.abs(this.x - b.x), d = Math.abs(this.y - b.y);
        return c <= d ? d : c;
    };
    THREE.Vector2.prototype.distanceToQuadratic = function(b) {
        var c = Math.abs(this.x - b.x), d = Math.abs(this.y - b.y);
        return c*c + c*d + d*d;
    };

    /**
     * Find the Voronoi centroid closest to the current terrain vertex.
     *
     * This approach is naive, but since the number of cells isn't typically
     * very big, it's plenty fast enough.
     *
     * Alternatives approaches include using Fortune's algorithm or tracking
     * cells based on a grid.
     */
    function distanceToNearest(coords, points, distanceType) {
        var color = Infinity,
            distanceFunc = 'distanceTo' + distanceType;
        for (var k = 0; k < points.length; k++) {
            var d = points[k][distanceFunc](coords);
            if (d < color) {
                color = d;
            }
        }
        return color;
    }

    /**
     * Generate random terrain using Worley noise.
     *
     * Worley noise is also known as Cell or Voronoi noise. It is generated by
     * scattering a bunch of points in heightmap-space, then setting the height
     * of every point in the heightmap based on how close it is to the closest
     * scattered point (or the nth-closest point, but this results in
     * heightmaps that don't look much like terrain).
     *
     * @param {THREE.Vector3[]} g
     *   The vertex array for plane geometry to modify with heightmap data.
     *   This method sets the `z` property of each vertex.
     * @param {Object} options
     *   A map of settings that control how the terrain is constructed and
     *   displayed. Valid values are the same as those for the `options`
     *   parameter of {@link THREE.Terrain}(), plus three additional available
     *   properties:
     *   - `distanceType`: The name of a method to use to calculate the
     *     distance between a point in the heightmap and a Voronoi centroid in
     *     order to determine the height of that point. Available methods
     *     include 'Manhattan', 'Chebyshev', 'Quadratic', 'Squared' (squared
     *     Euclidean), and '' (the empty string, meaning Euclidean, the
     *     default).
     *   - `worleyDistanceTransformation`: A function that takes the distance
     *     from a heightmap vertex to a Voronoi centroid and returns a relative
     *     height for that vertex. Defaults to function(d) { return -d; }.
     *     Interesting choices of algorithm include
     *     `0.5 + 1.0 * Math.cos((0.5*d-1) * Math.PI) - d`, which produces
     *     interesting stepped cones, and `-Math.sqrt(d)`, which produces sharp
     *     peaks resembling stalagmites.
     *   - `worleyDistribution`: A function to use to distribute Voronoi
     *     centroids. Available methods include
     *     `THREE.Terrain.Worley.randomPoints` (the default),
     *     `THREE.Terrain.Worley.PoissonDisks`, and any function that returns
     *     an array of `THREE.Vector2` instances. You can wrap the PoissonDisks
     *     function to use custom parameters.
     *   - `worleyPoints`: The number of Voronoi cells to use (must be at least
     *     one). Calculated by default based on the size of the terrain.
     */
    THREE.Terrain.Worley = function(g, options) {
        var points = (options.worleyDistribution || THREE.Terrain.Worley.randomPoints)(options.xSegments, options.ySegments, options.worleyPoints),
            transform = options.worleyDistanceTransformation || function(d) { return -d; },
            currentCoords = new THREE.Vector2(0, 0);
        // The height of each heightmap vertex is the distance to the closest Voronoi centroid
        for (var i = 0, xl = options.xSegments + 1; i < xl; i++) {
            for (var j = 0; j < options.ySegments + 1; j++) {
                currentCoords.x = i;
                currentCoords.y = j;
                g[j*xl+i].z = transform(distanceToNearest(currentCoords, points, options.distanceType || ''));
            }
        }
        // We set the heights to distances so now we need to normalize
        THREE.Terrain.Clamp(g, {
            maxHeight: options.maxHeight,
            minHeight: options.minHeight,
            stretch: true,
        });
    };

    /**
     * Randomly distribute points in space.
     */
    THREE.Terrain.Worley.randomPoints = function(width, height, numPoints) {
        numPoints = numPoints || Math.floor(Math.sqrt(width * height * 0.025)) || 1;
        var points = new Array(numPoints);
        for (var i = 0; i < numPoints; i++) {
            points[i] = new THREE.Vector2(
                Math.random() * width,
                Math.random() * height
            );
        }
        return points;
    };

    /* Utility functions for Poisson Disks. */

    function removeAndReturnRandomElement(arr) {
        return arr.splice(Math.floor(Math.random() * arr.length), 1)[0];
    }

    function putInGrid(grid, point, cellSize) {
        var gx = Math.floor(point.x / cellSize), gy = Math.floor(point.y / cellSize);
        if (!grid[gx]) grid[gx] = [];
        grid[gx][gy] = point;
    }

    function inRectangle(point, width, height) {
        return  point.x >= 0 &&
                point.y >= 0 &&
                point.x <= width+1 &&
                point.y <= height+1;
    }

    function inNeighborhood(grid, point, minDist, cellSize) {
        var gx = Math.floor(point.x / cellSize),
            gy = Math.floor(point.y / cellSize);
        for (var x = gx - 1; x <= gx + 1; x++) {
            for (var y = gy - 1; y <= gy + 1; y++) {
                if (x !== gx && y !== gy &&
                    typeof grid[x] !== 'undefined' && typeof grid[x][y] !== 'undefined') {
                    var cx = x * cellSize, cy = y * cellSize;
                    if (Math.sqrt((point.x - cx) * (point.x - cx) + (point.y - cy) * (point.y - cy)) < minDist) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function generateRandomPointAround(point, minDist) {
        var radius = minDist * (Math.random() + 1),
            angle = 2 * Math.PI * Math.random();
        return new THREE.Vector2(
            point.x + radius * Math.cos(angle),
            point.y + radius * Math.sin(angle)
        );
    }

    /**
     * Generate a set of points using Poisson disk sampling.
     *
     * Useful for clustering scattered meshes and Voronoi cells for Worley noise.
     *
     * Ported from pseudocode at http://devmag.org.za/2009/05/03/poisson-disk-sampling/
     *
     * @param {Object} options
     *   A map of settings that control how the resulting noise should be generated
     *   (with the same parameters as the `options` parameter to the
     *   `THREE.Terrain` function).
     *
     * @return {THREE.Vector2[]}
     *   An array of points.
     */
    THREE.Terrain.Worley.PoissonDisks = function(width, height, numPoints, minDist) {
        numPoints = numPoints || Math.floor(Math.sqrt(width * height * 0.2)) || 1;
        minDist = Math.sqrt((width + height) * 2.5);
        if (minDist > numPoints * 0.67) minDist = numPoints * 0.67;
        var cellSize = minDist / Math.sqrt(2);
        if (cellSize < 2) cellSize = 2;

        var grid = [];

        var processList = [],
            samplePoints = [];

        var firstPoint = new THREE.Vector2(
            Math.random() * width,
            Math.random() * height
        );
        processList.push(firstPoint);
        samplePoints.push(firstPoint);
        putInGrid(grid, firstPoint, cellSize);

        var count = 0;
        while (processList.length) {
            var point = removeAndReturnRandomElement(processList);
            for (var i = 0; i < numPoints; i++) {
                // optionally, minDist = perlin(point.x / width, point.y / height)
                var newPoint = generateRandomPointAround(point, minDist);
                if (inRectangle(newPoint, width, height) && !inNeighborhood(grid, newPoint, minDist, cellSize)) {
                    processList.push(newPoint);
                    samplePoints.push(newPoint);
                    putInGrid(grid, newPoint, cellSize);
                    if (samplePoints.length >= numPoints) break;
                }
            }
            if (samplePoints.length >= numPoints) break;
            // Sanity check
            if (++count > numPoints*numPoints) {
                break;
            }
        }
        return samplePoints;
    };
})();