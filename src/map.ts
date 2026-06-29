// ============================================================
// MAP — Urban war-zone level geometry (CoD4 style)
// ============================================================

import * as THREE from 'three';
import { MAP, RENDER } from './constants';
import { PhysicsWorld } from './physics';

export interface EnemySpawnPoint {
  position: THREE.Vector3;
  waypoints: THREE.Vector3[];
}

export interface LoadedAssets {
  buildings: Map<string, THREE.Group>;
  trees: Map<string, THREE.Group>;
  decorations: Map<string, THREE.Group>;
  fences: Map<string, THREE.Group>;
}

export class GameMap {
  private group = new THREE.Group();
  private obstacleGroup = new THREE.Group();
  private dustParticles: THREE.Points | null = null;
  // Material cache — avoid creating duplicate materials
  private materialCache = new Map<string, THREE.MeshLambertMaterial>();

  getGroup(): THREE.Group {
    return this.group;
  }

  getObstacles(): THREE.Group {
    return this.obstacleGroup;
  }

  build(scene: THREE.Scene, physics: PhysicsWorld, assets: LoadedAssets): EnemySpawnPoint[] {
    this.group.name = 'map';
    this.obstacleGroup.name = 'obstacles';
    this.group.add(this.obstacleGroup);

    this.buildGround();
    this.buildSkybox(scene);
    this.buildBoundaries(physics);
    const spawns = this.buildBuildings(physics, assets);
    this.buildCover(physics, assets);
    this.buildStreets();
    this.buildDust(scene);
    this.buildLighting(scene);

    scene.add(this.group);
    return spawns;
  }

