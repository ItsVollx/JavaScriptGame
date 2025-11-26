// Greedy Mesher - Optimizes voxel rendering by merging adjacent blocks
function greedyMesher(voxelGrid, chunkX, chunkZ, key, chunkSize, chunkHeight, blockSize, colorsMatch, gameInstance) {
    const offsetX = chunkX * chunkSize;
    const offsetZ = chunkZ * chunkSize;
    const cubes = [];
    const processed = new Set();
    
    console.log(`[Greedy Mesh] Starting chunk ${chunkX},${chunkZ}`);
    
    // Helper function to get voxel from any position (including neighboring chunks)
    function getVoxelAt(x, y, z) {
        // Check if within current chunk (Y range -60 to +67)
        if (x >= 0 && x < chunkSize && z >= 0 && z < chunkSize && y >= -60 && y < chunkHeight - 60) {
            return voxelGrid[x]?.[z]?.[y + 60];
        }
        
        // Check neighboring chunks if at border
        if (gameInstance && gameInstance.chunks) {
            let neighborChunkX = chunkX;
            let neighborChunkZ = chunkZ;
            let localX = x;
            let localZ = z;
            
            if (x < 0) {
                neighborChunkX--;
                localX = chunkSize - 1;
            } else if (x >= chunkSize) {
                neighborChunkX++;
                localX = 0;
            }
            
            if (z < 0) {
                neighborChunkZ--;
                localZ = chunkSize - 1;
            } else if (z >= chunkSize) {
                neighborChunkZ++;
                localZ = 0;
            }
            
            // Only check neighbor if we actually crossed a chunk boundary
            if (neighborChunkX !== chunkX || neighborChunkZ !== chunkZ) {
                const neighborKey = `${neighborChunkX},${neighborChunkZ}`;
                const neighborChunk = gameInstance.chunks.get(neighborKey);
                
                if (neighborChunk && neighborChunk.voxelGrid) {
                    return neighborChunk.voxelGrid[localX]?.[localZ]?.[y + 60];
                }
                // If neighbor chunk doesn't exist, assume it's the same material (to prevent seams)
                // This will be updated when the neighbor chunk loads
                return { material: null, assumeSame: true };
            }
        }
        
        return null;
    }
    
    // Helper function to check which faces should be rendered
    function getVisibleFaces(voxel, x, y, z) {
        const faces = [];
        const neighbors = {
            top: getVoxelAt(x, y + 1, z),
            bottom: getVoxelAt(x, y - 1, z),
            right: getVoxelAt(x + 1, y, z),
            left: getVoxelAt(x - 1, y, z),
            front: getVoxelAt(x, y, z + 1),
            back: getVoxelAt(x, y, z - 1)
        };
        
        for (const [face, neighbor] of Object.entries(neighbors)) {
            // Skip if neighbor chunk is not loaded (assumeSame flag)
            if (neighbor && neighbor.assumeSame) {
                continue;
            }
            
            // For transparent blocks: render face if neighbor is different material or air
            if (voxel.material.transparent) {
                if (!neighbor || !neighbor.material || neighbor.material !== voxel.material) {
                    faces.push(face);
                }
            } else {
                // For solid blocks: render face if neighbor is air or transparent
                if (!neighbor || !neighbor.material || neighbor.material.transparent) {
                    faces.push(face);
                }
            }
        }
        
        return faces;
    }
    
    // Process all blocks (transparent and solid)
    for (let y = -60; y < chunkHeight - 60; y++) {
        for (let x = 0; x < chunkSize; x++) {
            for (let z = 0; z < chunkSize; z++) {
                const posKey = `${x},${y},${z}`;
                if (processed.has(posKey)) continue;
                
                const voxel = voxelGrid[x]?.[z]?.[y + 60];
                if (!voxel || !voxel.material) continue;
                
                // Get visible faces for this voxel
                const visibleFaces = getVisibleFaces(voxel, x, y, z);
                
                if (visibleFaces.length === 0) {
                    processed.add(posKey);
                    continue;
                }
                
                // For transparent blocks, render individually with visible faces only
                if (voxel.material.transparent) {
                    processed.add(posKey);
                    
                    const worldX = offsetX + x;
                    const worldZ = offsetZ + z;
                    const worldY = y;
                    
                    cubes.push({
                        position: [worldX * blockSize, worldY * 0.5, worldZ * blockSize],
                        scale: [blockSize, 0.5, blockSize],
                        color: voxel.color,
                        material: voxel.material,
                        alpha: voxel.material.alpha,
                        chunkKey: key,
                        merged: false,
                        visibleFaces: visibleFaces
                    });
                    continue;
                }
                
                // For solid blocks: Use progressive greedy meshing (XZ plane, then Y)
                // First expand in X direction
                let width = 1;
                while (x + width < chunkSize) {
                    const nextVoxel = voxelGrid[x + width]?.[z]?.[y + 60];
                    const nextKey = `${x + width},${y},${z}`;
                    
                    if (!nextVoxel || processed.has(nextKey) ||
                        nextVoxel.material !== voxel.material ||
                        !colorsMatch(nextVoxel.color, voxel.color)) {
                        break;
                    }
                    width++;
                }
                
                // Then expand in Z direction with the established width
                let depth = 1;
                let canExpandZ = true;
                while (z + depth < chunkSize && canExpandZ) {
                    // Check entire row can expand
                    for (let dx = 0; dx < width; dx++) {
                        const nextVoxel = voxelGrid[x + dx]?.[z + depth]?.[y + 60];
                        const nextKey = `${x + dx},${y},${z + depth}`;
                        
                        if (!nextVoxel || processed.has(nextKey) ||
                            nextVoxel.material !== voxel.material ||
                            !colorsMatch(nextVoxel.color, voxel.color)) {
                            canExpandZ = false;
                            break;
                        }
                    }
                    
                    if (canExpandZ) depth++;
                }
                
                // Now try to expand in Y direction with the established XZ rectangle
                let height = 1;
                let canExpandY = true;
                while (y + height < chunkHeight - 60 && canExpandY) {
                    // Check entire XZ plane can expand upward
                    for (let dx = 0; dx < width; dx++) {
                        for (let dz = 0; dz < depth; dz++) {
                            const nextVoxel = voxelGrid[x + dx]?.[z + dz]?.[y + height + 60];
                            const nextKey = `${x + dx},${y + height},${z + dz}`;
                            
                            if (!nextVoxel || processed.has(nextKey) ||
                                nextVoxel.material !== voxel.material ||
                                !colorsMatch(nextVoxel.color, voxel.color)) {
                                canExpandY = false;
                                break;
                            }
                        }
                        if (!canExpandY) break;
                    }
                    
                    if (canExpandY) height++;
                }
                
                // Check if merged volume has any exposed faces
                let hasExposedFace = false;
                
                // Check all 6 faces of the merged volume
                for (let dy = 0; dy < height && !hasExposedFace; dy++) {
                    for (let dx = 0; dx < width && !hasExposedFace; dx++) {
                        for (let dz = 0; dz < depth && !hasExposedFace; dz++) {
                            const checkX = x + dx;
                            const checkY = y + dy;
                            const checkZ = z + dz;
                            
                            // Check if this position is on the edge of the merged volume
                            const isEdge = dx === 0 || dx === width - 1 || 
                                         dz === 0 || dz === depth - 1 || 
                                         dy === 0 || dy === height - 1;
                            
                            if (!isEdge) continue;
                            
                            // Check neighbors outside the merged volume
                            const neighbors = [
                                dy === height - 1 ? getVoxelAt(checkX, checkY + 1, checkZ) : null,
                                dy === 0 ? getVoxelAt(checkX, checkY - 1, checkZ) : null,
                                dx === width - 1 ? getVoxelAt(checkX + 1, checkY, checkZ) : null,
                                dx === 0 ? getVoxelAt(checkX - 1, checkY, checkZ) : null,
                                dz === depth - 1 ? getVoxelAt(checkX, checkY, checkZ + 1) : null,
                                dz === 0 ? getVoxelAt(checkX, checkY, checkZ - 1) : null
                            ];
                            
                            for (const neighbor of neighbors) {
                                if (neighbor === null) continue;
                                // Skip assumeSame neighbors
                                if (neighbor && neighbor.assumeSame) continue;
                                // Expose if neighbor is air or transparent
                                if (!neighbor || !neighbor.material || neighbor.material.transparent) {
                                    hasExposedFace = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // Skip this merged volume if it has no exposed faces
                if (!hasExposedFace) {
                    // Still mark as processed to avoid re-checking
                    for (let dx = 0; dx < width; dx++) {
                        for (let dz = 0; dz < depth; dz++) {
                            for (let dy = 0; dy < height; dy++) {
                                processed.add(`${x + dx},${y + dy},${z + dz}`);
                            }
                        }
                    }
                    continue;
                }
                
                // Mark entire 3D volume as processed
                for (let dx = 0; dx < width; dx++) {
                    for (let dz = 0; dz < depth; dz++) {
                        for (let dy = 0; dy < height; dy++) {
                            processed.add(`${x + dx},${y + dy},${z + dz}`);
                        }
                    }
                }
                
                // Create merged cube with 3D dimensions
                const worldX = offsetX + x + (width - 1) / 2;
                const worldZ = offsetZ + z + (depth - 1) / 2;
                const worldY = y + (height - 1) / 2;
                
                cubes.push({
                    position: [worldX * blockSize, worldY * 0.5, worldZ * blockSize],
                    scale: [width * blockSize, height * 0.5, depth * blockSize],
                    color: voxel.color,
                    material: voxel.material,
                    alpha: voxel.material.alpha,
                    chunkKey: key,
                    merged: width * depth * height > 1
                });
            }
        }
    }
    
    console.log(`[Greedy Mesh] Chunk ${chunkX},${chunkZ} generated ${cubes.length} cubes`);
    return cubes;
}
