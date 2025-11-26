// Material System
class Material {
    constructor(name, color, transparent = false, alpha = 1.0, renderOrder = 0) {
        this.name = name;
        this.color = color;
        this.transparent = transparent;
        this.alpha = alpha;
        this.renderOrder = renderOrder; // 0 = solid, 1 = transparent
    }
}

// Material definitions
const Materials = {
    GRASS: new Material('grass', [0.3, 0.7, 0.3], false, 1.0, 0),
    DIRT: new Material('dirt', [0.6, 0.4, 0.2], false, 1.0, 0),
    STONE: new Material('stone', [0.5, 0.5, 0.52], false, 1.0, 0),
    BEDROCK: new Material('bedrock', [0.3, 0.3, 0.32], false, 1.0, 0),
    SAND: new Material('sand', [0.93, 0.88, 0.65], false, 1.0, 0),
    SNOW: new Material('snow', [0.95, 0.95, 0.98], false, 1.0, 0),
    ICE: new Material('ice', [0.7, 0.85, 0.95], false, 1.0, 0),
    WATER: new Material('water', [0.2, 0.4, 0.8], true, 0.7, 1),
    WOOD: new Material('wood', [0.4, 0.25, 0.1], false, 1.0, 0),
    LEAVES: new Material('leaves', [0.2, 0.5, 0.2], false, 1.0, 0)
};

// First Person 3D World Game
class Game {
    constructor() {
        console.log('Game constructor starting...');
        this.canvas = document.getElementById('gameCanvas');
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            alert('WebGL not supported!');
            return;
        }

        // Player properties - spawn in open area
        this.player = {
            position: [0, 5, 0],
            rotation: [0, 0],
            velocity: [0, 0, 0],
            speed: 0.1,
            mouseSensitivity: 0.002,
            jumpSpeed: 0.15,
            onGround: false,
            health: 100,
            maxHealth: 100
        };

        // Weapon system
        this.weapon = {
            ammo: 12,
            maxAmmo: 12,
            totalAmmo: 60,
            damage: 25,
            fireRate: 300,
            lastShot: 0,
            reloadTime: 1500,
            isReloading: false
        };

        // Enemies
        this.enemies = [];

        // Input state
        this.keys = {};
        this.mouseMovement = { x: 0, y: 0 };
        this.pointerLocked = false;

        // Voxel chunk system
        this.chunks = new Map();
        this.chunkSize = 16; // 16x16 blocks per chunk
        this.chunkHeight = 128; // Vertical chunk size (world height)
        this.renderDistance = 2; // chunks
        this.lastChunkX = null;
        this.lastChunkZ = null;
        this.worldSeed = Math.floor(Math.random() * 1000000);
        // console.log(`World Seed: ${this.worldSeed}`);
        this.blockSize = 2; // Each block is 2x2x2 units
        this.dirtyChunks = new Set(); // Track chunks that need re-rendering
        
        // World objects
        this.cubes = [];
        this.updateChunks();
        this.generateEnemies();
        
        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.setupShaders();
        this.setupBuffers();
        this.setupInput();
        
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.clearColor(0.53, 0.81, 0.92, 1.0); // Sky blue
        
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fpsTime = 0;
        this.fpsElement = document.getElementById('fps');
        
        // Generate initial chunks around spawn
        // console.log('Generating initial chunks...');
        this.updateChunks();
        // console.log(`Chunks loaded: ${this.chunks.size}, Cubes: ${this.cubes.length}`);
        
        // Set player spawn on solid ground
        const spawnHeight = this.getTerrainHeightAt(0, 0);
        this.player.position[1] = Math.max(spawnHeight + 3, 5); // Spawn above terrain, minimum Y=5
        this.player.rotation = [0, 0]; // Look straight ahead
        // console.log(`Player spawn at height: ${this.player.position[1]}`);
        
        this.generateEnemies();
        
        this.gameLoop();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    setupShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec3 aColor;
            attribute vec3 aNormal;
            
            uniform mat4 uModelMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            varying float vDepth;
            
