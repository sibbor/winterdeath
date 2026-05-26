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

    init(session: GameSessionLogic) {}

    update(session: GameSessionLogic, delta: number) {}

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

        const sets = state.discoverySets;
        const stats = state.sessionStats;
        let isNew = false;

        switch (type) {
            case DiscoveryType.ZOMBIE:
                if (!sets.seenEnemies.has(id)) isNew = true;
                break;
            case DiscoveryType.BOSS:
                if (!sets.seenBosses.has(id)) isNew = true;
                break;
            case DiscoveryType.CLUE: {
                const clueSmi = DataResolver.resolveClueID(id);
                if (clueSmi !== undefined && !sets.clues.has(clueSmi)) isNew = true;
                break;
            }
            case DiscoveryType.POI: {
                const poiSmi = DataResolver.resolvePoiID(id);
                if (poiSmi !== undefined && !sets.pois.has(poiSmi)) isNew = true;
                break;
            }
            case DiscoveryType.COLLECTIBLE: {
                const colSmi = DataResolver.resolveCollectibleID(id);
                if (colSmi !== undefined && !sets.collectibles.has(colSmi)) isNew = true;
                break;
            }
            case DiscoveryType.PERK: {
                const perkSmi = Number(uiSmi !== undefined ? uiSmi : id);
                const globalDiscovered = state.stats?.discoveredPerksMap ? state.stats.discoveredPerksMap[perkSmi] === 1 : false;

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

            if (state.isPlayground) return true; // Block career persistence

            // Persist the discovery
            switch (type) {
                case DiscoveryType.ZOMBIE: sets.seenEnemies.add(id); break;
                case DiscoveryType.BOSS: sets.seenBosses.add(id); break;
                case DiscoveryType.CLUE: {
                    const clueSmi = DataResolver.resolveClueID(id);
                    if (clueSmi !== undefined) sets.clues.add(clueSmi);
                    break;
                }
                case DiscoveryType.POI: {
                    const poiSmi = DataResolver.resolvePoiID(id);
                    if (poiSmi !== undefined) sets.pois.add(poiSmi);
                    break;
                }
                case DiscoveryType.COLLECTIBLE: {
                    const colSmi = DataResolver.resolveCollectibleID(id);
                    if (colSmi !== undefined) sets.collectibles.add(colSmi);
                    break;
                }
                case DiscoveryType.PERK: {
                    const perkSmi = Number(uiSmi !== undefined ? uiSmi : id);
                    if (stats.discoveredPerksMap && perkSmi < stats.discoveredPerksMap.length) {
                        stats.discoveredPerksMap[perkSmi] = 1;
                    }
                    if (state.stats && state.stats.discoveredPerksMap && perkSmi < state.stats.discoveredPerksMap.length) {
                        state.stats.discoveredPerksMap[perkSmi] = 1;
                    }
                    break;
                }
            }
            return true;
        }

        return false;
    }
}
