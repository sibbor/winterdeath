
import { CharacterModels } from './models/characters';
import { ZombieModels } from './models/zombie';
import { CollectibleModels } from './models/collectibles';

export const ModelFactory = {
    ...CharacterModels,
    ...ZombieModels,
    ...CollectibleModels
};
