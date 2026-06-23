# SNIPER WARFARE

A tactical 3D first-person sniper game built in **TypeScript**, **Three.js**, and **Vite**. Features precise bolt-action sniper mechanics, fluid movement system, custom asset loading, and a modern HUD interface.

---

## 🎮 Gameplay Features

* **3D Asset Integration**: Loads custom map elements (buildings, fences, planters, trees) and a high-fidelity **AWP Sniper Rifle** model.
* **Sleek View Model**: A polished first-person view model with tactical sleeves and gloves naturally aligned to the weapon grip and handguard.
* **Rotating Radar Minimap**: A circular glassmorphic HUD minimap that rotates counter-clockwise with player rotation, showing cached static level walls, compass markings, and active enemy targets.
* **Call of Duty 4-style Movement**: Smooth physics engine featuring sprinting, jumping, head bob, and stance transitions (standing, crouching, prone).
* **Scope Mechanics (ADS)**: Right-click to zoom, lowering FOV and activating a custom 2D HUD scope. Shift to hold breath to steady aim.
* **Custom Firing Audio**: Features asynchronous preloading and playback of the custom `fire.mp3` sound.

---

## ⌨️ Control Scheme

| Action | Control |
| :--- | :--- |
| **Movement** | `W` `A` `S` `D` |
| **Jump** | `SPACE` |
| **Crouch** | `C` |
| **Prone** | `Z` |
| **Sprint** | `SHIFT` |
| **Scope (ADS)** | `RMB` (Right Click) |
| **Shoot** | `LMB` (Left Click) |
| **Reload** | `R` |
| **Hold Breath** | `SHIFT` (While Scoped) |
| **Pause Menu** | `ESC` |

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173/` in your browser.

### 3. Build for Production
```bash
npm run build
```
Creates a minified production bundle in the `dist` directory.