  // Cached material factory — reuses materials for same color
  private mat(color: number): THREE.MeshLambertMaterial {
    const key = color.toString(16);
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, new THREE.MeshLambertMaterial({ color }));
    }
    return this.materialCache.get(key)!;
  }

  // --- Ground plane ---
  private buildGround(): void {
    const size = MAP.SIZE;
    const geo = new THREE.PlaneGeometry(size, size, 8, 8);

    const ground = new THREE.Mesh(geo, this.mat(MAP.BUILDING_COLORS.SAND));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
  }

  // --- Sky color ---
  private buildSkybox(scene: THREE.Scene): void {
    scene.background = new THREE.Color(RENDER.SKY_COLOR);
    scene.fog = new THREE.Fog(RENDER.FOG_COLOR, RENDER.FOG_NEAR, RENDER.FOG_FAR);
  }

  // --- Map boundaries ---
  private buildBoundaries(physics: PhysicsWorld): void {
    const hs = MAP.SIZE / 2;
    const h = MAP.BOUNDARY_HEIGHT;
    const t = 2;

    const walls: [number, number, number, number, number, number][] = [
      [MAP.SIZE, h, t, 0, h / 2, -hs],
      [MAP.SIZE, h, t, 0, h / 2, hs],
      [t, h, MAP.SIZE, -hs, h / 2, 0],
      [t, h, MAP.SIZE, hs, h / 2, 0],
    ];

    walls.forEach(([w, hh, d, x, y, z]) => {
      const geo = new THREE.BoxGeometry(w, hh, d);
      const mesh = new THREE.Mesh(geo, this.mat(MAP.BUILDING_COLORS.CONCRETE));
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      physics.addMeshCollider(mesh);
    });
  }

  // --- Main buildings ---
  private buildBuildings(physics: PhysicsWorld, assets: LoadedAssets): EnemySpawnPoint[] {
    const spawns: EnemySpawnPoint[] = [];

    // All building types a-u (21 models)
    const ALL_BUILDING_TYPES = [
      'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u'
    ];

    // Dense urban layout — 18 buildings using all available model types
    const buildings: {
      x: number; z: number; w: number; d: number;
      floors: number; name: string; modelIdx: number;
    }[] = [
      // North-West cluster
      { x: -32, z: -32, w: 13, d: 11, floors: 3, name: 'apt_nw', modelIdx: 0 },
      { x: -18, z: -38, w: 10, d: 8,  floors: 2, name: 'shop_nw', modelIdx: 1 },
      { x: -42, z: -18, w: 8,  d: 10, floors: 4, name: 'tower_nw', modelIdx: 2 },

      // North-East cluster
      { x: 22, z: -30, w: 10, d: 14, floors: 2, name: 'warehouse_ne', modelIdx: 3 },
      { x: 36, z: -22, w: 12, d: 10, floors: 3, name: 'office_ne', modelIdx: 4 },
      { x: 12, z: -42, w: 16, d: 8,  floors: 2, name: 'market_n', modelIdx: 5 },

      // Center (flanking the road)
      { x: -14, z: -8, w: 9,  d: 9,  floors: 3, name: 'corner_w', modelIdx: 6 },
      { x: 14,  z: -8, w: 9,  d: 9,  floors: 3, name: 'corner_e', modelIdx: 7 },
      { x: -14, z: 10, w: 10, d: 8,  floors: 2, name: 'mid_w', modelIdx: 8 },
      { x: 14,  z: 10, w: 10, d: 8,  floors: 2, name: 'mid_e', modelIdx: 9 },

      // South-West cluster
      { x: -28, z: 26, w: 14, d: 10, floors: 3, name: 'hotel_sw', modelIdx: 10 },
      { x: -42, z: 14, w: 8,  d: 8,  floors: 2, name: 'shack_w', modelIdx: 11 },
      { x: -38, z: 36, w: 10, d: 12, floors: 2, name: 'depot_sw', modelIdx: 12 },

      // South-East cluster
      { x: 30, z: 30,  w: 10, d: 10, floors: 2, name: 'garage_se', modelIdx: 13 },
      { x: 42, z: 10,  w: 10, d: 12, floors: 3, name: 'office_e', modelIdx: 14 },
      { x: 20, z: 42,  w: 12, d: 8,  floors: 2, name: 'shop_s', modelIdx: 15 },

      // Far corners for map density
      { x: 0,  z: 44,  w: 14, d: 8,  floors: 2, name: 'base_s', modelIdx: 16 },
      { x: -8, z: -50, w: 12, d: 8,  floors: 1, name: 'bunker_n', modelIdx: 17 },
    ];

    const floorH = 3.5;

    buildings.forEach((b) => {
      const totalH = b.floors * floorH;
      const modelLetter = ALL_BUILDING_TYPES[b.modelIdx % ALL_BUILDING_TYPES.length];
      const modelName = `building-type-${modelLetter}.glb`;
      const model = assets.buildings?.get(modelName);

      if (model) {
        const instance = model.clone();
        instance.position.set(b.x, 0, b.z);

        const box = new THREE.Box3().setFromObject(instance);
        const size = new THREE.Vector3();
        box.getSize(size);

        const scaleX = size.x > 0 ? b.w / size.x : 1;
        const scaleY = size.y > 0 ? totalH / size.y : 1;
        const scaleZ = size.z > 0 ? b.d / size.z : 1;
        instance.scale.set(scaleX, scaleY, scaleZ);

        this.adaptModelToNight(instance);
        this.group.add(instance);
        this.obstacleGroup.add(instance.clone());
        physics.addMeshCollider(instance);
      } else {
        // Procedural fallback
        const wallColor = MAP.BUILDING_COLORS.WALL;
        this.addWall(b.x, totalH / 2, b.z - b.d / 2, b.w, totalH, 0.4, wallColor, physics);
        this.addWall(b.x, totalH / 2, b.z + b.d / 2, b.w, totalH, 0.4, wallColor, physics);
        this.addWall(b.x - b.w / 2, totalH / 2, b.z, 0.4, totalH, b.d, wallColor, physics);
        this.addWall(b.x + b.w / 2, totalH / 2, b.z, 0.4, totalH, b.d, wallColor, physics);
        this.addWall(b.x, totalH, b.z, b.w, 0.3, b.d, MAP.BUILDING_COLORS.ROOF, physics);
      }

      // Spawn point
      const spawnOffset = b.d / 2 + 3;
      spawns.push({
        position: new THREE.Vector3(b.x, 0, b.z + spawnOffset),
        waypoints: [
          new THREE.Vector3(b.x + b.w / 2 + 2, 0, b.z + spawnOffset),
          new THREE.Vector3(b.x - b.w / 2 - 2, 0, b.z - spawnOffset),
          new THREE.Vector3(b.x + b.w / 2 + 2, 0, b.z - spawnOffset),
        ],
      });
    });

    return spawns;
  }

  private addWall(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color: number, physics: PhysicsWorld
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, this.mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.obstacleGroup.add(mesh.clone());
    physics.addMeshCollider(mesh);
    return mesh;
  }

  // --- Cover objects ---
  private buildCover(physics: PhysicsWorld, assets: LoadedAssets): void {
    // ── Low-fence / sandbag cover lines ──────────────────────────────
    const sandbagPositions: [number, number, number, number][] = [
      [0,    0, -10, 0],
      [10,   0,   5, Math.PI / 4],
      [-15,  0, -15, Math.PI / 2],
      [15,   0,  20, -Math.PI / 6],
      [-5,   0,  35, Math.PI / 3],
      [20,   0, -15, 0],
      [-6,   0,   2, Math.PI / 2],
      [6,    0,   2, Math.PI / 2],
      [28,   0,  -5, 0],
      [-28,  0,  -5, 0],
      [0,    0,  15, Math.PI / 3],
      [-20,  0,   8, -Math.PI / 4],
      [20,   0,   8, Math.PI / 4],
      [0,    0, -20, 0],
    ];

    sandbagPositions.forEach(([x, , z, rot]) => {
      const fenceModel = assets.fences?.get('fence-low.glb');
      if (fenceModel) {
        const instance = fenceModel.clone();
        instance.position.set(x, 0, z);
        instance.rotation.y = rot;
        const box = new THREE.Box3().setFromObject(instance);
        const size = new THREE.Vector3();
        box.getSize(size);
        instance.scale.set(
          size.x > 0 ? 4.2 / size.x : 1,
          size.y > 0 ? 1.0 / size.y : 1,
          size.z > 0 ? 0.5 / size.z : 1
        );
        this.adaptModelToNight(instance);
        this.group.add(instance);
        physics.addMeshCollider(instance);
      } else {
        const wallMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.2, 1.0, 0.5),
          this.mat(MAP.BUILDING_COLORS.SANDBAG)
        );
        wallMesh.position.set(x, 0.5, z);
        wallMesh.rotation.y = rot;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        this.group.add(wallMesh);
        physics.addMeshCollider(wallMesh);
      }
    });

    // ── Fence-panel perimeters around building clusters ───────────────
    // fence-1x4 panels used as compound walls
    const fencePanelSpots: [number, number, number, number, string][] = [
      // Around NW cluster
      [-46, 0, -28, 0,            'fence-1x4.glb'],
      [-46, 0, -24, 0,            'fence-1x4.glb'],
      [-30, 0, -42, Math.PI / 2,  'fence-1x4.glb'],
      [-26, 0, -42, Math.PI / 2,  'fence-1x4.glb'],
      // Around NE cluster
      [40,  0, -36, 0,            'fence-2x3.glb'],
      [44,  0, -28, Math.PI / 2,  'fence-1x3.glb'],
      // Around central area (street flanks)
      [-5,  0, -16, Math.PI / 2,  'fence-3x2.glb'],
      [5,   0, -16, Math.PI / 2,  'fence-3x2.glb'],
      // Around SE cluster
      [46,  0,  16, Math.PI / 2,  'fence-1x4.glb'],
      [34,  0,  40, 0,            'fence-2x2.glb'],
      // Around SW cluster
      [-48, 0,  20, Math.PI / 2,  'fence-1x3.glb'],
      [-34, 0,  40, 0,            'fence-1x4.glb'],
    ];

    fencePanelSpots.forEach(([x, , z, rot, fenceName]) => {
      const fenceModel = assets.fences?.get(fenceName as string);
      if (!fenceModel) return;
      const instance = fenceModel.clone();
      instance.position.set(x as number, 0, z as number);
      instance.rotation.y = rot as number;
      const box = new THREE.Box3().setFromObject(instance);
      const size = new THREE.Vector3();
      box.getSize(size);
      // Keep native scale — they're already sized correctly
      const targetH = 2.0;
      const sf = size.y > 0 ? targetH / size.y : 1;
      instance.scale.set(sf, sf, sf);
      this.adaptModelToNight(instance);
      this.group.add(instance);
      physics.addMeshCollider(instance);
    });

    // ── Concrete barriers / planters ─────────────────────────────────
    const barrierPositions: [number, number][] = [
      [-10, 10], [5, -20], [35,  10], [-20, -30],
      [0,   20], [25,   0], [-25,  0], [0,    0],
      [18, -10], [-18,  10],
    ];

    barrierPositions.forEach(([x, z]) => {
      const planterModel = assets.decorations?.get('planter.glb');
      if (planterModel) {
        const instance = planterModel.clone();
        instance.position.set(x, 0, z);
        instance.rotation.y = Math.random() * Math.PI;
        const box = new THREE.Box3().setFromObject(instance);
        const size = new THREE.Vector3();
        box.getSize(size);
        instance.scale.set(
          size.x > 0 ? 3.0 / size.x : 1,
          size.y > 0 ? 1.0 / size.y : 1,
          size.z > 0 ? 0.6 / size.z : 1
        );
        this.adaptModelToNight(instance);
        this.group.add(instance);
        physics.addMeshCollider(instance);
      } else {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(3, 1.0, 0.6),
          this.mat(MAP.BUILDING_COLORS.CONCRETE)
        );
        mesh.position.set(x, 0.5, z);
        mesh.rotation.y = Math.random() * Math.PI;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        physics.addMeshCollider(mesh);
      }
    });

    // ── Driveways ─────────────────────────────────────────────────────
    const driveways: [number, number, number, string][] = [
      [-32, 0, -20, 'driveway-long.glb'],
      [22,  0, -18, 'driveway-short.glb'],
      [30,  0,  18, 'driveway-long.glb'],
      [-28, 0,  16, 'driveway-short.glb'],
      [8,   0,  30, 'driveway-long.glb'],
      [-8,  0, -38, 'driveway-short.glb'],
    ];

    driveways.forEach(([x, , z, name]) => {
      const model = assets.decorations?.get(name as string);
      if (!model) return;
      const instance = model.clone();
      instance.position.set(x as number, 0.005, z as number);
      instance.rotation.y = Math.random() > 0.5 ? 0 : Math.PI / 2;
      const box = new THREE.Box3().setFromObject(instance);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = Math.max(size.x, size.z) > 0 ? 6 / Math.max(size.x, size.z) : 1;
      instance.scale.set(scale, 1, scale);
      this.adaptModelToNight(instance);
      this.group.add(instance);
    });

    // ── Path stones scattered around the map ─────────────────────────
    const pathStonesSpots: [number, number, string][] = [
      [-5,   -5,  'path-stones-messy.glb'],
      [5,     5,  'path-stones-messy.glb'],
      [-10,  20,  'path-stones-short.glb'],
      [10,  -20,  'path-stones-short.glb'],
      [0,    -5,  'path-stones-long.glb'],
      [20,   25,  'path-stones-messy.glb'],
      [-20, -20,  'path-stones-long.glb'],
      [30,  -10,  'path-stones-short.glb'],
      [-30,  -5,  'path-stones-messy.glb'],
      [5,    35,  'path-stones-long.glb'],
      // Paved paths
      [-2,  -25,  'path-short.glb'],
      [2,   -25,  'path-short.glb'],
      [0,   -30,  'path-long.glb'],
      [15,   15,  'path-short.glb'],
      [-15, -15,  'path-short.glb'],
    ];

    pathStonesSpots.forEach(([x, z, name]) => {
      const model = assets.decorations?.get(name as string);
      if (!model) return;
      const instance = model.clone();
      instance.position.set(x as number, 0.01, z as number);
      instance.rotation.y = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 1.0;
      instance.scale.set(s, 1, s);
      this.adaptModelToNight(instance);
      this.group.add(instance);
    });

    // ── Trees ─────────────────────────────────────────────────────────
    const treePositions: { x: number; z: number; type: 'large' | 'small' }[] = [
      { x: -15, z: -15, type: 'large' },
      { x: 15,  z: -15, type: 'large' },
      { x: -35, z:  20, type: 'large' },
      { x: 35,  z:  20, type: 'large' },
      { x: -50, z: -40, type: 'large' },
      { x: 50,  z: -40, type: 'large' },
      { x: -50, z:  40, type: 'large' },
      { x: 50,  z:  40, type: 'large' },
      { x: 10,  z:  10, type: 'small' },
      { x: -10, z: -10, type: 'small' },
      { x: 0,   z:  30, type: 'small' },
      { x: 20,  z: -35, type: 'small' },
      { x: -5,  z:  50, type: 'small' },
      { x: 5,   z: -50, type: 'small' },
      { x: 25,  z:  -5, type: 'small' },
      { x: -25, z:   5, type: 'small' },
      { x: 45,  z:  30, type: 'small' },
      { x: -45, z: -30, type: 'small' },
      { x: 40,  z: -45, type: 'large' },
      { x: -40, z:  45, type: 'large' },
    ];

    treePositions.forEach((pos) => {
      const treeModel = assets.trees?.get(pos.type === 'large' ? 'tree-large.glb' : 'tree-small.glb');
      if (!treeModel) return;
      const instance = treeModel.clone();
      instance.position.set(pos.x, 0, pos.z);
      const scale = 0.8 + Math.random() * 0.6;
      instance.scale.set(scale, scale, scale);
      instance.rotation.y = Math.random() * Math.PI * 2;
      this.adaptModelToNight(instance);
      this.group.add(instance);
      physics.addMeshCollider(instance);
    });

    // ── Destroyed vehicles ────────────────────────────────────────────
    this.buildVehicle(-8,  0, -25, 0.3,  physics);
    this.buildVehicle(18,  0,  15, -0.5, physics);
    this.buildVehicle(-35, 0,  10, 1.2,  physics);
    this.buildVehicle(28,  0, -38, 2.1,  physics);
    this.buildVehicle(-22, 0,  30, 0.8,  physics);
  }

  private buildVehicle(x: number, _y: number, z: number, rot: number, physics: PhysicsWorld): void {
    const vehicleGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(4.5, 1.2, 2.0);
    const body = new THREE.Mesh(bodyGeo, this.mat(MAP.BUILDING_COLORS.VEHICLE_BODY));
    body.position.set(0, 0.7, 0);
    body.castShadow = true;
    vehicleGroup.add(body);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(2.5, 1.0, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, this.mat(MAP.BUILDING_COLORS.VEHICLE_RUST));
    cabin.position.set(-0.3, 1.6, 0);
    cabin.castShadow = true;
    vehicleGroup.add(cabin);

    // Wheels (cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const wheelMat = this.mat(0x1a1a1a);
    const wheelPositions: [number, number, number][] = [
      [-1.5, 0.35, 1.1], [-1.5, 0.35, -1.1],
      [1.5, 0.35, 1.1], [1.5, 0.35, -1.1],
    ];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.rotation.x = Math.PI / 2;
      vehicleGroup.add(wheel);
    });

    vehicleGroup.position.set(x, 0, z);
    vehicleGroup.rotation.y = rot;
    this.group.add(vehicleGroup);

    // Physics collider for the whole vehicle
    const colliderMesh = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 2.0));
    colliderMesh.position.set(x, 1.1, z);
    colliderMesh.rotation.y = rot;
    physics.addMeshCollider(colliderMesh);
  }

  // --- Streets (road markings) ---
  private buildStreets(): void {
    // Main road
    const roadGeo = new THREE.PlaneGeometry(8, MAP.SIZE * 0.8);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x3A3A3A,
      roughness: 0.95,
      metalness: 0,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 0);
    road.receiveShadow = true;
    this.group.add(road);

    // Cross road
    const crossRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP.SIZE * 0.6, 6),
      roadMat
    );
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(0, 0.01, 0);
    crossRoad.receiveShadow = true;
    this.group.add(crossRoad);

    // Road lines
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xCCCC88,
      roughness: 0.8,
    });
    for (let i = -40; i < 40; i += 5) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 2),
        lineMat
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.02, i);
      this.group.add(line);
    }
  }

  // --- Dust particles ---
  private buildDust(scene: THREE.Scene): void {
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * MAP.SIZE;
      positions[i * 3 + 1] = Math.random() * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * MAP.SIZE;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xDDCC99,
      size: 0.1,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    this.dustParticles = new THREE.Points(geo, mat);
    this.dustParticles.name = 'dust';
    this.dustParticles.frustumCulled = false;
    scene.add(this.dustParticles);
  }

  // --- Lighting ---
  private buildLighting(scene: THREE.Scene): void {
    // Ambient light using RENDER constants
    const ambient = new THREE.AmbientLight(RENDER.AMBIENT_LIGHT_COLOR, RENDER.AMBIENT_LIGHT_INTENSITY);
    ambient.layers.enable(1);
    scene.add(ambient);

    // Sun (directional) — smaller shadow frustum for better quality + perf
    const sun = new THREE.DirectionalLight(RENDER.SUN_COLOR, RENDER.SUN_INTENSITY);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.002;
    
    // Enable layer 1 on directional light and its shadow camera
    sun.layers.enable(1);
    sun.shadow.camera.layers.enable(1);
    scene.add(sun);

    // Hemisphere light for natural fill (dim cool blue sky to dark ground bounce)
    const hemi = new THREE.HemisphereLight(0x5b6882, 0x15161c, 0.05);
    hemi.layers.enable(1);
    scene.add(hemi);
  }

  private adaptModelToNight(model: THREE.Object3D): void {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  // --- Animate dust (simplified — just drift, no per-particle sin()) ---
  update(delta: number): void {
    if (!this.dustParticles) return;
    const pos = this.dustParticles.geometry.attributes.position;
    const halfSize = MAP.SIZE / 2;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + delta * 0.5;
      if (x > halfSize) x = -halfSize;
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }
}
