// Short-lived popups at the top centre of the screen. 'level' toasts are
// bigger and stay longer; click any toast to dismiss it.
export class Toasts {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'toasts';
    parent.appendChild(this.root);
  }

  show(html: string, kind: 'level' | 'goal' | 'achievement'): void {
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.innerHTML = html;
    toast.addEventListener('click', () => toast.remove());
    this.root.appendChild(toast);
    setTimeout(() => toast.classList.add('fade'), kind === 'level' ? 6000 : 4000);
    setTimeout(() => toast.remove(), kind === 'level' ? 6500 : 4500);
  }
}
