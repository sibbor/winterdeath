
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Engine } from '../../core/engine/Engine';
import { EditorSystem } from '../../core/editor/EditorSystem';
import { EditorSector, EditorPersistence } from '../../utils/editorPersistence';
import EditorUI from './EditorUI';
import { exportToCode } from '../../game/LevelExporter';
import './SectorEditor.css';

interface SectorEditorProps {
    onClose: () => void;
}

const SectorEditor: React.FC<SectorEditorProps> = ({ onClose }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [editor, setEditor] = useState<EditorSystem | null>(null);
    const [currentSectorName, setCurrentSectorName] = useState("New Sector");

    useEffect(() => {
        if (!containerRef.current) return;

        const engine = Engine.getInstance();
        engine.mount(containerRef.current);

        const editorSystem = new EditorSystem(engine);
        setEditor(editorSystem);

        return () => {
            editorSystem.dispose();
        };
    }, []);

    const handleExport = () => {
        if (!editor) return;
        editor.currentSector.name = currentSectorName;
        const code = exportToCode(editor.currentSector);
        navigator.clipboard.writeText(code);
        alert("Sector code copied to clipboard!");
    };

    return (
        <div className="sector-editor-overlay">
            <div ref={containerRef} className="editor-canvas-container" />

            {editor && (
                <EditorUI
                    editor={editor}
                    onExport={handleExport}
                    currentSectorName={currentSectorName}
                    setSectorName={setCurrentSectorName}
                />
            )}

            <button
                onClick={onClose}
                className="btn-close"
                style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
            >
                Close Editor
            </button>
        </div>
    );
};

export default SectorEditor;
