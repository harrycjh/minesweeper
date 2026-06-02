/* ═══════ Minesweeper — Full Game Logic ═══════ */

/* ─── Difficulty presets ─── */
const DIFFICULTIES = {
  easy:   { rows: 9,  cols: 9,  mines: 10, label: '简单 9×9' },
  medium: { rows: 16, cols: 16, mines: 40, label: '中等 16×16' },
  hard:   { rows: 16, cols: 30, mines: 99, label: '困难 30×16' },
};

/* ─── GameBoard ─── */
class GameBoard {
  constructor(rows, cols, mineCount) {
    this.rows = rows;
    this.cols = cols;
    this.mineCount = mineCount;
    this.board = [];         // 2D array of {mine, revealed, flagged, adjacent}
    this.gameOver = false;
    this.win = false;
    this.firstMove = true;
    this.revealedCount = 0;
    this.flagCount = 0;
    this.hitMinePos = null;  // {row, col} of the mine that was hit
    this.wrongFlags = [];    // [{row, col}] wrongly flagged cells
    this._initBoard();
  }

  _initBoard() {
    this.board = [];
    for (let r = 0; r < this.rows; r++) {
      this.board[r] = [];
      for (let c = 0; c < this.cols; c++) {
        this.board[r][c] = { mine: false, revealed: false, flagged: false, adjacent: 0 };
      }
    }
  }

  _placeMines(excludeRow, excludeCol) {
    // Collect all safe positions (excluding clicked cell only, per spec)
    const candidates = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (r === excludeRow && c === excludeCol) continue;
        candidates.push({ r, c });
      }
    }
    // Fisher-Yates shuffle, take first mineCount
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < this.mineCount; i++) {
      const { r, c } = candidates[i];
      this.board[r][c].mine = true;
    }
    this._calcAdjacent();
  }

  _calcAdjacent() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].mine) {
          this.board[r][c].adjacent = -1;
          continue;
        }
        let count = 0;
        for (const [dr, dc] of this._neighbors(r, c)) {
          if (this._inBounds(dr, dc) && this.board[dr][dc].mine) count++;
        }
        this.board[r][c].adjacent = count;
      }
    }
  }

  _neighbors(r, c) {
    const dirs = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        dirs.push([r + dr, c + dc]);
      }
    }
    return dirs;
  }

  _inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  get safeCells() {
    return this.rows * this.cols - this.mineCount;
  }

  /* ─── Public API ─── */

  reveal(row, col) {
    if (this.gameOver) return { revealed: 0, gameOver: true, win: this.win, hitMine: false };
    const cell = this.board[row][col];
    if (cell.revealed || cell.flagged) return { revealed: 0 };

    // First move safety — place mines now, excluding clicked cell
    if (this.firstMove) {
      this.firstMove = false;
      this._placeMines(row, col);
    }

    if (cell.mine) {
      cell.revealed = true;
      this.gameOver = true;
      this.win = false;
      this.hitMinePos = { row, col };
      this.revealAllMines();
      return { revealed: 1, gameOver: true, win: false, hitMine: true };
    }

    // Flood fill for zero-adjacent
    const revealed = this._floodFill(row, col);
    this._checkWin();
    return { revealed, gameOver: this.gameOver, win: this.win, hitMine: false };
  }

  _floodFill(row, col) {
    const cell = this.board[row][col];
    if (cell.revealed || cell.flagged || cell.mine) return 0;

    cell.revealed = true;
    this.revealedCount++;
    let count = 1;

    if (cell.adjacent === 0) {
      for (const [nr, nc] of this._neighbors(row, col)) {
        if (this._inBounds(nr, nc)) {
          count += this._floodFill(nr, nc);
        }
      }
    }
    return count;
  }

  toggleFlag(row, col) {
    if (this.gameOver) return;
    const cell = this.board[row][col];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    this.flagCount += cell.flagged ? 1 : -1;
  }

  chord(row, col) {
    if (this.gameOver) return { revealed: 0, gameOver: true, win: this.win, hitMine: false };
    const cell = this.board[row][col];
    if (!cell.revealed || cell.adjacent <= 0) return { revealed: 0 };

    // Count flags around
    let flagCount = 0;
    for (const [nr, nc] of this._neighbors(row, col)) {
      if (this._inBounds(nr, nc) && this.board[nr][nc].flagged) flagCount++;
    }
    if (flagCount !== cell.adjacent) return { revealed: 0 };

    // Reveal all unflagged neighbors
    let totalRevealed = 0;
    let hitMine = false;
    for (const [nr, nc] of this._neighbors(row, col)) {
      if (!this._inBounds(nr, nc)) continue;
      const nCell = this.board[nr][nc];
      if (nCell.revealed || nCell.flagged) continue;
      if (nCell.mine) {
        nCell.revealed = true;
        this.gameOver = true;
        this.win = false;
        this.hitMinePos = { row: nr, col: nc };
        hitMine = true;
      } else {
        totalRevealed += this._floodFill(nr, nc);
      }
    }

    if (this.gameOver) {
      this.revealAllMines();
    } else {
      this._checkWin();
    }
    return { revealed: totalRevealed, gameOver: this.gameOver, win: this.win, hitMine };
  }

  _checkWin() {
    if (this.revealedCount >= this.safeCells) {
      this.gameOver = true;
      this.win = true;
      // Auto-flag remaining mines
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.board[r][c].mine && !this.board[r][c].flagged) {
            this.board[r][c].flagged = true;
            this.flagCount++;
          }
        }
      }
    }
  }

  revealAllMines() {
    this.wrongFlags = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].mine) {
          this.board[r][c].revealed = true;
        }
        // Mark wrong flags
        if (this.board[r][c].flagged && !this.board[r][c].mine) {
          this.wrongFlags.push({ row: r, col: c });
        }
      }
    }
  }

  getRemainingMines() {
    return this.mineCount - this.flagCount;
  }

  getFlagCount() {
    return this.flagCount;
  }

  getCell(row, col) {
    return this._inBounds(row, col) ? { ...this.board[row][col] } : null;
  }

  getWrongFlags() {
    return [...this.wrongFlags];
  }

  reset() {
    this.gameOver = false;
    this.win = false;
    this.firstMove = true;
    this.revealedCount = 0;
    this.flagCount = 0;
    this.hitMinePos = null;
    this.wrongFlags = [];
    this._initBoard();
  }
}

