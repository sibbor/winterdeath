
import { CharacterModels } from './models/characters';
import { UndeadModels } from './models/undead';

export const ModelFactory = {
    ...CharacterModels,
    ...UndeadModels
};
