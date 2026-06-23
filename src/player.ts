// ============================================================
// PLAYER — CoD4-style FPS controller
// ============================================================

import * as THREE from 'three';
import { PLAYER, Stance } from './constants';
import { PhysicsWorld } from './physics';
import { AudioManager } from './audio';

export class Player {
  // Camera & scene
  camera: THREE.PerspectiveCamera;
  private pitchObject = new THREE.Object3D();
  private yawObject = new THREE.Object3D();

  // Position & physics
  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  private verticalVelocity = 0;
  private isOnGround = true;

  // Stance
  stance = Stance.STANDING;
  private currentEyeHeight: number = PLAYER.STAND_HEIGHT;
  private targetEyeHeight: number = PLAYER.STAND_HEIGHT;

  // Sprint
  isSprinting = false;
  stamina: number = PLAYER.SPRINT_DURATION;

  // Input state
  private keys: Record<string, boolean> = {};
  private moveDirection = new THREE.Vector3();

  // Head bob
  private bobTimer = 0;
  private bobOffset = 0;

  // Footstep
  private footstepTimer = 0;

  // Health
  health: number = PLAYER.MAX_HEALTH;
  private healthRegenTimer = 0;
  isDead = false;

  // Movement state
  isMoving = false;
  private currentSpeed = 0;

  // Mouse sensitivity (can be adjusted)
  sensitivity = PLAYER.MOUSE_SENSITIVITY;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.position = new THREE.Vector3(-45, PLAYER.STAND_HEIGHT, -45);

    // Set up camera hierarchy: yaw (Y rotation) → pitch (X rotation) → camera
    this.pitchObject.add(camera);
    this.yawObject.add(this.pitchObject);
    this.yawObject.position.copy(this.position);