            void main() {
                vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
                
                // Transform normal to world space
                vNormal = mat3(uModelMatrix) * aNormal;
                vColor = aColor;
                vDepth = gl_Position.z / gl_Position.w;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            varying float vDepth;
            
            uniform vec3 uLightDir;
            uniform vec3 uAmbientLight;
            uniform float uAlpha;
            
            void main() {
                // Normalize the normal
                vec3 normal = normalize(vNormal);
                
                // Calculate lighting
                float diffuse = max(dot(normal, uLightDir), 0.0);
                
                // Cell shading - quantize the lighting
                if (diffuse > 0.95) {
                    diffuse = 1.0;
                } else if (diffuse > 0.5) {
                    diffuse = 0.7;
                } else if (diffuse > 0.25) {
                    diffuse = 0.4;
                } else {
                    diffuse = 0.2;
                }
                
                // Combine ambient and diffuse lighting
                vec3 lighting = uAmbientLight + vec3(diffuse);
                vec3 finalColor = vColor * lighting;
                
                // Add subtle edge darkening for cartoon effect
                float edge = abs(dot(normal, vec3(0.0, 0.0, 1.0)));
                if (edge < 0.3) {
                    finalColor *= 0.5;
                }
                
                gl_FragColor = vec4(finalColor, uAlpha);
            }
        `;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        this.program = this.createProgram(vertexShader, fragmentShader);
        this.gl.useProgram(this.program);

        // Get attribute and uniform locations
        this.locations = {
            aPosition: this.gl.getAttribLocation(this.program, 'aPosition'),
            aColor: this.gl.getAttribLocation(this.program, 'aColor'),
            aNormal: this.gl.getAttribLocation(this.program, 'aNormal'),
            uModelMatrix: this.gl.getUniformLocation(this.program, 'uModelMatrix'),
            uViewMatrix: this.gl.getUniformLocation(this.program, 'uViewMatrix'),
            uProjectionMatrix: this.gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            uLightDir: this.gl.getUniformLocation(this.program, 'uLightDir'),
            uAmbientLight: this.gl.getUniformLocation(this.program, 'uAmbientLight'),
            uAlpha: this.gl.getUniformLocation(this.program, 'uAlpha')
        };
        
        // Set lighting uniforms
        this.gl.uniform3f(this.locations.uLightDir, 0.5, 0.7, 0.5);
        this.gl.uniform3f(this.locations.uAmbientLight, 0.4, 0.4, 0.5);
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }

    setupBuffers() {
        // Cube vertices (position)
        const vertices = new Float32Array([
            // Front face
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            // Back face
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            // Top face
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            // Bottom face
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
            // Right face
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            // Left face
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5
        ]);

        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        // Cube normals
        const normals = new Float32Array([
            // Front face
            0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
            // Back face
            0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
            // Top face
            0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
            // Bottom face
            0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
            // Right face
            1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
            // Left face
            -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0
        ]);

        this.normalBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);

        // Cube indices
        const indices = new Uint16Array([
            0,  1,  2,   0,  2,  3,    // front
            4,  5,  6,   4,  6,  7,    // back
            8,  9, 10,   8, 10, 11,    // top
            12, 13, 14,  12, 14, 15,   // bottom
            16, 17, 18,  16, 18, 19,   // right
            20, 21, 22,  20, 22, 23    // left
        ]);

        this.indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
        this.indexCount = indices.length;

        // Create reusable color buffer
        this.colorBuffer = this.gl.createBuffer();
    }

    seededRandom(x, z, seed) {
        const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
        return n - Math.floor(n);
    }
    
    floodFillWater(voxelGrid, chunkSize, seaLevel) {
        // 3D BFS: seed at the FIRST empty below sea level per column, then flow DOWN first.
        // Also traverse through existing water at sea level to reach cave openings.
        const visited = new Set();
        const queue = [];
        let seeds = 0;
        let placed = 0;
        let logged = 0;
        let minPlacedY = 9999;

        for (let x = 0; x < chunkSize; x++) {
            for (let z = 0; z < chunkSize; z++) {
                // Seed ALL empty cells at or below sea level for this column
                for (let y = seaLevel; y >= -60; y--) {
                    const aY = y + 60;
                    const v = voxelGrid[x] && voxelGrid[x][z] ? voxelGrid[x][z][aY] : null;
                    if (!v) {
                        const k = `${x},${y},${z}`;
                        if (!visited.has(k)) { visited.add(k); queue.push([x, y, z]); seeds++; }
                    }
                }
                // Also enqueue sea-level water to traverse across ocean surface
                const seaAY = seaLevel + 60;
                if (voxelGrid[x] && voxelGrid[x][z] && voxelGrid[x][z][seaAY] && voxelGrid[x][z][seaAY].material === Materials.WATER) {
                    const kw = `${x},${seaLevel},${z}`;
                    if (!visited.has(kw)) { visited.add(kw); queue.push([x, seaLevel, z]); seeds++; }
                }
            }
        }

        while (queue.length > 0) {
            const [x, y, z] = queue.shift();
            if (x < 0 || x >= chunkSize || z < 0 || z >= chunkSize || y < -60 || y > seaLevel) continue;
            if (!voxelGrid[x] || !voxelGrid[x][z]) continue;
            const aY = y + 60;
            const v = voxelGrid[x][z][aY];

            // Place water only into empty cells, but traverse through existing water
            if (!v) {
                voxelGrid[x][z][aY] = { material: Materials.WATER, color: [0.2, 0.4, 0.8], type: 'water' };
                placed++;
                if (y < minPlacedY) minPlacedY = y;
                if (logged < 40 && y < 0) { console.log(`[WaterFill] placed x=${x} y=${y} z=${z}`); logged++; }
            }

            // Strong downwards priority: always try DOWN, then 4 sides; skip UP to keep flow downward
            const down = [x, y - 1, z];
            const sides = [
                [x - 1, y, z], [x + 1, y, z], [x, y, z - 1], [x, y, z + 1]
            ];

            // Enqueue DOWN even when below is water (to continue falling through cavities)
            {
                const [nx, ny, nz] = down;
                if (nx >= 0 && nx < chunkSize && nz >= 0 && nz < chunkSize && ny >= -60 && ny <= seaLevel) {
                    const key = `${nx},${ny},${nz}`;
                    if (!visited.has(key)) {
                        const naY = ny + 60;
                        const belowV = voxelGrid[nx] && voxelGrid[nx][nz] ? voxelGrid[nx][nz][naY] : null;
                        if (!belowV || (belowV && belowV.material === Materials.WATER)) {
                            visited.add(key);
                            queue.push([nx, ny, nz]);
                        }
                    }
                }
            }

            // Then enqueue sides, but only into empty or water to avoid tunneling through solids
            for (const [nx, ny, nz] of sides) {
                if (nx < 0 || nx >= chunkSize || nz < 0 || nz >= chunkSize) continue;
                if (ny < -60 || ny > seaLevel) continue;
                const key = `${nx},${ny},${nz}`;
                if (visited.has(key)) continue;
                const naY = ny + 60;
                if (!voxelGrid[nx] || !voxelGrid[nx][nz]) continue;
                const nv = voxelGrid[nx][nz][naY];
                if (!nv || (nv.material && nv.material === Materials.WATER)) {
                    visited.add(key);
                    queue.push([nx, ny, nz]);
                }
            }
        }

        console.log(`[WaterFill] seeds=${seeds} placed=${placed} minYPlaced=${minPlacedY === 9999 ? 'n/a' : minPlacedY}`);
    }
    
    isPlayerInWater() {
        // Check if player is in water by checking cubes at player position
        const playerRadius = 0.5;
        const playerHeight = 1.8;
        
        for (let cube of this.cubes) {
            if (cube.material && cube.material.transparent && cube.material === Materials.WATER) {
                // Check if player overlaps with water cube
                const cubeMinX = cube.position[0] - cube.scale[0] / 2;
                const cubeMaxX = cube.position[0] + cube.scale[0] / 2;
                const cubeMinY = cube.position[1] - cube.scale[1] / 2;
                const cubeMaxY = cube.position[1] + cube.scale[1] / 2;
                const cubeMinZ = cube.position[2] - cube.scale[2] / 2;
                const cubeMaxZ = cube.position[2] + cube.scale[2] / 2;
                
                const playerMinX = this.player.position[0] - playerRadius;
                const playerMaxX = this.player.position[0] + playerRadius;
                const playerMinY = this.player.position[1] - playerHeight / 2;
                const playerMaxY = this.player.position[1] + playerHeight / 2;
                const playerMinZ = this.player.position[2] - playerRadius;
                const playerMaxZ = this.player.position[2] + playerRadius;
                
                if (playerMaxX > cubeMinX && playerMinX < cubeMaxX &&
                    playerMaxY > cubeMinY && playerMinY < cubeMaxY &&
                    playerMaxZ > cubeMinZ && playerMinZ < cubeMaxZ) {
                    return true;
                }
            }
        }
        return false;
    }
    
    getVoxelAt(worldX, worldY, worldZ) {
        const chunkX = Math.floor(worldX / this.chunkSize);
        const chunkZ = Math.floor(worldZ / this.chunkSize);
        const key = `${chunkX},${chunkZ}`;
        const chunkData = this.chunks.get(key);
        
        if (!chunkData || !chunkData.voxelGrid) return null;
        
        const localX = worldX - chunkX * this.chunkSize;
        const localZ = worldZ - chunkZ * this.chunkSize;
        
        return chunkData.voxelGrid[localX]?.[localZ]?.[worldY + 6];
    }
    
    floodFill3D(voxelGrid, startX, startY, startZ, targetMaterial, processed) {
        const connected = [];
        const queue = [{x: startX, y: startY, z: startZ}];
        const visited = new Set();
        visited.add(`${startX},${startY},${startZ}`);
        
        while (queue.length > 0) {
            const {x, y, z} = queue.shift();
            const posKey = `${x},${y},${z}`;
            
            if (processed.has(posKey)) continue;
            
            const voxel = voxelGrid[x]?.[z]?.[y];
            if (!voxel || !voxel.material || voxel.material !== targetMaterial) continue;
            
            connected.push({x, y, z});
            processed.add(posKey);
            
            // Check all 6 neighbors
            const neighbors = [
                {x: x + 1, y, z},
                {x: x - 1, y, z},
                {x, y: y + 1, z},
                {x, y: y - 1, z},
                {x, y, z: z + 1},
                {x, y, z: z - 1}
            ];
            
            for (const n of neighbors) {
                const nKey = `${n.x},${n.y},${n.z}`;
                if (n.x >= 0 && n.x < this.chunkSize &&
                    n.y >= 0 && n.y < this.chunkHeight &&
                    n.z >= 0 && n.z < this.chunkSize &&
                    !visited.has(nKey) && !processed.has(nKey)) {
                    visited.add(nKey);
                    queue.push(n);
                }
            }
        }
        
        return connected;
    }
    
    rebuildDirtyChunks() {
        for (const key of this.dirtyChunks) {
            const chunkData = this.chunks.get(key);
            if (!chunkData) continue;
            
            // Remove old cubes from render list
            this.cubes = this.cubes.filter(cube => cube.chunkKey !== key);
            
            // Regenerate visible cubes from voxel grid with greedy meshing
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const newCubes = this.greedyMesher(chunkData.voxelGrid, chunkX, chunkZ, key);
            
            chunkData.cubes = newCubes;
            chunkData.dirty = false;
            chunkData.lastRendered = Date.now();
            this.cubes.push(...newCubes);
        }
        
        this.dirtyChunks.clear();
    }
    
    greedyMesher(voxelGrid, chunkX, chunkZ, key) {
        return greedyMesher(voxelGrid, chunkX, chunkZ, key, this.chunkSize, this.chunkHeight, this.blockSize, this.colorsMatch.bind(this), this);
    }
    
    colorsMatch(color1, color2) {
        if (!color1 || !color2) return false;
        return Math.abs(color1[0] - color2[0]) < 0.01 &&
               Math.abs(color1[1] - color2[1]) < 0.01 &&
               Math.abs(color1[2] - color2[2]) < 0.01;
    }
    
    markChunkDirty(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunks.has(key)) {
            this.dirtyChunks.add(key);
            this.chunks.get(key).dirty = true;
        }
    }

    getBiome(worldX, worldZ) {
        const temp = Math.sin(worldX * 0.008 + this.worldSeed) * Math.cos(worldZ * 0.008 + this.worldSeed);
        const moisture = Math.sin(worldX * 0.012 + this.worldSeed * 2) * Math.cos(worldZ * 0.012 + this.worldSeed * 2);
        const elevation = Math.sin(worldX * 0.005 + this.worldSeed * 3) * Math.cos(worldZ * 0.005 + this.worldSeed * 3);
        
        // Cold biomes
        if (temp < -0.4) {
            return 'ice';
        } else if (temp < -0.1) {
            return moisture < 0 ? 'tundra' : 'taiga';
        }
        // Temperate biomes
        else if (temp < 0.3) {
            if (elevation > 0.4) return 'mountains';
            if (moisture < -0.3) return 'desert';
            if (moisture < 0) return 'plains';
            if (moisture < 0.4) return 'forest';
            return 'swamp';
        }
        // Hot biomes
        else {
            if (moisture < -0.2) return 'desert';
            if (moisture < 0.2) return 'savanna';
            return 'jungle';
        }
    }

    getBiomeColor(biome, heightVariation) {
        const base = 0.4 + heightVariation * 0.15;
        
        switch(biome) {
            case 'desert':
                return [base * 1.8, base * 1.5, base * 0.8];
            case 'tundra':
                return [base * 1.3, base * 1.4, base * 1.5];
            case 'taiga':
                return [base * 0.6, base * 1.2, base * 0.7];
            case 'ice':
                return [base * 1.6, base * 1.7, base * 1.8];
            case 'plains':
                return [base * 0.7, base * 1.5, base * 0.7];
            case 'forest':
                return [base * 0.5, base * 1.4, base * 0.6];
            case 'jungle':
                return [base * 0.4, base * 1.3, base * 0.5];
            case 'savanna':
                return [base * 1.2, base * 1.3, base * 0.6];
            case 'swamp':
                return [base * 0.5, base * 1.0, base * 0.6];
            case 'mountains':
                return [base * 0.7, base * 0.7, base * 0.75];
            default:
                return [base, base * 1.2, base];
        }
    }

    updateChunks() {
        const playerChunkX = Math.floor(this.player.position[0] / (this.chunkSize * 2));
        const playerChunkZ = Math.floor(this.player.position[2] / (this.chunkSize * 2));
        
        // Only update if player moved to a new chunk
        if (playerChunkX === this.lastChunkX && playerChunkZ === this.lastChunkZ) {
            // Still check dirty chunks even if player hasn't moved
            if (this.dirtyChunks.size > 0) {
                this.rebuildDirtyChunks();
            }
            return;
        }
        
        this.lastChunkX = playerChunkX;
        this.lastChunkZ = playerChunkZ;
        
        // Load chunks around player
        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.chunks.has(key)) {
                    this.generateChunk(chunkX, chunkZ);
                }
            }
        }
        
        // Unload distant chunks more aggressively
        for (const [key, chunkData] of this.chunks.entries()) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const dx = Math.abs(chunkX - playerChunkX);
            const dz = Math.abs(chunkZ - playerChunkZ);
            
            // Unload chunks immediately outside render distance
            if (dx > this.renderDistance || dz > this.renderDistance) {
                // Remove cubes from render list
                this.cubes = this.cubes.filter(cube => cube.chunkKey !== key);
                this.chunks.delete(key);
                this.dirtyChunks.delete(key);
            }
        }
        
        // Limit total chunks in memory (safety limit)
        if (this.chunks.size > 25) {
            console.warn(`Too many chunks in memory (${this.chunks.size}), clearing oldest`);
            let oldestKey = null;
            let oldestTime = Date.now();
            
            for (const [key, chunkData] of this.chunks.entries()) {
                if (chunkData.lastRendered < oldestTime) {
                    oldestTime = chunkData.lastRendered;
                    oldestKey = key;
                }
            }
            
            if (oldestKey) {
                this.cubes = this.cubes.filter(cube => cube.chunkKey !== oldestKey);
                this.chunks.delete(oldestKey);
                this.dirtyChunks.delete(oldestKey);
            }
        }
        
        // Rebuild dirty chunks
        if (this.dirtyChunks.size > 0) {
            this.rebuildDirtyChunks();
        }
    }

    generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        let chunkCubes = [];
        
        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;
        
        // Voxel grid for this chunk [x][z][y]
        const voxelGrid = [];
        
        // Generate voxel data
        for (let x = 0; x < this.chunkSize; x++) {
            voxelGrid[x] = [];
            for (let z = 0; z < this.chunkSize; z++) {
                voxelGrid[x][z] = [];
                
                const worldX = offsetX + x;
                const worldZ = offsetZ + z;
                
                // Multi-octave terrain generation for smooth hills
                const noise1 = Math.sin(worldX * 0.1 + this.worldSeed) * Math.cos(worldZ * 0.1 + this.worldSeed);
                const noise2 = Math.sin(worldX * 0.05 + this.worldSeed * 2) * Math.cos(worldZ * 0.05 + this.worldSeed * 2) * 1.5;
                const noise3 = Math.sin(worldX * 0.02 + this.worldSeed * 3) * Math.cos(worldZ * 0.02 + this.worldSeed * 3) * 2;
                const noise4 = Math.sin(worldX * 0.15 + this.worldSeed * 4) * Math.cos(worldZ * 0.15 + this.worldSeed * 4) * 0.5;
                
                const biome = this.getBiome(worldX, worldZ);
                
                let heightMultiplier = 1.2;
                if (biome === 'mountains') heightMultiplier = 3.0;
                else if (biome === 'ice' || biome === 'tundra') heightMultiplier = 2.0;
                else if (biome === 'taiga') heightMultiplier = 1.5;
                else if (biome === 'desert') heightMultiplier = 1.0;
                else if (biome === 'plains') heightMultiplier = 0.6;
                else if (biome === 'forest' || biome === 'jungle') heightMultiplier = 1.4;
                else if (biome === 'savanna') heightMultiplier = 0.8;
                else if (biome === 'swamp') heightMultiplier = 0.5;
                
                const height = (noise1 + noise2 + noise3 + noise4) * heightMultiplier;
                const surfaceY = Math.round(height * 2.5); // Round instead of floor for smoother terrain
                
                const heightVariation = (height + 3) / 6;
                const surfaceColor = this.getBiomeColor(biome, heightVariation);
                
                const bedrockLevel = -60; // Bottom of the world
                const bedrockTop = -55;    // Bedrock layer thickness
                const seaLevel = 0;
                
                // Fill from bedrock to surface (NOT forcing to sea level)
                const maxY = surfaceY;
                
                for (let y = bedrockLevel; y <= maxY; y++) {
                    const depthFromSurface = surfaceY - y;
                    let voxelType, voxelColor, material;
                    
                    // Bedrock layer at bottom (ALWAYS solid, no exceptions)
                    if (y <= bedrockTop) {
                        voxelType = 'terrain';
                        voxelColor = [0.15, 0.15, 0.15];
                        material = Materials.BEDROCK;
                    }
                    else if (y > surfaceY) {
                        // Water above terrain
                        if (y <= seaLevel) {
                            voxelType = 'water';
                            voxelColor = [0.2, 0.4, 0.8];
                        }
                    } else {
                        // Solid terrain
                        // Multi-layered cave system with tall chambers and branching tunnels
                        // Main cave chambers (very low Y frequency for tall vertical spaces)
                        const caveNoise1 = Math.sin(worldX * 0.06 + y * 0.03 + this.worldSeed) * 
                                          Math.cos(worldZ * 0.06 + y * 0.03 + this.worldSeed * 2);
                        
                        // Medium branches (low Y frequency for walkable height)
                        const caveNoise2 = Math.sin(worldX * 0.12 + y * 0.05 + this.worldSeed * 3) * 
                                          Math.cos(worldZ * 0.12 + y * 0.05 + this.worldSeed * 4);
                        
                        // Small tunnels (still tall enough to walk through)
                        const caveNoise3 = Math.sin(worldX * 0.15 + y * 0.04 + this.worldSeed * 5) * 
                                          Math.cos(worldZ * 0.15 + y * 0.04 + this.worldSeed * 6);
                        
                        // Additional layer for more branching variety
                        const caveNoise4 = Math.sin(worldX * 0.1 + y * 0.06 + worldZ * 0.08 + this.worldSeed * 7) * 
                                          Math.cos(worldZ * 0.11 + y * 0.06 + worldX * 0.09 + this.worldSeed * 8);
                        
                        // Combine all layers - weighted to create main chambers with branching tunnels
                        const combinedCaveNoise = (caveNoise1 * 0.6 + caveNoise2 * 0.5 + caveNoise3 * 0.4 + caveNoise4 * 0.3) / 1.8;
                        
                        // Caves can reach surface, but not in bedrock layer
                        const isCave = y > bedrockTop + 3 && combinedCaveNoise > 0.35 && y > bedrockLevel + 8;
                        
                        if (!isCave) {
                            // Solid terrain
                            voxelType = 'terrain';
                            
                            // Ore generation based on depth
                            let isOre = false;
                            const oreRandom = this.seededRandom(worldX * 1000, worldZ * 1000 + y, this.worldSeed + y);
                            
                            if (depthFromSurface >= 3) {
                                // Coal ore (common, shallow)
                                if (depthFromSurface >= 3 && depthFromSurface < 12 && oreRandom < 0.08) {
                                    material = Materials.COAL_ORE;
                                    voxelColor = [0.2, 0.2, 0.2];
                                    isOre = true;
                                }
                                // Iron ore (medium depth)
                                else if (depthFromSurface >= 6 && depthFromSurface < 18 && oreRandom < 0.05) {
                                    material = Materials.IRON_ORE;
                                    voxelColor = [0.7, 0.6, 0.5];
                                    isOre = true;
                                }
                                // Gold ore (deep)
                                else if (depthFromSurface >= 10 && depthFromSurface < 22 && oreRandom < 0.03) {
                                    material = Materials.GOLD_ORE;
                                    voxelColor = [0.9, 0.8, 0.2];
                                    isOre = true;
                                }
                                // Diamond ore (very deep, rare)
                                else if (depthFromSurface >= 15 && oreRandom < 0.015) {
                                    material = Materials.DIAMOND_ORE;
                                    voxelColor = [0.3, 0.8, 0.9];
                                    isOre = true;
                                }
                            }
                            
                            if (!isOre) {
                                // Normal terrain layers
                                if (y === surfaceY) {
                                    voxelColor = surfaceColor;
                                } else if (depthFromSurface < 3) {
                                    voxelColor = [surfaceColor[0] * 0.7, surfaceColor[1] * 0.7, surfaceColor[2] * 0.7];
                                } else if (depthFromSurface < 8) {
                                    voxelColor = [0.5, 0.5, 0.52];
                                } else {
                                    voxelColor = [0.3, 0.3, 0.32];
                                }
                            }
                        }
                    }
                    
                    if (voxelType) {
                        // Determine material based on type and color (if not already set as ore)
                        if (!material) {
                            if (voxelType === 'water') {
                                material = Materials.WATER;
                            } else {
                                // Match color to material for terrain
                                if (voxelColor[0] === 0.3 && voxelColor[1] === 0.3) {
                                    material = Materials.BEDROCK;
                                } else if (depthFromSurface === 0) {
                                    // Surface block - use biome-specific material
                                    if (biome === 'desert') {
                                        material = Materials.SAND;
                                    } else if (biome === 'ice' || biome === 'tundra') {
                                        material = Materials.SNOW;
                                    } else {
                                        material = Materials.GRASS;
                                    }
                                } else if (depthFromSurface < 3) {
                                    material = Materials.DIRT;
                                } else if (depthFromSurface < 8) {
                                    material = Materials.STONE;
                                } else {
                                    material = Materials.BEDROCK;
                                }
                            }
                        }
                        voxelGrid[x][z][y + 60] = { material: material, color: voxelColor, type: voxelType };
                    }
                }
            }
        }
        
        // Flood fill water into caves below sea level (seaLevel is always 0)
        this.floodFillWater(voxelGrid, this.chunkSize, 0);
        
        // Use greedy meshing to generate optimized render cubes
        chunkCubes = this.greedyMesher(voxelGrid, chunkX, chunkZ, key);
        
        // if (chunkCubes.length === 0) {
        //     console.warn(`Chunk ${key} generated 0 cubes!`);
        // }
        
        // Generate features based on biome
        this.generateChunkFeatures(chunkX, chunkZ, chunkCubes, key);
        
        // Store chunk with metadata
        this.chunks.set(key, {
            cubes: chunkCubes,
            voxelGrid: voxelGrid,
            dirty: false,
            lastRendered: Date.now()
        });
        this.cubes.push(...chunkCubes);
        
        // Log optimization stats
        // const mergedCount = chunkCubes.filter(c => c.merged).length;
        // if (mergedCount > 0) {
        //     console.log(`Chunk ${key}: ${chunkCubes.length} cubes (${mergedCount} merged)`);
        // }
    }

    generateChunkFeatures(chunkX, chunkZ, chunkCubes, key) {
        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;
        
        const numFeatures = 2 + Math.floor(this.seededRandom(chunkX, chunkZ, this.worldSeed + 500) * 3);
        
        for (let i = 0; i < numFeatures; i++) {
            const localX = this.seededRandom(chunkX + i, chunkZ, this.worldSeed + 600) * this.chunkSize;
            const localZ = this.seededRandom(chunkX, chunkZ + i, this.worldSeed + 700) * this.chunkSize;
            
            const worldX = (offsetX + localX) * 2;
            const worldZ = (offsetZ + localZ) * 2;
            
            // Skip spawn area
            if (Math.sqrt(worldX * worldX + worldZ * worldZ) < 10) continue;
            
            const terrainHeight = this.getTerrainHeightAt(worldX, worldZ);
            const biome = this.getBiome(worldX / 2, worldZ / 2);
            const rand = this.seededRandom(worldX, worldZ, this.worldSeed + 800);
            
            // Biome-specific features
            if (biome === 'forest' || biome === 'jungle') {
                // Trees - don't spawn in water
                if (rand < 0.7 && terrainHeight > 0) {
                    const treeHeight = 2 + this.seededRandom(worldX, worldZ, this.worldSeed + 900) * 3;
                    const isFantasy = this.seededRandom(worldX, worldZ, this.worldSeed + 1100) > 0.6;
                    
                    chunkCubes.push({
                        position: [worldX, terrainHeight + 0.25 + treeHeight / 2, worldZ],
                        scale: [0.7, treeHeight, 0.7],
                        color: [0.35 + rand * 0.15, 0.22, 0.10],
                        material: Materials.WOOD,
                        type: 'structure',
                        chunkKey: key
                    });
                    
                    let leafColor;
                    if (isFantasy) {
                        const hue = this.seededRandom(worldX, worldZ, this.worldSeed + 1200);
                        leafColor = hue < 0.33 ? [0.2, 0.7, 0.9] : hue < 0.66 ? [0.9, 0.3, 0.7] : [0.9, 0.8, 0.2];
                    } else {
                        leafColor = [0.1, 0.6 + rand * 0.2, 0.15];
                    }
                    
                    chunkCubes.push({
                        position: [worldX, terrainHeight + 0.25 + treeHeight + 0.8, worldZ],
                        scale: [2, 1.5, 2],
                        color: leafColor,
                        material: Materials.LEAVES,
                        type: 'decoration',
                        chunkKey: key
                    });
                }
            } else if (biome === 'desert' || biome === 'savanna') {
                // Cacti / rocks
                if (rand < 0.4) {
                    const size = 0.5 + this.seededRandom(worldX, worldZ, this.worldSeed + 1300) * 1.5;
                    chunkCubes.push({
                        position: [worldX, terrainHeight + 0.25 + size / 2, worldZ],
                        scale: [size * 0.8, size * 1.5, size * 0.8],
                        color: biome === 'desert' ? [0.3, 0.6, 0.3] : [0.5, 0.45, 0.4],
                        material: Materials.WOOD,
                        type: 'obstacle',
                        chunkKey: key
                    });
                }
            } else if (biome === 'ice' || biome === 'tundra') {
                // Ice spikes / snow mounds
                if (rand < 0.3) {
                    const size = 0.8 + this.seededRandom(worldX, worldZ, this.worldSeed + 1400) * 1.2;
                    chunkCubes.push({
                        position: [worldX, terrainHeight + 0.25 + size / 2, worldZ],
                        scale: [size, size * 1.3, size],
                        color: [0.85, 0.9, 0.95],
                        material: Materials.ICE,
                        type: 'obstacle',
                        chunkKey: key
                    });
                }
            }
        }
    }

    generateWorld() {
        const cubes = [];
        const terrainMap = {};
        
        // Enhanced terrain with more variation and biomes
        for (let x = -20; x <= 20; x++) {
            for (let z = -20; z <= 20; z++) {
                // Multiple noise layers for more complex terrain
                const noise1 = Math.sin(x * 0.3) * Math.cos(z * 0.3);
                const noise2 = Math.sin(x * 0.15) * Math.cos(z * 0.15) * 2;
                const noise3 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 3;
                const height = Math.floor((noise1 + noise2 + noise3) * 0.5) * 0.5;
                const yPos = -1 + height;
                
                // Biome detection based on position
                const distFromCenter = Math.sqrt(x * x + z * z);
                const biome = distFromCenter < 8 ? 'forest' : 
                             distFromCenter < 15 ? 'plains' : 'mountains';
                
                // Store terrain info
                terrainMap[`${x},${z}`] = { height: yPos, biome: biome };
                
                // Color based on biome and height - natural palette
                let color;
                const heightVariation = (height + 1.5) / 3;
                
                if (biome === 'forest') {
                    // Dark forest greens
                    const base = 0.25 + heightVariation * 0.1;
                    color = [base * 0.6, base * 1.8, base * 0.8];
                } else if (biome === 'plains') {
                    // Bright grass greens
                    const base = 0.45 + heightVariation * 0.15;
                    color = [base * 0.7, base * 1.5, base * 0.7];
                } else {
                    // Mountains - natural stone grays
                    const base = 0.45 + heightVariation * 0.2;
                    color = [base * 1.1, base * 1.0, base * 0.9];
                }
                
                cubes.push({
                    position: [x * 2, yPos, z * 2],
                    scale: [2, 0.5, 2],
                    color: color,
                    type: 'terrain'
                });
            }
        }

        // Helper function to get terrain info at world position
        const getTerrainInfo = (worldX, worldZ) => {
            const gridX = Math.round(worldX / 2);
            const gridZ = Math.round(worldZ / 2);
            return terrainMap[`${gridX},${gridZ}`] || { height: -1, biome: 'plains' };
        };

        // Dense forest with varied trees - with spacing (avoid spawn area)
        const treePositions = [];
        const minTreeDistance = 3; // Minimum distance between trees
        const spawnClearRadius = 5; // Clear area around spawn
        
        for (let i = 0; i < 50; i++) {
            let x, z, attempts = 0;
            let validPosition = false;
            
            // Try to find a valid position that's not too close to other trees or spawn
            while (!validPosition && attempts < 20) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 5 + Math.random() * 20; // Start trees away from spawn
                x = Math.cos(angle) * distance;
                z = Math.sin(angle) * distance;
                
                // Check distance from spawn point
                const distFromSpawn = Math.sqrt(x * x + z * z);
                if (distFromSpawn < spawnClearRadius) {
                    attempts++;
                    continue;
                }
                
                validPosition = true;
                for (let pos of treePositions) {
                    const dx = x - pos.x;
                    const dz = z - pos.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < minTreeDistance) {
                        validPosition = false;
                        break;
                    }
                }
                attempts++;
            }
            
            if (!validPosition) continue; // Skip if couldn't find valid position
            
            treePositions.push({ x, z });
            const terrainInfo = getTerrainInfo(x, z);
            
            // Don't spawn trees in water
            if (terrainInfo.height <= 0) continue;
            
            const treeHeight = 2 + Math.random() * 3;
            const treeType = Math.random();
            
            if (treeType < 0.6) {
                // Regular tree - natural bark
                const barkVariation = Math.random();
                cubes.push({
                    position: [x, terrainInfo.height + 0.25 + treeHeight / 2, z],
                    scale: [0.7, treeHeight, 0.7],
                    color: [0.35 + barkVariation * 0.15, 0.22 + barkVariation * 0.08, 0.10 + barkVariation * 0.05],
                    type: 'structure'
                });
                
                // Natural green leaves
                const leafVariation = Math.random();
                cubes.push({
                    position: [x, terrainInfo.height + 0.25 + treeHeight + 0.8, z],
                    scale: [2, 1.5, 2],
                    color: [0.15 * leafVariation, 0.5 + leafVariation * 0.3, 0.15 + leafVariation * 0.1],
                    type: 'decoration'
                });
            } else {
                // Colorful fantasy tree - saturated but harmonious
                const hue = Math.random();
                cubes.push({
                    position: [x, terrainInfo.height + 0.25 + treeHeight / 2, z],
                    scale: [0.8, treeHeight, 0.8],
                    color: [0.4 + hue * 0.1, 0.25, 0.12 + hue * 0.08],
                    type: 'structure'
                });
                
                // Complementary colored leaves
                let leafColor;
                if (hue < 0.33) {
                    leafColor = [0.2, 0.7, 0.9]; // Cyan
                } else if (hue < 0.66) {
                    leafColor = [0.9, 0.3, 0.7]; // Magenta
                } else {
                    leafColor = [0.9, 0.8, 0.2]; // Yellow
                }
                
                cubes.push({
                    position: [x, terrainInfo.height + 0.25 + treeHeight + 0.8, z],
                    scale: [2.2, 1.8, 2.2],
                    color: leafColor,
                    type: 'decoration'
                });
            }
        }

        // Rocks and boulders
        for (let i = 0; i < 40; i++) {
            const x = (Math.random() - 0.5) * 70;
            const z = (Math.random() - 0.5) * 70;
            const terrainInfo = getTerrainInfo(x, z);
            const rockSize = 0.5 + Math.random() * 1.5;
            
            // Natural stone colors - cool grays
            const stoneBase = 0.4 + Math.random() * 0.15;
            cubes.push({
                position: [x, terrainInfo.height + 0.25 + rockSize / 2, z],
                scale: [rockSize, rockSize * 0.8, rockSize],
                color: [stoneBase * 0.95, stoneBase, stoneBase * 0.98],
                type: 'obstacle'
            });
        }

        // Colorful flowers and small plants
        for (let i = 0; i < 80; i++) {
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            const terrainInfo = getTerrainInfo(x, z);
            
            if (terrainInfo.biome !== 'mountains') {
                // Varied flower colors - pinks, purples, reds, yellows
                const flowerType = Math.random();
                let flowerColor;
                if (flowerType < 0.25) {
                    flowerColor = [0.9, 0.2, 0.4]; // Pink
                } else if (flowerType < 0.5) {
                    flowerColor = [0.7, 0.2, 0.9]; // Purple
                } else if (flowerType < 0.75) {
                    flowerColor = [0.95, 0.8, 0.1]; // Yellow
                } else {
                    flowerColor = [0.95, 0.3, 0.2]; // Red
                }
                
                cubes.push({
                    position: [x, terrainInfo.height + 0.5, z],
                    scale: [0.3, 0.4, 0.3],
                    color: flowerColor,
                    type: 'decoration'
                });
            }
        }

        // Small buildings/structures
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 20 + Math.random() * 15;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const terrainInfo = getTerrainInfo(x, z);
            
            const buildingWidth = 2 + Math.random() * 2;
            const buildingDepth = 2 + Math.random() * 2;
            const buildingHeight = 3 + Math.random() * 3;
            
            // Building walls - clean, distinct colors
            const wallColorType = Math.random();
            let wallColor;
            if (wallColorType < 0.25) {
                wallColor = [0.9, 0.9, 0.85]; // White/cream
            } else if (wallColorType < 0.5) {
                wallColor = [0.85, 0.7, 0.55]; // Sandstone
            } else if (wallColorType < 0.75) {
                wallColor = [0.75, 0.65, 0.75]; // Lavender
            } else {
                wallColor = [0.7, 0.75, 0.8]; // Light blue
            }
            
            cubes.push({
                position: [x, terrainInfo.height + 0.25 + buildingHeight / 2, z],
                scale: [buildingWidth, buildingHeight, buildingDepth],
                color: wallColor,
                type: 'structure'
            });
            
            // Roof - terracotta red
            cubes.push({
                position: [x, terrainInfo.height + 0.25 + buildingHeight + 0.3, z],
                scale: [buildingWidth + 0.3, 0.5, buildingDepth + 0.3],
                color: [0.75, 0.3, 0.2],
                type: 'decoration'
            });
            
            // Door - rich dark wood
            cubes.push({
                position: [x + buildingWidth / 2, terrainInfo.height + 0.75, z],
                scale: [0.2, 1, 0.8],
                color: [0.3, 0.2, 0.12],
                type: 'decoration'
            });
        }

        // Fence posts around spawn
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const distance = 8;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const terrainInfo = getTerrainInfo(x, z);
            
            cubes.push({
                position: [x, terrainInfo.height + 0.75, z],
                scale: [0.3, 1, 0.3],
                color: [0.45, 0.3, 0.18],
                type: 'decoration'
            });
        }

        // Scattered crates and obstacles
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            const terrainInfo = getTerrainInfo(x, z);
            const size = 0.8 + Math.random() * 0.6;
            
            // Wooden crate colors - natural wood tones
            const woodTone = 0.5 + Math.random() * 0.15;
            cubes.push({
                position: [x, terrainInfo.height + 0.25 + size / 2, z],
                scale: [size, size, size],
                color: [woodTone * 0.9, woodTone * 0.7, woodTone * 0.4],
                type: 'obstacle'
            });
        }

        return cubes;
    }

    generateEnemies() {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const distance = 10 + Math.random() * 15;
            
            this.enemies.push({
                position: [Math.cos(angle) * distance, 1.5, Math.sin(angle) * distance],
                scale: [1, 2, 1],
                color: [0.9, 0.1, 0.1],
                velocity: [0, 0, 0],
                health: 100,
                maxHealth: 100,
                speed: 0.03,
                active: true,
                type: 'enemy'
            });
        }
    }

    setupInput() {
        // Keyboard input
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Shooting
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.pointerLocked && e.button === 0) {
                this.shoot();
            }
        });

        // Reload
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'r') {
                this.reload();
            }
        });

        // Mouse input
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === this.canvas;
        });

        document.addEventListener('mousemove', (e) => {
            if (this.pointerLocked) {
                this.mouseMovement.x = e.movementX;
                this.mouseMovement.y = e.movementY;
            }
        });
    }

    updatePlayer(deltaTime) {
        const dt = deltaTime / 16.67; // Normalize to 60fps

        // Mouse look
        if (this.pointerLocked) {
            this.player.rotation[1] -= this.mouseMovement.x * this.player.mouseSensitivity;
            this.player.rotation[0] -= this.mouseMovement.y * this.player.mouseSensitivity;
            this.player.rotation[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.player.rotation[0]));
            
            this.mouseMovement.x = 0;
            this.mouseMovement.y = 0;
        }

        // Movement
        const forward = [
            -Math.sin(this.player.rotation[1]),
            0,
            -Math.cos(this.player.rotation[1])
        ];
        const right = [
            Math.cos(this.player.rotation[1]),
            0,
            -Math.sin(this.player.rotation[1])
        ];

        let moveX = 0, moveZ = 0;
        
        if (this.keys['w']) {
            moveX += forward[0];
            moveZ += forward[2];
        }
        if (this.keys['s']) {
            moveX -= forward[0];
            moveZ -= forward[2];
        }
        if (this.keys['a']) {
            moveX -= right[0];
            moveZ -= right[2];
        }
        if (this.keys['d']) {
            moveX += right[0];
            moveZ += right[2];
        }

        // Normalize movement
        const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLength > 0) {
            moveX = (moveX / moveLength) * this.player.speed * dt;
            moveZ = (moveZ / moveLength) * this.player.speed * dt;
        }

        // Store old position for collision detection
        const oldX = this.player.position[0];
        const oldZ = this.player.position[2];
        
        this.player.position[0] += moveX;
        this.player.position[2] += moveZ;

        // Check collision with obstacles and use sliding collision
        if (this.checkCollision(this.player.position)) {
            // Try sliding along X axis
            this.player.position[2] = oldZ;
            if (this.checkCollision(this.player.position)) {
                // Try sliding along Z axis
                this.player.position[0] = oldX;
                this.player.position[2] = oldZ + moveZ;
                if (this.checkCollision(this.player.position)) {
                    // Can't move, revert completely
                    this.player.position[0] = oldX;
                    this.player.position[2] = oldZ;
                }
            }
        }

        // Jumping and swimming
        const isInWater = this.isPlayerInWater();
        
        if (isInWater) {
            // Swimming mechanics
            if (this.keys[' ']) {
                // Swim up
                this.player.velocity[1] = 0.3;
            } else {
                // Slow fall in water
                this.player.velocity[1] -= 0.003 * dt;
            }
            // Limit sink speed
            if (this.player.velocity[1] < -0.2) {
                this.player.velocity[1] = -0.2;
            }
        } else {
            // Normal jumping on ground
            if (this.keys[' '] && this.player.onGround) {
                this.player.velocity[1] = this.player.jumpSpeed;
                this.player.onGround = false;
            }
            
            // Normal gravity
            if (!this.player.onGround) {
                this.player.velocity[1] -= 0.01 * dt;
            }
        }
        
        // Store old Y for ceiling collision
        const oldY = this.player.position[1];
        this.player.position[1] += this.player.velocity[1] * dt;
        
        // Ceiling collision - check for blocks above player's head
        const playerHeight = 1.8;
        const headCheckRadius = 0.5;
        const headY = this.player.position[1] + playerHeight / 2;
        
        for (let cube of this.cubes) {
            if (cube.material && !cube.material.transparent) {
                const cubeMinY = cube.position[1] - cube.scale[1] / 2;
                const cubeMaxY = cube.position[1] + cube.scale[1] / 2;
                const cubeMinX = cube.position[0] - cube.scale[0] / 2;
                const cubeMaxX = cube.position[0] + cube.scale[0] / 2;
                const cubeMinZ = cube.position[2] - cube.scale[2] / 2;
                const cubeMaxZ = cube.position[2] + cube.scale[2] / 2;
                
                // Check if player's head is colliding with block from below
                if (headY > cubeMinY && headY < cubeMaxY) {
                    if (this.player.position[0] + headCheckRadius > cubeMinX && 
                        this.player.position[0] - headCheckRadius < cubeMaxX &&
                        this.player.position[2] + headCheckRadius > cubeMinZ && 
                        this.player.position[2] - headCheckRadius < cubeMaxZ) {
                        // Hit ceiling, stop upward movement and position player below block
                        this.player.position[1] = cubeMinY - playerHeight / 2 - 0.01;
                        this.player.velocity[1] = 0;
                        break;
                    }
                }
            }
        }

        // Ground collision - check for solid blocks below player
        let foundGround = false;
        const playerRadius = 0.8; // Increased radius for better detection
        const checkPositions = [
            [this.player.position[0], this.player.position[2]],
            [this.player.position[0] + playerRadius, this.player.position[2]],
            [this.player.position[0] - playerRadius, this.player.position[2]],
            [this.player.position[0], this.player.position[2] + playerRadius],
            [this.player.position[0], this.player.position[2] - playerRadius],
            [this.player.position[0] + playerRadius * 0.7, this.player.position[2] + playerRadius * 0.7],
            [this.player.position[0] - playerRadius * 0.7, this.player.position[2] - playerRadius * 0.7],
            [this.player.position[0] + playerRadius * 0.7, this.player.position[2] - playerRadius * 0.7],
            [this.player.position[0] - playerRadius * 0.7, this.player.position[2] + playerRadius * 0.7]
        ];
        
        let highestGroundY = -1000;
        
        // Only check nearby chunks (optimization)
        const chunkX = Math.floor(this.player.position[0] / (this.chunkSize * 2));
        const chunkZ = Math.floor(this.player.position[2] / (this.chunkSize * 2));
        
        for (let cube of this.cubes) {
            // Skip cubes in far chunks
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - chunkX) > 1 || Math.abs(cubeChunkZ - chunkZ) > 1) {
                    continue;
                }
            }
            if (cube.material && !cube.material.transparent) {
                const blockTop = cube.position[1] + cube.scale[1] / 2;
                
                // Only check blocks below player
                if (blockTop < this.player.position[1]) {
                    for (let pos of checkPositions) {
                        const dx = pos[0] - cube.position[0];
                        const dz = pos[1] - cube.position[2];
                        
                        // Check if position is within cube bounds (works with merged cubes)
                        const halfWidth = cube.scale[0] / 2;
                        const halfDepth = cube.scale[2] / 2;
                        
                        if (Math.abs(dx) <= halfWidth + 0.1 && Math.abs(dz) <= halfDepth + 0.1) {
                            if (blockTop > highestGroundY) {
                                highestGroundY = blockTop;
                                foundGround = true;
                            }
                        }
                    }
                }
            }
        }
        
        if (foundGround) {
            const minHeight = highestGroundY + 2;
            if (this.player.position[1] <= minHeight) {
                this.player.position[1] = minHeight;
                this.player.velocity[1] = 0;
                this.player.onGround = true;
            } else {
                this.player.onGround = false;
            }
        } else {
            this.player.onGround = false;
        }
        
        // Absolute floor at bedrock level (prevent falling through world)
        const bedrockFloor = -55 * 0.5; // Convert to world coordinates
        if (this.player.position[1] < bedrockFloor) {
            this.player.position[1] = bedrockFloor;
            this.player.velocity[1] = 0;
            this.player.onGround = true;
        }

        // Update enemies
        this.updateEnemies(deltaTime);
        
        // Update world chunks
        this.updateChunks();
    }

    checkCollision(position) {
        const playerRadius = 0.5;
        const playerHeight = 1.8;
        
        // Only check nearby chunks (optimization)
        const chunkX = Math.floor(position[0] / (this.chunkSize * 2));
        const chunkZ = Math.floor(position[2] / (this.chunkSize * 2));
        
        for (let cube of this.cubes) {
            // Skip cubes in far chunks (optimization)
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - chunkX) > 1 || Math.abs(cubeChunkZ - chunkZ) > 1) {
                    continue;
                }
            }
            
            // Ignore transparent blocks, check only solid blocks
            if (cube.material && !cube.material.transparent) {
                // AABB collision detection for merged cubes
                const cubeHalfWidth = cube.scale[0] / 2;
                const cubeHalfHeight = cube.scale[1] / 2;
                const cubeHalfDepth = cube.scale[2] / 2;
                
                const cubeMinX = cube.position[0] - cubeHalfWidth;
                const cubeMaxX = cube.position[0] + cubeHalfWidth;
                const cubeMinY = cube.position[1] - cubeHalfHeight;
                const cubeMaxY = cube.position[1] + cubeHalfHeight;
                const cubeMinZ = cube.position[2] - cubeHalfDepth;
                const cubeMaxZ = cube.position[2] + cubeHalfDepth;
                
                const playerMinX = position[0] - playerRadius;
                const playerMaxX = position[0] + playerRadius;
                const playerMinY = position[1] - playerHeight / 2;
                const playerMaxY = position[1] + playerHeight / 2;
                const playerMinZ = position[2] - playerRadius;
                const playerMaxZ = position[2] + playerRadius;
                
                // AABB overlap test
                if (playerMaxX > cubeMinX && playerMinX < cubeMaxX &&
                    playerMaxY > cubeMinY && playerMinY < cubeMaxY &&
                    playerMaxZ > cubeMinZ && playerMinZ < cubeMaxZ) {
                    return true;
                }
            }
        }
        
        return false;
    }

    getTerrainHeightAt(worldX, worldZ) {
        const gridX = Math.round(worldX / 2);
        const gridZ = Math.round(worldZ / 2);
        
        // Match chunk generation exactly
        const x = gridX;
        const z = gridZ;
        const noise1 = Math.sin(x * 0.1 + this.worldSeed) * Math.cos(z * 0.1 + this.worldSeed);
        const noise2 = Math.sin(x * 0.05 + this.worldSeed * 2) * Math.cos(z * 0.05 + this.worldSeed * 2) * 1.5;
        const noise3 = Math.sin(x * 0.02 + this.worldSeed * 3) * Math.cos(z * 0.02 + this.worldSeed * 3) * 2;
        const noise4 = Math.sin(x * 0.15 + this.worldSeed * 4) * Math.cos(z * 0.15 + this.worldSeed * 4) * 0.5;
        
        const biome = this.getBiome(x, z);
        
        let heightMultiplier = 1.2;
        if (biome === 'mountains') heightMultiplier = 3.0;
        else if (biome === 'ice' || biome === 'tundra') heightMultiplier = 2.0;
        else if (biome === 'taiga') heightMultiplier = 1.5;
        else if (biome === 'desert') heightMultiplier = 1.0;
        else if (biome === 'plains') heightMultiplier = 0.6;
        else if (biome === 'forest' || biome === 'jungle') heightMultiplier = 1.4;
        else if (biome === 'savanna') heightMultiplier = 0.8;
        else if (biome === 'swamp') heightMultiplier = 0.5;
        
        const height = (noise1 + noise2 + noise3 + noise4) * heightMultiplier;
        const surfaceY = Math.round(height * 2.5);
        
        return surfaceY * 0.5;
    }

    updateEnemies(deltaTime) {
        const dt = deltaTime / 16.67;
        const playerPos = this.player.position;

        this.enemies.forEach(enemy => {
            if (!enemy.active) return;

            // Simple AI - move towards player
            const dx = playerPos[0] - enemy.position[0];
            const dz = playerPos[2] - enemy.position[2];
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > 2 && distance < 30) {
                const oldX = enemy.position[0];
                const oldZ = enemy.position[2];
                
                enemy.position[0] += (dx / distance) * enemy.speed * dt;
                enemy.position[2] += (dz / distance) * enemy.speed * dt;
                
                // Check collision with obstacles
                if (this.checkCollision(enemy.position)) {
                    enemy.position[0] = oldX;
                    enemy.position[2] = oldZ;
                }
            }

            // Gravity and terrain following for enemies
            if (!enemy.velocity) enemy.velocity = [0, 0, 0];
            enemy.velocity[1] -= 0.01 * dt;
            enemy.position[1] += enemy.velocity[1] * dt;
            
            // Keep enemies on terrain
            const terrainHeight = this.getTerrainHeightAt(enemy.position[0], enemy.position[2]);
            const minHeight = terrainHeight + 0.25 + enemy.scale[1] / 2;
            
            if (enemy.position[1] <= minHeight) {
                enemy.position[1] = minHeight;
                enemy.velocity[1] = 0;
            }

            // Damage player on contact
            if (distance < 1.5) {
                this.player.health -= 0.1 * dt;
                this.updateHealthBar();
                if (this.player.health <= 0) {
                    this.gameOver();
                }
            }
        });
    }

    shoot() {
        const now = performance.now();
        if (this.weapon.isReloading || 
            now - this.weapon.lastShot < this.weapon.fireRate ||
            this.weapon.ammo <= 0) {
            return;
        }

        this.weapon.lastShot = now;
        this.weapon.ammo--;
        this.updateAmmoDisplay();

        // Raycast from center of screen (camera position)
        const rayOrigin = [
            this.player.position[0],
            this.player.position[1],
            this.player.position[2]
        ];
        
        const rayDir = [
            -Math.sin(this.player.rotation[1]) * Math.cos(this.player.rotation[0]),
            -Math.sin(this.player.rotation[0]),
            -Math.cos(this.player.rotation[1]) * Math.cos(this.player.rotation[0])
        ];

        // Normalize ray direction
        const rayLength = Math.sqrt(rayDir[0]**2 + rayDir[1]**2 + rayDir[2]**2);
        rayDir[0] /= rayLength;
        rayDir[1] /= rayLength;
        rayDir[2] /= rayLength;

        // Check hit with enemies - very generous detection
        let hitEnemy = false;
        let closestEnemy = null;
        let closestDistance = Infinity;
        
        this.enemies.forEach(enemy => {
            if (!enemy.active) return;

            // Vector from ray origin to enemy
            const toEnemy = [
                enemy.position[0] - rayOrigin[0],
                enemy.position[1] - rayOrigin[1],
                enemy.position[2] - rayOrigin[2]
            ];
            
            const distance = Math.sqrt(toEnemy[0]**2 + toEnemy[1]**2 + toEnemy[2]**2);
            
            if (distance > 60 || distance < 0.5) return;

            // Normalize direction to enemy
            const toEnemyNorm = [
                toEnemy[0] / distance,
                toEnemy[1] / distance,
                toEnemy[2] / distance
            ];
            
            // Check if aiming roughly at enemy (dot product)
            const alignment = rayDir[0] * toEnemyNorm[0] + 
                            rayDir[1] * toEnemyNorm[1] + 
                            rayDir[2] * toEnemyNorm[2];
            
            // Very forgiving threshold (0.9 = ~25 degree cone)
            if (alignment > 0.9 && distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        });
        
        // Apply damage to closest hit enemy
        if (closestEnemy) {
            closestEnemy.health -= this.weapon.damage;
            hitEnemy = true;

            if (closestEnemy.health <= 0) {
                closestEnemy.active = false;
            }
        }

        if (hitEnemy) {
            this.showHitMarker();
        }

        // Auto reload when empty
        if (this.weapon.ammo === 0) {
            this.reload();
        }
    }

    reload() {
        if (this.weapon.isReloading || 
            this.weapon.ammo === this.weapon.maxAmmo ||
            this.weapon.totalAmmo === 0) {
            return;
        }

        this.weapon.isReloading = true;
        
        setTimeout(() => {
            const needed = this.weapon.maxAmmo - this.weapon.ammo;
            const reload = Math.min(needed, this.weapon.totalAmmo);
            
            this.weapon.ammo += reload;
            this.weapon.totalAmmo -= reload;
            this.weapon.isReloading = false;
            
            this.updateAmmoDisplay();
        }, this.weapon.reloadTime);
    }

    showHitMarker() {
        const marker = document.getElementById('hitmarker');
        marker.classList.add('active');
        setTimeout(() => marker.classList.remove('active'), 100);
    }

    updateAmmoDisplay() {
        document.getElementById('ammo').textContent = this.weapon.ammo;
        document.getElementById('ammoTotal').textContent = this.weapon.totalAmmo;
    }

    updateHealthBar() {
        const percent = (this.player.health / this.player.maxHealth) * 100;
        document.getElementById('healthFill').style.width = Math.max(0, percent) + '%';
    }

    gameOver() {
        alert('Game Over! Refresh to play again.');
        location.reload();
    }

    render() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Projection matrix
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, 
            Math.PI / 3, 
            this.canvas.width / this.canvas.height, 
            0.1, 
            100.0
        );
        this.gl.uniformMatrix4fv(this.locations.uProjectionMatrix, false, projectionMatrix);

        // View matrix
        const viewMatrix = mat4.create();
        mat4.rotateX(viewMatrix, viewMatrix, -this.player.rotation[0]);
        mat4.rotateY(viewMatrix, viewMatrix, -this.player.rotation[1]);
        mat4.translate(viewMatrix, viewMatrix, [
            -this.player.position[0],
            -this.player.position[1],
            -this.player.position[2]
        ]);
        this.gl.uniformMatrix4fv(this.locations.uViewMatrix, false, viewMatrix);

        // Enable vertex attributes once per frame
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.enableVertexAttribArray(this.locations.aPosition);
        this.gl.vertexAttribPointer(this.locations.aPosition, 3, this.gl.FLOAT, false, 0, 0);

        // Enable normal attribute
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.enableVertexAttribArray(this.locations.aNormal);
        this.gl.vertexAttribPointer(this.locations.aNormal, 3, this.gl.FLOAT, false, 0, 0);

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

        // Draw only cubes in visible chunks (optimized rendering)
        const playerPos = this.player.position;
        const renderDistance = 80;
        const playerChunkX = Math.floor(playerPos[0] / (this.chunkSize * 2));
        const playerChunkZ = Math.floor(playerPos[2] / (this.chunkSize * 2));
        
        // First pass: render all solid blocks
        for (let i = 0; i < this.cubes.length; i++) {
            const cube = this.cubes[i];
            
            if (!cube.material || cube.material.transparent) continue; // Skip transparent in first pass
            
            // Skip cubes in far chunks (coarse culling)
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - playerChunkX) > this.renderDistance || 
                    Math.abs(cubeChunkZ - playerChunkZ) > this.renderDistance) {
                    continue;
                }
            }
            
            const dx = cube.position[0] - playerPos[0];
            const dz = cube.position[2] - playerPos[2];
            const distSq = dx * dx + dz * dz;
            
            if (distSq < renderDistance * renderDistance) {
                this.drawCube(cube);
            }
        }
        
        // Second pass: render water sorted back-to-front for proper transparency
        this.gl.depthMask(false);
        this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
        this.gl.polygonOffset(1, 1);
        
        // Collect and sort water blocks by distance
        const waterCubes = [];
        for (let i = 0; i < this.cubes.length; i++) {
            const cube = this.cubes[i];
            
            if (!cube.material || !cube.material.transparent) continue;
            
            // Skip cubes in far chunks
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - playerChunkX) > this.renderDistance || 
                    Math.abs(cubeChunkZ - playerChunkZ) > this.renderDistance) {
                    continue;
                }
            }
            
            const dx = cube.position[0] - playerPos[0];
            const dy = cube.position[1] - playerPos[1];
            const dz = cube.position[2] - playerPos[2];
            const distSq = dx * dx + dy * dy + dz * dz;
            
            if (distSq < renderDistance * renderDistance) {
                waterCubes.push({ cube, distSq });
            }
        }
        
        // Sort back-to-front (farthest first)
        waterCubes.sort((a, b) => b.distSq - a.distSq);
        
        // Render sorted water
        for (let i = 0; i < waterCubes.length; i++) {
            this.drawCube(waterCubes[i].cube);
        }
        
        this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
        this.gl.depthMask(true);

        // Draw enemies
        this.enemies.forEach(enemy => {
            if (enemy.active) {
                this.drawCube(enemy);
                
                // Draw health bar above enemy
                const healthBarCube = {
                    position: [enemy.position[0], enemy.position[1] + 1.5, enemy.position[2]],
                    scale: [(enemy.health / enemy.maxHealth) * 1, 0.1, 0.1],
                    color: [0, 1, 0],
                    colorData: null
                };
                this.drawCube(healthBarCube);
            }
        });
    }

    drawCube(cube) {
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, cube.position);
        mat4.scale(modelMatrix, modelMatrix, cube.scale);
        
        this.gl.uniformMatrix4fv(this.locations.uModelMatrix, false, modelMatrix);
        
        // Set alpha for transparency (water blocks)
        const alpha = cube.alpha !== undefined ? cube.alpha : 1.0;
        this.gl.uniform1f(this.locations.uAlpha, alpha);

        // Reuse color buffer and cache color data if not already cached
        if (!cube.colorData) {
            cube.colorData = new Float32Array(24 * 3);
            for (let i = 0; i < 24; i++) {
                cube.colorData[i * 3] = cube.color[0];
                cube.colorData[i * 3 + 1] = cube.color[1];
                cube.colorData[i * 3 + 2] = cube.color[2];
            }
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, cube.colorData, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(this.locations.aColor);
        this.gl.vertexAttribPointer(this.locations.aColor, 3, this.gl.FLOAT, false, 0, 0);

        // If cube has visibleFaces array, only render those faces
        if (cube.visibleFaces && cube.visibleFaces.length > 0) {
            // Face index offsets in bytes: front=0, back=12, top=24, bottom=36, right=48, left=60
            const faceOffsets = {
                front: 0,
                back: 12,
                top: 24,
                bottom: 36,
                right: 48,
                left: 60
            };
            
            for (const face of cube.visibleFaces) {
                this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, faceOffsets[face]);
            }
        } else {
            // Render all faces
            this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
        }
    }

    gameLoop() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // FPS calculation and stats
        this.frameCount++;
        this.fpsTime += deltaTime;
        if (this.fpsTime >= 1000) {
            const fps = Math.round(this.frameCount / (this.fpsTime / 1000));
            this.fpsElement.textContent = fps;
            
            // Update stats display
            const infoDiv = document.getElementById('info');
            const cubeCount = this.cubes.length;
            const chunkCount = this.chunks.size;
            const mergedCount = this.cubes.filter(c => c.merged).length;
            infoDiv.innerHTML = `
                <strong>Cube World FPS</strong><br>
                FPS: ${fps}<br>
                Cubes: ${cubeCount} (${mergedCount} merged)<br>
                Chunks: ${chunkCount}<br>
                WASD - Move<br>
                Mouse - Look around<br>
                Space - Jump<br>
                Left Click - Shoot<br>
                R - Reload<br>
                Click to start
            `;
            
            this.frameCount = 0;
            this.fpsTime = 0;
        }

        this.updatePlayer(deltaTime);
        this.render();

        requestAnimationFrame(() => this.gameLoop());
    }
}

// Matrix library mini implementation (using gl-matrix would be better in production)
const mat4 = {
    create() {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    },

    perspective(out, fovy, aspect, near, far) {
        const f = 1.0 / Math.tan(fovy / 2);
        const nf = 1 / (near - far);
        
        out[0] = f / aspect;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[5] = f;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[10] = (far + near) * nf;
        out[11] = -1;
        out[12] = 0;
        out[13] = 0;
        out[14] = 2 * far * near * nf;
        out[15] = 0;
        return out;
    },

    translate(out, a, v) {
        const x = v[0], y = v[1], z = v[2];
        
        if (a === out) {
            out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
            out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
            out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
            out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
        } else {
            const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
            const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
            const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
            
            out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
            out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
            out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;
            out[12] = a00 * x + a10 * y + a20 * z + a[12];
            out[13] = a01 * x + a11 * y + a21 * z + a[13];
            out[14] = a02 * x + a12 * y + a22 * z + a[14];
            out[15] = a03 * x + a13 * y + a23 * z + a[15];
        }
        return out;
    },

    rotateX(out, a, rad) {
        const s = Math.sin(rad);
        const c = Math.cos(rad);
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        
        if (a !== out) {
            out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
            out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
        }
        
        out[4] = a10 * c + a20 * s;
        out[5] = a11 * c + a21 * s;
        out[6] = a12 * c + a22 * s;
        out[7] = a13 * c + a23 * s;
        out[8] = a20 * c - a10 * s;
        out[9] = a21 * c - a11 * s;
        out[10] = a22 * c - a12 * s;
        out[11] = a23 * c - a13 * s;
        return out;
    },

    rotateY(out, a, rad) {
        const s = Math.sin(rad);
        const c = Math.cos(rad);
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        
        if (a !== out) {
            out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
            out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
        }
        
        out[0] = a00 * c - a20 * s;
        out[1] = a01 * c - a21 * s;
        out[2] = a02 * c - a22 * s;
        out[3] = a03 * c - a23 * s;
        out[8] = a00 * s + a20 * c;
        out[9] = a01 * s + a21 * c;
        out[10] = a02 * s + a22 * c;
        out[11] = a03 * s + a23 * c;
        return out;
    },

    scale(out, a, v) {
        const x = v[0], y = v[1], z = v[2];
        
        out[0] = a[0] * x;
        out[1] = a[1] * x;
        out[2] = a[2] * x;
        out[3] = a[3] * x;
        out[4] = a[4] * y;
        out[5] = a[5] * y;
        out[6] = a[6] * y;
        out[7] = a[7] * y;
        out[8] = a[8] * z;
        out[9] = a[9] * z;
        out[10] = a[10] * z;
        out[11] = a[11] * z;
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
        return out;
    }
};

// Start the game when page loads
window.addEventListener('load', () => {
    new Game();
});
