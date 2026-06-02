import { System, SystemID } from './System';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
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

        const sets = state.discovery.discoverySets;
        const stats = state.sessionStats;
        let isNew = false;

        switch (type) {
            case DiscoveryType.ZOMBIE:
                if (!sets.discoveredZombies.has(id)) isNew = true;
                break;
            case DiscoveryType.BOSS:
                if (!sets.discoveredBosses.has(id)) isNew = true;
                break;
            case DiscoveryType.CLUE: {
                const clueSmi = DataResolver.resolveClueID(id);
                if (clueSmi !== undefined && !sets.discoveredClues.has(clueSmi)) isNew = true;
                break;
            }
            case DiscoveryType.POI: {
                const poiSmi = DataResolver.resolvePoiID(id);
                if (poiSmi !== undefined && !sets.discoveredPois.has(poiSmi)) isNew = true;
                break;
            }
            case DiscoveryType.COLLECTIBLE: {
                const colSmi = DataResolver.resolveCollectibleID(id);
                if (colSmi !== undefined && !sets.discoveredCollectibles.has(colSmi)) isNew = true;
                break;
            }
            case DiscoveryType.PERK: {
                const perkSmi = Number(uiSmi !== undefined ? uiSmi : id);
                const globalDiscovered = state.careerStats?.discoveredPerksMap ? state.careerStats.discoveredPerksMap[perkSmi] === 1 : false;

                if (stats.discoveredPerksMap && perkSmi < stats.discoveredPerksMap.length && !stats.discoveredPerksMap[perkSmi] && !globalDiscovered) {
                    isNew = true;
                    uiSmi = perkSmi;
                }
                break;
            }
        }

        if (isNew) {
            const smi = uiSmi || (typeof id === 'number' ? id : 0);
            UIEventRingBuffer.push(UIEventType.DISCOVERY, smi, type, state.simTime);

            // Persist the discovery to session sets (deduplication)
            switch (type) {
                case DiscoveryType.ZOMBIE: sets.discoveredZombies.add(id); break;
                case DiscoveryType.BOSS: sets.discoveredBosses.add(id); break;
                case DiscoveryType.CLUE: {
                    const clueSmi = DataResolver.resolveClueID(id);
                    if (clueSmi !== undefined) sets.discoveredClues.add(clueSmi);
                    break;
                }
                case DiscoveryType.POI: {
                    const poiSmi = DataResolver.resolvePoiID(id);
                    if (poiSmi !== undefined) sets.discoveredPois.add(poiSmi);
                    break;
                }
                case DiscoveryType.COLLECTIBLE: {
                    const colSmi = DataResolver.resolveCollectibleID(id);
                    if (colSmi !== undefined) sets.discoveredCollectibles.add(colSmi);
                    break;
                }
                case DiscoveryType.PERK: {
                    const perkSmi = Number(uiSmi !== undefined ? uiSmi : id);
                    if (stats.discoveredPerksMap && perkSmi < stats.discoveredPerksMap.length) {
                        stats.discoveredPerksMap[perkSmi] = 1;
                    }
                    if (state.careerStats && state.careerStats.discoveredPerksMap && perkSmi < state.careerStats.discoveredPerksMap.length) {
                        state.careerStats.discoveredPerksMap[perkSmi] = 1;
                    }
                    break;
                }
            }
            return true;
        }

        return false;
    }
}
