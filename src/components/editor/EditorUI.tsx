
import React from 'react';
import * as THREE from 'three';
import { EditorSystem } from '../../core/editor/EditorSystem';
import { t } from '../../utils/i18n';

interface EditorUIProps {
    editor: EditorSystem;
    onExport: () => void;
    currentSectorName: string;
    setSectorName: (name: string) => void;
}

const EditorUI: React.FC<EditorUIProps> = ({ editor, onExport, currentSectorName, setSectorName }) => {
    // We would normally use useTranslation() but I'll use a direct reference for simplicity or if i18n is setup differently
    // Based on previous files, let's assume T is available or we just use hardcoded strings/ids as per rules.

    const [activeCategory, setActiveCategory] = React.useState('props');
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    const categories = {
        props: ['spruce', 'pine', 'birch', 'rock', 'car', 'lamp', 'barrel', 'explosive_barrel', 'hedge', 'fence', 'stonewall'],
        buildings: ['WallSection', 'Corner', 'DoorFrame', 'WindowFrame', 'Floor'],
        enemies: ['WALKER', 'RUNNER', 'TANK', 'BOMBER'],
        triggers: ['standard_chest', 'big_chest', 'story_trigger']
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
            // Simplify: editor only exposes rotateObject with angle, let's make it more direct for UI
            const mesh = (editor as any).editorObjects.get(obj.id);
            if (mesh) {
                mesh.rotation[axis] = value;
                obj.rotation[axis] = value;
            }
        } else if (prop === 'scale') {
            editor.scaleObject(obj.id, value);
        }
        forceUpdate();
    };

    return (
        <div className="editor-ui" onMouseDown={(e) => e.stopPropagation()}>
            <div className="editor-top-bar">
                <input
                    value={currentSectorName}
                    onChange={(e) => setSectorName(e.target.value)}
                    placeholder="Sector Name"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <button onClick={() => {
                    editor.currentTool = 'SELECT';
                    forceUpdate();
                }} style={{ background: editor.currentTool === 'SELECT' ? '#2563eb' : '#444' }}>Select</button>
                <button onClick={() => {
                    editor.currentTool = 'PLACE';
                    forceUpdate();
                }} style={{ background: editor.currentTool === 'PLACE' ? '#2563eb' : '#444' }}>Place</button>
                <button onClick={() => {
                    editor.currentTool = 'PATH';
                    forceUpdate();
                }} style={{ background: editor.currentTool === 'PATH' ? '#2563eb' : '#444' }}>Path</button>
                <button onClick={() => {
                    editor.currentTool = 'SHAPE';
                    forceUpdate();
                }} style={{ background: editor.currentTool === 'SHAPE' ? '#2563eb' : '#444' }}>Shape</button>

                {editor.currentTool === 'SHAPE' && (
                    <button onClick={() => {
                        editor.finishShape();
                        forceUpdate();
                    }} style={{ background: '#10b981', marginLeft: '10px' }}>Finish Shape</button>
                )}

                <div style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input type="checkbox" checked={editor.snapToGrid} onChange={(e) => {
                        editor.snapToGrid = e.target.checked;
                        forceUpdate();
                    }} />
                    <span>Grid Snap</span>
                </div>

                <button onClick={() => editor.save()} style={{ marginLeft: 'auto' }}>Save</button>
                <button onClick={onExport} style={{ background: '#10b981' }}>Export Code</button>
            </div>

            <div style={{ display: 'flex', height: 'calc(100% - 60px)' }}>
                <div className="editor-side-panel">
                    <h3>Assets</h3>
                    <div className="category-tabs">
                        {['props', 'buildings', 'enemies', 'triggers', 'environment', 'spawns'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => {
                                    setActiveCategory(cat);
                                    if (cat !== 'environment') {
                                        // Reset current path progress when switching asset categories
                                        (editor as any).currentPathPoints = [];
                                        (editor as any).updatePathLine();
                                    }
                                }}
                                style={{
                                    background: activeCategory === cat ? 'rgba(59, 130, 246, 0.4)' : 'transparent',
                                    color: activeCategory === cat ? '#fff' : '#888'
                                }}
                            >
                                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </button>
                        ))}
                    </div>

                    {activeCategory === 'environment' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label>Background Color</label>
                                <input
                                    type="color"
                                    value={'#' + editor.currentSector.environment.bgColor.toString(16).padStart(6, '0')}
                                    onChange={(e) => {
                                        editor.currentSector.environment.bgColor = parseInt(e.target.value.replace('#', ''), 16);
                                        editor.updateEnvironmentVisuals();
                                        forceUpdate();
                                    }}
                                    style={{ width: '100%', height: '40px', background: 'transparent', border: 'none' }}
                                />
                            </div>
                            <div>
                                <label>Fog Density ({editor.currentSector.environment.fogDensity.toFixed(3)})</label>
                                <input
                                    type="range" min="0" max="0.1" step="0.001"
                                    value={editor.currentSector.environment.fogDensity}
                                    onChange={(e) => {
                                        editor.currentSector.environment.fogDensity = parseFloat(e.target.value);
                                        editor.updateEnvironmentVisuals();
                                        forceUpdate();
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label>Ambient Light</label>
                                <input
                                    type="range" min="0" max="2" step="0.1"
                                    value={editor.currentSector.environment.ambientIntensity}
                                    onChange={(e) => {
                                        editor.currentSector.environment.ambientIntensity = parseFloat(e.target.value);
                                        editor.updateEnvironmentVisuals();
                                        forceUpdate();
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label>Time of Day</label>
                                <select
                                    value={editor.currentSector.environment.timeOfDay}
                                    onChange={(e) => {
                                        editor.currentSector.environment.timeOfDay = e.target.value as any;
                                        editor.updateEnvironmentVisuals();
                                        forceUpdate();
                                    }}
                                    style={{ width: '100%', padding: '8px', background: '#111', color: '#fff', border: '1px solid #444' }}
                                >
                                    <option value="day">Day</option>
                                    <option value="night">Night</option>
                                </select>
                            </div>
                            <div>
                                <label>Weather</label>
                                <select
                                    value={editor.currentSector.environment.weather}
                                    onChange={(e) => {
                                        editor.currentSector.environment.weather = e.target.value as any;
                                        forceUpdate();
                                    }}
                                    style={{ width: '100%', padding: '8px', background: '#111', color: '#fff', border: '1px solid #444' }}
                                >
                                    <option value="none">None</option>
                                    <option value="snow">Snow</option>
                                    <option value="rain">Rain</option>
                                    <option value="ash">Ash</option>
                                </select>
                            </div>
                            <div className="property-group">
                                <label>Weather Intensity ({editor.currentSector.environment.weatherIntensity?.toFixed(1)})</label>
                                <input
                                    type="range" min="0" max="5" step="0.1"
                                    value={editor.currentSector.environment.weatherIntensity || 1.0}
                                    onChange={(e) => {
                                        editor.currentSector.environment.weatherIntensity = parseFloat(e.target.value);
                                        forceUpdate();
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                    ) : activeCategory === 'spawns' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div className="property-group">
                                <label>Spawn Tools</label>
                                <div className="asset-grid">
                                    <button onClick={() => { editor.currentTool = 'SPAWN_PLAYER'; forceUpdate(); }} style={{ background: editor.currentTool === 'SPAWN_PLAYER' ? 'rgba(59, 130, 246, 0.4)' : '' }}>Player</button>
                                    <button onClick={() => { editor.currentTool = 'SPAWN_FAMILY'; forceUpdate(); }} style={{ background: editor.currentTool === 'SPAWN_FAMILY' ? 'rgba(16, 185, 129, 0.4)' : '' }}>Family</button>
                                    <button onClick={() => { editor.currentTool = 'SPAWN_BOSS'; forceUpdate(); }} style={{ background: editor.currentTool === 'SPAWN_BOSS' ? 'rgba(244, 63, 94, 0.4)' : '' }}>Boss</button>
                                </div>
                            </div>

                            <div style={{ marginTop: '10px', fontSize: '11px', color: '#888', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                                <div>Player: {editor.currentSector.spawns.player.x.toFixed(1)}, {editor.currentSector.spawns.player.z.toFixed(1)}</div>
                                <div>Family: {editor.currentSector.spawns.family.x.toFixed(1)}, {editor.currentSector.spawns.family.z.toFixed(1)}</div>
                                <div>Boss: {editor.currentSector.spawns.boss.x.toFixed(1)}, {editor.currentSector.spawns.boss.z.toFixed(1)}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="asset-grid">
                            {(categories as any)[activeCategory]?.map((type: string) => (
                                <button
                                    key={type}
                                    onClick={() => {
                                        editor.currentTool = 'PLACE';
                                        editor.placementType = type;
                                        forceUpdate();
                                    }}
                                    style={{
                                        border: editor.placementType === type && editor.currentTool === 'PLACE' ? '2px solid #3b82f6' : '1px solid #444'
                                    }}
                                >
                                    {type.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    )}

                    {editor.currentTool === 'PATH' && (
                        <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                            <div className="property-group">
                                <label>Path Settings</label>
                                <select
                                    value={editor.currentPathType}
                                    onChange={(e) => { editor.currentPathType = e.target.value as any; forceUpdate(); }}
                                    style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '8px', borderRadius: '4px' }}
                                >
                                    <option value="ROAD">Road</option>
                                    <option value="PATH">Walking/Gravel</option>
                                    <option value="STREAM">Water/Stream</option>
                                    <option value="RAIL">Railroad</option>
                                    <option value="BLOOD">Blood Trail</option>
                                    <option value="FOOTPRINTS">Footprints</option>
                                </select>
                            </div>
                            <div className="property-group" style={{ marginTop: '10px' }}>
                                <label>Width: {editor.currentPathWidth}m</label>
                                <input type="range" min="0.5" max="10" step="0.5" value={editor.currentPathWidth} onChange={(e) => { editor.currentPathWidth = parseFloat(e.target.value); forceUpdate(); }} />
                            </div>
                            <button onClick={() => { editor.finishPath(); forceUpdate(); }} style={{ marginTop: '10px', width: '100%', background: '#3b82f6' }}>Finish Path</button>
                        </div>
                    )}

                    <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                        <label style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '10px', display: 'block' }}>Scene Objects</label>
                        <div className="sector-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {editor.currentSector.objects.map(obj => (
                                <button
                                    key={obj.id}
                                    onClick={() => editor.selectObject(obj.id)}
                                    style={{
                                        background: editor.selectedObjectId === obj.id ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.02)',
                                        color: editor.selectedObjectId === obj.id ? '#fff' : '#999',
                                        borderColor: editor.selectedObjectId === obj.id ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255,255,255,0.05)'
                                    }}
                                >
                                    {obj.type} <span style={{ opacity: 0.4, fontSize: '10px' }}>({obj.id.slice(0, 4)})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {selectedObject && (
                    <div className="editor-side-panel" style={{ marginLeft: 'auto', borderRight: 'none', borderLeft: '1px solid #333' }}>
                        <h3>Properties</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label>Type: <strong>{selectedObject.type}</strong></label>
                            </div>

                            <div>
                                <label>Position</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                                    <input type="number" value={selectedObject.position.x} onChange={(e) => handlePropertyChange('position', 'x', parseFloat(e.target.value))} />
                                    <input type="number" value={selectedObject.position.y} onChange={(e) => handlePropertyChange('position', 'y', parseFloat(e.target.value))} />
                                    <input type="number" value={selectedObject.position.z} onChange={(e) => handlePropertyChange('position', 'z', parseFloat(e.target.value))} />
                                </div>
                            </div>

                            <div>
                                <label>Rotation (Y)</label>
                                <input
                                    type="range" min="0" max={Math.PI * 2} step="0.1"
                                    value={selectedObject.rotation.y}
                                    onChange={(e) => handlePropertyChange('rotation', 'y', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div>
                                <label>Scale</label>
                                <input
                                    type="range" min="0.1" max="10" step="0.1"
                                    value={selectedObject.scale.x}
                                    onChange={(e) => handlePropertyChange('scale', 'x', parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            {selectedObject.type === 'SHAPE' && selectedObject.properties && (
                                <>
                                    <div>
                                        <label>Height</label>
                                        <input
                                            type="number"
                                            value={selectedObject.properties.height}
                                            onChange={(e) => {
                                                selectedObject.properties!.height = parseFloat(e.target.value);
                                                editor.deleteObject(selectedObject.id); // Redraw
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label>Thickness</label>
                                        <input
                                            type="number"
                                            value={selectedObject.properties.thickness}
                                            onChange={(e) => {
                                                selectedObject.properties!.thickness = parseFloat(e.target.value);
                                                editor.deleteObject(selectedObject.id); // Redraw
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedObject.properties.filled}
                                            onChange={(e) => {
                                                selectedObject.properties!.filled = e.target.checked;
                                                editor.deleteObject(selectedObject.id); // Redraw
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }}
                                        />
                                        <label>Filled</label>
                                    </div>
                                    <div>
                                        <label>Color</label>
                                        <input
                                            type="color"
                                            value={'#' + (selectedObject.properties.color || 0x888888).toString(16).padStart(6, '0')}
                                            onChange={(e) => {
                                                selectedObject.properties!.color = parseInt(e.target.value.replace('#', ''), 16);
                                                editor.deleteObject(selectedObject.id); // Redraw
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }}
                                            style={{ width: '100%', height: '30px' }}
                                        />
                                    </div>
                                </>
                            )}

                            {selectedObject.type === 'rock' && (
                                <>
                                    <div className="property-group">
                                        <label>Radius: {selectedObject.properties?.radius || 1.0}</label>
                                        <input
                                            type="range" min="0.5" max="5.0" step="0.1"
                                            value={selectedObject.properties?.radius || 1.0}
                                            onChange={(e) => {
                                                if (!selectedObject.properties) selectedObject.properties = {};
                                                selectedObject.properties.radius = parseFloat(e.target.value);
                                                editor.deleteObject(selectedObject.id);
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }}
                                        />
                                    </div>
                                    <div className="property-group">
                                        <label>Sides (Detail): {selectedObject.properties?.segments || 6}</label>
                                        <input
                                            type="range" min="0" max="4" step="1"
                                            value={selectedObject.properties?.segments || 0}
                                            onChange={(e) => {
                                                if (!selectedObject.properties) selectedObject.properties = {};
                                                selectedObject.properties.segments = parseInt(e.target.value);
                                                editor.deleteObject(selectedObject.id);
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }}
                                        />
                                    </div>
                                </>
                            )}

                            <div style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                                <label>Attached Effects</label>
                                <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                    <button onClick={() => {
                                        if (!selectedObject.effects) selectedObject.effects = [];
                                        selectedObject.effects.push({ type: 'light', color: 0xffaa00, intensity: 1, offset: { x: 0, y: 1, z: 0 } });
                                        editor.deleteObject(selectedObject.id);
                                        (editor as any).spawnObjectInScene(selectedObject);
                                        forceUpdate();
                                    }} style={{ fontSize: '10px', padding: '5px' }}>+ Light</button>
                                    <button onClick={() => {
                                        if (!selectedObject.effects) selectedObject.effects = [];
                                        selectedObject.effects.push({ type: 'fire', offset: { x: 0, y: 0.5, z: 0 } });
                                        editor.deleteObject(selectedObject.id);
                                        (editor as any).spawnObjectInScene(selectedObject);
                                        forceUpdate();
                                    }} style={{ fontSize: '10px', padding: '5px' }}>+ Fire</button>
                                </div>
                                {selectedObject.effects?.map((eff, i) => (
                                    <div key={i} style={{ padding: '8px', background: '#222', borderRadius: '4px', marginBottom: '5px', fontSize: '11px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                            <strong>{eff.type.toUpperCase()}</strong>
                                            <button onClick={() => {
                                                selectedObject.effects!.splice(i, 1);
                                                editor.deleteObject(selectedObject.id);
                                                (editor as any).spawnObjectInScene(selectedObject);
                                                forceUpdate();
                                            }} style={{ padding: '0 5px', background: '#551111', border: 'none', color: '#fff' }}>x</button>
                                        </div>
                                        {eff.type === 'light' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                                <input type="color" value={'#' + (eff.color || 0xffffff).toString(16).padStart(6, '0')} onChange={(e) => {
                                                    eff.color = parseInt(e.target.value.replace('#', ''), 16);
                                                    editor.deleteObject(selectedObject.id);
                                                    (editor as any).spawnObjectInScene(selectedObject);
                                                    forceUpdate();
                                                }} style={{ width: '100%' }} />
                                                <input type="number" step="0.1" value={eff.intensity} onChange={(e) => {
                                                    eff.intensity = parseFloat(e.target.value);
                                                    editor.deleteObject(selectedObject.id);
                                                    (editor as any).spawnObjectInScene(selectedObject);
                                                    forceUpdate();
                                                }} style={{ width: '100%' }} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => {
                                    editor.deleteObject(selectedObject.id);
                                    forceUpdate();
                                }}
                                style={{ background: '#ef4444', marginTop: '20px' }}
                            >
                                Delete Object
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorUI;
