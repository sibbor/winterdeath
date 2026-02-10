
import { CharacterModels } from './models/characters';
import { ZombieModels } from './models/ZombieModels';
import { BossModels } from './models/BossModels';
import { CollectibleModels } from './models/collectibles';

export const ModelFactory = {
    ...CharacterModels,
    ...ZombieModels,
    ...BossModels,
    ...CollectibleModels
};
