import * as THREE from 'three';
import { PLAYER, WEAPON } from './constants';

interface KillFeedEntry {
  text: string;
  isHeadshot: boolean;
  timestamp: number;
}

export class HUD {
  // DOM elements
  private crosshairEl!: HTMLElement;
  private ammoCurrentEl!: HTMLElement;
  private ammoReserveEl!: HTMLElement;
  private healthBarFillEl!: HTMLElement;
  private healthTextEl!: HTMLElement;
  private staminaBarEl!: HTMLElement;
  private killFeedEl!: HTMLElement;
  private hitMarkerEl!: HTMLElement;
  private damageOverlayEl!: HTMLElement;
  private scopeOverlayEl!: HTMLElement;
  private stanceIconEl!: HTMLElement;
  private damageDirectionEl!: HTMLElement;
  private reloadingEl!: HTMLElement;
  private boltActionEl!: HTMLElement;
  private breathBarEl!: HTMLElement;
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private enemyCountEl!: HTMLElement;

  // State
  private killFeed: KillFeedEntry[] = [];
  private hitMarkerTimer = 0;
  private staticObstacles: { x: number; z: number; w: number; h: number; type: string }[] = [];

  init(): void {
    this.crosshairEl = document.getElementById('crosshair')!;
    this.ammoCurrentEl = document.getElementById('ammo-current')!;
    this.ammoReserveEl = document.getElementById('ammo-reserve')!;
    this.minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
    this.healthBarFillEl = document.getElementById('health-bar-fill')!;
    this.healthTextEl = document.getElementById('health-text')!;
    this.staminaBarEl = document.getElementById('stamina-bar-fill')!;
    this.killFeedEl = document.getElementById('kill-feed')!;
    this.hitMarkerEl = document.getElementById('hit-marker')!;
    this.damageOverlayEl = document.getElementById('damage-overlay')!;
    this.scopeOverlayEl = document.getElementById('scope-overlay')!;
    this.stanceIconEl = document.getElementById('stance-icon')!;
    this.damageDirectionEl = document.getElementById('damage-direction')!;
    this.reloadingEl = document.getElementById('reloading-indicator')!;
    this.boltActionEl = document.getElementById('bolt-action-indicator')!;
    this.breathBarEl = document.getElementById('breath-bar-fill')!;
    this.enemyCountEl = document.getElementById('enemy-count')!;
  }

  // --- Crosshair ---
  updateCrosshair(isMoving: boolean, isADS: boolean): void {
    if (isADS) {
      this.crosshairEl.style.display = 'none';
    } else {
      this.crosshairEl.style.display = 'block';
      const spread = isMoving ? 20 : 8;
      const lines = this.crosshairEl.querySelectorAll('.crosshair-line') as NodeListOf<HTMLElement>;
      lines.forEach((line, i) => {
        const base = spread;
        if (i === 0) line.style.top = `-${base + 10}px`;      // top
        else if (i === 1) line.style.bottom = `-${base + 10}px`; // bottom
        else if (i === 2) line.style.left = `-${base + 10}px`;  // left
        else if (i === 3) line.style.right = `-${base + 10}px`; // right
      });
    }
  }

  // --- Ammo ---
  updateAmmo(current: number, reserve: number): void {
    this.ammoCurrentEl.textContent = String(current);
    this.ammoReserveEl.textContent = String(reserve);

    if (current === 0) {
      this.ammoCurrentEl.style.color = '#ff4444';
    } else if (current <= 2) {
      this.ammoCurrentEl.style.color = '#ffaa44';
    } else {
      this.ammoCurrentEl.style.color = '#ffffff';
    }
  }

  // --- Health ---
  updateHealth(hp: number): void {
    const pct = Math.max(0, Math.min(100, (hp / PLAYER.MAX_HEALTH) * 100));
    this.healthBarFillEl.style.width = `${pct}%`;
    this.healthTextEl.textContent = String(Math.ceil(hp));

    if (pct > 60) {
      this.healthBarFillEl.style.background = 'linear-gradient(90deg, #00f0ff, #0088cc)';
    } else if (pct > 30) {
      this.healthBarFillEl.style.background = 'linear-gradient(90deg, #33b5e5, #005588)';
    } else {
      this.healthBarFillEl.style.background = 'linear-gradient(90deg, #ff3b30, #aa0000)';
    }

    // Full screen damage vignette when low hp
    if (pct < 30) {
      this.damageOverlayEl.style.opacity = String((30 - pct) / 30 * 0.6);
    } else {
      this.damageOverlayEl.style.opacity = '0';
    }
  }

