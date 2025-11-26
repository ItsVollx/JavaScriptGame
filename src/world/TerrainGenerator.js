import { Materials } from '../materials/materials.js';

export class TerrainGenerator {
    constructor(worldSeed, chunkSize) {
        this.worldSeed = worldSeed;
        this.chunkSize = chunkSize;
    }

    seededRandom(x, z, seed = 0) {
        const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
        return n - Math.floor(n);
    }

    noise2D(x, z, frequency, seed = 0) {
        x *= frequency;
        z *= frequency;
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const x1 = x0 + 1;
        const z1 = z0 + 1;
        const fracX = x - x0;
        const fracZ = z - z0;
        const v00 = this.seededRandom(x0, z0, seed);
        const v10 = this.seededRandom(x1, z0, seed);
        const v01 = this.seededRandom(x0, z1, seed);
        const v11 = this.seededRandom(x1, z1, seed);
        const i0 = v00 * (1 - fracX) + v10 * fracX;
        const i1 = v01 * (1 - fracX) + v11 * fracX;
        return i0 * (1 - fracZ) + i1 * fracZ;
    }

    noise3D(x, y, z, frequency, seed = 0) {
        x *= frequency;
        y *= frequency;
        z *= frequency;
        const x0 = Math.floor(x), x1 = x0 + 1;
        const y0 = Math.floor(y), y1 = y0 + 1;
        const z0 = Math.floor(z), z1 = z0 + 1;
        const fx = x - x0, fy = y - y0, fz = z - z0;
        const v000 = this.seededRandom(x0 + y0 * 1000 + z0 * 100000, 0, seed);
        const v100 = this.seededRandom(x1 + y0 * 1000 + z0 * 100000, 0, seed);
        const v010 = this.seededRandom(x0 + y1 * 1000 + z0 * 100000, 0, seed);
        const v110 = this.seededRandom(x1 + y1 * 1000 + z0 * 100000, 0, seed);
        const v001 = this.seededRandom(x0 + y0 * 1000 + z1 * 100000, 0, seed);
        const v101 = this.seededRandom(x1 + y0 * 1000 + z1 * 100000, 0, seed);
        const v011 = this.seededRandom(x0 + y1 * 1000 + z1 * 100000, 0, seed);
        const v111 = this.seededRandom(x1 + y1 * 1000 + z1 * 100000, 0, seed);
        const i00 = v000 * (1 - fx) + v100 * fx;
        const i10 = v010 * (1 - fx) + v110 * fx;
        const i01 = v001 * (1 - fx) + v101 * fx;
        const i11 = v011 * (1 - fx) + v111 * fx;
        const i0 = i00 * (1 - fy) + i10 * fy;
        const i1 = i01 * (1 - fy) + i11 * fy;
        return i0 * (1 - fz) + i1 * fz;
    }

    getBiome(x, z) {
        const biomeNoise = this.noise2D(x, z, 0.01, this.worldSeed + 100);
        const tempNoise = this.noise2D(x, z, 0.015, this.worldSeed + 200);
        if (biomeNoise < 0.3) return tempNoise < 0.4 ? 'tundra' : 'plains';
        if (biomeNoise < 0.6) return tempNoise < 0.5 ? 'forest' : 'desert';
        return tempNoise < 0.6 ? 'mountains' : 'snow';
    }

    getTerrainHeightAt(worldX, worldZ) {
        const noise1 = this.noise2D(worldX, worldZ, 0.1, this.worldSeed);
        const noise2 = this.noise2D(worldX, worldZ, 0.05, this.worldSeed + 100);
        const noise3 = this.noise2D(worldX, worldZ, 0.02, this.worldSeed + 200);
        const noise4 = this.noise2D(worldX, worldZ, 0.15, this.worldSeed + 300);
        const biome = this.getBiome(worldX, worldZ);
        const biomeMultiplier = {
            plains: 0.6, forest: 1.0, desert: 0.8,
            mountains: 3.0, tundra: 0.7, snow: 2.0
        }[biome] || 1.0;
        const combinedNoise = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.15 + noise4 * 0.05);
        const height = combinedNoise * biomeMultiplier;
        return Math.round(height * 2.5);
    }

    generateOres(voxelGrid, worldX, worldY, worldZ) {
        const oreNoise = this.noise3D(worldX, worldY, worldZ, 0.1, this.worldSeed + 400);
        if (worldY < -20 && oreNoise > 0.85) return Materials.DIAMOND_ORE;
        if (worldY < -10 && oreNoise > 0.82) return Materials.GOLD_ORE;
        if (worldY < 10 && oreNoise > 0.78) return Materials.IRON_ORE;
        if (worldY < 30 && oreNoise > 0.75) return Materials.COAL_ORE;
        return null;
    }

    isCave(worldX, worldY, worldZ) {
        const cave1 = this.noise3D(worldX, worldY, worldZ, 0.06, this.worldSeed + 1000);
        const cave2 = this.noise3D(worldX, worldY, worldZ, 0.09, this.worldSeed + 2000);
        const cave3 = this.noise3D(worldX, worldY, worldZ, 0.12, this.worldSeed + 3000);
        const cave4 = this.noise3D(worldX, worldY, worldZ, 0.15, this.worldSeed + 4000);
        const combinedCaveNoise = (cave1 + cave2 + cave3 + cave4) / 4;
        return combinedCaveNoise > 0.35;
    }

    floodFillWater(voxelGrid, seaLevel) {
        console.log('[Water Fill] Starting water fill, seaLevel:', seaLevel);
        let waterBlocksPlaced = 0;
        let emptyBlocksFound = 0;
        let solidBlocksFound = 0;
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                if (!voxelGrid[x] || !voxelGrid[x][z]) continue;
                
                for (let y = seaLevel; y >= -60; y--) {
                    const arrayY = y + 60;
                    const voxel = voxelGrid[x][z][arrayY];
                    
                    if (voxel) {
                        solidBlocksFound++;
                        break;
                    } else {
                        emptyBlocksFound++;
                    }
                    
                    voxelGrid[x][z][arrayY] = {
                        material: Materials.WATER,
                        color: [0.2, 0.4, 0.8],
                        type: 'water'
                    };
                    waterBlocksPlaced++;
                }
            }
        }
        
        console.log('[Water Fill] Empty blocks:', emptyBlocksFound, 'Solid blocks:', solidBlocksFound, 'Water placed:', waterBlocksPlaced);
    }
}
