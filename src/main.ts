// ============================================================
// MAIN — Game loop, initialization, and scene setup
// ============================================================

import * as THREE from 'three';
import { GameState, WEAPON, PLAYER } from './constants';
import { PhysicsWorld } from './physics';
import { AudioManager } from './audio';
import { GameMap } from './map';
import type { LoadedAssets } from './map';
import { Player } from './player';
import { SniperRifle } from './weapon';
import { EnemyManager } from './enemies';
import { HUD } from './hud';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './style.css';

class Game {
  // Core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  // Systems
  private physics = new PhysicsWorld();
  private audio = new AudioManager();
  private hud = new HUD();

  // Game objects
  private map!: GameMap;
  private player!: Player;
  private weapon!: SniperRifle;
  private enemies!: EnemyManager;

  // State
  private state: GameState = GameState.MENU;
  private animationId = 0;
  private spawnProtectionTimer = 0;
  private pendingState: GameState | null = null;

  // DOM
  private menuEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  private gameOverEl!: HTMLElement;
  private gameContainer!: HTMLElement;

  private loadedWeaponGLTF: any = null;

  private loadedAssets: LoadedAssets = {
    buildings: new Map(),
    trees: new Map(),
    decorations: new Map(),
    fences: new Map(),
  };

  constructor() {
    this.preloadAssets().then(() => {
      this.init();
    });
  }

  private async preloadAssets(): Promise<void> {
    const startPrompt = document.querySelector('.start-prompt') as HTMLElement;
    if (startPrompt) {
      startPrompt.innerHTML = '<div class="reload-spinner" style="display:inline-block; margin-right:10px;"></div> LOADING MAP ASSETS <span id="load-pct">0%</span>';
    }

    const loader = new GLTFLoader();
    const assetsToLoad = [
      // Buildings
      { type: 'building', name: 'building-type-a.glb', path: '/map-assets/building-type-a.glb' },
      { type: 'building', name: 'building-type-b.glb', path: '/map-assets/building-type-b.glb' },
      { type: 'building', name: 'building-type-c.glb', path: '/map-assets/building-type-c.glb' },
      { type: 'building', name: 'building-type-d.glb', path: '/map-assets/building-type-d.glb' },
      { type: 'building', name: 'building-type-e.glb', path: '/map-assets/building-type-e.glb' },
      { type: 'building', name: 'building-type-f.glb', path: '/map-assets/building-type-f.glb' },
      { type: 'building', name: 'building-type-g.glb', path: '/map-assets/building-type-g.glb' },
      { type: 'building', name: 'building-type-h.glb', path: '/map-assets/building-type-h.glb' },
      // Trees
      { type: 'tree', name: 'tree-large.glb', path: '/map-assets/tree-large.glb' },
      { type: 'tree', name: 'tree-small.glb', path: '/map-assets/tree-small.glb' },
      // Decorations
      { type: 'decoration', name: 'planter.glb', path: '/map-assets/planter.glb' },
      { type: 'decoration', name: 'path-stones-messy.glb', path: '/map-assets/path-stones-messy.glb' },
      // Fences
      { type: 'fence', name: 'fence.glb', path: '/map-assets/fence.glb' },
      { type: 'fence', name: 'fence-low.glb', path: '/map-assets/fence-low.glb' },
      // Weapons
      { type: 'weapon', name: 'awp.glb', path: '/gun-assets/awp.glb' },
    ];

    let loadedCount = 0;
    const total = assetsToLoad.length;

    const loadPromises = assetsToLoad.map((asset) => {
      return new Promise<void>((resolve) => {
        loader.load(
          asset.path,
          (gltf) => {
            if (asset.type === 'building') {
              this.loadedAssets.buildings.set(asset.name, gltf.scene);
            } else if (asset.type === 'tree') {
              this.loadedAssets.trees.set(asset.name, gltf.scene);
            } else if (asset.type === 'decoration') {
              this.loadedAssets.decorations.set(asset.name, gltf.scene);
            } else if (asset.type === 'fence') {
              this.loadedAssets.fences.set(asset.name, gltf.scene);
            } else if (asset.type === 'weapon') {
              this.loadedWeaponGLTF = gltf;
            }
            loadedCount++;
            const pctEl = document.getElementById('load-pct');
            if (pctEl) {
              pctEl.textContent = `${Math.round((loadedCount / total) * 100)}%`;
            }
            resolve();
          },
          undefined,
          (error) => {
            console.error(`Error loading asset ${asset.path}:`, error);
            resolve(); // Resolve anyway to not break game start
          }
        );
      });
    });

    await Promise.all(loadPromises);

    if (startPrompt) {
      startPrompt.innerHTML = '<div class="start-icon">⊕</div><div>CLICK ANYWHERE TO DEPLOY</div>';
    }
  }

