// ============================================================
// MAIN — Game loop, initialization, and scene setup
// ============================================================

import * as THREE from 'three';
import { GameState, WEAPON, PLAYER } from './constants';
import { PhysicsWorld } from './physics';
import { AudioManager } from './audio';
import { GameMap } from './map';
import { Player } from './player';
import { SniperRifle } from './weapon';
import { EnemyManager } from './enemies';
import { HUD } from './hud';
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
  private state = GameState.MENU;
  private animationId = 0;
  private spawnProtectionTimer = 0;
  private pendingState: GameState | null = null;

  // DOM
  private menuEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  private gameOverEl!: HTMLElement;
  private gameContainer!: HTMLElement;

  constructor() {
    this.init();
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
    this.weapon = new SniperRifle(this.camera);
    this.camera.add(this.weapon.getWeaponGroup());

    // Map
    this.map = new GameMap();
    const spawnPoints = this.map.build(this.scene, this.physics);

    // Enemies
    this.enemies = new EnemyManager();
    this.enemies.spawnEnemies(spawnPoints, this.scene);

    // HUD
    this.hud.init();
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
    this.weapon = new SniperRifle(this.camera);
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
    const spawnPoints = this.map.build(this.scene, this.physics);
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
