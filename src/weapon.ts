// ============================================================
// WEAPON — Bolt-Action Sniper Rifle
// ============================================================

import * as THREE from 'three';
import { WEAPON, PLAYER, Stance } from './constants';
import { AudioManager } from './audio';
import { PhysicsWorld } from './physics';
import { HUD } from './hud';

export class SniperRifle {
  // State
  isADS = false;
  private adsProgress = 0; // 0 = hip, 1 = fully scoped

  // Ammo
  ammoInMag: number = WEAPON.MAG_SIZE;
  ammoReserve: number = WEAPON.RESERVE_AMMO;

  // Timing
  private boltActionTimer = 0;
  private reloadTimer = 0;
  isReloading = false;
  private isBoltAction = false;
  canFire = true;

  // Scope sway
  private swayTime = 0;
  private holdingBreath = false;
  breathRemaining: number = WEAPON.HOLD_BREATH_DURATION;
  private breathRegenTimer = 0;

  // Weapon lag (tracks mouse delta for inertia effect)
  private weaponLagX = 0;
  private weaponLagY = 0;
  private lastMouseDX = 0;
  private lastMouseDY = 0;

  // Recoil
  private recoilPitch = 0;
  private recoilRecovery = 0;

  // Weapon model
  private weaponGroup = new THREE.Group();
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashTimer = 0;

  // Gun position/rotation configs (set dynamically based on model type)
  private hipfirePosition = new THREE.Vector3(0.2, -0.22, -0.35);
  private adsPosition = new THREE.Vector3(0, -0.05, -0.35);

  // Tracers
  private tracers: { line: THREE.Line; timer: number }[] = [];

  // Camera ref
  private camera: THREE.PerspectiveCamera;
  private currentFOV: number = WEAPON.NORMAL_FOV;

