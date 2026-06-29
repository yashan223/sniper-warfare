const fs = require('fs');

let main = fs.readFileSync('src/main.ts', 'utf8');

// Fix 1: Update menuEl
main = main.replace(
  "this.menuEl = document.getElementById('main-menu')!;",
  "this.menuEl = document.getElementById('login-screen')!;"
);

// Fix 2: Rewrite startGame()
const oldStartGame = `  private startGame(): void {
    this.audio.init();
    this.audio.startAmbient();
    this.audio.resume();
    this.spawnProtectionTimer = 3.0; // 3 seconds spawn protection
    this.pendingState = GameState.PLAYING;
    this.gameContainer.requestPointerLock();
    // State will transition in pointerlockchange handler
    // Fallback: if pointer lock fails, still start (for testing)
    setTimeout(() => {
      if (this.state === GameState.MENU) {
        this.setState(GameState.PLAYING);
      }
    }, 500);
  }`;

const newStartGame = `  private startGame(): void {
    this.audio.init();
    this.audio.startAmbient();
    this.audio.resume();
    this.sessionStartTime = Date.now();
    
    // Initialize multiplayer when game starts
    if (this.currentUser) {
      this.multiplayer.init(this.currentUser.uid, this.currentUser.displayName || 'Soldier', this.player.position, (dmg) => {
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
          this.killerPos.copy(this.player.position).sub(new THREE.Vector3(0, 5, 0));
          this.killcamTimer = 3.5;
          this.setState(GameState.KILLCAM);
          this.audio.stopHeartbeat();
        }
      });
    }

    this.spawnProtectionTimer = 3.0; // 3 seconds spawn protection
    this.pendingState = GameState.PLAYING;
    this.gameContainer.requestPointerLock();
    // State will transition in pointerlockchange handler
    setTimeout(() => {
      if (this.state === GameState.MENU) {
        this.setState(GameState.PLAYING);
      }
    }, 500);
  }`;

main = main.replace(oldStartGame, newStartGame);

fs.writeFileSync('src/main.ts', main, 'utf8');
console.log('Fixed main.ts!');
