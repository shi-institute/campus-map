import { createSubscriber } from 'svelte/reactivity';
import * as Y from 'yjs';

export class SvelteYUndoManager {
  protected manager: Y.UndoManager;
  protected subscribe: () => void;

  constructor(
    typeScope: ConstructorParameters<typeof Y.UndoManager>[0],
    options?: ConstructorParameters<typeof Y.UndoManager>[1]
  ) {
    this.manager = new Y.UndoManager(typeScope, { ...options });
    setTimeout(() => {
      this.manager.addTrackedOrigin(this.manager);
    });

    this.subscribe = createSubscriber((update) => {
      this.manager.on('stack-item-updated', update);
      this.manager.on('stack-item-added', update);
      this.manager.on('stack-item-popped', update);
      return () => {
        this.manager.off('stack-item-updated', update);
        this.manager.off('stack-item-added', update);
        this.manager.off('stack-item-popped', update);
      };
    });
  }

  get current() {
    return this.manager;
  }

  /**
   * Pauses the undo manager from recording any changes.
   *
   * @returns A function that should be called when you want to resume recording changes.
   */
  pause() {
    const currentScopes = this.manager.scope;
    this.manager.scope = [];
    return () => {
      this.manager.scope = currentScopes;
    };
  }

  undo() {
    this.manager.undo();
  }

  redo() {
    this.manager.redo();
  }

  stopCapturing() {
    this.manager.stopCapturing();
  }

  clear() {
    this.manager.clear();
  }

  get canUndo() {
    this.subscribe();
    return this.manager.canUndo();
  }

  get canRedo() {
    this.subscribe();
    return this.manager.canRedo();
  }

  get undoStack() {
    this.subscribe();
    return this.manager.undoStack;
  }

  get redoStack() {
    this.subscribe();
    return this.manager.redoStack;
  }
}
