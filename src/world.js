// World generation and chunk management
export class World {
    constructor() {
        this.chunks = new Map();
        this.chunkSize = 16;
        this.chunkHeight = 32;
        this.renderDistance = 3;
        this.lastChunkX = null;
        this.lastChunkZ = null;
        this.worldSeed = Math.random() * 10000;
        this.blockSize = 2;
        this.dirtyChunks = new Set();
    }

    seededRandom(x, z, seed) {
        const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
        return n - Math.floor(n);
    }

    getBiome(worldX, worldZ) {
        const temp = Math.sin(worldX * 0.01 + this.worldSeed) * Math.cos(worldZ * 0.01 + this.worldSeed);
        const moisture = Math.sin(worldX * 0.015 + this.worldSeed * 2) * Math.cos(worldZ * 0.015 + this.worldSeed * 2);
        
        if (temp < -0.3) {
            return moisture < 0 ? 'tundra' : 'ice';
        } else if (temp < 0) {
            return moisture < -0.2 ? 'plains' : 'forest';
        } else if (temp < 0.3) {
            return moisture < -0.3 ? 'savanna' : moisture < 0.2 ? 'plains' : 'jungle';
        } else {
            return moisture < 0 ? 'desert' : 'swamp';
        }
    }

    getBiomeColor(biome, heightVariation) {
        const colors = {
            desert: [0.85 + heightVariation * 0.1, 0.75 + heightVariation * 0.1, 0.4],
            tundra: [0.7, 0.75, 0.8],
            ice: [0.9, 0.95, 1.0],
            plains: [0.4 + heightVariation * 0.2, 0.7 + heightVariation * 0.15, 0.3],
            forest: [0.25 + heightVariation * 0.15, 0.55 + heightVariation * 0.1, 0.2],
            jungle: [0.2, 0.6 + heightVariation * 0.1, 0.25],
            savanna: [0.65 + heightVariation * 0.15, 0.6 + heightVariation * 0.1, 0.3],
            swamp: [0.35, 0.45 + heightVariation * 0.1, 0.35]
        };
        return colors[biome] || [0.5, 0.7, 0.3];
    }

    generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const chunkCubes = [];
        
        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;
        
        const voxelGrid = [];
        
