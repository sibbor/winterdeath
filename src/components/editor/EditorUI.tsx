
import React from 'react';
import * as THREE from 'three';
import { EditorSystem } from '../../core/editor/EditorSystem';
import { t } from '../../utils/i18n';
import { EditorPersistence } from '../../utils/editorPersistence';

interface EditorUIProps {
    editor: EditorSystem;
    onExport: () => void;
    currentSectorName: string;
    setSectorName: (name: string) => void;
    isPlaying: boolean;
    onPlayToggle: () => void;
    onClose: () => void;
}

const EditorUI: React.FC<EditorUIProps> = ({
    editor, onExport, currentSectorName, setSectorName, isPlaying, onPlayToggle, onClose
}) => {
    const [activeCategory, setActiveCategory] = React.useState('nature');
    const [activeSidebar, setActiveSidebar] = React.useState<'inspector' | 'environment' | 'assets' | null>(null);
    const [showLoadDialog, setShowLoadDialog] = React.useState(false);
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    React.useEffect(() => {
        editor.onChange = () => forceUpdate();
        return () => { editor.onChange = null; };
    }, [editor]);

    const categories = {
        nature: ['spruce', 'pine', 'birch', 'rock', 'hedge'],
        buildings: ['WallSection', 'Corner', 'DoorFrame', 'WindowFrame', 'Floor'],
        props: ['car', 'lamp', 'barrel', 'explosive_barrel', 'fence', 'stonewall'],
        entities: ['WALKER', 'RUNNER', 'TANK', 'BOMBER', 'standard_chest', 'big_chest'],
        logic: ['player_spawn', 'family_spawn', 'boss_spawn', 'story_trigger']
    };

    const selectedObject = editor.selectedObjectId ?
        editor.currentSector.objects.find(o => o.id === editor.selectedObjectId) : null;

    const handlePropertyChange = (prop: string, axis: 'x' | 'y' | 'z', value: number) => {
        if (!editor.selectedObjectId) return;

        const obj = editor.currentSector.objects.find(o => o.id === editor.selectedObjectId);
        if (!obj) return;

        if (prop === 'position') {
            const newPos = { ...obj.position, [axis]: value };
            editor.moveObject(obj.id, new THREE.Vector3(newPos.x, newPos.y, newPos.z));
        } else if (prop === 'rotation') {
            let finalValue = value;
            if (editor.snapToGrid && axis === 'y') {
                const degrees = (value * 180) / Math.PI;
                const snappedDegrees = Math.round(degrees / 45) * 45;
                finalValue = (snappedDegrees * Math.PI) / 180;
            }
            obj.rotation[axis] = finalValue;
            const mesh = editor.scene.children.find(c => c.userData.id === obj.id);
            if (mesh) mesh.rotation[axis] = finalValue;
        } else if (prop === 'scale') {
            editor.scaleObject(obj.id, value);
        }
        forceUpdate();
    };

    const handlePrePlacementChange = (prop: string, axis: 'x' | 'y' | 'z', value: number) => {
        const current = editor.prePlacementObject;
        if (prop === 'rotation') {
            let finalValue = value;
            if (editor.snapToGrid && axis === 'y') {
                const degrees = (value * 180) / Math.PI;
                const snappedDegrees = Math.round(degrees / 45) * 45;
                finalValue = (snappedDegrees * Math.PI) / 180;
            }
            editor.updatePrePlacement({ rotation: { ...current.rotation, [axis]: finalValue } });
        } else if (prop === 'scale') {
            editor.updatePrePlacement({ scale: { ...current.scale, [axis]: value } });
        }
        forceUpdate();
    };

    const savedSectors = EditorPersistence?.listSectors() || [];

    return (
        <div className="editor-ui">
            <div className="editor-header" onMouseDown={(e) => e.stopPropagation()}>
                {/* ROW 1: System Controls */}
                <div className="header-row top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '20px' }}>
                        <div style={{ width: '4px', height: '24px', background: '#dc2626' }} />
                        <h4 style={{ margin: 0, color: '#dc2626', fontWeight: 900, fontStyle: 'italic', fontSize: '12px' }}>VINTERDÖD // EDITOR</h4>
                    </div>

                    <input
                        value={currentSectorName}
                        onChange={(e) => setSectorName(e.target.value)}
                        placeholder="Sector Name"
                        style={{ width: '200px' }}
                    />

                    <div style={{ display: 'flex', gap: '10px', marginLeft: '20px' }}>
                        <button onClick={onPlayToggle} style={{ background: isPlaying ? '#dc2626' : '#111', border: isPlaying ? '1px solid #ff0000' : '1px solid #444', minWidth: '120px' }}>
                            {isPlaying ? '■ STOP TEST' : '▶ START TEST'}
                        </button>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                        <button className="btn-prologue" onClick={() => setShowLoadDialog(!showLoadDialog)}>LOAD</button>
                        <button className="btn-prologue" onClick={() => editor.save()}>SAVE</button>
                        <button className="btn-prologue" onClick={onExport} style={{ background: '#dc2626', color: '#fff' }}>EXPORT</button>
                        <button onClick={onClose} className="btn-close" style={{ background: '#ef4444', borderColor: '#ef4444' }}>CLOSE</button>
                    </div>
                </div>

                {/* ROW 2: Context & Tools */}
                {!isPlaying && (
                    <div className="header-row bottom">
                        <button
                            className={`btn-prologue ${activeSidebar === 'environment' ? 'active' : ''}`}
                            onClick={() => setActiveSidebar(activeSidebar === 'environment' ? null : 'environment')}
                        >
                            ENVIRONMENT
                        </button>
                        <button
                            className={`btn-prologue ${activeSidebar === 'inspector' ? 'active' : ''}`}
                            onClick={() => setActiveSidebar(activeSidebar === 'inspector' ? null : 'inspector')}
                        >
                            SCENE INSPECTOR
                        </button>

                        <div style={{ display: 'flex', gap: '8px', padding: '0 10px', marginLeft: '20px', borderLeft: '1px solid rgba(220, 38, 38, 0.2)' }}>
                            <button
                                className={`btn-prologue ${editor.currentTool === 'SELECT' ? 'active' : ''}`}
                                onClick={() => editor.setTool('SELECT')}
                            >
                                SELECT
                            </button>
                            <button
                                className={`btn-prologue ${editor.currentTool === 'PLACE' ? 'active' : ''}`}
                                onClick={() => { editor.setTool('PLACE'); setActiveSidebar('assets'); }}
                            >
                                PLACE
                            </button>
                            <button
                                className={`btn-prologue ${editor.currentTool === 'PATH' ? 'active' : ''}`}
                                onClick={() => editor.setTool('PATH')}
                            >
                                PATH
                            </button>
                            <button
                                className={`btn-prologue ${editor.currentTool === 'SHAPE' ? 'active' : ''}`}
                                onClick={() => editor.setTool('SHAPE')}
                            >
                                SHAPE
                            </button>
                        </div>

                        <div style={{ marginLeft: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 'bold', color: '#888' }}>
                            <input id="snapToGrid" type="checkbox" checked={editor.snapToGrid} onChange={(e) => {
                                editor.snapToGrid = e.target.checked;
                                forceUpdate();
                            }} />
                            <label htmlFor="snapToGrid" style={{ transform: 'skewX(-5deg)', textTransform: 'uppercase', cursor: 'pointer' }}>SNAP</label>
                        </div>
                    </div>
                )}
            </div>

            {/* Load Dialog Overlay */}
            {showLoadDialog && (
                <div style={{ position: 'absolute', top: '70px', right: '120px', background: '#0a0a0a', border: '1px solid #dc2626', padding: '15px', zIndex: 1000, minWidth: '200px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
                    <h5 style={{ margin: '0 0 10px 0', color: '#dc2626', fontSize: '10px' }}>LOAD SECTOR</h5>
                    <div className="sector-list">
                        {EditorPersistence.listSectors().map((s: any) => (
                            <button key={s.name} onClick={() => {
                                editor.load(s.name);
                                setSectorName(s.name);
                                setShowLoadDialog(false);
                            }}>
                                {s.name}
                            </button>
                        ))}
                        {EditorPersistence.listSectors().length === 0 && (
                            <div style={{ color: '#444', fontSize: '10px' }}>No saved sectors</div>
                        )}
                    </div>
                </div>
            )}

            {editor.hoveredObjectId && !isPlaying && (
                <div style={{
                    position: 'absolute',
                    bottom: '100px',
                    left: '50%',
                    transform: 'translateX(-50%) skewX(-5deg)',
                    background: 'rgba(0,0,0,0.85)',
                    border: '1px solid #dc2626',
                    padding: '10px 25px',
                    pointerEvents: 'none',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    boxShadow: '0 0 30px rgba(220,38,38,0.4)'
                }}>
                    <div style={{ width: '4px', height: '25px', background: '#dc2626' }} />
                    <span style={{ color: '#fff', fontWeight: 900, fontSize: '16px', fontStyle: 'italic', letterSpacing: '1px', textTransform: 'uppercase' }}>
                        {(() => {
                            const obj = editor.currentSector.objects.find(o => o.id === editor.hoveredObjectId);
                            if (obj) return obj.type;
                            if (editor.hoveredObjectId.includes('Spawn')) return editor.hoveredObjectId.replace('Spawn_', 'SPAWN: ');
                            return 'OBJECT';
                        })()}
                    </span>
                    <span style={{ color: '#666', fontSize: '12px', fontWeight: 'bold' }}>#{editor.hoveredObjectId.slice(0, 8)}</span>
                </div>
            )}

            {!isPlaying && (
                <div style={{ display: 'flex', height: '100%', pointerEvents: 'none' }}>
                    {/* LEFT SIDEBAR: Assets / Inspector / Environment */}
                    {activeSidebar && (
                        <div className="editor-side-panel" onMouseDown={(e) => e.stopPropagation()}>
                            {activeSidebar === 'assets' && (
                                <>
                                    <h3>ASSETS</h3>
                                    <div className="category-tabs">
                                        {Object.keys(categories).map(cat => (
                                            <button
                                                key={cat}
                                                className={`btn-prologue ${activeCategory === cat ? 'active' : ''}`}
                                                onClick={() => setActiveCategory(cat)}
                                                style={{ fontSize: '10px', padding: '6px 12px' }}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="asset-grid">
                                        {(categories as any)[activeCategory].map((type: string) => (
                                            <button
                                                key={type}
                                                className={`btn-prologue ${editor.placementType === type ? 'active' : ''}`}
                                                onClick={() => { editor.setPlacementType(type); forceUpdate(); }}
                                                style={{ fontSize: '9px', padding: '8px', minWidth: '80px' }}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}

                            {activeSidebar === 'inspector' && (
                                <>
                                    <h3>SCENE INSPECTOR</h3>
                                    <div style={{ flex: 1, overflowY: 'auto', pointerEvents: 'auto' }}>
                                        {editor.currentSector.objects.map((obj) => (
                                            <div
                                                key={obj.id}
                                                style={{
                                                    padding: '8px 12px',
                                                    background: editor.selectedObjectId === obj.id ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.05)',
                                                    borderLeft: editor.selectedObjectId === obj.id ? '3px solid #dc2626' : '3px solid transparent',
                                                    marginBottom: '4px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    fontSize: '13px'
                                                }}
                                                onClick={() => {
                                                    editor.selectObject(obj.id);
                                                    const mesh = editor.scene.children.find(c => c.userData.id === obj.id);
                                                    if (mesh) {
                                                        const worldPos = new THREE.Vector3();
                                                        mesh.getWorldPosition(worldPos);
                                                        editor.focusCamera(worldPos);
                                                    }
                                                    forceUpdate();
                                                }}
                                            >
                                                <span style={{ color: '#fff', fontWeight: 'bold' }}>{obj.type}</span>
                                                <span style={{ color: '#666', fontSize: '10px' }}>#{obj.id.slice(0, 6)}</span>
                                            </div>
                                        ))}
                                        {editor.currentSector.objects.length === 0 && (
                                            <div style={{ color: '#444', fontStyle: 'italic', textAlign: 'center', marginTop: '20px', pointerEvents: 'none' }}>No objects in scene</div>
                                        )}
                                    </div>
                                </>
                            )}

                            {activeSidebar === 'environment' && (
                                <>
                                    <h3>ENVIRONMENT</h3>
                                    <div className="property-group">
                                        <label>WEATHER</label>
                                        <select
                                            value={editor.currentSector.environment.weather}
                                            onChange={(e) => {
                                                editor.currentSector.environment.weather = e.target.value as any;
                                                editor.updateEnvironmentVisuals();
                                                forceUpdate();
                                            }}
                                        >
                                            <option value="none">Clear</option>
                                            <option value="snow">Snow</option>
                                            <option value="rain">Rain</option>
                                            <option value="ash">Ash</option>
                                        </select>
                                    </div>
                                    <div className="property-group">
                                        <label>GROUND MATERIAL</label>
                                        <select
                                            value={editor.currentSector.environment.groundColor === 0xddddff ? 'snow' : editor.currentSector.environment.groundColor === 0x445544 ? 'grass' : 'gravel'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === 'snow') editor.currentSector.environment.groundColor = 0xddddff;
                                                else if (val === 'grass') editor.currentSector.environment.groundColor = 0x445544;
                                                else editor.currentSector.environment.groundColor = 0x888888;
                                                editor.updateEnvironmentVisuals();
                                                forceUpdate();
                                            }}
                                        >
                                            <option value="snow">Snow (White)</option>
                                            <option value="grass">Grass (Green)</option>
                                            <option value="gravel">Gravel (Grey)</option>
                                        </select>
                                    </div>
                                    <div className="property-group">
                                        <label>TIME OF DAY</label>
                                        <select
                                            value={editor.currentSector.environment.timeOfDay}
                                            onChange={(e) => {
                                                editor.currentSector.environment.timeOfDay = e.target.value as any;
                                                editor.updateEnvironmentVisuals();
                                                forceUpdate();
                                            }}
                                        >
                                            <option value="day">Day</option>
                                            <option value="night">Night</option>
                                        </select>
                                    </div>
                                    <div className="property-group">
                                        <label>AMBIENT LIGHT</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={editor.currentSector.environment.ambientIntensity}
                                            onChange={(e) => {
                                                editor.currentSector.environment.ambientIntensity = parseFloat(e.target.value);
                                                editor.updateEnvironmentVisuals();
                                                forceUpdate();
                                            }}
                                        />
                                    </div>
                                    <div className="property-group">
                                        <label>FOG DENSITY</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="0.1"
                                            step="0.005"
                                            value={editor.currentSector.environment.fogDensity}
                                            onChange={(e) => {
                                                editor.currentSector.environment.fogDensity = parseFloat(e.target.value);
                                                editor.updateEnvironmentVisuals();
                                                forceUpdate();
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div style={{ flex: 1 }} />

                    {/* Properties Sidebar (Right) - Visible when object selected OR when placing */}
                    {(selectedObject || ['PLACE', 'PATH', 'SHAPE'].includes(editor.currentTool)) && (
                        <div className="editor-side-panel right" onMouseDown={(e) => e.stopPropagation()}>
                            <h3>{selectedObject ? 'PROPERTIES' : 'PLACEMENT SETTINGS'}</h3>

                            {/* Tool specific "End" buttons */}
                            {editor.currentTool === 'PATH' && (
                                <button className="btn-prologue" style={{ width: '100%', marginBottom: '15px' }} onClick={() => editor.finishPath()}>END PATH</button>
                            )}
                            {editor.currentTool === 'SHAPE' && (
                                <button className="btn-prologue" style={{ width: '100%', marginBottom: '15px' }} onClick={() => editor.finishShape()}>END SHAPE</button>
                            )}

                            {selectedObject && (
                                <div className="property-group">
                                    <label>POSITION</label>
                                    <div className="coord-grid">
                                        <div className="coord-input">
                                            <span>X</span>
                                            <input
                                                type="number"
                                                value={selectedObject.position.x}
                                                onChange={(e) => handlePropertyChange('position', 'x', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div className="coord-input">
                                            <span>Y</span>
                                            <input
                                                type="number"
                                                value={selectedObject.position.y}
                                                onChange={(e) => handlePropertyChange('position', 'y', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div className="coord-input">
                                            <span>Z</span>
                                            <input
                                                type="number"
                                                value={selectedObject.position.z}
                                                onChange={(e) => handlePropertyChange('position', 'z', parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="property-group">
                                <label>ROTATION Y</label>
                                <input
                                    type="range"
                                    min="0"
                                    max={Math.PI * 2}
                                    step="0.01"
                                    value={selectedObject ? selectedObject.rotation.y : editor.prePlacementObject.rotation.y}
                                    onChange={(e) => selectedObject ?
                                        handlePropertyChange('rotation', 'y', parseFloat(e.target.value)) :
                                        handlePrePlacementChange('rotation', 'y', parseFloat(e.target.value))
                                    }
                                />
                                <div style={{ fontSize: '10px', color: '#555' }}>
                                    {Math.round(((selectedObject ? selectedObject.rotation.y : editor.prePlacementObject.rotation.y) * 180) / Math.PI)}°
                                </div>
                            </div>

                            <div className="property-group">
                                <label>SCALE</label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    value={selectedObject ? selectedObject.scale.x : editor.prePlacementObject.scale.x}
                                    onChange={(e) => selectedObject ?
                                        handlePropertyChange('scale', 'x', parseFloat(e.target.value)) :
                                        handlePrePlacementChange('scale', 'x', parseFloat(e.target.value))
                                    }
                                />
                                <div className="property-value">{selectedObject ? selectedObject.scale.x.toFixed(2) : editor.prePlacementObject.scale.x.toFixed(2)}x</div>
                            </div>

                            {selectedObject && (
                                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                    <button
                                        className="btn-prologue"
                                        style={{ flex: 1, background: '#dc2626', color: '#fff' }}
                                        onClick={() => editor.deleteObject(selectedObject.id)}
                                    >
                                        DELETE
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hover Tooltip */}
                    {editor.hoveredObjectId && (
                        <div
                            className="editor-tooltip"
                            style={{
                                left: `${editor.lastMousePos.x}px`,
                                top: `${editor.lastMousePos.y}px`
                            }}
                        >
                            {editor.currentSector.objects.find(o => o.id === editor.hoveredObjectId)?.type ||
                                editor.currentSector.paths.find(p => p.id === editor.hoveredObjectId)?.type || 'Object'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EditorUI;
