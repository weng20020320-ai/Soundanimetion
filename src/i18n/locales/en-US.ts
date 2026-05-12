import type { Dictionary } from '../types';

export const enUS: Dictionary = {
  language: {
    label: 'Language',
  },

  topbar: {
    brand: 'Audio Visualizer',
    loadAudio: 'Open file',
    loadingAudio: 'Loading…',
    notLoadedHint:
      'No file loaded (click "Open file" to choose mp3/wav/flac/mp4… or drop one onto the window)',
    sourceTypeAudio: 'audio',
    sourceTypeVideo: 'video',
    presetLabel: 'Preset',
    exportVideo: 'Export video…',
    snapshot: 'Snapshot',
    snapshotTitle: 'Save current frame as PNG',
    snapshotSaved: (path) =>
      `Snapshot saved:\n${path}\n\nReveal in file explorer?`,
  },

  errors: {
    needAudioFirst: 'Please load an audio or video file first',
    presetSwitchFailed: (msg) => `Failed to switch preset: ${msg}`,
    audioLoadFailed: (msg) => `Load failed: ${msg}`,
    snapshotFailed: (msg) => `Snapshot failed: ${msg}`,
    exportFailed: (msg) => `Export failed: ${msg}`,
    timelineMissing: 'Failed to build FeatureTimeline',
    unsupportedDrop: (name) =>
      `Unsupported file: ${name} (only audio mp3/wav/flac… and video mp4/mov/webm… are accepted)`,
  },

  playback: {
    play: '▶ Play',
    pause: '⏸ Pause',
    volume: 'Volume',
  },

  exportDialog: {
    title: 'Export Video',
    formatLabel: 'Output format',
    formatMp4: 'MP4 (H.264) — solid background, small, universal',
    formatProRes: 'ProRes 4444 (.mov) — alpha included, Adobe gold standard',
    formatPngSeq: 'PNG sequence — alpha included, AE-friendly',
    pngSeqHint:
      'A frame_000001.png … sequence will be generated in the chosen folder. Audio is not bundled — import it separately in After Effects.',

    encoderLabel: 'Encoder',
    encoderRecommended: ' · Recommended',
    encoderHint:
      'Hardware encoders run on the GPU and can be 5–10× faster than software at 4K, with slightly lower quality than libx264 at the same setting.',
    encoderName: (encoder) => {
      switch (encoder) {
        case 'libx264':
          return 'libx264 (software H.264)';
        case 'h264_nvenc':
          return 'NVENC H.264 (NVIDIA GPU)';
        case 'hevc_nvenc':
          return 'NVENC H.265 (NVIDIA GPU)';
        case 'h264_amf':
          return 'AMF H.264 (AMD GPU)';
        case 'hevc_amf':
          return 'AMF H.265 (AMD GPU)';
        case 'h264_qsv':
          return 'QSV H.264 (Intel)';
        case 'hevc_qsv':
          return 'QSV H.265 (Intel)';
        default:
          return encoder;
      }
    },

    qualityLabel: 'Quality',
    qualityDraft: 'Draft',
    qualityStandard: 'Standard',
    qualityHigh: 'High',
    qualityBest: 'Best',
    qualityDraftHint: 'Very fast · small file (CRF 23)',
    qualityStandardHint: 'Fast · moderate size · Recommended (CRF 20, 1080p60 20s ≈ 25 MB)',
    qualityHighHint: 'Moderate · near-lossless (CRF 17, ~3× size)',
    qualityBestHint: 'Slow · visually lossless (CRF 14, ~6× size)',

    profileLabel: 'Quality profile (GPU path)',
    profileAuto: 'Auto',
    profileFast: 'Fast',
    profileBalanced: 'Balanced',
    profileUltra: 'Ultra',
    profileAutoHint: 'Pick based on detected GPU — recommended',
    profileFastHint: 'Disable PBO, best compatibility (mandatory for weak GPUs)',
    profileBalancedHint: 'PBO 2 slots + composer 1× (mid-range GPU)',
    profileUltraHint: 'PBO 3 slots (only stable on strong GPUs)',
    detectedGpu: (label) => `Detected GPU: ${label}`,
    detectingGpu: 'Detecting GPU…',
    actualPath: (desc) => `Actual path: ${desc}`,
    profileNote:
      'Note: the "Quality profile" only changes the GPU execution path — it does NOT affect output pixels or color quality. If export fails, switch this to "Fast".',

    pipelineDescFast: 'Fast: PBO disabled + composer 1× (best compatibility)',
    pipelineDescBalanced: 'Balanced: PBO 2 slots + composer 1×',
    pipelineDescUltra: 'Ultra: PBO 3 slots + composer 1×',

    resolutionLabel: 'Resolution',
    resolutionCustom: 'Custom',
    resolutionEvenHint: '(H.264 requires both width and height to be even)',

    fpsLabel: 'Frame rate',
    timeRangeLabel: 'Time range (seconds)',
    timeRangeSummary: (durSec, frames) =>
      `${durSec.toFixed(2)} s total · ${frames} frames`,

    backgroundLabel: 'Background',
    transparentLabel: 'Transparent (alpha channel)',
    transparentNotSupported:
      'MP4 (H.264) does not support alpha. For transparency, choose ProRes 4444 or PNG sequence.',

    audioInfo: (name, mb) => `Audio: ${name} · ${mb.toFixed(2)} MB / frame`,
    audioNotLoaded: 'Not loaded',

    sizeEstimateLabel: 'Estimated file size',
    sizeEstimateValue: ({ totalMB, videoMB, audioMB, uncertaintyPct, hasAudio }) => {
      const total = formatMBEn(totalMB);
      const v = formatMBEn(videoMB);
      if (hasAudio) {
        const a = formatMBEn(audioMB);
        return `~${total} (video ${v} + audio ${a}, ±${uncertaintyPct}%)`;
      }
      return `~${total} (±${uncertaintyPct}%)`;
    },
    encoderAutoMatched: (label) => `Auto-selected: ${label} (matching GPU detected)`,
    encoderCpuFallback: 'Auto-selected: CPU encoding (no hardware encoder available)',
    encoderDetecting: 'Detecting GPU…',
    advancedToggle: 'Advanced (encoder / pipeline)',

    cancel: 'Cancel',
    confirm: 'Choose location and export',
  },

  exportProgress: {
    titleAnalyzing: 'Analyzing audio…',
    titleRendering: 'Rendering…',
    analyzingFeatures: 'Extracting audio features…',
    detectingBpm: 'Detecting BPM…',
    renderingFrames: 'Sending frames to ffmpeg…',
    waitingFfmpeg: 'Waiting for ffmpeg to encode and flush…',
    frameStats: (frame, total, fps, eta, inFlight) => {
      const parts = [`Frame ${frame} / ${total}`];
      if (fps !== null && fps > 0) parts.push(`${fps.toFixed(1)} fps`);
      if (eta !== null && eta > 0) parts.push(`~${formatEtaEn(eta)} left`);
      if (inFlight !== null) parts.push(`${inFlight} in flight`);
      return parts.join(' · ');
    },
    waitingFfmpegHint:
      'The render pipeline is full and waiting for ffmpeg to encode and flush frames.\nCommon causes: slow first-frame init / CPU encoding preset too high / disk write bottleneck.\nIf this stalls, check the ffmpeg log below.',
    ffmpegLogPrefix: '[ffmpeg]',
    encoderFallback: (from, to) =>
      `Hardware encoder ${from} failed to start. Falling back to ${to} (CPU encoding).\nThis usually means an outdated GPU driver or unsupported encoder. Output quality is unaffected.`,
    completed: (path) =>
      `Export completed:\n${path}\n\nReveal in file explorer?`,
    cancel: 'Cancel',
  },

  background: {
    label: 'Background',
    transparentLabel: 'Transparent',
    transparentHint:
      'Transparent background only keeps alpha for ProRes 4444 / PNG sequence exports. MP4 always uses a solid background.',
  },

  presetIO: {
    label: 'Parameter preset',
    exportJson: 'Export .json',
    importJson: 'Import .json',
    invalidFile: 'Invalid file format',
    parseFailed: (msg) => `Failed to parse parameter file: ${msg}`,
  },

  parameterPanel: {
    paneTitle: 'Parameters',
  },

  presetSelector: {
    entry: (name, category) => `${name} (${category})`,
    musicTagsLabel: 'Best for',
    allMoods: 'All',
    empty: 'No matching presets',
  },

  presetCategories: {
    spectrum: 'Spectrum',
    particles: 'Particles',
    shader: 'Shader',
  },

  presetMoods: {
    energetic: 'Energetic',
    ambient: 'Ambient',
    abstract: 'Abstract',
    minimal: 'Minimal',
    retro: 'Retro',
    organic: 'Organic',
  },

  musicTags: {
    electronic: 'Electronic',
    pop: 'Pop',
    hiphop: 'Hip-hop',
    rock: 'Rock',
    jazz: 'Jazz',
    classical: 'Classical',
    piano: 'Piano',
    lofi: 'Lo-fi',
    ambient: 'Ambient',
    chillout: 'Chillout',
    techno: 'Techno',
    house: 'House',
    synthwave: 'Synthwave',
    vaporwave: 'Vaporwave',
    experimental: 'Experimental',
    'dark-ambient': 'Dark Ambient',
    drone: 'Drone',
    'post-rock': 'Post-rock',
    dnb: 'Drum & Bass',
    dubstep: 'Dubstep',
    cinematic: 'Cinematic',
    psychedelic: 'Psychedelic',
    '8bit': '8-bit',
  },

  presetNames: {
    'spectrum-bars': 'Mirror Spectrum Bars',
    'radial-spectrum': 'Radial Spectrum',
    'area-spectrum': 'Area Spectrum',
    'wave-line': 'Glow Wave Line',
    'circle-burst': 'Beat Circle Burst',
    'particles-burst': 'Beat Particle Burst',
    'gpu-particles': 'GPU Particles (millions)',
    'shader-flow': 'Spectrum Flow',
    'st-wormhole': 'Wormhole · Spectrum',
    'st-plasma': 'Plasma · Beat Pulse',
    'st-neon-grid': 'Neon Grid · 80s',
    'st-mercury': 'Liquid Mercury',
    'st-kaleido': 'Kaleidoscope · Spectrum',
    'inversion': 'Inversion Grid',
    'piano-rain': 'Falling Notes · Piano Rain',
    'drifting-spirits': 'Drifting Spirits',
  },

  presetDescriptions: {
    'spectrum-bars': 'Mirrored spectrum bars - the most iconic music visualizer',
    'radial-spectrum': 'Spectrum bars arranged in a circle, strong rhythmic symmetry',
    'area-spectrum': 'Spectrum filled as a gradient area, gentle like waves',
    'wave-line': 'Time-domain waveform as a flowing light line, minimal and abstract',
    'circle-burst': 'Beat-triggered concentric shockwaves with strong impact',
    'particles-burst': 'Beat-triggered particle fireworks - one bloom per kick',
    'gpu-particles': 'A million particles swirling in a flow field like a nebula',
    'shader-flow': 'Spectrum-driven liquid distortion that breathes',
    'st-wormhole': 'Travel through a wormhole, camera dives with the beat',
    'st-plasma': 'Classic plasma effect overlaid with beat pulses',
    'st-neon-grid': 'Retro 80s cyberpunk neon grid',
    'st-mercury': 'Reflections and flow on a liquid metal surface',
    'st-kaleido': 'Spectrum-driven kaleidoscope patterns',
    'inversion': 'Black-and-white mathematical grid that flips on every beat',
    'piano-rain': 'Minimal falling notes: trails, judge-line bursts; gradient only colors the notes, background stays pure black (starfield / water optional)',
    'drifting-spirits': 'Beat-triggered glowing particles rising from the bottom like fireflies',
  },

  presetParamLabels: {
    'spectrum-bars': {
      barCount: 'Band count',
      barWidth: 'Bar width ratio',
      heightScale: 'Height scale',
      smoothing: 'Smoothing',
      gradient: 'Bar gradient',
      colorMode: 'Gradient mapping',
      baseLightness: 'Brightness floor',
      energyBoost: 'Energy brightness boost',
      beatPunch: 'Beat punch',
      mirror: 'Mirror horizontally',
      cornerRadius: 'Top corner radius',
      // EXPOSURE_SCHEMA
      exposure: 'Exposure',
      glowFloor: 'Glow floor',
      glowBias: 'Glow bias',
      softClip: 'Over-exposure curve',
    },
    'radial-spectrum': {
      barCount: 'Bar count',
      innerRadius: 'Inner radius',
      lengthScale: 'Length scale',
      barWidth: 'Bar width',
      smoothing: 'Smoothing',
      rotationSpeed: 'Rotation speed',
      beatPunch: 'Beat punch',
      gradient: 'Bar gradient',
      colorMode: 'Gradient mapping',
      baseLightness: 'Brightness floor',
      energyBoost: 'Energy boost',
      mirror: 'Mirror horizontally',
      innerRing: 'Show inner ring',
      // EXPOSURE_SCHEMA
      exposure: 'Exposure',
      glowFloor: 'Glow floor',
      glowBias: 'Glow bias',
      softClip: 'Over-exposure curve',
    },
    'area-spectrum': {
      resolution: 'Sample precision',
      width: 'Canvas width',
      heightScale: 'Height scale',
      smoothing: 'Time smoothing',
      spatialSmoothing: 'Spatial smoothing (neighbor)',
      baseY: 'Baseline Y',
      fillAlpha: 'Fill opacity',
      edgeIntensity: 'Top edge intensity',
      beatPunch: 'Beat punch',
      mirror: 'Mirror horizontally',
      gradient: 'Fill gradient',
      edgeColorMode: 'Top edge color',
    },
    'wave-line': {
      resolution: 'Sample precision',
      width: 'Canvas width',
      thickness: 'Line width',
      amplitude: 'Waveform amplitude',
      smoothing: 'Smoothing',
      glowSpread: 'Glow radius',
      beatGrow: 'Beat thickness boost',
      doubleLine: 'Double layer (more body)',
      gradient: 'Wave gradient',
      colorMode: 'Gradient mapping',
      centerLine: 'Draw center line',
    },
    'circle-burst': {
      maxRings: 'Concurrent rings',
      expandSpeed: 'Spread speed',
      ringWidth: 'Ring width',
      fadeRate: 'Fade speed',
      bassTrigger: 'Bass trigger threshold',
      triggerCooldownMs: 'Trigger cooldown (ms)',
      coreEnabled: 'Show center core',
      coreScale: 'Core size',
      gradient: 'Color',
      colorMode: 'Gradient mapping',
    },
    'particles-burst': {
      particleCount: 'Particle count',
      particleSize: 'Particle size',
      burstStrength: 'Burst strength',
      gravity: 'Gravity (toward center)',
      drag: 'Damping',
      lifetime: 'Lifetime (s)',
      rotationSpeed: 'Global rotation',
      alphaScale: 'Opacity',
      gradient: 'Gradient',
    },
    'gpu-particles': {
      textureSize: 'Particle scale',
      pointSize: 'Point size',
      drag: 'Drag',
      centerPull: 'Centripetal force',
      bassKick: 'Bass push',
      swirl: 'Swirl',
      beatSpawn: 'Beat respawn',
      fieldScale: 'Field scale',
      alphaScale: 'Opacity',
      gradient: 'Gradient',
    },
    'inversion': {
      cellSize: 'Cell size',
      shape: 'Shape',
      fillRatio: 'Fill ratio',
      rotateSpeed: 'Rotation speed',
      beatInvert: 'Beat invert strength',
      bassDensity: 'Bass density mod',
      contrast: 'Edge hardness',
      gradient: 'Gradient',
      accentBoost: 'Beat accent boost',
    },
    'shader-flow': {
      speed: 'Flow speed',
      scale: 'Noise scale',
      warp: 'Distortion',
      fftDrive: 'Spectrum drive',
      beatGlow: 'Beat glow',
      gradient: 'Gradient',
      vignette: 'Vignette',
    },
    'st-wormhole': {
      speed: 'Speed',
      intensity: 'Intensity',
      twist: 'Twist',
      glow: 'Glow',
      gradient: 'Gradient',
    },
    'st-plasma': {
      speed: 'Speed',
      intensity: 'Intensity',
      scale: 'Scale',
      pulse: 'Pulse amplitude',
      gradient: 'Gradient',
    },
    'st-neon-grid': {
      speed: 'Speed',
      intensity: 'Intensity',
      density: 'Density',
      horizon: 'Horizon',
      gradient: 'Gradient',
    },
    'st-mercury': {
      speed: 'Speed',
      intensity: 'Intensity',
      thickness: 'Thickness',
      shine: 'Highlight',
      gradient: 'Gradient',
    },
    'st-kaleido': {
      speed: 'Speed',
      intensity: 'Intensity',
      slices: 'Mirror count',
      zoom: 'Zoom',
      gradient: 'Gradient',
    },
    'piano-rain': {
      notesPerBeat: 'Notes per beat',
      fallSpeed: 'Fall speed',
      energyThreshold: 'Trigger threshold',
      beatThreshold: 'Beat RMS threshold',
      noteWidth: 'Note width',
      noteHeight: 'Note height',
      noteTrail: 'Note trail length',
      noteGlow: 'Note glow',
      judgeLineY: 'Judge-line position',
      judgeLineGlow: 'Judge-line glow',
      hitBurst: 'Hit burst',
      waterSurface: 'Water reflection',
      waterIntensity: 'Reflection intensity',
      starfield: 'Starfield density',
      bgIntensity: 'Background glow',
      gradient: 'Note gradient',
    },
    'drifting-spirits': {
      particleCount: 'Particle pool',
      particleSize: 'Particle size',
      beatBurst: 'Particles per beat',
      beatThreshold: 'Beat threshold (RMS)',
      ambientRate: 'Ambient spawn rate',
      riseSpeed: 'Rise speed',
      drift: 'Horizontal drift',
      lifetime: 'Lifetime (s)',
      spawnSpread: 'Spawn width',
      alphaScale: 'Opacity',
      bassPush: 'Bass push',
      gradient: 'Gradient',
    },
  },

  presetParamOptions: {
    'spectrum-bars': {
      colorMode: {
        position: 'By position (left→right)',
        energy: 'By energy',
        frequency: 'By frequency (low→high)',
      },
      softClip: {
        linear: 'Linear (no clip)',
        soft: 'Soft (recommended)',
        film: 'Filmic (ACES)',
      },
    },
    'radial-spectrum': {
      colorMode: {
        angle: 'By angle (full circle)',
        frequency: 'By frequency (low→high)',
        energy: 'By energy',
      },
      softClip: {
        linear: 'Linear (no clip)',
        soft: 'Soft (recommended)',
        film: 'Filmic (ACES)',
      },
    },
    'area-spectrum': {
      edgeColorMode: {
        'gradient-end': 'Gradient end',
        white: 'White glow',
        'per-bin': 'Per band',
      },
    },
    'wave-line': {
      colorMode: {
        horizontal: 'Horizontal (left→right)',
        amplitude: 'Amplitude (center→peak)',
      },
    },
    'circle-burst': {
      colorMode: {
        lifetime: 'By lifetime (new→old)',
        radius: 'By radius (small→large)',
        random: 'Random',
      },
    },
    'gpu-particles': {
      textureSize: {
        '256': 'Low 65 k (256²)',
        '512': 'Mid 262 k (512²)',
        '1024': 'High 1 M (1024²)',
      },
    },
    'inversion': {
      shape: {
        '0': 'Square',
        '1': 'Triangle',
        '2': 'Circle',
        '3': 'Cross',
      },
    },
  },

  postFX: {
    enabled: 'Enable post-FX',
    bloom: '◆ Bloom',
    bloomStrength: ' Strength',
    bloomRadius: ' Radius',
    bloomThreshold: ' Threshold',
    bloomBeatBoost: ' Beat boost',
    chromatic: '◆ Chromatic Aberration',
    chromaticOffset: ' Offset',
    chromaticBeatBoost: ' Beat boost',
    glitch: '◆ Beat Glitch',
    glitchIntensity: ' Intensity',
    grain: '◆ Film Grain',
    grainIntensity: ' Intensity',
    vignette: '◆ Vignette',
    vignetteAmount: ' Amount',
    vignetteSoftness: ' Softness',
  },

  gradient: {
    custom: 'Custom',
    advanced: 'Advanced',
    collapse: 'Collapse',
    start: 'Start',
    middle: 'Middle',
    end: 'End',
    addMiddle: 'Add middle color',
    removeMiddle: 'Remove',
    angle: (deg) => `Angle ${Math.round(deg)}°`,
    horizontalTitle: 'Horizontal',
    verticalTitle: 'Vertical',
    reset: 'Reset',
    groups: {
      mist: 'Mist',
      neon: 'Neon',
      auroraOcean: 'Aurora & Ocean',
      warm: 'Warm',
      mono: 'Monochrome',
      rainbow: 'Rainbow',
    },
    presets: {
      'midnight-violet': 'Midnight Violet',
      'haze-violet': 'Haze Violet',
      'silver-mist': 'Silver Mist',
      charcoal: 'Charcoal',
      'twilight-blue': 'Twilight Blue',
      'sakura-mist': 'Sakura Mist',
      cyberpunk: 'Cyberpunk',
      'neon-rose': 'Neon Rose',
      synthwave: 'Synthwave',
      miami: 'Miami',
      'electric-violet': 'Electric Violet',
      'acid-lime': 'Acid Lime',
      aurora: 'Aurora',
      'ocean-dive': 'Ocean Dive',
      'mint-flow': 'Mint Flow',
      glacier: 'Glacier',
      emerald: 'Emerald',
      sunset: 'Sunset',
      fire: 'Fire',
      'rose-gold': 'Rose Gold',
      peach: 'Peach',
      'amber-glow': 'Amber Glow',
      monochrome: 'Monochrome',
      moonlight: 'Moonlight',
      'gold-bar': 'Gold Bar',
      'pure-white': 'Pure White',
      'pure-cyan': 'Pure Cyan',
      rainbow: 'Rainbow',
      tropical: 'Tropical',
      vinyl: 'Vinyl',
    },
  },

  fileDialog: {
    openTitle: 'Choose an audio or video file',
    audioFilter: 'Audio',
    videoFilter: 'Video',
    mediaFilter: 'Audio / Video',
    allFilesFilter: 'All files',
    saveExportTitle: 'Export to...',
    pngSeqDirTitle: 'Choose PNG sequence output folder',
    pngSeqFilterName: 'PNG sequence folder (enter folder name)',
    mp4FilterName: 'MP4 video',
    proResFilterName: 'QuickTime ProRes 4444',
    snapshotTitle: 'Save snapshot',
    snapshotFilterName: 'PNG image',
  },
};

function formatEtaEn(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function formatMBEn(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${mb.toFixed(0)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(2)} MB`;
}
