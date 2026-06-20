import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { DiscoveryType } from '../components/ui/hud/game/HudTypes';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';
import { DataResolver } from '../core/data/DataResolver';

export class DiscoverySystem implements System {
    readonly systemId = SystemID.DISCOVERY_SYSTEM;
    id = 'discovery_system';
    enabled = true;
    persistent = true;

    init(session: GameSessionLogic) { }

    update(session: GameSessionLogic, delta: number) { }

    public handleDiscovery(
        session: GameSessionLogic,
        type: DiscoveryType,
        id: any,
        uiSmi: number = 0,
        titleKey: string = '',
        detailsKey: string = '',
        payload?: any
    ): boolean {
        const state = session.state;
        if (!state) return false;

        const career = state.careerStats;
        let isNew = false;

        switch (type) {
            case DiscoveryType.ZOMBIE:
                if (career?.discoveredZombies && career.discoveredZombies[id] !== 1) isNew = true;
                break;
            case DiscoveryType.BOSS:
                if (career?.discoveredBosses && career.discoveredBosses[id] !== 1) isNew = true;
                break;
            case DiscoveryType.CLUE: {
                const clueSmi = DataResolver.resolveClueID(id);
                if (clueSmi !== undefined && career?.discoveredClues && career.discoveredClues[clueSmi] !== 1) isNew = true;
                break;
            }
            case DiscoveryType.POI: {
                const poiSmi = DataResolver.resolvePoiID(id);
                if (poiSmi !== undefined && career?.discoveredPois && career.discoveredPois[poiSmi] !== 1) isNew = true;
                break;
            }
            case DiscoveryType.COLLECTIBLE: {
                const colSmi = DataResolver.resolveCollectibleID(id);
                if (colSmi !== undefined && career?.discoveredCollectibles && career.discoveredCollectibles[colSmi] !== 1) isNew = true;
                break;
            }
            case DiscoveryType.PERK: {
                const perkSmi = Number(uiSmi !== undefined ? uiSmi : id);
                if (career?.discoveredPerks && perkSmi < career.discoveredPerks.length && !career.discoveredPerks[perkSmi]) {
                    isNew = true;
                    uiSmi = perkSmi;
                }
                break;
            }
        }

        if (isNew) {
            const smi = uiSmi || (typeof id === 'number' ? id : 0);
            UIEventRingBuffer.push(UIEventType.DISCOVERY, smi, type, state.simTime);

            // Persist the discovery directly to the career profile
            switch (type) {
                case DiscoveryType.ZOMBIE:
                    if (career?.discoveredZombies) career.discoveredZombies[id] = 1;
                    break;
                case DiscoveryType.BOSS:
                    if (career?.discoveredBosses) career.discoveredBosses[id] = 1;
                    break;
                case DiscoveryType.CLUE: {
                    const clueSmi = DataResolver.resolveClueID(id);
                    if (clueSmi !== undefined) {
                        if (career?.discoveredClues) career.discoveredClues[clueSmi] = 1;
                    }
                    break;
                }
                case DiscoveryType.POI: {
                    const poiSmi = DataResolver.resolvePoiID(id);
                    if (poiSmi !== undefined) {
                        if (career?.discoveredPois) career.discoveredPois[poiSmi] = 1;
                    }
                    break;
                }
                case DiscoveryType.COLLECTIBLE: {
                    const colSmi = DataResolver.resolveCollectibleID(id);
                    if (colSmi !== undefined) {
                        if (career?.discoveredCollectibles) career.discoveredCollectibles[colSmi] = 1;
                    }
                    break;
                }
                case DiscoveryType.PERK: {
                    const perkSmi = Number(uiSmi !== undefined ? uiSmi : id);
                    if (career?.discoveredPerks && perkSmi < career.discoveredPerks.length) {
                        career.discoveredPerks[perkSmi] = 1;
                    }
                    break;
                }
            }
            return true;
        }

        return false;
    }
}