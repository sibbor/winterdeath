import { useState, useEffect } from 'react';

export function useOrientation() {
    const [isLandscapeMode, setIsLandscapeMode] = useState(window.innerWidth > window.innerHeight);

    useEffect(() => {
        const checkOrientation = () => {
            setIsLandscapeMode(window.innerWidth > window.innerHeight);
        };

        window.addEventListener('resize', checkOrientation);
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    return { isLandscapeMode };
}