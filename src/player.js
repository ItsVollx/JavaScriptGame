// Player controller
export class Player {
    constructor() {
        this.position = [0, 5, 0];
        this.rotation = [0, 0];
        this.velocity = [0, 0, 0];
        this.speed = 0.1;
        this.jumpSpeed = 0.3;
        this.onGround = false;
        this.health = 100;
        this.maxHealth = 100;
    }

    update(keys, deltaTime, world, cubes) {
        const dt = deltaTime / 16.67;

        const forward = [
            -Math.sin(this.rotation[1]) * Math.cos(this.rotation[0]),
            0,
            -Math.cos(this.rotation[1]) * Math.cos(this.rotation[0])
        ];

        const right = [
            Math.cos(this.rotation[1]),
            0,
            -Math.sin(this.rotation[1])
        ];

        let moveX = 0, moveZ = 0;
        
        if (keys['w']) {
            moveX += forward[0];
            moveZ += forward[2];
        }
        if (keys['s']) {
            moveX -= forward[0];
            moveZ -= forward[2];
        }
        if (keys['a']) {
            moveX -= right[0];
            moveZ -= right[2];
        }
        if (keys['d']) {
            moveX += right[0];
            moveZ += right[2];
        }

        const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLength > 0) {
            moveX = (moveX / moveLength) * this.speed * dt;
            moveZ = (moveZ / moveLength) * this.speed * dt;
        }

        const oldX = this.position[0];
        const oldZ = this.position[2];
        
        this.position[0] += moveX;
        this.position[2] += moveZ;

        if (this.checkCollision(this.position, cubes, world.chunkSize)) {
            this.position[2] = oldZ;
            if (this.checkCollision(this.position, cubes, world.chunkSize)) {
                this.position[0] = oldX;
                this.position[2] = oldZ + moveZ;
                if (this.checkCollision(this.position, cubes, world.chunkSize)) {
                    this.position[0] = oldX;
                    this.position[2] = oldZ;
                }
            }
        }

        if (keys[' '] && this.onGround) {
            this.velocity[1] = this.jumpSpeed;
            this.onGround = false;
        }

        if (!this.onGround) {
            this.velocity[1] -= 0.01 * dt;
        }
        this.position[1] += this.velocity[1] * dt;

        this.updateGroundCollision(cubes, world.chunkSize);
    }

    checkCollision(position, cubes, chunkSize) {
        const playerRadius = 0.5;
        const playerHeight = 1.8;
        
        const chunkX = Math.floor(position[0] / (chunkSize * 2));
        const chunkZ = Math.floor(position[2] / (chunkSize * 2));
        
        for (let cube of cubes) {
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - chunkX) > 1 || Math.abs(cubeChunkZ - chunkZ) > 1) {
                    continue;
                }
            }
            
            if (cube.type === 'terrain' || cube.type === 'structure' || cube.type === 'obstacle') {
                const dx = position[0] - cube.position[0];
                const dz = position[2] - cube.position[2];
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                const cubeHalfWidth = cube.scale[0] / 2;
                const cubeHalfDepth = cube.scale[2] / 2;
                const cubeRadius = Math.sqrt(cubeHalfWidth * cubeHalfWidth + cubeHalfDepth * cubeHalfDepth);
                
                if (distance < playerRadius + cubeRadius - 0.1) {
                    const cubeHalfHeight = cube.scale[1] / 2;
                    const cubeBottom = cube.position[1] - cubeHalfHeight;
                    const cubeTop = cube.position[1] + cubeHalfHeight;
                    
                    const playerBottom = position[1] - playerHeight / 2;
                    const playerTop = position[1] + playerHeight / 2;
                    
                    if (playerBottom < cubeTop - 0.1 && playerTop > cubeBottom + 0.1) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    updateGroundCollision(cubes, chunkSize) {
        let foundGround = false;
        const playerRadius = 0.5;
        const checkPositions = [
            [this.position[0], this.position[2]],
            [this.position[0] + playerRadius, this.position[2]],
            [this.position[0] - playerRadius, this.position[2]],
            [this.position[0], this.position[2] + playerRadius],
            [this.position[0], this.position[2] - playerRadius]
        ];
        
        let highestGroundY = -1000;
        
        const chunkX = Math.floor(this.position[0] / (chunkSize * 2));
        const chunkZ = Math.floor(this.position[2] / (chunkSize * 2));
        
        for (let cube of cubes) {
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - chunkX) > 1 || Math.abs(cubeChunkZ - chunkZ) > 1) {
                    continue;
                }
            }
            
            if (cube.type === 'terrain' || cube.type === 'structure' || cube.type === 'obstacle') {
                const cubeTop = cube.position[1] + cube.scale[1] / 2;
                
                if (cubeTop < this.position[1] && cubeTop > highestGroundY) {
                    for (const [checkX, checkZ] of checkPositions) {
                        const dx = checkX - cube.position[0];
                        const dz = checkZ - cube.position[2];
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        
                        if (dist < cube.scale[0] / 2 + 0.1) {
                            highestGroundY = cubeTop;
                            foundGround = true;
                        }
                    }
                }
            }
        }
        
        if (foundGround) {
            const minHeight = highestGroundY + 2;
            if (this.position[1] <= minHeight) {
                this.position[1] = minHeight;
                this.velocity[1] = 0;
                this.onGround = true;
            } else {
                this.onGround = false;
            }
        } else {
            this.onGround = false;
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            return true; // Player died
        }
        return false;
    }
}
