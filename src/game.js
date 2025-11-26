import { Renderer } from './src/renderer.js';
import { World } from './src/world.js';
import { Player } from './src/player.js';
import { mat4 } from './src/math.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);
        this.world = new World();
        this.player = new Player();
        
        this.keys = {};
        this.cubes = [];
        this.enemies = [];
        
        this.weapon = {
            ammo: 30,
            maxAmmo: 30,
            totalAmmo: 120,
            lastShot: 0,
            fireRate: 200,
            damage: 25,
            isReloading: false,
            reloadTime: 1500
        };

        this.lastTime = performance.now();
        this.frameCount = 0;
        this.lastFpsUpdate = this.lastTime;

        this.setupInput();
        this.generateEnemies();
        this.cubes = this.world.updateChunks(this.player.position);
        this.updateAmmoDisplay();
        this.updateHealthBar();
        
        this.gameLoop();
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
            this.shoot();
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                this.player.rotation[1] -= e.movementX * 0.002;
                this.player.rotation[0] -= e.movementY * 0.002;
                this.player.rotation[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.player.rotation[0]));
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'r') {
                this.reload();
            }
        });
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

    updateEnemies(deltaTime) {
        const dt = deltaTime / 16.67;
        const playerPos = this.player.position;

        this.enemies.forEach(enemy => {
            if (!enemy.active) return;

            const dx = playerPos[0] - enemy.position[0];
            const dz = playerPos[2] - enemy.position[2];
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > 2 && distance < 30) {
                const oldX = enemy.position[0];
                const oldZ = enemy.position[2];
                
                enemy.position[0] += (dx / distance) * enemy.speed * dt;
                enemy.position[2] += (dz / distance) * enemy.speed * dt;
                
                if (this.player.checkCollision(enemy.position, this.cubes, this.world.chunkSize)) {
                    enemy.position[0] = oldX;
                    enemy.position[2] = oldZ;
                }
            }

            if (!enemy.velocity) enemy.velocity = [0, 0, 0];
            enemy.velocity[1] -= 0.01 * dt;
            enemy.position[1] += enemy.velocity[1] * dt;
            
            const terrainHeight = this.world.getTerrainHeightAt(enemy.position[0], enemy.position[2]);
            const minHeight = terrainHeight + 0.25 + enemy.scale[1] / 2;
            
            if (enemy.position[1] <= minHeight) {
                enemy.position[1] = minHeight;
                enemy.velocity[1] = 0;
            }

            if (distance < 1.5) {
                const died = this.player.takeDamage(0.1 * dt);
                this.updateHealthBar();
                if (died) {
                    this.gameOver();
                }
            }
        });
    }

    shoot() {
        const now = Date.now();
        if (now - this.weapon.lastShot < this.weapon.fireRate || 
            this.weapon.isReloading || 
            this.weapon.ammo <= 0) {
            return;
        }

        this.weapon.lastShot = now;
        this.weapon.ammo--;
        this.updateAmmoDisplay();

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

        const rayLength = Math.sqrt(rayDir[0]**2 + rayDir[1]**2 + rayDir[2]**2);
        rayDir[0] /= rayLength;
        rayDir[1] /= rayLength;
        rayDir[2] /= rayLength;

        let hitEnemy = false;
        let closestEnemy = null;
        let closestDistance = Infinity;
        
        this.enemies.forEach(enemy => {
            if (!enemy.active) return;

            const toEnemy = [
                enemy.position[0] - rayOrigin[0],
                enemy.position[1] - rayOrigin[1],
                enemy.position[2] - rayOrigin[2]
            ];

            const enemyDistance = Math.sqrt(toEnemy[0]**2 + toEnemy[1]**2 + toEnemy[2]**2);
            
            if (enemyDistance > 100) return;

            toEnemy[0] /= enemyDistance;
            toEnemy[1] /= enemyDistance;
            toEnemy[2] /= enemyDistance;

            const dotProduct = rayDir[0] * toEnemy[0] + rayDir[1] * toEnemy[1] + rayDir[2] * toEnemy[2];
            
            if (dotProduct > 0.9 && enemyDistance < closestDistance) {
                closestEnemy = enemy;
                closestDistance = enemyDistance;
                hitEnemy = true;
            }
        });

        if (hitEnemy && closestEnemy) {
            closestEnemy.health -= this.weapon.damage;
            this.showHitMarker();
            
            if (closestEnemy.health <= 0) {
                closestEnemy.active = false;
            }
        }
    }

    reload() {
        if (this.weapon.isReloading || this.weapon.ammo === this.weapon.maxAmmo || this.weapon.totalAmmo === 0) {
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
        this.renderer.clear();

        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, this.canvas.width / this.canvas.height, 0.1, 1000);

        const view = mat4.create();
        mat4.rotateX(view, view, -this.player.rotation[0]);
        mat4.rotateY(view, view, -this.player.rotation[1]);
        mat4.translate(view, view, [-this.player.position[0], -this.player.position[1], -this.player.position[2]]);

        this.renderer.setMatrices(projection, view);

        const playerPos = this.player.position;
        const renderDistance = 80;
        const playerChunkX = Math.floor(playerPos[0] / (this.world.chunkSize * 2));
        const playerChunkZ = Math.floor(playerPos[2] / (this.world.chunkSize * 2));
        
        for (let i = 0; i < this.cubes.length; i++) {
            const cube = this.cubes[i];
            
            if (cube.chunkKey) {
                const [cubeChunkX, cubeChunkZ] = cube.chunkKey.split(',').map(Number);
                if (Math.abs(cubeChunkX - playerChunkX) > this.world.renderDistance || 
                    Math.abs(cubeChunkZ - playerChunkZ) > this.world.renderDistance) {
                    continue;
                }
            }
            
            const dx = cube.position[0] - playerPos[0];
            const dz = cube.position[2] - playerPos[2];
            const distSq = dx * dx + dz * dz;
            
            if (distSq < renderDistance * renderDistance) {
                this.renderer.drawCube(cube, mat4);
            }
        }

        this.enemies.forEach(enemy => {
            if (enemy.active) {
                this.renderer.drawCube(enemy, mat4);
                
                const healthBarCube = {
                    position: [enemy.position[0], enemy.position[1] + 1.5, enemy.position[2]],
                    scale: [(enemy.health / enemy.maxHealth) * 1.2, 0.1, 0.1],
                    color: [0, 1, 0],
                    colorData: null
                };
                this.renderer.drawCube(healthBarCube, mat4);
            }
        });
    }

    update(deltaTime) {
        this.player.update(this.keys, deltaTime, this.world, this.cubes);
        
        const newCubes = this.world.updateChunks(this.player.position);
        if (newCubes.length > 0) {
            this.cubes = newCubes;
        }
        
        this.updateEnemies(deltaTime);
    }

    gameLoop() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.frameCount++;
        if (currentTime - this.lastFpsUpdate >= 1000) {
            document.getElementById('fps').textContent = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
        }

        this.update(deltaTime);
        this.render();
        
        requestAnimationFrame(() => this.gameLoop());
    }
}

window.addEventListener('load', () => {
    new Game();
});
