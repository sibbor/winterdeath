import { useState, useEffect } from 'react';

export function useOrientation() {
    const [isLandscapeMode, setIsLandscapeMode] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia('(orientation: landscape)');

        // Initial check
        setIsLandscapeMode(mql.matches);

        const handleChange = (e: MediaQueryListEvent) => {
            setIsLandscapeMode(e.matches);
        };

        mql.addEventListener('change', handleChange);
        return () => mql.removeEventListener('change', handleChange);
    }, []);

    return { isLandscapeMode };
}