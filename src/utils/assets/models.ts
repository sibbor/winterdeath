
import { CharacterModels } from './models/characters';
import { UndeadModels } from './models/undead';
import { CollectibleModels } from './models/collectibles';

export const ModelFactory = {
    ...CharacterModels,
    ...UndeadModels,
    ...CollectibleModels
};