    this.setupInput();
  }

  getObject(): THREE.Object3D {
    return this.yawObject;
  }

  getDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    return dir;
  }

  getWorldPosition(): THREE.Vector3 {
    return this.yawObject.position.clone();
  }

  getEyePosition(): THREE.Vector3 {
    const pos = this.yawObject.position.clone();
    pos.y = this.currentEyeHeight + this.bobOffset;
    return pos;
  }

  private setupInput(): void {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.onMouseMove(e.movementX, e.movementY);
      }
    });
  }

  private onMouseMove(dx: number, dy: number): void {
    this.yawObject.rotation.y -= dx * this.sensitivity;
    this.pitchObject.rotation.x -= dy * this.sensitivity;
    // Clamp pitch
    this.pitchObject.rotation.x = Math.max(
      -Math.PI / 2 * 0.95,
      Math.min(Math.PI / 2 * 0.95, this.pitchObject.rotation.x)
    );
  }

  update(delta: number, physics: PhysicsWorld, audio: AudioManager, isADS: boolean): void {
    if (this.isDead) return;

    this.updateStance(delta);
    this.updateMovement(delta, physics, isADS, audio);
    this.updateHeadBob(delta);
    this.updateHealth(delta);
    this.updateStamina(delta);

    // Update yaw object position
    this.yawObject.position.x = this.position.x;
    this.yawObject.position.z = this.position.z;
    this.yawObject.position.y = this.currentEyeHeight + this.bobOffset;
  }

  private updateStance(delta: number): void {
    // Crouch toggle (C)
    if (this.keys['KeyC'] && !this.isSprinting) {
      this.keys['KeyC'] = false; // consume
      if (this.stance === Stance.CROUCHING) {
        this.stance = Stance.STANDING;
        this.targetEyeHeight = PLAYER.STAND_HEIGHT;
      } else {
        this.stance = Stance.CROUCHING;
        this.targetEyeHeight = PLAYER.CROUCH_HEIGHT;
      }
    }

    // Prone toggle (Z)
    if (this.keys['KeyZ'] && !this.isSprinting) {
      this.keys['KeyZ'] = false;
      if (this.stance === Stance.PRONE) {
        this.stance = Stance.CROUCHING;
        this.targetEyeHeight = PLAYER.CROUCH_HEIGHT;
      } else {
        this.stance = Stance.PRONE;
        this.targetEyeHeight = PLAYER.PRONE_HEIGHT;
      }
    }

    // Smooth height transition
    const diff = this.targetEyeHeight - this.currentEyeHeight;
    if (Math.abs(diff) > 0.01) {
      this.currentEyeHeight += Math.sign(diff) * PLAYER.STANCE_TRANSITION_SPEED * delta;
      // Clamp to target
      if (Math.abs(this.targetEyeHeight - this.currentEyeHeight) < 0.02) {
        this.currentEyeHeight = this.targetEyeHeight;
      }
    }
  }

  private updateMovement(delta: number, physics: PhysicsWorld, isADS: boolean, audio: AudioManager): void {
    // Determine target speed
    let speed: number;
    if (isADS) {
      speed = PLAYER.ADS_SPEED;
    } else if (this.isSprinting && this.stance === Stance.STANDING && this.stamina > 0) {
      speed = PLAYER.SPRINT_SPEED;
    } else {
      switch (this.stance) {
        case Stance.CROUCHING: speed = PLAYER.CROUCH_SPEED; break;
        case Stance.PRONE: speed = PLAYER.PRONE_SPEED; break;
        default: speed = PLAYER.WALK_SPEED;
      }
    }

    // Sprint detection
    this.isSprinting = this.keys['ShiftLeft'] && this.stance === Stance.STANDING && !isADS && this.stamina > 0;

    // Input direction
    this.moveDirection.set(0, 0, 0);
    if (this.keys['KeyW']) this.moveDirection.z -= 1;
    if (this.keys['KeyS']) this.moveDirection.z += 1;
    if (this.keys['KeyA']) this.moveDirection.x -= 1;
    if (this.keys['KeyD']) this.moveDirection.x += 1;

    // Can't move backward while sprinting
    if (this.isSprinting && this.moveDirection.z > 0) {
      this.isSprinting = false;
    }

    this.isMoving = this.moveDirection.length() > 0;

    if (this.isMoving) {
      this.moveDirection.normalize();

      // Rotate direction by yaw (Y-axis rotation matrix for local→world)
      const yaw = this.yawObject.rotation.y;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const newX = this.moveDirection.x * cos + this.moveDirection.z * sin;
      const newZ = -this.moveDirection.x * sin + this.moveDirection.z * cos;
      this.moveDirection.x = newX;
      this.moveDirection.z = newZ;

      // Accelerate toward target velocity
      const targetVelX = this.moveDirection.x * speed;
      const targetVelZ = this.moveDirection.z * speed;

      this.velocity.x += (targetVelX - this.velocity.x) * Math.min(1, PLAYER.ACCELERATION * delta);
      this.velocity.z += (targetVelZ - this.velocity.z) * Math.min(1, PLAYER.ACCELERATION * delta);
    } else {
      // Decelerate
      this.velocity.x *= Math.max(0, 1 - PLAYER.DECELERATION * delta);
      this.velocity.z *= Math.max(0, 1 - PLAYER.DECELERATION * delta);

      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    }

    this.currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // Jump
    if (this.keys['Space'] && this.isOnGround && this.stance !== Stance.PRONE) {
      this.verticalVelocity = PLAYER.JUMP_FORCE;
      this.isOnGround = false;
      // Stand up from crouch when jumping
      if (this.stance === Stance.CROUCHING) {
        this.stance = Stance.STANDING;
        this.targetEyeHeight = PLAYER.STAND_HEIGHT;
      }
    }

    // Gravity
    this.verticalVelocity += PLAYER.GRAVITY * delta;
    const desiredY = this.position.y + this.verticalVelocity * delta;

    // Ground collision
    if (desiredY <= PLAYER.STAND_HEIGHT) {
      this.position.y = PLAYER.STAND_HEIGHT;
      this.verticalVelocity = 0;
      this.isOnGround = true;
    } else {
      this.position.y = desiredY;
      this.isOnGround = false;
    }

    // Move with collision
    const desired = new THREE.Vector3(
      this.position.x + this.velocity.x * delta,
      this.position.y,
      this.position.z + this.velocity.z * delta
    );

    const resolved = physics.resolveMovement(
      this.position,
      desired,
      PLAYER.RADIUS,
      this.currentEyeHeight
    );

    this.position.x = resolved.x;
    this.position.z = resolved.z;

    // Footstep sounds
    if (this.isMoving && this.isOnGround && this.stance !== Stance.PRONE) {
      const stepInterval = this.isSprinting ? 0.3 : (this.stance === Stance.CROUCHING ? 0.6 : 0.45);
      this.footstepTimer += delta;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        if (this.stance !== Stance.CROUCHING) { // crouch = silent
          audio.playFootstep(this.currentSpeed / PLAYER.WALK_SPEED);
        }
      }
    }
  }

  private updateHeadBob(delta: number): void {
    if (this.isMoving && this.isOnGround) {
      const freq = PLAYER.HEAD_BOB_FREQUENCY * (this.isSprinting ? PLAYER.SPRINT_BOB_MULTIPLIER : 1);
      this.bobTimer += delta * freq;
      this.bobOffset = Math.sin(this.bobTimer) * PLAYER.HEAD_BOB_AMPLITUDE *
        (this.isSprinting ? PLAYER.SPRINT_BOB_MULTIPLIER : 1);
    } else {
      // Smoothly return to zero
      this.bobOffset *= 0.9;
      this.bobTimer = 0;
    }
  }

  private updateStamina(delta: number): void {
    if (this.isSprinting) {
      this.stamina -= delta;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isSprinting = false;
      }
    } else {
      this.stamina = Math.min(
        PLAYER.SPRINT_DURATION,
        this.stamina + PLAYER.SPRINT_REGEN_RATE * delta
      );
    }
  }

  private updateHealth(delta: number): void {
    if (this.health < PLAYER.MAX_HEALTH) {
      this.healthRegenTimer += delta;
      if (this.healthRegenTimer >= PLAYER.HEALTH_REGEN_DELAY) {
        this.health = Math.min(
          PLAYER.MAX_HEALTH,
          this.health + PLAYER.HEALTH_REGEN_RATE * delta
        );
      }
    }
  }

  takeDamage(amount: number, fromDirection?: THREE.Vector3): number {
    if (this.isDead) return 0;

    this.health -= amount;
    this.healthRegenTimer = 0; // Reset regen timer

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
    }

    return fromDirection ? this.getDamageAngle(fromDirection) : 0;
  }

  private getDamageAngle(fromDir: THREE.Vector3): number {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.yawObject.quaternion);
    return Math.atan2(
      forward.x * fromDir.z - forward.z * fromDir.x,
      forward.x * fromDir.x + forward.z * fromDir.z
    );
  }

  respawn(): void {
    this.health = PLAYER.MAX_HEALTH;
    this.isDead = false;
    this.position.set(-45, PLAYER.STAND_HEIGHT, -45);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.stance = Stance.STANDING;
    this.currentEyeHeight = PLAYER.STAND_HEIGHT;
    this.targetEyeHeight = PLAYER.STAND_HEIGHT;
    this.stamina = PLAYER.SPRINT_DURATION;
  }

  getYaw(): number {
    return this.yawObject.rotation.y;
  }

  getPitch(): number {
    return this.pitchObject.rotation.x;
  }
}
