import { useState, useRef, useEffect, useMemo } from 'react';
import { useWindowDimensions, Platform } from 'react-native';

// Use only resize modes supported by all player backends
export type PlayerResizeMode = 'contain' | 'cover' | 'stretch';

// Hook for shared player state logic
export const usePlayerState = () => {
    // Playback State
    const [paused, setPaused] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    // UI State
    const [showControls, setShowControls] = useState(true);
    const [resizeMode, setResizeMode] = useState<PlayerResizeMode>('contain');
    const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
    const [is16by9Content, setIs16by9Content] = useState(false);
    
    // Use the hook for responsive dimensions
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    // Zoom State
    const [zoomScale, setZoomScale] = useState(1);
    const [zoomTranslateX, setZoomTranslateX] = useState(0);
    const [zoomTranslateY, setZoomTranslateY] = useState(0);
    const [lastZoomScale, setLastZoomScale] = useState(1);
    const [lastTranslateX, setLastTranslateX] = useState(0);
    const [lastTranslateY, setLastTranslateY] = useState(0);

    // AirPlay State (iOS only, but keeping it here for unified interface)
    const [isAirPlayActive, setIsAirPlayActive] = useState<boolean>(false);
    const [allowsAirPlay, setAllowsAirPlay] = useState<boolean>(true);

    // Logic State
    const isSeeking = useRef(false);
    const isDragging = useRef(false);
    const isMounted = useRef(true);
    const seekDebounceTimer = useRef<NodeJS.Timeout | null>(null);
    const pendingSeekValue = useRef<number | null>(null);
    const lastSeekTime = useRef<number>(0);
    const wasPlayingBeforeDragRef = useRef<boolean>(false);

    // Reliable iPad/macOS detection
    const isIPad = Platform.OS === 'ios' && Platform.isPad === true;
    const isIos = Platform.OS === 'ios';
    
    // In split-screen/multitasking, we should use window dimensions, not screen dimensions
    const effectiveDimensions = useMemo(() => ({
        width: windowWidth,
        height: windowHeight
    }), [windowWidth, windowHeight]);

    return {
        paused, setPaused,
        currentTime, setCurrentTime,
        duration, setDuration,
        buffered, setBuffered,
        isBuffering, setIsBuffering,
        isVideoLoaded, setIsVideoLoaded,
        isPlayerReady, setIsPlayerReady,
        showControls, setShowControls,
        resizeMode, setResizeMode,
        videoAspectRatio, setVideoAspectRatio,
        is16by9Content, setIs16by9Content,
        screenDimensions: effectiveDimensions,
        zoomScale, setZoomScale,
        zoomTranslateX, setZoomTranslateX,
        zoomTranslateY, setZoomTranslateY,
        lastZoomScale, setLastZoomScale,
        lastTranslateX, setLastTranslateX,
        lastTranslateY, setLastTranslateY,
        isAirPlayActive, setIsAirPlayActive,
        allowsAirPlay, setAllowsAirPlay,
        isSeeking,
        isDragging,
        isMounted,
        seekDebounceTimer,
        pendingSeekValue,
        lastSeekTime,
        wasPlayingBeforeDragRef,
        effectiveDimensions,
        isIPad,
        isIos
    };
};