        for (let x = 0; x < this.chunkSize; x++) {
            voxelGrid[x] = [];
            for (let z = 0; z < this.chunkSize; z++) {
                voxelGrid[x][z] = [];
                
                const worldX = offsetX + x;
                const worldZ = offsetZ + z;
                
                const noise1 = Math.sin(worldX * 0.1 + this.worldSeed) * Math.cos(worldZ * 0.1 + this.worldSeed);
                const noise2 = Math.sin(worldX * 0.05 + this.worldSeed * 2) * Math.cos(worldZ * 0.05 + this.worldSeed * 2) * 1.5;
                const noise3 = Math.sin(worldX * 0.02 + this.worldSeed * 3) * Math.cos(worldZ * 0.02 + this.worldSeed * 3) * 2;
                
                const biome = this.getBiome(worldX, worldZ);
                
                let heightMultiplier = 0.8;
                if (biome === 'ice' || biome === 'tundra') heightMultiplier = 1.3;
                else if (biome === 'desert') heightMultiplier = 0.6;
                else if (biome === 'plains') heightMultiplier = 0.4;
                else if (biome === 'forest' || biome === 'jungle') heightMultiplier = 0.8;
                else if (biome === 'savanna') heightMultiplier = 0.5;
                else if (biome === 'swamp') heightMultiplier = 0.3;
                
                const height = (noise1 + noise2 + noise3) * heightMultiplier;
                const surfaceY = Math.floor(height * 2);
                
                const heightVariation = (height + 3) / 6;
                const surfaceColor = this.getBiomeColor(biome, heightVariation);
                
                const bedrockLevel = -6;
                const seaLevel = 0;
                
                for (let y = bedrockLevel; y <= Math.max(surfaceY, seaLevel); y++) {
                    const depthFromSurface = surfaceY - y;
                    let voxelType, voxelColor;
                    
                    if (y > surfaceY) {
                        if (y <= seaLevel) {
                            voxelType = 'water';
                            voxelColor = [0.2, 0.4, 0.8];
                        }
                    } else {
                        const caveNoise = Math.sin(worldX * 0.3 + y * 0.5 + this.worldSeed) * 
                                         Math.cos(worldZ * 0.3 + y * 0.5 + this.worldSeed * 2);
                        const isCave = caveNoise > 0.6 && y < surfaceY - 2 && y > bedrockLevel + 2;
                        
                        if (!isCave) {
                            voxelType = 'terrain';
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
                    
                    if (voxelType) {
                        voxelGrid[x][z][y + 6] = { type: voxelType, color: voxelColor };
                    }
                }
            }
        }
        
        // Convert voxels to cubes with proper culling
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                for (let y = 0; y < this.chunkHeight; y++) {
                    const voxel = voxelGrid[x]?.[z]?.[y];
                    if (voxel) {
                        const isTransparent = voxel.type === 'water';
                        const neighbors = [
                            voxelGrid[x]?.[z]?.[y + 1],
                            voxelGrid[x]?.[z]?.[y - 1],
                            voxelGrid[x + 1]?.[z]?.[y],
                            voxelGrid[x - 1]?.[z]?.[y],
                            voxelGrid[x]?.[z + 1]?.[y],
                            voxelGrid[x]?.[z - 1]?.[y]
                        ];
                        
                        let hasExposedFace = false;
                        for (const neighbor of neighbors) {
                            if (!neighbor || (isTransparent && neighbor.type !== 'water') || 
                                (!isTransparent && neighbor.type === 'water')) {
                                hasExposedFace = true;
                                break;
                            }
                        }
                        
                        if (hasExposedFace) {
                            const worldX = offsetX + x;
                            const worldZ = offsetZ + z;
                            const worldY = y - 6;
                            
                            chunkCubes.push({
                                position: [worldX * this.blockSize, worldY * 0.5, worldZ * this.blockSize],
                                scale: [this.blockSize, 0.5, this.blockSize],
                                color: voxel.color,
                                type: voxel.type,
                                alpha: voxel.type === 'water' ? 0.6 : 1.0,
                                chunkKey: key,
                                localPos: [x, y, z]
                            });
                        }
                    }
                }
            }
        }
        
        this.generateChunkFeatures(chunkX, chunkZ, chunkCubes, key);
        
        this.chunks.set(key, {
            cubes: chunkCubes,
            voxelGrid: voxelGrid,
            dirty: false,
            lastRendered: Date.now()
        });
        
        return chunkCubes;
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
            
            if (Math.sqrt(worldX * worldX + worldZ * worldZ) < 10) continue;
            
            const terrainHeight = this.getTerrainHeightAt(worldX, worldZ);
            const biome = this.getBiome(worldX / 2, worldZ / 2);
            const rand = this.seededRandom(worldX, worldZ, this.worldSeed + 800);
            
