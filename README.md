# First Person 3D World Game

A first-person 3D world game built with JavaScript and WebGL (OpenGL for the web).

## Features

- **First-person camera** with mouse look
- **3D procedurally generated world** with terrain and obstacles
- **WASD movement controls**
- **Jumping mechanic** with gravity physics
- **WebGL rendering** with custom shaders
- **Collision detection** with ground

## Controls

- **W/A/S/D** - Move forward/left/backward/right
- **Mouse** - Look around (click to lock mouse)
- **Space** - Jump
- **ESC** - Release mouse lock

## How to Run

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge, Safari)
2. Click on the canvas to lock the mouse pointer
3. Use WASD to move and mouse to look around

## Technical Details

- Pure JavaScript with WebGL (no external 3D libraries like Three.js)
- Custom matrix math implementation for 3D transformations
- Vertex and fragment shaders for rendering
- Real-time physics simulation
- Procedural world generation

## Browser Compatibility

Requires a browser with WebGL support:
- Chrome 9+
- Firefox 4+
- Safari 5.1+
- Edge (all versions)
- Opera 12+

## Performance

The game runs at 60 FPS on most modern hardware. If you experience performance issues, try:
- Closing other browser tabs
- Updating your graphics drivers
- Using a different browser

Enjoy exploring your 3D world!
