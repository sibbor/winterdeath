
import { CharacterModels } from './models/CharacterModels';
import { ZombieModels } from './models/ZombieModels';
import { BossModels } from './models/BossModels';
import { CollectibleModels } from './models/CollectibleModels';

export const ModelFactory = {
    ...CharacterModels,
    ...ZombieModels,
    ...BossModels,
    ...CollectibleModels
};
