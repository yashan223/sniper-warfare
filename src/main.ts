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
import { MultiplayerManager } from './multiplayer';
import { loginWithGoogle, loginWithEmail, registerWithEmail, loginAsGuest, logout, listenToAuthStatus, updatePlayerStats, listenToLeaderboard, measurePing, getServerRegion } from './firebase';
import type { User } from 'firebase/auth';
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
  private multiplayer!: MultiplayerManager;
  private currentUser: User | null = null;
  private sessionKills = 0;
  private sessionHeadshots = 0;
  private sessionStartTime = 0;
  private lastNetworkUpdate = 0; // throttle Firebase writes

  // State
  private state: GameState = GameState.MENU;
  private animationId = 0;
  private spawnProtectionTimer = 0;
  private pendingState: GameState | null = null;
  private shakeIntensity = 0; // camera shake
  private victoryTimer = -1; // countdown before showing victory screen
  private killcamTimer = 0; // countdown for killcam
  private killerPos = new THREE.Vector3(); // position of killer
  // private totalEnemies = 0;

  // DOM
  private menuEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  private gameOverEl!: HTMLElement;
  private victoryEl!: HTMLElement;
  private gameContainer!: HTMLElement;

  private loadedWeaponGLTF: any = null;
  private loadedPlayerModelGLTF: any = null;

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
      // Buildings (all 21 types)
      ...['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u'].map(letter => ({
        type: 'building', name: `building-type-${letter}.glb`, path: `/map-assets/building-type-${letter}.glb`
      })),
      // Trees
      { type: 'tree', name: 'tree-large.glb', path: '/map-assets/tree-large.glb' },
      { type: 'tree', name: 'tree-small.glb', path: '/map-assets/tree-small.glb' },
      // Decorations
      { type: 'decoration', name: 'planter.glb', path: '/map-assets/planter.glb' },
      { type: 'decoration', name: 'path-stones-messy.glb', path: '/map-assets/path-stones-messy.glb' },
      { type: 'decoration', name: 'path-stones-short.glb', path: '/map-assets/path-stones-short.glb' },
      { type: 'decoration', name: 'path-stones-long.glb', path: '/map-assets/path-stones-long.glb' },
      { type: 'decoration', name: 'path-short.glb', path: '/map-assets/path-short.glb' },
      { type: 'decoration', name: 'path-long.glb', path: '/map-assets/path-long.glb' },
      { type: 'decoration', name: 'driveway-short.glb', path: '/map-assets/driveway-short.glb' },
      { type: 'decoration', name: 'driveway-long.glb', path: '/map-assets/driveway-long.glb' },
      // Fences (all variants)
      { type: 'fence', name: 'fence.glb', path: '/map-assets/fence.glb' },
      { type: 'fence', name: 'fence-low.glb', path: '/map-assets/fence-low.glb' },
      { type: 'fence', name: 'fence-1x2.glb', path: '/map-assets/fence-1x2.glb' },
      { type: 'fence', name: 'fence-1x3.glb', path: '/map-assets/fence-1x3.glb' },
      { type: 'fence', name: 'fence-1x4.glb', path: '/map-assets/fence-1x4.glb' },
      { type: 'fence', name: 'fence-2x2.glb', path: '/map-assets/fence-2x2.glb' },
      { type: 'fence', name: 'fence-2x3.glb', path: '/map-assets/fence-2x3.glb' },
      { type: 'fence', name: 'fence-3x2.glb', path: '/map-assets/fence-3x2.glb' },
      { type: 'fence', name: 'fence-3x3.glb', path: '/map-assets/fence-3x3.glb' },
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

  
  private setupAuthUI() {
    const loginScreen = document.getElementById('login-screen')!;
    const googleLoginBtn = document.getElementById('google-login-btn')!;
    const guestLoginBtn = document.getElementById('guest-login-btn')!;
    const emailLoginBtn = document.getElementById('email-login-btn')!;
    const emailRegisterBtn = document.getElementById('email-register-btn')!;
    const tabSignin = document.getElementById('tab-signin')!;
    const tabSignup = document.getElementById('tab-signup')!;
    const emailInput = document.getElementById('auth-email') as HTMLInputElement;
    const passInput = document.getElementById('auth-password') as HTMLInputElement;
    const authError = document.getElementById('auth-error')!;
    const logoutBtn = document.getElementById('logout-btn')!;
    const playBtn = document.getElementById('start-game-btn')!;
    const loginSection = document.getElementById('login-section')!;
    const playSection = document.getElementById('play-section')!;
    const profile = document.getElementById('player-profile')!;

    // Tab switching
    tabSignin?.addEventListener('click', () => {
      tabSignin.classList.add('active'); tabSignup.classList.remove('active');
      emailLoginBtn.style.display = 'flex'; emailRegisterBtn.style.display = 'none';
    });
    tabSignup?.addEventListener('click', () => {
      tabSignup.classList.add('active'); tabSignin.classList.remove('active');
      emailRegisterBtn.style.display = 'flex'; emailLoginBtn.style.display = 'none';
    });

    const displayError = (err: any) => {
      console.error(err);
      const msg = (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password')
        ? 'Invalid email or password'
        : err.code === 'auth/email-already-in-use'
        ? 'Email already in use'
        : err.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters'
        : err.message || 'Authentication failed';
      authError.textContent = msg;
    };

    googleLoginBtn.addEventListener('click', async () => {
      try { authError.textContent = ''; await loginWithGoogle(); } catch (e) { displayError(e); }
    });
    
    guestLoginBtn.addEventListener('click', async () => {
      try { authError.textContent = ''; await loginAsGuest(); } catch (e) { displayError(e); }
    });

    emailLoginBtn.addEventListener('click', async () => {
      if (!emailInput.value || !passInput.value) return displayError({message: 'Enter email and password'});
      try { authError.textContent = ''; await loginWithEmail(emailInput.value, passInput.value); } catch (e) { displayError(e); }
    });

    emailRegisterBtn.addEventListener('click', async () => {
      if (!emailInput.value || !passInput.value) return displayError({message: 'Enter email and password'});
      try { authError.textContent = ''; await registerWithEmail(emailInput.value, passInput.value); } catch (e) { displayError(e); }
    });

    logoutBtn.addEventListener('click', async () => {
      await logout();
    });

    playBtn.addEventListener('click', () => {
      loginScreen.style.display = 'none';
      this.startGame();
    });

    listenToAuthStatus((user) => {
      this.currentUser = user;
      if (user) {
        loginSection.style.display = 'none';
        playSection.style.display = 'flex';
        const name = user.isAnonymous ? 'GUEST' : (user.displayName?.toUpperCase() || user.email?.split('@')[0].toUpperCase() || 'SOLDIER');
        profile.textContent = name;
      } else {
        loginSection.style.display = 'block';
        playSection.style.display = 'none';
        loginScreen.style.display = 'flex';
      }
    });

    // Online player count from /players node
    const onlineCountEl = document.getElementById('online-count');
    import('firebase/database').then(({ onValue: fbOnValue, ref: fbRef }) => {
      import('./firebase').then(({ db }) => {
        fbOnValue(fbRef(db, 'players'), (snap: any) => {
          const count = snap.exists() ? Object.keys(snap.val() || {}).length : 0;
          if (onlineCountEl) onlineCountEl.textContent = String(count);
        });
      });
    });

    // Leaderboard
    const lbContent = document.getElementById('leaderboard-content')!;
    const tabKills = document.getElementById('tab-kills')!;
    const tabTime = document.getElementById('tab-time')!;
    let unsubLb: (() => void) | null = null;

    const loadLeaderboard = (sortBy: 'kills' | 'playTime') => {
      if (unsubLb) unsubLb();
      lbContent.innerHTML = '<div class="lp-lb-loading"><div class="lp-lb-spinner"></div>LOADING...</div>';
      unsubLb = listenToLeaderboard(sortBy, (data) => {
        lbContent.innerHTML = '';
        data.forEach((p, idx) => {
          const row = document.createElement('div');
          row.className = `lp-lb-row ${p.uid === this.currentUser?.uid ? 'lp-lb-me' : ''}`;
          const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
          const score = sortBy === 'kills'
            ? `${p.kills || 0} K`
            : `${Math.floor((p.playTime || 0) / 60)}m`;
          row.innerHTML = `
            <div class="lp-lb-rank ${rankClass}">${idx + 1}</div>
            <div class="lp-lb-name">${p.displayName || 'UNKNOWN'}</div>
            <div class="lp-lb-score">${score}</div>`;
          lbContent.appendChild(row);
        });
        if (data.length === 0) lbContent.innerHTML = '<div class="lp-lb-loading">NO PLAYERS YET</div>';
      });
    };

    tabKills.addEventListener('click', () => {
      tabKills.classList.add('active'); tabTime.classList.remove('active');
      loadLeaderboard('kills');
    });
    tabTime.addEventListener('click', () => {
      tabTime.classList.add('active'); tabKills.classList.remove('active');
      loadLeaderboard('playTime');
    });
    loadLeaderboard('kills');

    // --- Ping + Server Region ---
    const region = getServerRegion();

    // Landing page stats
    const lpServerCode = document.getElementById('lp-server-code');
    const lpServerLabel = document.getElementById('lp-server-label');
    const lpPingEl = document.getElementById('lp-ping');
    if (lpServerCode) lpServerCode.textContent = region.code;
    if (lpServerLabel) lpServerLabel.textContent = region.label;

    // In-game HUD
    const netPingEl = document.getElementById('net-ping');
    const netServerEl = document.getElementById('net-server');
    if (netServerEl) netServerEl.textContent = region.code + ' · ' + region.label.split('(')[0].trim();

    const updatePing = async () => {
      const ms = await measurePing();
      const label = `${ms} ms`;
      const cls = ms < 80 ? 'ping-ok' : ms < 180 ? 'ping-mid' : 'ping-bad';

      if (lpPingEl) lpPingEl.textContent = String(ms);
      if (netPingEl) {
        netPingEl.textContent = label;
        netPingEl.className = cls;
      }
    };

    updatePing();
    setInterval(updatePing, 5000); // refresh every 5 seconds
  }

  private init(): void {
    this.setupAuthUI();

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

    // Player (no third-person model — pure FPS)
    this.player = new Player(this.camera);
    this.scene.add(this.player.getObject());

    // Weapon
    this.weapon = new SniperRifle(this.camera, this.loadedWeaponGLTF);
    this.camera.add(this.weapon.getWeaponGroup());

    // Map
    this.map = new GameMap();
    const spawnPoints = this.map.build(this.scene, this.physics, this.loadedAssets);

    // Enemies
    this.multiplayer = new MultiplayerManager(this.scene);
//     this.enemies.spawnEnemies(spawnPoints, this.scene);
//     this.totalEnemies = this.enemies.getEnemies().length;

    // HUD
    this.hud.init();
    this.hud.initMinimap(this.map.getObstacles());
    this.hud.updateAmmo(this.weapon.ammoInMag, this.weapon.ammoReserve);
    this.hud.updateHealth(this.player.health);
    this.hud.updateStamina(this.player.stamina, PLAYER.SPRINT_DURATION);
    this.hud.updateStance(this.player.stance);

    // DOM refs
    this.menuEl = document.getElementById('login-screen')!;
    this.pauseEl = document.getElementById('pause-menu')!;
    this.gameOverEl = document.getElementById('game-over')!;
    this.victoryEl = document.getElementById('victory-screen')!;

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
    document.getElementById('restart-btn-victory')?.addEventListener('click', () => {
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
    this.sessionStartTime = Date.now();
    this.sessionKills = 0;
    this.sessionHeadshots = 0;

    // Initialize Firebase multiplayer
    if (this.currentUser) {
      this.multiplayer.init(
        this.currentUser.uid,
        this.currentUser.isAnonymous ? 'GUEST' : (this.currentUser.displayName || this.currentUser.email?.split('@')[0] || 'Soldier'),
        this.player.position,
        (dmg) => {
          if (this.spawnProtectionTimer > 0) return;
          const angle = this.player.takeDamage(dmg);
          this.hud.flashDamage();
          this.hud.showDamageDirection(angle);
          this.audio.playDamage();
          this.shakeIntensity = 0.018;
          if (this.player.health < 25) {
            this.audio.startHeartbeat();
          } else {
            this.audio.stopHeartbeat();
          }
          if (this.player.health <= 0 && this.state === GameState.PLAYING) {
            this.killerPos.copy(this.player.position).add(new THREE.Vector3(0, 5, 10));
            this.killcamTimer = 3.5;
            this.setState(GameState.KILLCAM);
            this.audio.stopHeartbeat();
          }
        }
      );
    }

    this.spawnProtectionTimer = 3.0;
    this.pendingState = GameState.PLAYING;
    this.gameContainer.requestPointerLock();
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
    // Cleanup multiplayer first
    this.multiplayer.cleanup();

    // Reset player
    this.player.respawn();

    // Reset weapon
    this.weapon = new SniperRifle(this.camera, this.loadedWeaponGLTF);
    this.camera.children.forEach(child => {
      if (child.name === 'weapon') this.camera.remove(child);
    });
    this.camera.add(this.weapon.getWeaponGroup());

    // Rebuild map
    this.physics.clearColliders();
    this.scene.children
      .filter((c) => c.name === 'map' || c.name === 'dust')
      .forEach((c) => this.scene.remove(c));
    this.map = new GameMap();
    this.map.build(this.scene, this.physics, this.loadedAssets);

    this.victoryTimer = -1;
    this.sessionKills = 0;
    this.sessionHeadshots = 0;

    // Reset HUD
    this.hud.updateAmmo(this.weapon.ammoInMag, this.weapon.ammoReserve);
    this.hud.updateHealth(this.player.health);

    // Show login screen to re-deploy (re-inits multiplayer via startGame)
    const loginScreen = document.getElementById('login-screen')!;
    loginScreen.style.display = 'flex';
    this.setState(GameState.MENU);
  }

  private setState(state: GameState): void {
    this.state = state;
    this.menuEl.style.display = state === GameState.MENU ? 'flex' : 'none';
    this.pauseEl.style.display = state === GameState.PAUSED ? 'flex' : 'none';
    this.gameOverEl.style.display = state === GameState.GAME_OVER ? 'flex' : 'none';
    this.victoryEl.style.display = state === GameState.VICTORY ? 'flex' : 'none';

    const killcamEl = document.getElementById('killcam-overlay');
    if (killcamEl) {
      killcamEl.style.display = state === GameState.KILLCAM ? 'block' : 'none';
    }

    const hudEl = document.getElementById('hud')!;
    if (state === GameState.PLAYING || state === GameState.KILLCAM) {
      hudEl.style.display = 'block';
    } else {
      hudEl.style.display = 'none';
    }
  }

  private fireWeapon(): void {
    const origin = this.player.getEyePosition();
    const direction = this.player.getDirection();

    this.weapon.fire(
      origin,
      direction,
      this.physics,
      this.multiplayer.getNetworkMeshes(),
      [this.map.getObstacles()],
      this.audio,
      this.hud,
      this.scene,
      (hitObj) => {
        const hitData = this.multiplayer.processHit(hitObj);
        if (hitData?.killed) {
           this.sessionKills++;
           if (hitData.headshot) this.sessionHeadshots++;
        }
        return hitData;
      }
    );
  }

  private gameLoop = (): void => {
    this.animationId = requestAnimationFrame(this.gameLoop);
    const delta = Math.min(this.clock.getDelta(), 0.05); // cap delta

    if (this.state !== GameState.PLAYING && this.state !== GameState.KILLCAM) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Update systems
    this.player.update(delta, this.physics, this.audio, this.weapon.isADS);

    // Apply recoil — push the player's pitch up then recover each frame
    const recoil = this.weapon.getRecoilPitch();
    if (recoil > 0) {
      this.player.applyRecoil(recoil);
    }
    // Smoothly recover recoil toward zero
    this.player.recoverRecoil(delta);

    // Sprint weapon anim
    this.weapon.setSprinting(this.player.isSprinting);

    this.weapon.update(delta, this.hud, this.player.stance);

    // Spawn protection countdown
    if (this.spawnProtectionTimer > 0) {
      this.spawnProtectionTimer -= delta;
    }

    this.multiplayer.update(delta);

    // Throttle network position updates to ~15/sec to avoid Firebase write limits
    const now = Date.now();
    if (this.currentUser && now - this.lastNetworkUpdate > 66) {
      this.lastNetworkUpdate = now;
      this.multiplayer.updateLocalPlayer(this.player.position, this.player.getYaw(), this.player.stance, this.player.health, this.player.isDead);
    }


    this.map.update(delta);
    this.hud.update(delta);

    // Update HUD values
    this.hud.updateHealth(this.player.health);
    this.hud.updateStamina(this.player.stamina, PLAYER.SPRINT_DURATION);
    this.hud.updateStance(this.player.stance);
    this.hud.updateCrosshair(this.player.isMoving, this.weapon.isADS);
    this.hud.updateScore(this.sessionKills, this.sessionHeadshots);
    this.hud.updateMinimap(this.player.position, this.player.getYaw(), []); // Optional: show players on minimap
    // this.hud.updateEnemyCount(this.enemies.getAliveCount(), this.totalEnemies);

    // Camera shake
    if (this.shakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.82; // decay
      if (this.shakeIntensity < 0.0005) {
        this.shakeIntensity = 0;
        this.camera.position.set(0, 0, 0); // reset local position
      }
    }

    // Handle Killcam state
    if (this.state === GameState.KILLCAM) {
      this.killcamTimer -= delta;
      
      // Detach weapon immediately to hide it
      this.weapon.getWeaponGroup().visible = false;
      
      this.player.lookAtSmooth(this.killerPos, delta);

      if (this.killcamTimer <= 0) {
        this.setState(GameState.GAME_OVER);
        document.exitPointerLock();
        
        // Show final stats
        const statsEl = document.getElementById('final-stats');
        if (statsEl) {
          statsEl.textContent = `Kills: ${this.sessionKills} | Headshots: ${this.sessionHeadshots}`;
          
          // Send to Firebase
          if (this.currentUser) {
            const playTimeMs = Date.now() - this.sessionStartTime;
            updatePlayerStats(this.currentUser.uid, this.currentUser.displayName || '', {
              kills: this.sessionKills,
              deaths: 1,
              playTime: Math.floor(playTimeMs / 1000)
            });
            this.sessionKills = 0;
            this.sessionHeadshots = 0;
          }
        }
      }
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  };
}

// Start the game
new Game();