  // --- Stamina ---
  updateStamina(current: number, max: number): void {
    const pct = (current / max) * 100;
    this.staminaBarEl.style.width = `${pct}%`;
    if (pct < 20) {
      this.staminaBarEl.style.background = '#ff4444';
    } else {
      this.staminaBarEl.style.background = 'linear-gradient(90deg, #44aaff, #2288dd)';
    }
  }

  // --- Scope ---
  showScope(show: boolean): void {
    this.scopeOverlayEl.style.display = show ? 'flex' : 'none';
  }

  // --- Hit marker ---
  showHitMarker(isKill: boolean): void {
    this.hitMarkerEl.style.display = 'block';
    this.hitMarkerEl.className = isKill ? 'hit-marker kill' : 'hit-marker';
    this.hitMarkerTimer = 0.2;
  }

  // --- Kill feed ---
  addKill(enemyName: string, isHeadshot: boolean): void {
    this.killFeed.push({
      text: isHeadshot ? `☠ ${enemyName} [HEADSHOT]` : `✕ ${enemyName}`,
      isHeadshot,
      timestamp: Date.now(),
    });

    // Keep only last 5
    if (this.killFeed.length > 5) {
      this.killFeed.shift();
    }

    this.renderKillFeed();
  }

  private renderKillFeed(): void {
    this.killFeedEl.innerHTML = '';
    this.killFeed.forEach((entry) => {
      const el = document.createElement('div');
      el.className = `kill-feed-entry${entry.isHeadshot ? ' headshot' : ''}`;
      el.textContent = entry.text;
      this.killFeedEl.appendChild(el);
    });
  }

  // --- Stance indicator ---
  updateStance(stance: string): void {
    const icons: Record<string, string> = {
      STANDING: '🧍',
      CROUCHING: '🦵',
      PRONE: '🏊',
    };
    this.stanceIconEl.textContent = icons[stance] || '🧍';
  }

  // --- Damage direction ---
  showDamageDirection(angle: number): void {
    this.damageDirectionEl.style.display = 'block';
    this.damageDirectionEl.style.transform = `rotate(${angle}rad)`;
    this.damageDirectionEl.style.opacity = '1';

    setTimeout(() => {
      this.damageDirectionEl.style.opacity = '0';
      setTimeout(() => {
        this.damageDirectionEl.style.display = 'none';
      }, 300);
    }, 1000);
  }

  // --- Flash damage overlay ---
  flashDamage(): void {
    this.damageOverlayEl.style.opacity = '0.5';
    setTimeout(() => {
      this.damageOverlayEl.style.opacity = '0';
    }, 150);
  }

  // --- Reloading ---
  showReloading(show: boolean): void {
    this.reloadingEl.style.display = show ? 'block' : 'none';
  }

  // --- Bolt action ---
  showBoltAction(show: boolean): void {
    this.boltActionEl.style.display = show ? 'block' : 'none';
  }

  // --- Breath bar (ADS hold breath) ---
  updateBreath(remaining: number, max: number): void {
    const pct = (remaining / max) * 100;
    this.breathBarEl.style.width = `${pct}%`;
    const container = this.breathBarEl.parentElement!;
    container.style.display = remaining < max ? 'block' : 'none';
  }

  // --- Update (called every frame) ---
  update(delta: number): void {
    // Hit marker timeout
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= delta;
      if (this.hitMarkerTimer <= 0) {
        this.hitMarkerEl.style.display = 'none';
      }
    }