/* ─── MinesweeperUI ─── */
class MinesweeperUI {
  constructor() {
    this.difficulty = 'easy';
    this.board = null;
    this.timerInterval = null;
    this.elapsed = 0;
    this.timerRunning = false;
    this.flagMode = false;

    // DOM refs
    this.el = {
      board: document.getElementById('board'),
      mineCount: document.querySelector('#mine-count span'),
      timer: document.querySelector('#timer span'),
      resetBtn: document.getElementById('reset-btn'),
      diffBtns: document.querySelectorAll('.diff-btn'),
      flagToggle: document.getElementById('flag-toggle'),
      flagModeBtn: document.getElementById('flag-mode-btn'),
      overlay: document.getElementById('game-overlay'),
      overlayEmoji: document.getElementById('overlay-emoji'),
      overlayMessage: document.getElementById('overlay-message'),
      overlayStats: document.getElementById('overlay-stats'),
      playAgainBtn: document.getElementById('play-again-btn'),
    };

    this._bindEvents();
    this._calcCellSize();
    this._newGame();
    window.addEventListener('resize', () => this._calcCellSize());
  }

  _bindEvents() {
    // Reset
    this.el.resetBtn.addEventListener('click', () => this._newGame());
    // Difficulty
    this.el.diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const level = btn.dataset.level;
        if (level === this.difficulty) return;
        this.difficulty = level;
        this._updateDiffBtns();
        this._newGame();
      });
    });
    // Play Again
    this.el.playAgainBtn.addEventListener('click', () => this._newGame());
    // Flag mode (mobile)
    this.el.flagModeBtn?.addEventListener('click', () => {
      this.flagMode = !this.flagMode;
      this.el.flagModeBtn.classList.toggle('active', this.flagMode);
    });
  }

  _calcCellSize() {
    const cfg = DIFFICULTIES[this.difficulty];
    const vw = Math.min(window.innerWidth - 40, 560);
    const maxByCols = Math.floor((vw - (cfg.cols - 1) * 3) / cfg.cols);
    const size = Math.max(30, Math.min(48, maxByCols));
    document.documentElement.style.setProperty('--cell-size', size + 'px');
  }

  _newGame() {
    this._stopTimer();
    this.elapsed = 0;
    this.timerRunning = false;
    this.flagMode = false;
    if (this.el.flagModeBtn) this.el.flagModeBtn.classList.remove('active');
    this.el.overlay.classList.add('hidden');
    this._updateTimer();

    const cfg = DIFFICULTIES[this.difficulty];
    this.board = new GameBoard(cfg.rows, cfg.cols, cfg.mines);
    this._updateDiffBtns();
    this._buildGrid();
    this._render();
    this.el.resetBtn.textContent = '🙂';
  }

  _updateDiffBtns() {
    this.el.diffBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.level === this.difficulty);
    });
  }

  _startTimer() {
    if (this.timerRunning) return;
    this.timerRunning = true;
    this.timerInterval = setInterval(() => {
      this.elapsed++;
      this._updateTimer();
    }, 1000);
  }

  _stopTimer() {
    this.timerRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _updateTimer() {
    this.el.timer.textContent = this.elapsed;
  }

  _buildGrid() {
    this.el.board.innerHTML = '';
    this.el.board.style.gridTemplateColumns = `repeat(${this.board.cols}, var(--cell-size))`;
    this.el.board.style.gridTemplateRows = `repeat(${this.board.rows}, var(--cell-size))`;

    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell';
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;

        // Left click: reveal or chord
        cellEl.addEventListener('click', () => this._handleClick(r, c));
        // Right click: flag
        cellEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this._handleRightClick(r, c);
        });
        // Double click: chord (desktop)
        cellEl.addEventListener('dblclick', (e) => {
          e.preventDefault();
          if (this.flagMode) return;
          this._handleChord(r, c);
        });

        this.el.board.appendChild(cellEl);
      }
    }
  }

  _handleClick(r, c) {
    if (this.flagMode) {
      this._handleRightClick(r, c);
      return;
    }
    if (this.board.gameOver) return;
    this._startTimer();

    const cell = this.board.getCell(r, c);
    if (!cell) return;
    if (cell.revealed && cell.adjacent > 0) {
      // Chord on revealed numbered cell
      this._handleChord(r, c);
    } else {
      const result = this.board.reveal(r, c);
      this._render();
      if (result.gameOver) this._showGameOver();
    }
  }

  _handleRightClick(r, c) {
    if (this.board.gameOver) return;
    this._startTimer();
    this.board.toggleFlag(r, c);
    this._render();
  }

  _handleChord(r, c) {
    if (this.board.gameOver) return;
    const result = this.board.chord(r, c);
    this._render();
    if (result.gameOver) this._showGameOver();
  }

  _render() {
    const mineEl = this.el.mineCount;
    const remaining = this.board.getRemainingMines();
    mineEl.textContent = Math.max(0, remaining);

    // Update each cell's DOM from board state
    const cells = this.el.board.querySelectorAll('.cell');
    cells.forEach(cellEl => {
      const r = parseInt(cellEl.dataset.row);
      const c = parseInt(cellEl.dataset.col);
      const state = this.board.getCell(r, c);
      if (!state) return;

      // Reset classes
      cellEl.className = 'cell';
      cellEl.textContent = '';

      if (state.revealed) {
        cellEl.classList.add('revealed');
        if (state.mine) {
          cellEl.classList.add('mine');
          cellEl.textContent = '💣';
        } else {
          if (state.adjacent > 0) {
            cellEl.classList.add(`adj-${state.adjacent}`);
            cellEl.textContent = state.adjacent;
          }
        }
      } else if (state.flagged) {
        cellEl.classList.add('flagged');
        cellEl.textContent = '🚩';
      }
    });

    // Highlight hit mine
    if (this.board.hitMinePos) {
      const hitCell = this.el.board.querySelector(
        `.cell[data-row="${this.board.hitMinePos.row}"][data-col="${this.board.hitMinePos.col}"]`
      );
      if (hitCell) hitCell.classList.add('mine-hit');
    }

    // Mark wrong flags
    for (const { row, col } of this.board.getWrongFlags()) {
      const wfEl = this.el.board.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
      if (wfEl) {
        wfEl.classList.add('wrong-flag');
        wfEl.classList.remove('flagged');
        wfEl.textContent = '❌';
      }
    }

    // Win: mark all mines as win-flagged
    if (this.board.win) {
      for (let r = 0; r < this.board.rows; r++) {
        for (let c = 0; c < this.board.cols; c++) {
          const state = this.board.getCell(r, c);
          if (state && state.mine && state.flagged) {
            const el = this.el.board.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
            if (el) el.classList.add('win-flagged');
          }
        }
      }
    }
  }

  _showGameOver() {
    this._stopTimer();
    if (this.board.win) {
      this.el.resetBtn.textContent = '😎';
      this.el.overlayEmoji.textContent = '🎉';
      this.el.overlayMessage.textContent = '你赢了！';
    } else {
      this.el.resetBtn.textContent = '😵';
      this.el.overlayEmoji.textContent = '💥';
      this.el.overlayMessage.textContent = '踩到雷了！';
    }

    const cfg = DIFFICULTIES[this.difficulty];
    const secs = this.elapsed;
    const mins = Math.floor(secs / 60);
    const sec = secs % 60;
    const timeStr = mins > 0 ? `${mins}分${sec}秒` : `${sec}秒`;

    this.el.overlayStats.textContent = `难度：${cfg.label}\n用时：${timeStr}\n剩余雷数：${this.board.getRemainingMines()}`;
    this.el.overlay.classList.remove('hidden');
  }
}

/* ─── Boot ─── */
document.addEventListener('DOMContentLoaded', () => {
  new MinesweeperUI();
});
