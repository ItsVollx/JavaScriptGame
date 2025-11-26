export class PlayerPhysics {
    constructor() {
        this.gravity = 0.01;
        this.waterGravity = 0.003;
        this.swimSpeed = 0.3;
    }

    isPlayerInWater(player, chunks, chunkSize, blockSize) {
        const px = player.position[0];
        const py = player.position[1];
        const pz = player.position[2];
        const playerHeight = 1.8;
        const playerWidth = 0.6;

        const chunkX = Math.floor(px / (chunkSize * blockSize));
        const chunkZ = Math.floor(pz / (chunkSize * blockSize));
        const key = `${chunkX},${chunkZ}`;
        const chunk = chunks.get(key);
        if (!chunk) return false;

        const cubes = chunk.cubes;
        for (const cube of cubes) {
            if (cube.material.name !== 'water') continue;

            const cx = cube.position[0];
            const cy = cube.position[1];
            const cz = cube.position[2];
            const size = blockSize;

            if (px + playerWidth / 2 > cx && px - playerWidth / 2 < cx + size &&
                py + playerHeight > cy && py < cy + size &&
                pz + playerWidth / 2 > cz && pz - playerWidth / 2 < cz + size) {
                return true;
            }
        }
        return false;
    }

    applyGravity(player, isInWater) {
        const currentGravity = isInWater ? this.waterGravity : this.gravity;
        player.velocity[1] -= currentGravity;
    }

    handleSwimming(player, keys, isInWater) {
        if (isInWater && keys[' ']) {
            player.velocity[1] = this.swimSpeed;
        }
    }

    checkCollision(player, chunks, chunkSize, blockSize) {
        const px = player.position[0];
        const py = player.position[1];
        const pz = player.position[2];
        const playerHeight = 1.8;
        const playerWidth = 0.6;

        const chunkX = Math.floor(px / (chunkSize * blockSize));
        const chunkZ = Math.floor(pz / (chunkSize * blockSize));

        for (let cx = chunkX - 1; cx <= chunkX + 1; cx++) {
            for (let cz = chunkZ - 1; cz <= chunkZ + 1; cz++) {
                const key = `${cx},${cz}`;
                const chunk = chunks.get(key);
                if (!chunk) continue;

                for (const cube of chunk.cubes) {
                    if (cube.material.name === 'water') continue;

                    const bx = cube.position[0];
                    const by = cube.position[1];
                    const bz = cube.position[2];
                    const size = blockSize;

                    if (px + playerWidth / 2 > bx && px - playerWidth / 2 < bx + size &&
                        py + playerHeight > by && py < by + size &&
                        pz + playerWidth / 2 > bz && pz - playerWidth / 2 < bz + size) {
                        return { collides: true, block: cube };
                    }
                }
            }
        }
        return { collides: false };
    }
}
