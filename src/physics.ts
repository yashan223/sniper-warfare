// ============================================================
// PHYSICS — Collision detection, raycasting, gravity
// ============================================================

import * as THREE from 'three';
import { PLAYER } from './constants';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export class PhysicsWorld {
  private colliders: AABB[] = [];
  private raycaster = new THREE.Raycaster();
  private tempVec = new THREE.Vector3();

  addCollider(box: AABB): void {
    this.colliders.push(box);
  }

  addMeshCollider(mesh: THREE.Object3D): void {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    
    if (isNaN(box.min.x) || isNaN(box.max.x) || isNaN(box.min.y) || isNaN(box.max.y) || isNaN(box.min.z) || isNaN(box.max.z)) {
      console.warn(`[PHYSICS] Warning: Bounding box for ${mesh.name || 'unnamed'} contains NaN!`, box);
      return;
    }
    
    if (!isFinite(box.min.x) || !isFinite(box.max.x)) {
      console.warn(`[PHYSICS] Warning: Bounding box for ${mesh.name || 'unnamed'} is Infinite!`, box);
      return;
    }

    console.log(`[PHYSICS] Added collider: name=${mesh.name || 'unnamed'}, min=(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}), max=(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})`);
    
    this.colliders.push({
      min: box.min.clone(),
      max: box.max.clone(),
    });
  }

  clearColliders(): void {
    this.colliders = [];
  }

  getColliders(): AABB[] {
    return this.colliders;
  }

  // Check if a sphere (player capsule simplified) collides with any AABB
  checkSphereCollision(
    position: THREE.Vector3,
    radius: number,
    height: number
  ): THREE.Vector3 | null {
    let totalPush = new THREE.Vector3();
    let collided = false;

    for (const box of this.colliders) {
      // Check capsule as a series of spheres along height
      const steps = 3;
      for (let s = 0; s < steps; s++) {
        const checkY = position.y - height + (height * s) / (steps - 1);
        const checkPos = this.tempVec.set(position.x, checkY, position.z);

        // Find closest point on AABB to sphere center
        const closestX = Math.max(box.min.x, Math.min(checkPos.x, box.max.x));
        const closestY = Math.max(box.min.y, Math.min(checkPos.y, box.max.y));
        const closestZ = Math.max(box.min.z, Math.min(checkPos.z, box.max.z));

        const dx = checkPos.x - closestX;
        const dy = checkPos.y - closestY;
        const dz = checkPos.z - closestZ;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            totalPush.x += (dx / dist) * overlap;
            totalPush.y += (dy / dist) * overlap;
            totalPush.z += (dz / dist) * overlap;
            collided = true;
          }
        }
      }
    }

    return collided ? totalPush : null;
  }

  // Simple AABB-point test for XZ collision (walls only, ignoring Y)
  resolveMovement(
    currentPos: THREE.Vector3,
    desiredPos: THREE.Vector3,
    radius: number,
    eyeHeight: number
  ): THREE.Vector3 {
    const result = desiredPos.clone();

    for (const box of this.colliders) {
      // Skip if box is entirely below feet or above head
      const feetY = result.y - eyeHeight;
      const headY = result.y + 0.1;

      if (box.max.y <= feetY + PLAYER.STEP_HEIGHT || box.min.y >= headY) {
        continue;
      }

      // Check XZ overlap with inflated box (by radius)
      const inflatedMinX = box.min.x - radius;
      const inflatedMaxX = box.max.x + radius;
      const inflatedMinZ = box.min.z - radius;
      const inflatedMaxZ = box.max.z + radius;

      if (
        result.x > inflatedMinX &&
        result.x < inflatedMaxX &&
        result.z > inflatedMinZ &&
        result.z < inflatedMaxZ
      ) {
        // Determine which axis to push out (smallest penetration)
        const pushLeft = result.x - inflatedMinX;
        const pushRight = inflatedMaxX - result.x;
        const pushBack = result.z - inflatedMinZ;
        const pushFront = inflatedMaxZ - result.z;

        const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront);

        if (minPush === pushLeft) result.x = inflatedMinX;
        else if (minPush === pushRight) result.x = inflatedMaxX;
        else if (minPush === pushBack) result.z = inflatedMinZ;
        else result.z = inflatedMaxZ;
      }
    }

    return result;
  }

  // Ground height at a position (returns Y of the top surface)
  getGroundHeight(x: number, z: number): number {
    let maxY = 0; // default ground

    for (const box of this.colliders) {
      if (
        x >= box.min.x &&
        x <= box.max.x &&
        z >= box.min.z &&
        z <= box.max.z
      ) {
        // Check if this is a floor/ground surface (not too tall to be a wall)
        if (box.max.y <= PLAYER.STEP_HEIGHT + 0.1) {
          maxY = Math.max(maxY, box.max.y);
        }
      }
    }

    return maxY;
  }

  // Raycast against Three.js scene meshes for bullet hits
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number,
    objects: THREE.Object3D[]
  ): THREE.Intersection[] {
    this.raycaster.set(origin, direction.normalize());
    this.raycaster.far = maxDist;
    return this.raycaster.intersectObjects(objects, true);
  }

  // Check line of sight between two points
  hasLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    obstacles: THREE.Object3D[]
  ): boolean {
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = direction.length();
    direction.normalize();

    this.raycaster.set(from, direction);
    this.raycaster.far = distance;

    const intersections = this.raycaster.intersectObjects(obstacles, true);
    return intersections.length === 0;
  }

  // Check if a point is inside any collider
  isInsideCollider(point: THREE.Vector3): boolean {
    for (const box of this.colliders) {
      if (
        point.x >= box.min.x &&
        point.x <= box.max.x &&
        point.y >= box.min.y &&
        point.y <= box.max.y &&
        point.z >= box.min.z &&
        point.z <= box.max.z
      ) {
        return true;
      }
    }
    return false;
  }
}
