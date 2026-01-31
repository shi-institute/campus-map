import type { TerraDrawEventListeners } from 'terra-draw';
import { parseFeatureId } from './parseFeatureId';

export class IdStrategy {
  private lastMinId = $state(-1);

  static create() {
    const strategy = new IdStrategy();
    return { isValidId: strategy.isValidId.bind(strategy), getId: strategy.getId.bind(strategy) };
  }

  isValidId(id: FeatureId) {
    try {
      parseFeatureId(id);
      return true;
    } catch {
      return false;
    }
  }

  getId() {
    return `${this.lastMinId--}.terra-draw`;
  }
}

type FeatureId = Parameters<TerraDrawEventListeners['finish']>[0];
