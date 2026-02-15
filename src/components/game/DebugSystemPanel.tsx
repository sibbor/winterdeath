import React, { useState, useEffect } from 'react';

interface DebugSystemPanelProps {
    onClose: () => void;
    flags: {
        wind: boolean;
        weather: boolean;
        footprints: boolean;
        enemies: boolean;
        fx: boolean;
        lighting: boolean;
    };
    onToggle: (system: 'wind' | 'weather' | 'footprints' | 'enemies' | 'fx' | 'lighting') => void;
}

const DebugSystemPanel: React.FC<DebugSystemPanelProps> = ({ onClose, flags, onToggle }) => {
    // Force re-render on updates if parent doesn't
    const [, forceUpdate] = useState(0);

    return (
        <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '20px',
            borderRadius: '8px',
            color: 'white',
            fontFamily: 'monospace',
            zIndex: 9999,
            minWidth: '200px',
            border: '1px solid #444'
        }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #666', paddingBottom: '10px' }}>Performance Debug</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={flags.wind}
                        onChange={() => { onToggle('wind'); forceUpdate(n => n + 1); }}
                        style={{ marginRight: '10px' }}
                    />
                    Wind System
                </label>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={flags.weather}
                        onChange={() => { onToggle('weather'); forceUpdate(n => n + 1); }}
                        style={{ marginRight: '10px' }}
                    />
                    Weather System
                </label>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={flags.footprints}
                        onChange={() => { onToggle('footprints'); forceUpdate(n => n + 1); }}
                        style={{ marginRight: '10px' }}
                    />
                    Footprint System
                </label>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={flags.enemies}
                        onChange={() => { onToggle('enemies'); forceUpdate(n => n + 1); }}
                        style={{ marginRight: '10px' }}
                    />
                    Enemies (AI/Spawning)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={flags.fx}
                        onChange={() => { onToggle('fx'); forceUpdate(n => n + 1); }}
                        style={{ marginRight: '10px' }}
                    />
                    FX / Particles
                </label>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={flags.lighting}
                        onChange={() => { onToggle('lighting'); forceUpdate(n => n + 1); }}
                        style={{ marginRight: '10px' }}
                    />
                    Lighting / Shadows
                </label>
            </div>

            <div style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>
                Press P to Toggle Panel
            </div>

            <button
                onClick={onClose}
                style={{
                    background: '#333', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px',
                    cursor: 'pointer', width: '100%', marginTop: '10px'
                }}
            >
                Close
            </button>
        </div>
    );
};

export default DebugSystemPanel;