  // Animation Mixer for GLB weapon
  private mixer!: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};

  constructor(camera: THREE.PerspectiveCamera, weaponGLTF?: any) {
    this.camera = camera;
    this.muzzleFlashLight = new THREE.PointLight(0xFFAA44, 0, 10);
    
    if (weaponGLTF) {
      this.buildGLTFWeaponModel(weaponGLTF);
    } else {
      this.buildWeaponModel();
    }

    // Track mouse movement for weapon lag
    document.addEventListener('mousemove', (e) => {
      this.lastMouseDX = e.movementX;
      this.lastMouseDY = e.movementY;
    });
  }

  getWeaponGroup(): THREE.Group {
    return this.weaponGroup;
  }

  private buildGLTFWeaponModel(gltf: any): void {
    const gltfScene = gltf.scene.clone();

    // Create a wrapper group to center and orient the model cleanly
    const wrapper = new THREE.Group();
    this.weaponGroup.add(wrapper);

    // Compute bounding box of the unscaled gltf model
    const box = new THREE.Box3().setFromObject(gltfScene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log('Weapon model size:', size, 'Center:', center);

    // Center the gltf model inside the wrapper
    gltfScene.position.copy(center).multiplyScalar(-1);
    wrapper.add(gltfScene);

    // Standardize length along the maximum dimension (size.x = 3.42 units) to 0.6 units
    const targetLength = 0.6;
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? targetLength / maxDim : 1;
    
    // Scale and orient the wrapper
    wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);
    wrapper.position.set(0, 0, 0); // centered inside weaponGroup
    wrapper.rotation.y = Math.PI / 2; // Rotate 90 degrees to point forward along camera view (Z-axis)

    // Parameterize offsets specifically for the GLTF model
    this.hipfirePosition.set(0.18, -0.16, -0.3);
    this.adsPosition.set(0, -0.045, -0.28); // center the scope vertically and horizontally

    gltfScene.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.mixer = new THREE.AnimationMixer(gltfScene);
    
    if (gltf.animations && Array.isArray(gltf.animations)) {
      console.log('Weapon animations found:', gltf.animations.map((c: any) => c.name));
      gltf.animations.forEach((clip: THREE.AnimationClip) => {
        const name = clip.name.toLowerCase();
        const action = this.mixer.clipAction(clip);
        this.actions[name] = action;

        if (name.includes('shoot') || name.includes('fire')) {
          this.actions['shoot'] = action;
        } else if (name.includes('reload')) {
          this.actions['reload'] = action;
        } else if (name.includes('idle')) {
          this.actions['idle'] = action;
        } else if (name.includes('aim')) {
          this.actions['aim'] = action;
        }
      });
    } else {
      console.log('No weapon animations found in model.');
    }

    if (this.actions['idle']) {
      this.actions['idle'].play();
    }

    // Muzzle flash light (centered)
    this.muzzleFlashLight.position.set(0, -0.02, -0.9);
    this.weaponGroup.add(this.muzzleFlashLight);

    this.weaponGroup.name = 'weapon';
  }

  private buildWeaponModel(): void {
    // Main body / receiver
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, -0.22, -0.5);
    this.weaponGroup.add(body);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.9, 8);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2, metalness: 0.9 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.19, -0.95);
    this.weaponGroup.add(barrel);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.05, 0.12, 0.35);
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7, metalness: 0.1 });
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.set(0, -0.25, -0.05);
    this.weaponGroup.add(stock);

    // Scope
    const scopeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8);
    const scopeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
    const scope = new THREE.Mesh(scopeGeo, scopeMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, -0.13, -0.5);
    this.weaponGroup.add(scope);

    // Scope lens (front)
    const lensGeo = new THREE.CircleGeometry(0.025, 16);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      roughness: 0,
      metalness: 1,
      transparent: true,
      opacity: 0.5,
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, -0.13, -0.625);
    this.weaponGroup.add(lens);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.04, 0.12, 0.08);
    const magMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 });
    const mag = new THREE.Mesh(magGeo, magMat);
    mag.position.set(0, -0.32, -0.42);
    this.weaponGroup.add(mag);

    // Bolt handle (offset to the right of the gun)
    const boltGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2, metalness: 0.9 });
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(0.04, -0.17, -0.38);
    this.weaponGroup.add(bolt);

    // Muzzle flash light
    this.muzzleFlashLight.position.set(0, -0.19, -1.45);
    this.weaponGroup.add(this.muzzleFlashLight);

    // Offsets specifically for the procedural model
    this.hipfirePosition.set(0.22, -0.22, -0.45);
    this.adsPosition.set(0, 0.13, -0.4); // Centers procedural scope vertically (scope is at -0.13 relative to body)

    this.weaponGroup.name = 'weapon';
  }

  // --- Fire ---
  fire(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    physics: PhysicsWorld,
    enemies: THREE.Object3D[],
    mapObstacles: THREE.Object3D[],
    audio: AudioManager,
    hud: HUD,
    scene: THREE.Scene,
    onHitEnemy: (enemyPart: THREE.Object3D, point: THREE.Vector3) => { killed: boolean; headshot: boolean; name: string } | null,
  ): void {
    if (!this.canFire || this.isReloading || this.ammoInMag <= 0) {
      if (this.ammoInMag <= 0) {
        audio.playEmpty();
        if (this.ammoReserve > 0) this.startReload(audio, hud);
      }
      return;
    }

    this.canFire = false;
    this.ammoInMag--;

    // Play shoot animation
    if (this.actions['shoot']) {
      this.actions['shoot'].reset().play();
    }

    // Sound
    audio.playSniper();

    // Muzzle flash
    this.muzzleFlashLight.intensity = 5;
    this.muzzleFlashTimer = WEAPON.MUZZLE_FLASH_DURATION;

    // Recoil
    this.recoilPitch = WEAPON.RECOIL_PITCH;
    this.recoilRecovery = WEAPON.RECOIL_PITCH;

    // Raycast for bullet
    const allTargets = [...enemies, ...mapObstacles];
    const hits = physics.raycast(origin, direction, WEAPON.BULLET_RANGE, allTargets);

    if (hits.length > 0) {
      const hit = hits[0];

      // Tracer line
      this.createTracer(origin, hit.point, scene);

      // Check if we hit an enemy
      const result = onHitEnemy(hit.object, hit.point);
      if (result) {
        if (result.killed) {
          audio.playKillConfirm();
          hud.showHitMarker(true);
          hud.addKill(result.name, result.headshot);
        } else {
          audio.playHitMarker();
          hud.showHitMarker(false);
        }
      } else {
        audio.playImpact();
        // Bullet hole decal (small dark circle)
        this.createBulletHole(hit.point, hit.face?.normal || new THREE.Vector3(0, 1, 0), scene);
      }
    } else {
      // Miss — tracer into the distance
      const endPoint = origin.clone().add(direction.clone().multiplyScalar(WEAPON.BULLET_RANGE));
      this.createTracer(origin, endPoint, scene);
    }

    // Bolt action delay
    this.isBoltAction = true;
    this.boltActionTimer = WEAPON.BOLT_ACTION_TIME;
    hud.showBoltAction(true);

    setTimeout(() => {
      audio.playBoltAction();
    }, 200);

    // Update HUD
    hud.updateAmmo(this.ammoInMag, this.ammoReserve);

    // Auto-reload on empty
    if (this.ammoInMag === 0 && this.ammoReserve > 0) {
      setTimeout(() => {
        this.startReload(audio, hud);
      }, WEAPON.BOLT_ACTION_TIME * 1000 + 200);
    }
  }

  private createTracer(from: THREE.Vector3, to: THREE.Vector3, scene: THREE.Scene): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xFFDD88,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    this.tracers.push({ line, timer: WEAPON.TRACER_DURATION });
  }

  private createBulletHole(point: THREE.Vector3, normal: THREE.Vector3, scene: THREE.Scene): void {
    const geo = new THREE.CircleGeometry(0.05, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const hole = new THREE.Mesh(geo, mat);
    hole.position.copy(point).add(normal.clone().multiplyScalar(0.01));
    hole.lookAt(point.clone().add(normal));
    scene.add(hole);

    // Remove after 30 seconds
    setTimeout(() => scene.remove(hole), 30000);
  }

  // --- Reload ---
  startReload(audio: AudioManager, hud: HUD): void {
    if (this.isReloading || this.ammoInMag === WEAPON.MAG_SIZE || this.ammoReserve <= 0) return;

    this.isReloading = true;
    this.reloadTimer = WEAPON.RELOAD_TIME;
    hud.showReloading(true);

    if (this.actions['reload']) {
      this.actions['reload'].reset().play();
    }

    audio.playReload();
  }

  // --- ADS ---
  toggleADS(enable: boolean): void {
    this.isADS = enable;
  }

  // --- Hold Breath ---
  setHoldBreath(holding: boolean): void {
    if (this.isADS && holding && this.breathRemaining > 0) {
      this.holdingBreath = true;
    } else {
      this.holdingBreath = false;
    }
  }

  // --- Update ---
  update(delta: number, hud: HUD, stance: Stance): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // ADS transition
    const adsTarget = this.isADS ? 1 : 0;
    const adsSpeed = 1 / WEAPON.ADS_TRANSITION_TIME;
    this.adsProgress += (adsTarget - this.adsProgress) * Math.min(1, adsSpeed * delta * 3);

    // FOV
    this.currentFOV = THREE.MathUtils.lerp(WEAPON.NORMAL_FOV, WEAPON.ADS_FOV, this.adsProgress);
    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();

    // Scope overlay
    hud.showScope(this.adsProgress > 0.88);

    // Weapon visibility (hide when fully ADS to prevent clipping through reticle)
    this.weaponGroup.visible = this.adsProgress < 0.88;

    // Weapon position and rotation (smoothly center and align scope during ADS)
    if (!this.isADS) {
      // Lerp position to hipfire position
      this.weaponGroup.position.lerp(this.hipfirePosition, delta * 8);

      // Lerp rotation to base hipfire angles (canted slightly in + roll) + mouse lag
      const targetRotX = this.weaponLagY * 0.8;
      const targetRotY = 0.06 - this.weaponLagX * 1.5; // slight inward rotation
      const targetRotZ = -0.04; // slight tilt

      this.weaponGroup.rotation.x += (targetRotX - this.weaponGroup.rotation.x) * Math.min(1, delta * 8);
      this.weaponGroup.rotation.y += (targetRotY - this.weaponGroup.rotation.y) * Math.min(1, delta * 8);
      this.weaponGroup.rotation.z += (targetRotZ - this.weaponGroup.rotation.z) * Math.min(1, delta * 8);
    } else {
      // Lerp position to perfectly align the scope center
      this.weaponGroup.position.lerp(this.adsPosition, delta * 12);

      // Reset rotations to aim perfectly straight
      this.weaponGroup.rotation.x += (0 - this.weaponGroup.rotation.x) * Math.min(1, delta * 12);
      this.weaponGroup.rotation.y += (0 - this.weaponGroup.rotation.y) * Math.min(1, delta * 12);
      this.weaponGroup.rotation.z += (0 - this.weaponGroup.rotation.z) * Math.min(1, delta * 12);
    }

    // Sprint weapon position (lower the weapon)
    // handled externally via isSprinting check

    // Scope — sway when ADS
    if (this.isADS) {
      // Build sway multiplier
      let swayMult = WEAPON.SCOPE_SWAY_AMOUNT;
      if (this.holdingBreath) swayMult *= WEAPON.HOLD_BREATH_SWAY_MULTIPLIER;
      if (stance === 'PRONE') swayMult *= WEAPON.PRONE_SWAY_MULTIPLIER;

      // Advance sway time only while ADS
      this.swayTime += delta * WEAPON.SCOPE_SWAY_SPEED;

      // Figure-8 sway: sin(t) on X, sin(2t) on Y
      const swayX = Math.sin(this.swayTime) * swayMult;
      const swayY = Math.sin(this.swayTime * 2) * swayMult * 0.5;
      this.camera.rotation.z = swayX;
      this.camera.rotation.x += swayY * 0.02; // very subtle vertical drift
    } else {
      // Hip fire — mouse movement lag
      this.weaponLagX += (this.lastMouseDX * 0.0003 - this.weaponLagX) * Math.min(1, delta * 8);
      this.weaponLagY += (this.lastMouseDY * 0.0003 - this.weaponLagY) * Math.min(1, delta * 8);
      this.lastMouseDX = 0;
      this.lastMouseDY = 0;

      this.camera.rotation.z = 0;
      this.swayTime = 0;
    }

    // Hold breath
    if (this.holdingBreath) {
      this.breathRemaining -= delta;
      if (this.breathRemaining <= 0) {
        this.breathRemaining = 0;
        this.holdingBreath = false;
      }
      this.breathRegenTimer = 0;
    } else {
      this.breathRegenTimer += delta;
      if (this.breathRegenTimer > 2) {
        this.breathRemaining = Math.min(WEAPON.HOLD_BREATH_DURATION, this.breathRemaining + delta * 1.5);
      }
    }
    hud.updateBreath(this.breathRemaining, WEAPON.HOLD_BREATH_DURATION);

    // Recoil recovery
    if (this.recoilRecovery > 0) {
      const recovery = WEAPON.RECOIL_RECOVERY_SPEED * delta;
      this.recoilRecovery = Math.max(0, this.recoilRecovery - recovery);
    }

    // Bolt action timer
    if (this.isBoltAction) {
      this.boltActionTimer -= delta;
      if (this.boltActionTimer <= 0) {
        this.isBoltAction = false;
        this.canFire = true;
        hud.showBoltAction(false);
      }
    }

    // Reload timer
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        const needed = WEAPON.MAG_SIZE - this.ammoInMag;
        const available = Math.min(needed, this.ammoReserve);
        this.ammoInMag += available;
        this.ammoReserve -= available;
        this.isReloading = false;
        this.canFire = true;
        hud.showReloading(false);
        hud.updateAmmo(this.ammoInMag, this.ammoReserve);
      }
    }

    // Muzzle flash
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= delta;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashLight.intensity = 0;
      }
    }

    // Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].timer -= delta;
      const mat = this.tracers[i].line.material as THREE.LineBasicMaterial;
      mat.opacity = this.tracers[i].timer / WEAPON.TRACER_DURATION;
      if (this.tracers[i].timer <= 0) {
        this.tracers[i].line.removeFromParent();
        (this.tracers[i].line.geometry as THREE.BufferGeometry).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  getRecoilPitch(): number {
    const r = this.recoilPitch;
    this.recoilPitch = 0;
    return r;
  }

  setSprinting(isSprinting: boolean): void {
    if (isSprinting) {
      this.weaponGroup.position.set(0.35, -0.4, -0.3);
      this.weaponGroup.rotation.x = -0.3;
    } else {
      this.weaponGroup.rotation.x = 0;
    }
  }

}
