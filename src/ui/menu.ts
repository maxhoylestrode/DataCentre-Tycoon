import { CONFIG, type Difficulty, DIFFICULTIES } from '../config';

const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  relaxed: 'Lower overhead and tax, fewer incidents, gentler reputation losses.',
  normal: 'The game as designed: big companies have to work for their profit.',
  tough: 'Higher overhead and tax, more incidents, harsher reputation losses.',
};

export interface MenuHandlers {
  onSetDifficulty(difficulty: Difficulty): void;
  onSetDayLighting(on: boolean): void;
  onSaveNow(): boolean;
  onExport(): void;
  // Returns an error message, or null when the file is a valid save.
  onImportFile(file: File): Promise<string | null>;
  onConfirmImport(): void;
  onSetAutosave(on: boolean): void;
  onSetSound(on: boolean): void;
  onSetVolume(volume: number): void;
  onNewGame(): void;
}

export interface MenuSettings {
  autosave: boolean;
  sound: boolean;
  volume: number;
  dayLighting: boolean;
}

// Save/settings menu, opened from a button in the top-right corner.
// Destructive actions use an in-page second click to confirm rather than
// browser dialogs.
export class Menu {
  private readonly panel: HTMLElement;
  private readonly status: HTMLElement;
  private readonly message: HTMLElement;
  private readonly importConfirm: HTMLElement;
  private readonly newGameButton: HTMLButtonElement;
  private readonly difficulty: HTMLSelectElement;
  private readonly difficultyNote: HTMLElement;
  private confirmingNewGame = false;
  private lastSavedAt: Date | null = null;

  constructor(parent: HTMLElement, settings: MenuSettings, handlers: MenuHandlers) {
    const toggle = document.createElement('button');
    toggle.className = 'menu-toggle';
    toggle.textContent = '⚙ Menu';
    parent.appendChild(toggle);

    this.panel = document.createElement('div');
    this.panel.className = 'menu';
    this.panel.innerHTML = `
      <h2>Game</h2>
      <div class="status muted"></div>
      <div class="row"><button data-act="save">Save now</button><button data-act="export">Export save</button><button data-act="import">Import save</button></div>
      <div class="import-confirm">
        <div>Replace your current game with the imported save?</div>
        <div class="row"><button data-act="import-yes">Replace</button><button data-act="import-no">Cancel</button></div>
      </div>
      <label class="row"><input type="checkbox" data-act="autosave"> Autosave (every 30s and when you leave)</label>
      <label class="row"><input type="checkbox" data-act="sound"> Sound</label>
      <label class="row volume">Volume <input type="range" min="0" max="100" step="5" data-act="volume"></label>
      <label class="row"><input type="checkbox" data-act="daylight"> Day and night lighting</label>
      <label class="row difficulty">Difficulty
        <select data-act="difficulty">${DIFFICULTIES.map((d) => `<option value="${d}">${CONFIG.difficulty[d].name}</option>`).join('')}</select>
      </label>
      <div class="muted fine difficulty-note"></div>
      <div class="row"><button data-act="new" class="danger">New game</button></div>
      <div class="message"></div>
      <input type="file" accept=".json,application/json" hidden>
    `;
    parent.appendChild(this.panel);

    const q = <T extends HTMLElement>(sel: string): T => this.panel.querySelector(sel) as T;
    this.status = q('.status');
    this.message = q('.message');
    this.importConfirm = q('.import-confirm');
    this.newGameButton = q<HTMLButtonElement>('[data-act="new"]');
    const fileInput = q<HTMLInputElement>('input[type="file"]');
    const autosaveBox = q<HTMLInputElement>('[data-act="autosave"]');
    autosaveBox.checked = settings.autosave;
    const soundBox = q<HTMLInputElement>('[data-act="sound"]');
    soundBox.checked = settings.sound;
    soundBox.addEventListener('change', () => handlers.onSetSound(soundBox.checked));
    const volume = q<HTMLInputElement>('[data-act="volume"]');
    volume.value = String(Math.round(settings.volume * 100));
    volume.addEventListener('input', () => handlers.onSetVolume(Number(volume.value) / 100));
    const daylight = q<HTMLInputElement>('[data-act="daylight"]');
    daylight.checked = settings.dayLighting;
    daylight.addEventListener('change', () => handlers.onSetDayLighting(daylight.checked));
    this.difficulty = q<HTMLSelectElement>('[data-act="difficulty"]');
    this.difficultyNote = q('.difficulty-note');
    this.difficulty.addEventListener('change', () => handlers.onSetDifficulty(this.difficulty.value as Difficulty));

    toggle.addEventListener('click', () => {
      this.panel.classList.toggle('open');
      this.resetConfirms();
      toggle.blur();
    });

    q('[data-act="save"]').addEventListener('click', () => {
      this.say(handlers.onSaveNow() ? 'Saved.' : 'Could not save: browser storage is unavailable.');
    });
    q('[data-act="export"]').addEventListener('click', () => {
      handlers.onExport();
      this.say('Save file downloaded.');
    });
    q('[data-act="import"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      const error = await handlers.onImportFile(file);
      if (error) {
        this.say(error, true);
        return;
      }
      this.say('');
      this.importConfirm.classList.add('visible');
    });
    q('[data-act="import-yes"]').addEventListener('click', () => handlers.onConfirmImport());
    q('[data-act="import-no"]').addEventListener('click', () => this.importConfirm.classList.remove('visible'));
    autosaveBox.addEventListener('change', () => handlers.onSetAutosave(autosaveBox.checked));

    this.newGameButton.addEventListener('click', () => {
      if (!this.confirmingNewGame) {
        this.confirmingNewGame = true;
        this.newGameButton.textContent = 'Click again to wipe your game';
        return;
      }
      handlers.onNewGame();
      this.resetConfirms();
      this.say('Started a new game.');
    });
  }

  markSaved(at: Date): void {
    this.lastSavedAt = at;
  }

  // Shown on startup when an existing save could not be loaded.
  say(text: string, isError = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('error', isError);
    if (isError) this.panel.classList.add('open');
  }

  update(difficulty: Difficulty): void {
    if (!this.panel.classList.contains('open')) return;
    const text = this.lastSavedAt ? `Last saved ${this.lastSavedAt.toLocaleTimeString('en-GB')}` : 'Not saved yet';
    if (this.status.textContent !== text) this.status.textContent = text;
    if (document.activeElement !== this.difficulty && this.difficulty.value !== difficulty) this.difficulty.value = difficulty;
    const note = DIFFICULTY_NOTES[difficulty];
    if (this.difficultyNote.textContent !== note) this.difficultyNote.textContent = note;
  }

  private resetConfirms(): void {
    this.confirmingNewGame = false;
    this.newGameButton.textContent = 'New game';
    this.importConfirm.classList.remove('visible');
  }
}
