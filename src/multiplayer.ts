import * as THREE from 'three';
import { ref, set, onValue, onDisconnect, remove, update } from 'firebase/database';
import { db } from './firebase';
import { Stance } from './constants';

export interface NetworkPlayer {
  uid: string;
  displayName: string;
  group: THREE.Group;
  headMesh: THREE.Mesh;
  bodyMesh: THREE.Mesh;
  targetPosition: THREE.Vector3;
  targetRotation: number;
  currentRotation: number;
  health: number;
  isDead: boolean;
  stance: Stance;
  lastUpdate: number;
}

export class MultiplayerManager {
  private localUid: string | null = null;
  private networkPlayers: Map<string, NetworkPlayer> = new Map();
  private scene: THREE.Scene;
  private playerRef: any;

  // Shared materials
  private static skinMat = new THREE.MeshLambertMaterial({ color: 0xD4A574 });
  private static uniformMat = new THREE.MeshLambertMaterial({ color: 0x4A5A3A });
  private static bootMat = new THREE.MeshLambertMaterial({ color: 0x2A2A1A });
  private static helmetMat = new THREE.MeshLambertMaterial({ color: 0x3A4A2A });
  private static rifleMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  init(uid: string, displayName: string, spawnPos: THREE.Vector3, onTakeDamage: (amount: number) => void) {
    this.localUid = uid;
    this.playerRef = ref(db, `players/${uid}`);
    
    let localHealth = 100;

    // Set initial data and clear on disconnect
    set(this.playerRef, {
      displayName,
      x: spawnPos.x,
      y: spawnPos.y,
      z: spawnPos.z,
      rotation: 0,
      stance: Stance.STANDING,
      health: 100,
      isDead: false,
      timestamp: Date.now()
    });
    onDisconnect(this.playerRef).remove();

    // Listen to local player changes (for when others damage us)
    onValue(this.playerRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.health < localHealth) {
        const damage = localHealth - data.health;
        onTakeDamage(damage);
      }
      if (data) {
        localHealth = data.health;
      }
    });

    // Listen to all players
    const playersRef = ref(db, 'players');
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      
      // Update existing or add new
      for (const key in data) {
        if (key === this.localUid) continue; // Skip local player
        
        const pData = data[key];
        if (!this.networkPlayers.has(key)) {
          this.addNetworkPlayer(key, pData);
        } else {
          this.updateNetworkPlayer(key, pData);
        }
      }

      // Remove disconnected
      for (const key of this.networkPlayers.keys()) {
        if (!data[key] && key !== this.localUid) {
          this.removeNetworkPlayer(key);
        }
      }
    });
  }

  private addNetworkPlayer(uid: string, data: any) {
    const group = new THREE.Group();
    group.position.set(data.x, data.y, data.z);

    // Build mesh (similar to enemies)
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    const bodyMesh = new THREE.Mesh(bodyGeo, MultiplayerManager.uniformMat);
    bodyMesh.position.y = 1.05;
    bodyMesh.castShadow = true;
    bodyMesh.userData = { type: 'body', uid };
    group.add(bodyMesh);

    const headGeo = new THREE.BoxGeometry(0.25, 0.28, 0.25);
    const headMesh = new THREE.Mesh(headGeo, MultiplayerManager.skinMat);
    headMesh.position.y = 1.55;
    headMesh.userData = { type: 'head', uid };
    group.add(headMesh);

    const helmetGeo = new THREE.BoxGeometry(0.3, 0.15, 0.3);
    const helmet = new THREE.Mesh(helmetGeo, MultiplayerManager.helmetMat);
    helmet.position.y = 1.73;
    group.add(helmet);

    // Arms, legs, rifle...
    const armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
    [-0.32, 0.32].forEach((xOff) => {
      const arm = new THREE.Mesh(armGeo, MultiplayerManager.uniformMat);
      arm.position.set(xOff, 0.95, 0);
      group.add(arm);
    });

    const legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
    [-0.13, 0.13].forEach((xOff) => {
      const leg = new THREE.Mesh(legGeo, MultiplayerManager.uniformMat);
      leg.position.set(xOff, 0.35, 0);
      group.add(leg);
    });

    const rifleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.7);
    const rifle = new THREE.Mesh(rifleGeo, MultiplayerManager.rifleMat);
    rifle.position.set(0.35, 0.95, -0.15);
    group.add(rifle);

    this.scene.add(group);

    // Create name tag sprite
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(data.displayName || 'Soldier', 128, 48);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.2;
    sprite.scale.set(2, 0.5, 1);
    group.add(sprite);

    const np: NetworkPlayer = {
      uid,
      displayName: data.displayName,
      group,
      headMesh,
      bodyMesh,
      targetPosition: new THREE.Vector3(data.x, data.y, data.z),
      targetRotation: data.rotation,
      currentRotation: data.rotation,
      health: data.health,
      isDead: data.isDead,
      stance: data.stance,
      lastUpdate: Date.now()
    };

    this.networkPlayers.set(uid, np);
  }

  private updateNetworkPlayer(uid: string, data: any) {
    const np = this.networkPlayers.get(uid);
    if (!np) return;

    np.targetPosition.set(data.x, data.y, data.z);
    np.targetRotation = data.rotation;
    np.health = data.health;
    np.isDead = data.isDead;
    np.stance = data.stance;
    np.lastUpdate = Date.now();
  }

  private removeNetworkPlayer(uid: string) {
    const np = this.networkPlayers.get(uid);
    if (np) {
      this.scene.remove(np.group);
      this.networkPlayers.delete(uid);
    }
  }

  updateLocalPlayer(pos: THREE.Vector3, rotation: number, stance: Stance, health: number, isDead: boolean) {
    if (!this.playerRef) return;
    
    update(this.playerRef, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rotation,
      stance,
      health,
      isDead,
      timestamp: Date.now()
    });
  }

  reportDamage(targetUid: string, damage: number) {
    // In a real game, damage is calculated server-side.
    // For this prototype, we just tell the DB they took damage.
    const np = this.networkPlayers.get(targetUid);
    if (!np || np.isDead) return;

    const newHealth = Math.max(0, np.health - damage);
    const isDead = newHealth === 0;

    update(ref(db, `players/${targetUid}`), {
      health: newHealth,
      isDead
    });
  }

  getNetworkMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const np of this.networkPlayers.values()) {
      if (!np.isDead) {
        meshes.push(np.headMesh, np.bodyMesh);
      }
    }
    return meshes;
  }

  processHit(hitObject: THREE.Object3D): { killed: boolean, headshot: boolean, uid: string } | null {
    let obj: THREE.Object3D | null = hitObject;
    while (obj) {
      if (obj.userData?.type === 'head' || obj.userData?.type === 'body') break;
      obj = obj.parent;
    }
    if (!obj || !obj.userData?.uid) return null;

    const targetUid = obj.userData.uid;
    const np = this.networkPlayers.get(targetUid);
    if (!np || np.isDead) return null;

    const isHeadshot = obj.userData.type === 'head';
    const damage = isHeadshot ? 150 : 100;
    
    // Optimistic local prediction
    np.health -= damage;
    const killed = np.health <= 0;
    if (killed) np.isDead = true;

    // Send to server
    this.reportDamage(targetUid, damage);

    return { killed, headshot: isHeadshot, uid: targetUid };
  }

  update(delta: number) {
    // Interpolate network players
    for (const np of this.networkPlayers.values()) {
      if (np.isDead) {
        if (np.group.rotation.x > -Math.PI / 2) {
          np.group.rotation.x -= delta * 3;
          np.group.position.y -= delta * 2;
          if (np.group.position.y < -0.5) np.group.position.y = -0.5;
        }
        continue;
      } else {
        // Reset rotation if revived (e.g., respawned)
        np.group.rotation.x = 0;
      }

      // Smooth position interpolation
      np.group.position.lerp(np.targetPosition, 10 * delta);

      // Smooth rotation interpolation
      let diffRot = np.targetRotation - np.currentRotation;
      while (diffRot > Math.PI) diffRot -= Math.PI * 2;
      while (diffRot < -Math.PI) diffRot += Math.PI * 2;
      np.currentRotation += diffRot * 10 * delta;
      np.group.rotation.y = np.currentRotation;
    }
  }

  cleanup() {
    if (this.playerRef) {
      remove(this.playerRef);
      this.playerRef = null;
    }
  }
}
