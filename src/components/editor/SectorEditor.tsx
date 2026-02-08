
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

    const [isPlaying, setIsPlaying] = useState(false);

    const handleExport = () => {
        if (!editor) return;
        editor.currentSector.name = currentSectorName;
        const code = exportToCode(editor.currentSector);

        // Clipboard Fallback
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
                alert("Sector code copied to clipboard!");
            }).catch(err => {
                console.error("Clipboard failed", err);
                fallbackCopy(code);
            });
        } else {
            fallbackCopy(code);
        }
    };

    const fallbackCopy = (text: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert("Sector code copied to clipboard (fallback)!");
        } catch (err) {
            console.error('Fallback copy failed', err);
            alert("Failed to copy code. Check console.");
        }
        document.body.removeChild(textArea);
    };

    const togglePlay = () => {
        if (!editor) return;
        const newPlaying = !isPlaying;
        setIsPlaying(newPlaying);
        editor.setPlayMode(newPlaying);
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
                    isPlaying={isPlaying}
                    onPlayToggle={togglePlay}
                    onClose={onClose}
                />
            )}

        </div>
    );
};

export default SectorEditor;
