import { Materials } from '../materials/materials.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { greedyMesher } from '../greedyMesher.js';

export class ChunkGenerator {
    constructor(worldSeed, chunkSize) {
        this.worldSeed = worldSeed;
        this.chunkSize = chunkSize;
        this.terrain = new TerrainGenerator(worldSeed, chunkSize);
    }

    generateChunk(chunkX, chunkZ) {
        const voxelGrid = Array(this.chunkSize).fill(null).map(() =>
            Array(this.chunkSize).fill(null).map(() =>
                Array(128).fill(null)
            )
        );

        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;

        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = (offsetX + x) * 2;
                const worldZ = (offsetZ + z) * 2;
                const terrainHeight = this.terrain.getTerrainHeightAt(worldX, worldZ);
                const biome = this.terrain.getBiome(worldX, worldZ);

                for (let y = -60; y < 68; y++) {
                    const arrayY = y + 60;
                    const worldY = y * 2;

                    // Bedrock layer
                    if (y >= -60 && y <= -55) {
                        voxelGrid[x][z][arrayY] = { material: Materials.BEDROCK, color: Materials.BEDROCK.color, type: 'terrain' };
                        continue;
                    }

                    // Check for caves
                    const isCave = this.terrain.isCave(worldX, worldY, worldZ);
                    if (isCave) continue;

                    // Terrain generation
                    if (y <= terrainHeight) {
                        let material = Materials.STONE;
                        const depthFromSurface = terrainHeight - y;

                        if (depthFromSurface === 0) {
                            material = { tundra: Materials.SNOW, plains: Materials.GRASS, forest: Materials.GRASS,
                                desert: Materials.SAND, mountains: Materials.STONE, snow: Materials.SNOW }[biome] || Materials.GRASS;
                        } else if (depthFromSurface <= 3) {
                            material = biome === 'desert' ? Materials.SAND : Materials.DIRT;
                        } else {
                            const ore = this.terrain.generateOres(voxelGrid, worldX, worldY, worldZ);
                            if (ore) material = ore;
                        }

                        voxelGrid[x][z][arrayY] = { material, color: material.color, type: 'terrain' };
                    }
                }
            }
        }

        // Fill water
        this.terrain.floodFillWater(voxelGrid, 0);

        // Generate mesh
        const key = `${chunkX},${chunkZ}`;
        const chunkCubes = greedyMesher(voxelGrid, chunkX, chunkZ, key);

        return { voxelGrid, chunkCubes };
    }

    generateChunkFeatures(chunkX, chunkZ, voxelGrid) {
        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;
        const numFeatures = 2 + Math.floor(this.terrain.seededRandom(chunkX, chunkZ, this.worldSeed + 500) * 3);

        for (let i = 0; i < numFeatures; i++) {
            const localX = this.terrain.seededRandom(chunkX + i, chunkZ, this.worldSeed + 600) * this.chunkSize;
            const localZ = this.terrain.seededRandom(chunkX, chunkZ + i, this.worldSeed + 700) * this.chunkSize;
            const worldX = (offsetX + localX) * 2;
            const worldZ = (offsetZ + localZ) * 2;

            if (Math.sqrt(worldX * worldX + worldZ * worldZ) < 10) continue;

            const terrainHeight = this.terrain.getTerrainHeightAt(worldX, worldZ);
            if (terrainHeight <= 0) continue;

            const biome = this.terrain.getBiome(worldX / 2, worldZ / 2);
            const rand = this.terrain.seededRandom(worldX, worldZ, this.worldSeed + 800);

            if ((biome === 'forest' || biome === 'plains') && rand > 0.7) {
                this.generateTree(voxelGrid, localX, terrainHeight + 1, localZ);
            } else if (biome === 'desert' && rand > 0.8) {
                this.generateCactus(voxelGrid, localX, terrainHeight + 1, localZ);
            }
        }
    }

    generateTree(voxelGrid, x, y, z) {
        x = Math.floor(x);
        z = Math.floor(z);
        const treeHeight = 4 + Math.floor(Math.random() * 2);

        for (let i = 0; i < treeHeight; i++) {
            const arrayY = (y + i) + 60;
            if (arrayY >= 0 && arrayY < 128 && x >= 0 && x < this.chunkSize && z >= 0 && z < this.chunkSize) {
                voxelGrid[x][z][arrayY] = { material: Materials.WOOD, color: Materials.WOOD.color, type: 'tree' };
            }
        }

        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                for (let dy = 0; dy <= 2; dy++) {
                    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
                    const lx = x + dx, lz = z + dz, ly = y + treeHeight - 1 + dy;
                    const arrayY = ly + 60;
                    if (arrayY >= 0 && arrayY < 128 && lx >= 0 && lx < this.chunkSize && lz >= 0 && lz < this.chunkSize) {
                        voxelGrid[lx][lz][arrayY] = { material: Materials.LEAVES, color: Materials.LEAVES.color, type: 'leaves' };
                    }
                }
            }
        }
    }

    generateCactus(voxelGrid, x, y, z) {
        x = Math.floor(x);
        z = Math.floor(z);
        const height = 2 + Math.floor(Math.random() * 2);

        for (let i = 0; i < height; i++) {
            const arrayY = (y + i) + 60;
            if (arrayY >= 0 && arrayY < 128 && x >= 0 && x < this.chunkSize && z >= 0 && z < this.chunkSize) {
                voxelGrid[x][z][arrayY] = { material: Materials.CACTUS, color: Materials.CACTUS.color, type: 'cactus' };
            }
        }
    }
}