  private init(): void {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.gameContainer = document.getElementById('game-container')!;
    this.gameContainer.appendChild(this.renderer.domElement);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      WEAPON.NORMAL_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    // Scene
    this.scene = new THREE.Scene();

    // Player
    this.player = new Player(this.camera);
    this.scene.add(this.player.getObject());

    // Weapon
    this.weapon = new SniperRifle(this.camera, this.loadedWeaponGLTF);
    this.camera.add(this.weapon.getWeaponGroup());

    // Map
    this.map = new GameMap();
    const spawnPoints = this.map.build(this.scene, this.physics, this.loadedAssets);

    // Enemies
    this.enemies = new EnemyManager();
    this.enemies.spawnEnemies(spawnPoints, this.scene);

    // HUD
    this.hud.init();
    this.hud.initMinimap(this.map.getObstacles());
    this.hud.updateAmmo(this.weapon.ammoInMag, this.weapon.ammoReserve);
    this.hud.updateHealth(this.player.health);
    this.hud.updateStamina(this.player.stamina, PLAYER.SPRINT_DURATION);
    this.hud.updateStance(this.player.stance);

    // DOM refs
    this.menuEl = document.getElementById('main-menu')!;
    this.pauseEl = document.getElementById('pause-menu')!;
    this.gameOverEl = document.getElementById('game-over')!;

    // Events
    this.setupEvents();

    // Start
    this.setState(GameState.MENU);
    this.gameLoop();
  }

