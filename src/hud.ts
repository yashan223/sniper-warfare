// ============================================================
// HUD — All in-game UI elements managed via DOM
// ============================================================

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

  // State
  private killFeed: KillFeedEntry[] = [];
  private hitMarkerTimer = 0;

  init(): void {
    this.crosshairEl = document.getElementById('crosshair')!;
    this.ammoCurrentEl = document.getElementById('ammo-current')!;
    this.ammoReserveEl = document.getElementById('ammo-reserve')!;
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
      this.healthBarFillEl.style.background = 'linear-gradient(90deg, #44ff44, #22cc22)';
    } else if (pct > 30) {
      this.healthBarFillEl.style.background = 'linear-gradient(90deg, #ffaa44, #ff8800)';
    } else {
      this.healthBarFillEl.style.background = 'linear-gradient(90deg, #ff4444, #cc0000)';
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

  // --- Score / kill count ---
  updateScore(kills: number, headshots: number): void {
    const el = document.getElementById('score-display');
    if (el) {
      el.textContent = `Kills: ${kills} | Headshots: ${headshots}`;
    }
  }
}
