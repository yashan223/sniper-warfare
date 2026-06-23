// ============================================================
// ENEMIES — AI soldiers with patrol/alert/combat states
// ============================================================

import * as THREE from 'three';
import { ENEMY, EnemyState, Stance } from './constants';
import { PhysicsWorld } from './physics';
import { AudioManager } from './audio';

export interface EnemyData {
  group: THREE.Group;
  headMesh: THREE.Mesh;
  bodyMesh: THREE.Mesh;
  state: EnemyState;
  health: number;
  position: THREE.Vector3;
  waypoints: THREE.Vector3[];
  currentWaypoint: number;
  alertTimer: number;
  reactionTimer: number;
  fireTimer: number;
  name: string;
  rotation: number;
  deathTimer: number;
}

export class EnemyManager {
  private enemies: EnemyData[] = [];
  private allEnemyMeshes: THREE.Object3D[] = [];
  kills = 0;
  headshots = 0;

  // Reusable vectors to avoid per-frame allocations
  private _dirToPlayer = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _yAxis = new THREE.Vector3(0, 1, 0);
  private _eyePos = new THREE.Vector3();
  private _patrolDir = new THREE.Vector3();
  private _frameCounter = 0;

  // Shared materials for all enemies
  private static skinMat = new THREE.MeshLambertMaterial({ color: 0xD4A574 });
  private static uniformMat = new THREE.MeshLambertMaterial({ color: 0x4A5A3A });
  private static bootMat = new THREE.MeshLambertMaterial({ color: 0x2A2A1A });
  private static helmetMat = new THREE.MeshLambertMaterial({ color: 0x3A4A2A });
  private static rifleMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  getEnemyMeshes(): THREE.Object3D[] {
    return this.allEnemyMeshes;
  }

  getEnemies(): EnemyData[] {
    return this.enemies;
  }

  spawnEnemies(
    spawnPoints: { position: THREE.Vector3; waypoints: THREE.Vector3[] }[],
    scene: THREE.Scene
  ): void {
    const names = [
      'Zakhaev', 'Al-Asad', 'Viktor', 'Imran', 'Yuri',
      'Makarov', 'Kamarov', 'Griggs', 'Jackson', 'Volker',
    ];

    const count = Math.min(ENEMY.TOTAL_ENEMIES, spawnPoints.length);

    for (let i = 0; i < count; i++) {
      const sp = spawnPoints[i % spawnPoints.length];
      const enemy = this.createEnemy(
        sp.position.clone(),
        sp.waypoints.map((w) => w.clone()),
        names[i % names.length]
      );
      this.enemies.push(enemy);
      scene.add(enemy.group);
      this.allEnemyMeshes.push(enemy.headMesh, enemy.bodyMesh);
    }
  }

  private createEnemy(
    position: THREE.Vector3,
    waypoints: THREE.Vector3[],
    name: string
  ): EnemyData {
    const group = new THREE.Group();
    group.position.copy(position);

    // Shared geometries
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    const bodyMesh = new THREE.Mesh(bodyGeo, EnemyManager.uniformMat);
    bodyMesh.position.y = 1.05;
    bodyMesh.castShadow = true;
    bodyMesh.userData = { type: 'body', enemyName: name };
    group.add(bodyMesh);

    const headGeo = new THREE.BoxGeometry(0.25, 0.28, 0.25);
    const headMesh = new THREE.Mesh(headGeo, EnemyManager.skinMat);
    headMesh.position.y = 1.55;
    headMesh.userData = { type: 'head', enemyName: name };
    group.add(headMesh);

    const helmetGeo = new THREE.BoxGeometry(0.3, 0.15, 0.3);
    const helmet = new THREE.Mesh(helmetGeo, EnemyManager.helmetMat);
    helmet.position.y = 1.73;
    group.add(helmet);

    const armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
    [-0.32, 0.32].forEach((xOff) => {
      const arm = new THREE.Mesh(armGeo, EnemyManager.uniformMat);
      arm.position.set(xOff, 0.95, 0);
      group.add(arm);
    });

    const legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
    [-0.13, 0.13].forEach((xOff) => {
      const leg = new THREE.Mesh(legGeo, EnemyManager.uniformMat);
      leg.position.set(xOff, 0.35, 0);
      group.add(leg);
    });

    const bootGeo = new THREE.BoxGeometry(0.2, 0.12, 0.28);
    [-0.13, 0.13].forEach((xOff) => {
      const boot = new THREE.Mesh(bootGeo, EnemyManager.bootMat);
      boot.position.set(xOff, 0.06, 0.03);
      group.add(boot);
    });

    const rifleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.7);
    const rifle = new THREE.Mesh(rifleGeo, EnemyManager.rifleMat);
    rifle.position.set(0.35, 0.95, -0.15);
    group.add(rifle);

