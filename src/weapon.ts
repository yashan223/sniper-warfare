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

  // Recoil
  private recoilPitch = 0;
  private recoilRecovery = 0;

  // Weapon model
  private weaponGroup = new THREE.Group();
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashTimer = 0;

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
    wrapper.position.set(0.18, -0.15, -0.35); // offset to the bottom right
    wrapper.rotation.y = Math.PI / 2; // Rotate 90 degrees to point forward along camera view (Z-axis)

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

    // Muzzle flash light
    this.muzzleFlashLight.position.set(0.18, -0.12, -0.9);
    this.weaponGroup.add(this.muzzleFlashLight);

    // Add hands/arms view model to the wrapper
    this.addProceduralHandsGLTF(wrapper);

    this.weaponGroup.name = 'weapon';
  }

  private buildWeaponModel(): void {
    // Main body / receiver
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0.25, -0.22, -0.5);
    this.weaponGroup.add(body);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.9, 8);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2, metalness: 0.9 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.25, -0.19, -0.95);
    this.weaponGroup.add(barrel);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.05, 0.12, 0.35);
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7, metalness: 0.1 });
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.set(0.25, -0.25, -0.05);
    this.weaponGroup.add(stock);

    // Scope
    const scopeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8);
    const scopeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
    const scope = new THREE.Mesh(scopeGeo, scopeMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0.25, -0.13, -0.5);
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
    lens.position.set(0.25, -0.13, -0.625);
    this.weaponGroup.add(lens);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.04, 0.12, 0.08);
    const magMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 });
    const mag = new THREE.Mesh(magGeo, magMat);
    mag.position.set(0.25, -0.32, -0.42);
    this.weaponGroup.add(mag);

    // Bolt handle
    const boltGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2, metalness: 0.9 });
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(0.29, -0.17, -0.38);
    this.weaponGroup.add(bolt);

    // Muzzle flash light
    this.muzzleFlashLight.position.set(0.25, -0.19, -1.45);
    this.weaponGroup.add(this.muzzleFlashLight);

    // Add hands/arms view model to the weapon group
    this.addProceduralHandsProcedural(this.weaponGroup);

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
    hud.showScope(this.adsProgress > 0.85);

    // Weapon visibility (hide when fully ADS)
    this.weaponGroup.visible = this.adsProgress < 0.85;

    // Weapon position (move to center when ADS)
    if (!this.isADS) {
      this.weaponGroup.position.lerp(new THREE.Vector3(0.3, -0.25, -0.4), delta * 8);
    } else {
      this.weaponGroup.position.lerp(new THREE.Vector3(0, -0.15, -0.5), delta * 8);
    }

    // Sprint weapon position (lower the weapon)
    // handled externally via isSprinting check

    // Scope — always steady (no sway)
    if (this.isADS) {
      this.camera.rotation.z = 0;
    } else {
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

  private addProceduralHandsGLTF(scene: THREE.Object3D): void {
    // Sleeve material (tactical dark grey/blue fabric)
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x4a4d52,
      roughness: 0.9,
      metalness: 0.05,
    });

    // Glove material (dark black tactical leather gloves)
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f22,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Skin/Wrist connector (black/dark grey wristband)
    const wristMat = new THREE.MeshStandardMaterial({
      color: 0x242428,
      roughness: 0.9,
      metalness: 0.1,
    });

    // --- RIGHT HAND & ARM (Holding stock / grip) ---
    // Right Hand Glove
    const rightHandGeo = new THREE.BoxGeometry(0.18, 0.16, 0.28);
    const rightHand = new THREE.Mesh(rightHandGeo, gloveMat);
    rightHand.castShadow = true;
    rightHand.receiveShadow = true;
    // Positioned near trigger / pistol grip in unscaled local coordinates
    rightHand.position.set(0.38, -0.18, 0.08);
    rightHand.rotation.set(-0.2, 0.4, -0.1);
    scene.add(rightHand);

    // Right Wrist cuff
    const rightWristGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.08, 8);
    const rightWrist = new THREE.Mesh(rightWristGeo, wristMat);
    rightWrist.castShadow = true;
    rightWrist.position.set(0.52, -0.28, 0.18);
    rightWrist.rotation.set(Math.PI / 4, 0, Math.PI / 6);
    scene.add(rightWrist);

    // Right Arm Sleeve
    const rightArmGeo = new THREE.CylinderGeometry(0.13, 0.16, 2.2, 8);
    const rightArm = new THREE.Mesh(rightArmGeo, sleeveMat);
    rightArm.castShadow = true;
    rightArm.receiveShadow = true;
    rightArm.position.set(0.85, -0.62, 0.42);
    rightArm.rotation.set(1.0, 0, 0.5);
    scene.add(rightArm);

    // --- LEFT HAND & ARM (Supporting under the barrel) ---
    // Left Hand Glove
    const leftHandGeo = new THREE.BoxGeometry(0.18, 0.15, 0.28);
    const leftHand = new THREE.Mesh(leftHandGeo, gloveMat);
    leftHand.castShadow = true;
    leftHand.receiveShadow = true;
    // Positioned forward under handguard in unscaled local coordinates
    leftHand.position.set(-0.68, -0.12, -0.08);
    leftHand.rotation.set(0.1, -0.2, -0.4);
    scene.add(leftHand);

    // Left Wrist cuff
    const leftWristGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.08, 8);
    const leftWrist = new THREE.Mesh(leftWristGeo, wristMat);
    leftWrist.castShadow = true;
    leftWrist.position.set(-0.54, -0.22, -0.16);
    leftWrist.rotation.set(Math.PI / 4, 0, -Math.PI / 6);
    scene.add(leftWrist);

    // Left Arm Sleeve
    const leftArmGeo = new THREE.CylinderGeometry(0.13, 0.16, 2.2, 8);
    const leftArm = new THREE.Mesh(leftArmGeo, sleeveMat);
    leftArm.castShadow = true;
    leftArm.receiveShadow = true;
    leftArm.position.set(-0.25, -0.58, -0.32);
    leftArm.rotation.set(0.9, 0, -0.5);
    scene.add(leftArm);
  }

  private addProceduralHandsProcedural(parent: THREE.Group): void {
    // Sleeve material (tactical dark grey/blue fabric)
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x2e3138,
      roughness: 0.85,
      metalness: 0.05,
    });

    // Glove material (dark black tactical leather gloves)
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.6,
      metalness: 0.15,
    });

    // Skin/Wrist connector (black/dark grey wristband)
    const wristMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.9,
      metalness: 0.1,
    });

    const baseX = 0.25;
    const baseY = -0.22;
    const baseZ = -0.5;

    // --- RIGHT HAND & ARM ---
    const rightHandGeo = new THREE.BoxGeometry(0.045, 0.045, 0.07);
    const rightHand = new THREE.Mesh(rightHandGeo, gloveMat);
    rightHand.castShadow = true;
    rightHand.receiveShadow = true;
    rightHand.position.set(baseX + 0.06, baseY - 0.08, baseZ + 0.05);
    rightHand.rotation.set(-0.2, -0.4, 0.1);
    parent.add(rightHand);

    const rightWristGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8);
    const rightWrist = new THREE.Mesh(rightWristGeo, wristMat);
    rightWrist.castShadow = true;
    rightWrist.position.set(baseX + 0.08, baseY - 0.11, baseZ + 0.1);
    rightWrist.rotation.set(Math.PI / 4, 0, -Math.PI / 6);
    parent.add(rightWrist);

    const rightArmGeo = new THREE.CylinderGeometry(0.038, 0.045, 0.35, 8);
    const rightArm = new THREE.Mesh(rightArmGeo, sleeveMat);
    rightArm.castShadow = true;
    rightArm.receiveShadow = true;
    rightArm.position.set(baseX + 0.12, baseY - 0.19, baseZ + 0.22);
    rightArm.rotation.set(0.9, 0, -0.4);
    parent.add(rightArm);

    // --- LEFT HAND & ARM ---
    const leftHandGeo = new THREE.BoxGeometry(0.045, 0.04, 0.07);
    const leftHand = new THREE.Mesh(leftHandGeo, gloveMat);
    leftHand.castShadow = true;
    leftHand.receiveShadow = true;
    leftHand.position.set(baseX - 0.03, baseY - 0.06, baseZ - 0.15);
    leftHand.rotation.set(0.1, 0.2, 0.4);
    parent.add(leftHand);

    const leftWristGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8);
    const leftWrist = new THREE.Mesh(leftWristGeo, wristMat);
    leftWrist.castShadow = true;
    leftWrist.position.set(baseX - 0.06, baseY - 0.1, baseZ - 0.08);
    leftWrist.rotation.set(Math.PI / 4, 0, Math.PI / 6);
    parent.add(leftWrist);

    const leftArmGeo = new THREE.CylinderGeometry(0.038, 0.045, 0.35, 8);
    const leftArm = new THREE.Mesh(leftArmGeo, sleeveMat);
    leftArm.castShadow = true;
    leftArm.receiveShadow = true;
    leftArm.position.set(baseX - 0.1, baseY - 0.19, baseZ + 0.08);
    leftArm.rotation.set(0.8, 0, 0.4);
    parent.add(leftArm);
  }
}