            if (biome === 'forest' || biome === 'jungle') {
                if (rand < 0.7) {
                    const treeHeight = 2 + this.seededRandom(worldX, worldZ, this.worldSeed + 900) * 3;
                    
                    chunkCubes.push({
                        position: [worldX, terrainHeight + 0.25 + treeHeight / 2, worldZ],
                        scale: [0.7, treeHeight, 0.7],
                        color: [0.35 + rand * 0.15, 0.22, 0.10],
                        type: 'structure',
                        chunkKey: key
                    });
                }
            }
        }
    }

    getTerrainHeightAt(worldX, worldZ) {
        const gridX = Math.round(worldX / 2);
        const gridZ = Math.round(worldZ / 2);
        
        const x = gridX;
        const z = gridZ;
        const noise1 = Math.sin(x * 0.1 + this.worldSeed) * Math.cos(z * 0.1 + this.worldSeed);
        const noise2 = Math.sin(x * 0.05 + this.worldSeed * 2) * Math.cos(z * 0.05 + this.worldSeed * 2) * 1.5;
        const noise3 = Math.sin(x * 0.02 + this.worldSeed * 3) * Math.cos(z * 0.02 + this.worldSeed * 3) * 2;
        
        const biome = this.getBiome(x, z);
        
        let heightMultiplier = 0.8;
        if (biome === 'ice' || biome === 'tundra') heightMultiplier = 1.3;
        else if (biome === 'desert') heightMultiplier = 0.6;
        else if (biome === 'plains') heightMultiplier = 0.4;
        else if (biome === 'forest' || biome === 'jungle') heightMultiplier = 0.8;
        else if (biome === 'savanna') heightMultiplier = 0.5;
        else if (biome === 'swamp') heightMultiplier = 0.3;
        
        const height = (noise1 + noise2 + noise3) * heightMultiplier;
        
        return Math.floor(height) * 0.5 - 1;
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

    markChunkDirty(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunks.has(key)) {
            this.dirtyChunks.add(key);
            this.chunks.get(key).dirty = true;
        }
    }

    rebuildDirtyChunks() {
        for (const key of this.dirtyChunks) {
            const chunkData = this.chunks.get(key);
            if (!chunkData) continue;
            
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const offsetX = chunkX * this.chunkSize;
            const offsetZ = chunkZ * this.chunkSize;
            const newCubes = [];
            
            for (let x = 0; x < this.chunkSize; x++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    for (let y = 0; y < this.chunkHeight; y++) {
                        const voxel = chunkData.voxelGrid[x]?.[z]?.[y];
                        if (voxel) {
                            const isTransparent = voxel.type === 'water';
                            const neighbors = [
                                chunkData.voxelGrid[x]?.[z]?.[y + 1],
                                chunkData.voxelGrid[x]?.[z]?.[y - 1],
                                chunkData.voxelGrid[x + 1]?.[z]?.[y],
                                chunkData.voxelGrid[x - 1]?.[z]?.[y],
                                chunkData.voxelGrid[x]?.[z + 1]?.[y],
                                chunkData.voxelGrid[x]?.[z - 1]?.[y]
                            ];
                            
                            let hasExposedFace = false;
                            for (const neighbor of neighbors) {
                                if (!neighbor || (isTransparent && neighbor.type !== 'water') || 
                                    (!isTransparent && neighbor.type === 'water')) {
                                    hasExposedFace = true;
                                    break;
                                }
                            }
                            
                            if (hasExposedFace) {
                                const worldX = offsetX + x;
                                const worldZ = offsetZ + z;
                                const worldY = y - 6;
                                
                                newCubes.push({
                                    position: [worldX * this.blockSize, worldY * 0.5, worldZ * this.blockSize],
                                    scale: [this.blockSize, 0.5, this.blockSize],
                                    color: voxel.color,
                                    type: voxel.type,
                                    alpha: voxel.type === 'water' ? 0.6 : 1.0,
                                    chunkKey: key,
                                    localPos: [x, y, z]
                                });
                            }
                        }
                    }
                }
            }
            
            chunkData.cubes = newCubes;
            chunkData.dirty = false;
            chunkData.lastRendered = Date.now();
        }
        
        this.dirtyChunks.clear();
    }

    updateChunks(playerPosition) {
        const playerChunkX = Math.floor(playerPosition[0] / (this.chunkSize * 2));
        const playerChunkZ = Math.floor(playerPosition[2] / (this.chunkSize * 2));
        
        if (playerChunkX === this.lastChunkX && playerChunkZ === this.lastChunkZ) {
            if (this.dirtyChunks.size > 0) {
                this.rebuildDirtyChunks();
            }
            return [];
        }
        
        this.lastChunkX = playerChunkX;
        this.lastChunkZ = playerChunkZ;
        
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
        
        for (const [key, chunkData] of this.chunks.entries()) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const dx = Math.abs(chunkX - playerChunkX);
            const dz = Math.abs(chunkZ - playerChunkZ);
            
            if (dx > this.renderDistance + 1 || dz > this.renderDistance + 1) {
                this.chunks.delete(key);
                this.dirtyChunks.delete(key);
            }
        }
        
        if (this.dirtyChunks.size > 0) {
            this.rebuildDirtyChunks();
        }
        
        const allCubes = [];
        for (const chunkData of this.chunks.values()) {
            allCubes.push(...chunkData.cubes);
        }
        
        return allCubes;
    }
}