    // Kill feed timeout (remove entries older than 5s)
    const now = Date.now();
    const before = this.killFeed.length;
    this.killFeed = this.killFeed.filter((e) => now - e.timestamp < 5000);
    if (this.killFeed.length !== before) {
      this.renderKillFeed();
    }
  }

  // --- Enemy count ---
  updateEnemyCount(alive: number, total: number): void {
    if (!this.enemyCountEl) return;
    const icon = alive > 0 ? '⚠' : '✓';
    this.enemyCountEl.textContent = `${icon} ${alive} / ${total} TARGETS`;
    this.enemyCountEl.style.color = alive === 0 ? '#00ff88' : alive <= 3 ? '#ffaa00' : '#ff4444';
  }

  // --- Score / kill count ---
  updateScore(kills: number, headshots: number): void {
    const el = document.getElementById('score-display');
    if (el) {
      el.textContent = `Kills: ${kills} | Headshots: ${headshots}`;
    }
  }

  // --- Minimap rendering ---
  initMinimap(obstaclesGroup: THREE.Group): void {
    this.staticObstacles = [];
    
    obstaclesGroup.children.forEach(child => {
      child.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(child);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      this.staticObstacles.push({
        x: center.x,
        z: center.z,
        w: size.x,
        h: size.z,
        type: child.name || 'obstacle'
      });
    });
    console.log(`Minimap initialized with ${this.staticObstacles.length} static obstacles.`);
  }

  updateMinimap(playerPosition: THREE.Vector3, playerYaw: number, enemies: any[]): void {
    if (!this.minimapCanvas || !this.minimapCtx) return;

    const ctx = this.minimapCtx;
    const width = this.minimapCanvas.width;
    const height = this.minimapCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Draw circular clipping mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
    ctx.clip();

    // Map scale: map is 120x120 units. Show around 45 units view range on the 150px canvas
    const scale = 3.2;

    // Apply rotation and translation so that the minimap rotates with the player
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-playerYaw);
    ctx.translate(-playerPosition.x * scale, -playerPosition.z * scale);

    // 1. Draw grid / map boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 15;
    for (let x = -60; x <= 60; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x * scale, -60 * scale);
      ctx.lineTo(x * scale, 60 * scale);
      ctx.stroke();
    }
    for (let z = -60; z <= 60; z += gridSize) {
      ctx.beginPath();
      ctx.moveTo(-60 * scale, z * scale);
      ctx.lineTo(60 * scale, z * scale);
      ctx.stroke();
    }

    // 2. Draw static obstacles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;

    this.staticObstacles.forEach(obs => {
      const rx = (obs.x - obs.w / 2) * scale;
      const rz = (obs.z - obs.h / 2) * scale;
      const rw = obs.w * scale;
      const rh = obs.h * scale;

      ctx.fillRect(rx, rz, rw, rh);
      ctx.strokeRect(rx, rz, rw, rh);
    });

    // 3. Draw active/alive enemies as red dots
    ctx.fillStyle = '#ff3333';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ff3333';
    
    enemies.forEach(enemy => {
      if (enemy.state && enemy.state !== 'DEAD') {
        const ex = enemy.group.position.x * scale;
        const ez = enemy.group.position.z * scale;
        
        ctx.beginPath();
        ctx.arc(ex, ez, 4.0, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Restore map transform context
    ctx.restore();
    ctx.shadowBlur = 0;

    // 4. Draw player pointer at the center (always pointing straight UP)
    ctx.fillStyle = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 6);
    ctx.lineTo(centerX - 5, centerY + 5);
    ctx.lineTo(centerX + 5, centerY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Draw radar sweep glow
    const sweepTime = (Date.now() / 2000) % 1;
    const sweepAngle = sweepTime * Math.PI * 2;
    const grad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, radius);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.05)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 2, sweepAngle - 0.2, sweepAngle);
    ctx.lineTo(centerX, centerY);
    ctx.closePath();
    ctx.fill();

    // 6. Draw compass markers
    ctx.restore(); // Restore outer circular clip

    ctx.font = '700 9px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const compassOffset = radius - 10;
    const directions = [
      { text: 'N', angle: 0 },
      { text: 'E', angle: Math.PI / 2 },
      { text: 'S', angle: Math.PI },
      { text: 'W', angle: -Math.PI / 2 }
    ];

    directions.forEach(dir => {
      const rotatedAngle = dir.angle - playerYaw;
      const dx = centerX + Math.sin(rotatedAngle) * compassOffset;
      const dy = centerY - Math.cos(rotatedAngle) * compassOffset;
      
      ctx.fillStyle = dir.text === 'N' ? '#00f0ff' : 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(dir.text, dx, dy);
    });
  }
}
