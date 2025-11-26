// WebGL Renderer Module
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.clearColor(0.53, 0.81, 0.92, 1.0);

        this.setupShaders();
        this.setupBuffers();
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
            
            void main() {
                gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
                vColor = aColor;
                vNormal = mat3(uModelMatrix) * aNormal;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            
            uniform vec3 uLightDir;
            uniform vec3 uAmbientLight;
            uniform float uAlpha;
            
            void main() {
                vec3 normal = normalize(vNormal);
                
                float diffuse = max(dot(normal, uLightDir), 0.0);
                
                // Cell shading
                if (diffuse > 0.95) {
                    diffuse = 1.0;
                } else if (diffuse > 0.5) {
                    diffuse = 0.7;
                } else if (diffuse > 0.25) {
                    diffuse = 0.4;
                } else {
                    diffuse = 0.2;
                }
                
                vec3 lighting = uAmbientLight + vec3(diffuse);
                vec3 finalColor = vColor * lighting;
                
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

        this.gl.uniform3f(this.locations.uLightDir, 0.5, 1.0, 0.3);
        this.gl.uniform3f(this.locations.uAmbientLight, 0.3, 0.3, 0.3);
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
        const vertices = new Float32Array([
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5
        ]);

        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const normals = new Float32Array([
            0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
            0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
            0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
            0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
            1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
            -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0
        ]);

        this.normalBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,
            4, 5, 6, 4, 6, 7,
            8, 9, 10, 8, 10, 11,
            12, 13, 14, 12, 14, 15,
            16, 17, 18, 16, 18, 19,
            20, 21, 22, 20, 22, 23
        ]);

        this.indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
        this.indexCount = indices.length;

        this.colorBuffer = this.gl.createBuffer();
    }

    clear() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    setMatrices(projection, view) {
        this.gl.uniformMatrix4fv(this.locations.uProjectionMatrix, false, projection);
        this.gl.uniformMatrix4fv(this.locations.uViewMatrix, false, view);
    }

    drawCube(cube, mat4) {
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, cube.position);
        mat4.scale(modelMatrix, modelMatrix, cube.scale);
        
        this.gl.uniformMatrix4fv(this.locations.uModelMatrix, false, modelMatrix);
        
        const alpha = cube.alpha !== undefined ? cube.alpha : 1.0;
        this.gl.uniform1f(this.locations.uAlpha, alpha);

        if (!cube.colorData) {
            cube.colorData = new Float32Array(24 * 3);
            for (let i = 0; i < 24; i++) {
                cube.colorData[i * 3] = cube.color[0];
                cube.colorData[i * 3 + 1] = cube.color[1];
                cube.colorData[i * 3 + 2] = cube.color[2];
            }
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.enableVertexAttribArray(this.locations.aPosition);
        this.gl.vertexAttribPointer(this.locations.aPosition, 3, this.gl.FLOAT, false, 0, 0);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.enableVertexAttribArray(this.locations.aNormal);
        this.gl.vertexAttribPointer(this.locations.aNormal, 3, this.gl.FLOAT, false, 0, 0);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, cube.colorData, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(this.locations.aColor);
        this.gl.vertexAttribPointer(this.locations.aColor, 3, this.gl.FLOAT, false, 0, 0);

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
    }
}