  private setupEvents(): void {
    // Pointer lock
    document.addEventListener('click', (e) => {
      // Don't handle clicks on buttons
      if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;

      if (this.state === GameState.MENU) {
        this.startGame();
      } else if (this.state === GameState.PLAYING) {
        if (!document.pointerLockElement) {
          this.gameContainer.requestPointerLock();
        }
      }
    });

    // Pointer lock change — only transition states when lock is acquired/lost
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) {
        // Pointer lock acquired — transition to pending state if any
        if (this.pendingState) {
          this.setState(this.pendingState);
          this.pendingState = null;
        }
      } else if (this.state === GameState.PLAYING) {
        this.setState(GameState.PAUSED);
      }
    });

    // Mouse buttons (ADS + Fire)
    document.addEventListener('mousedown', (e) => {
      if (this.state !== GameState.PLAYING || !document.pointerLockElement) return;

      if (e.button === 0) {
        // Left click — fire
        this.fireWeapon();
      } else if (e.button === 2) {
        // Right click — ADS
        this.weapon.toggleADS(true);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.weapon.toggleADS(false);
      }
    });

    // Context menu prevention
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (this.state === GameState.PAUSED && e.code === 'Escape') {
        this.resumeGame();
        return;
      }
      if (this.state !== GameState.PLAYING) return;

      switch (e.code) {
        case 'KeyR':
          this.weapon.startReload(this.audio, this.hud);
          break;
        case 'ShiftLeft':
          if (this.weapon.isADS) {
            this.weapon.setHoldBreath(true);
          }
          break;
        case 'Escape':
          this.setState(GameState.PAUSED);
          document.exitPointerLock();
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'ShiftLeft') {
        this.weapon.setHoldBreath(false);
      }
    });

    // Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Resume button
    document.getElementById('resume-btn')?.addEventListener('click', () => {
      this.resumeGame();
    });

    // Restart buttons
    document.getElementById('restart-btn')?.addEventListener('click', () => {
      this.restartGame();
    });
    document.getElementById('restart-btn-go')?.addEventListener('click', () => {
      this.restartGame();
    });

    // Sensitivity slider
    const sensSlider = document.getElementById('sensitivity-slider') as HTMLInputElement;
    if (sensSlider) {
      sensSlider.addEventListener('input', () => {
        this.player.sensitivity = parseFloat(sensSlider.value) * 0.001;
      });
    }
  }

  private startGame(): void {
    this.audio.init();
    this.audio.startAmbient();
    this.audio.resume();
    this.spawnProtectionTimer = 3.0; // 3 seconds spawn protection
    this.pendingState = GameState.PLAYING;
    this.gameContainer.requestPointerLock();
    // State will transition in pointerlockchange handler
    // Fallback: if pointer lock fails, still start (for testing)
    setTimeout(() => {
      if (this.state === GameState.MENU) {
        this.setState(GameState.PLAYING);
      }
    }, 500);
  }

  private resumeGame(): void {
    this.spawnProtectionTimer = 1.5; // brief protection on resume
    this.pendingState = GameState.PLAYING;
    this.gameContainer.requestPointerLock();
    // Fallback
    setTimeout(() => {
      if (this.state === GameState.PAUSED) {
        this.setState(GameState.PLAYING);
      }
    }, 500);
  }

  private restartGame(): void {
    // Reset player
    this.player.respawn();

    // Reset weapon
    this.weapon = new SniperRifle(this.camera, this.loadedWeaponGLTF);
    // Clear old weapon from camera and add new
    this.camera.children.forEach(child => {
      if (child.name === 'weapon') this.camera.remove(child);
    });
    this.camera.add(this.weapon.getWeaponGroup());

    // Reset enemies — remove old, spawn new
    this.enemies.getEnemies().forEach((e) => this.scene.remove(e.group));
    this.enemies = new EnemyManager();
    // Rebuild map to get spawn points
    this.physics.clearColliders();
    this.scene.children
      .filter((c) => c.name === 'map' || c.name === 'dust')
      .forEach((c) => this.scene.remove(c));
    this.map = new GameMap();
    const spawnPoints = this.map.build(this.scene, this.physics, this.loadedAssets);
    this.enemies.spawnEnemies(spawnPoints, this.scene);

    // Reset HUD
    this.hud.updateAmmo(this.weapon.ammoInMag, this.weapon.ammoReserve);
    this.hud.updateHealth(this.player.health);

    this.spawnProtectionTimer = 3.0;
    this.pendingState = GameState.PLAYING;
    this.gameContainer.requestPointerLock();
    setTimeout(() => {
      if (this.state !== GameState.PLAYING) {
        this.setState(GameState.PLAYING);
      }
    }, 500);
  }

  private setState(state: GameState): void {
    this.state = state;
    this.menuEl.style.display = state === GameState.MENU ? 'flex' : 'none';
    this.pauseEl.style.display = state === GameState.PAUSED ? 'flex' : 'none';
    this.gameOverEl.style.display = state === GameState.GAME_OVER ? 'flex' : 'none';

    const hudEl = document.getElementById('hud')!;
    hudEl.style.display = state === GameState.PLAYING ? 'block' : 'none';
  }

  private fireWeapon(): void {
    const origin = this.player.getEyePosition();
    const direction = this.player.getDirection();

    this.weapon.fire(
      origin,
      direction,
      this.physics,
      this.enemies.getEnemyMeshes(),
      [this.map.getObstacles()],
      this.audio,
      this.hud,
      this.scene,
      (hitObj, hitPoint) => this.enemies.processHit(hitObj, hitPoint)
    );
  }

  private gameLoop = (): void => {
    this.animationId = requestAnimationFrame(this.gameLoop);
    const delta = Math.min(this.clock.getDelta(), 0.05); // cap delta

    if (this.state !== GameState.PLAYING) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Update systems
    this.player.update(delta, this.physics, this.audio, this.weapon.isADS);

    // Apply recoil
    const recoil = this.weapon.getRecoilPitch();
    if (recoil > 0) {
      // camera pitch is on the pitchObject inside player
      // We use a workaround: temporarily offset camera
      this.camera.rotation.x -= recoil;
    }

    // Sprint weapon anim
    this.weapon.setSprinting(this.player.isSprinting);

    this.weapon.update(delta, this.hud, this.player.stance);

    // Spawn protection countdown
    if (this.spawnProtectionTimer > 0) {
      this.spawnProtectionTimer -= delta;
    }

    this.enemies.update(
      delta,
      this.player.getEyePosition(),
      this.player.stance,
      this.physics,
      [this.map.getObstacles()],
      this.audio,
      (damage, fromPos) => {
        // Ignore damage during spawn protection
        if (this.spawnProtectionTimer > 0) return;

        const angle = this.player.takeDamage(damage, fromPos);
        this.hud.flashDamage();
        this.hud.showDamageDirection(angle);
        this.audio.playDamage();

        if (this.player.health < 25) {
          this.audio.startHeartbeat();
        } else {
          this.audio.stopHeartbeat();
        }
      }
    );

    this.map.update(delta);
    this.hud.update(delta);

    // Update HUD values
    this.hud.updateHealth(this.player.health);
    this.hud.updateStamina(this.player.stamina, PLAYER.SPRINT_DURATION);
    this.hud.updateStance(this.player.stance);
    this.hud.updateCrosshair(this.player.isMoving, this.weapon.isADS);
    this.hud.updateScore(this.enemies.kills, this.enemies.headshots);
    this.hud.updateMinimap(this.player.position, this.player.getYaw(), this.enemies.getEnemies());

    // Check death
    if (this.player.isDead) {
      this.setState(GameState.GAME_OVER);
      document.exitPointerLock();
      this.audio.stopHeartbeat();

      // Show final stats
      const statsEl = document.getElementById('final-stats');
      if (statsEl) {
        statsEl.textContent = `Kills: ${this.enemies.kills} | Headshots: ${this.enemies.headshots}`;
      }
    }

    // Check all enemies dead
    if (this.enemies.getAliveCount() === 0) {
      const victoryEl = document.getElementById('victory-text');
      if (victoryEl) {
        victoryEl.style.display = 'block';
      }
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  };
}

// Start the game
new Game();