    group.name = `enemy_${name}`;

    return {
      group,
      headMesh,
      bodyMesh,
      state: EnemyState.PATROL,
      health: ENEMY.MAX_HEALTH,
      position: position.clone(),
      waypoints,
      currentWaypoint: 0,
      alertTimer: 0,
      reactionTimer: 0,
      fireTimer: 0,
      name,
      rotation: 0,
      deathTimer: 0,
    };
  }

  // --- Check if a hit mesh belongs to an enemy ---
  processHit(
    hitObject: THREE.Object3D,
    _hitPoint: THREE.Vector3
  ): { killed: boolean; headshot: boolean; name: string } | null {
    // Walk up to find userData
    let obj: THREE.Object3D | null = hitObject;
    while (obj) {
      if (obj.userData?.type === 'head' || obj.userData?.type === 'body') {
        break;
      }
      obj = obj.parent;
    }
    if (!obj || !obj.userData?.enemyName) return null;

    const enemy = this.enemies.find((e) => e.name === obj!.userData.enemyName);
    if (!enemy || enemy.state === EnemyState.DEAD) return null;

    const isHeadshot = obj.userData.type === 'head';
    const damage = isHeadshot ? 150 : 70; // headshot = instant kill

    enemy.health -= damage;
    const killed = enemy.health <= 0;

    if (killed) {
      this.killEnemy(enemy);
      this.kills++;
      if (isHeadshot) this.headshots++;
    } else {
      // Alert the enemy
      enemy.state = EnemyState.COMBAT;
      enemy.reactionTimer = 0;
    }

    return { killed, headshot: isHeadshot, name: enemy.name };
  }

  private killEnemy(enemy: EnemyData): void {
    enemy.state = EnemyState.DEAD;
    enemy.health = 0;
    enemy.deathTimer = 0;

    // Death animation: tip over
    // Will be animated in update
  }

  // --- Update all enemies ---
  update(
    delta: number,
    playerPos: THREE.Vector3,
    playerStance: Stance,
    physics: PhysicsWorld,
    obstacles: THREE.Object3D[],
    audio: AudioManager,
    onPlayerHit: (damage: number, fromPos: THREE.Vector3) => void
  ): void {
    this._frameCounter++;
    // Only do expensive LOS checks on alternating frames per enemy
    const doLOS = this._frameCounter % 2 === 0;

    for (const enemy of this.enemies) {
      if (enemy.state === EnemyState.DEAD) {
        this.updateDead(enemy, delta);
        continue;
      }

      const dx = playerPos.x - enemy.position.x;
      const dz = playerPos.z - enemy.position.z;
      const distToPlayerSq = dx * dx + dz * dz;
      const distToPlayer = Math.sqrt(distToPlayerSq);

      this._dirToPlayer.set(dx, playerPos.y - enemy.position.y, dz).normalize();

      // Detection range based on player stance
      let detectRange: number;
      switch (playerStance) {
        case Stance.CROUCHING: detectRange = ENEMY.DETECT_RANGE_CROUCHING; break;
        case Stance.PRONE: detectRange = ENEMY.DETECT_RANGE_PRONE; break;
        default: detectRange = ENEMY.DETECT_RANGE_STANDING;
      }

      // Quick distance cull — skip expensive checks if too far
      let canSeePlayer = false;
      if (distToPlayer < detectRange) {
        // Check FOV
        this._forward.set(0, 0, -1).applyAxisAngle(this._yAxis, enemy.rotation);
        const angleToPlayer = this._forward.angleTo(this._dirToPlayer);

        if (angleToPlayer < ENEMY.FOV / 2) {
          // Only do LOS raycast every other frame to save perf
          if (doLOS) {
            this._eyePos.set(enemy.position.x, 1.5, enemy.position.z);
            canSeePlayer = physics.hasLineOfSight(this._eyePos, playerPos, obstacles);
          } else {
            // On skip frames, use the previous state assumption
            canSeePlayer = enemy.state === EnemyState.COMBAT || enemy.state === EnemyState.ALERT;
          }
        }
      }

      switch (enemy.state) {
        case EnemyState.PATROL:
          this.updatePatrol(enemy, delta);
          if (canSeePlayer) {
            enemy.state = EnemyState.ALERT;
            enemy.alertTimer = ENEMY.ALERT_DURATION;
            enemy.reactionTimer = ENEMY.REACTION_TIME;
          }
          break;

        case EnemyState.ALERT:
          // Turn toward player
          enemy.rotation = Math.atan2(this._dirToPlayer.x, this._dirToPlayer.z) + Math.PI;
          enemy.reactionTimer -= delta;

          if (enemy.reactionTimer <= 0) {
            enemy.state = EnemyState.COMBAT;
          }

          if (!canSeePlayer) {
            enemy.alertTimer -= delta;
            if (enemy.alertTimer <= 0) {
              enemy.state = EnemyState.PATROL;
            }
          }
          break;

        case EnemyState.COMBAT:
          // Face player
          enemy.rotation = Math.atan2(this._dirToPlayer.x, this._dirToPlayer.z) + Math.PI;

          // Fire at player
          enemy.fireTimer -= delta;
          if (enemy.fireTimer <= 0 && canSeePlayer) {
            enemy.fireTimer = 1 / ENEMY.FIRE_RATE;
            this.fireAtPlayer(enemy, playerPos, distToPlayer, audio, onPlayerHit);
          }

          // Strafe/reposition occasionally
          if (Math.random() < delta * 0.3) {
            const strafeDir = new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              0,
              (Math.random() - 0.5) * 2
            ).normalize();
            enemy.position.add(strafeDir.multiplyScalar(ENEMY.COMBAT_SPEED * delta));
          }

          if (!canSeePlayer) {
            enemy.alertTimer = ENEMY.ALERT_DURATION;
            enemy.state = EnemyState.ALERT;
          }
          break;
      }

      // Update visual position
      enemy.group.position.copy(enemy.position);
      enemy.group.rotation.y = enemy.rotation;
    }
  }

  private updatePatrol(enemy: EnemyData, delta: number): void {
    if (enemy.waypoints.length === 0) return;

    const target = enemy.waypoints[enemy.currentWaypoint];
    this._patrolDir.subVectors(target, enemy.position);
    this._patrolDir.y = 0;
    const dist = this._patrolDir.length();

    if (dist < 1) {
      enemy.currentWaypoint = (enemy.currentWaypoint + 1) % enemy.waypoints.length;
    } else {
      this._patrolDir.normalize();
      enemy.position.addScaledVector(this._patrolDir, ENEMY.PATROL_SPEED * delta);
      enemy.rotation = Math.atan2(this._patrolDir.x, this._patrolDir.z) + Math.PI;
    }
  }

  private updateDead(enemy: EnemyData, delta: number): void {
    enemy.deathTimer += delta;

    // Fall over animation
    if (enemy.group.rotation.x > -Math.PI / 2) {
      enemy.group.rotation.x -= delta * 3;
      enemy.group.position.y -= delta * 2;
      if (enemy.group.position.y < -0.5) {
        enemy.group.position.y = -0.5;
      }
    }
  }

  private fireAtPlayer(
    enemy: EnemyData,
    playerPos: THREE.Vector3,
    distance: number,
    audio: AudioManager,
    onPlayerHit: (damage: number, fromPos: THREE.Vector3) => void
  ): void {
    audio.playEnemyShot(distance);

    // Accuracy check with spread
    const spread = ENEMY.ACCURACY;
    const hitChance = Math.max(0.1, 1 - (distance / ENEMY.DETECT_RANGE_STANDING) * 0.7);

    if (Math.random() < hitChance * (1 - spread)) {
      onPlayerHit(ENEMY.DAMAGE, enemy.position);
    }
  }

  // Get alive count
  getAliveCount(): number {
    return this.enemies.filter((e) => e.state !== EnemyState.DEAD).length;
  }
}
