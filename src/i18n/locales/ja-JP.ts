import type { Dictionary } from '../types';

export const jaJP: Dictionary = {
  language: {
    label: '言語',
  },

  topbar: {
    brand: 'Wavelet',
    loadAudio: 'ファイルを開く',
    loadingAudio: '読み込み中…',
    notLoadedHint:
      'ファイル未読み込み — 「ファイルを開く」から mp3 / wav / flac / mp4 などを選択するか、ウィンドウへドラッグ＆ドロップしてください',
    sourceTypeAudio: '音声',
    sourceTypeVideo: '動画',
    presetLabel: 'プリセット',
    exportVideo: '動画を書き出す…',
    snapshot: 'スナップショット',
    snapshotTitle: '現在のフレームを PNG として保存',
    snapshotSaved: (path) =>
      `スナップショットを保存しました：\n${path}\n\nエクスプローラーで開きますか？`,
  },

  viewport: {
    aspectLabel: 'フレーム',
    aspect169: '16:9 横',
    aspect916: '9:16 縦',
    aspect11: '1:1 スクエア',
    aspect45: '4:5 縦長',
    zoomLabel: 'ズーム',
    zoomTitle: 'プレビューズーム（書き出しの構図にも反映されます）',
  },

  errors: {
    needAudioFirst: '先に音声または動画を読み込んでください',
    presetSwitchFailed: (msg) => `プリセットの切り替えに失敗しました：${msg}`,
    audioLoadFailed: (msg) => `読み込みに失敗しました：${msg}`,
    snapshotFailed: (msg) => `スナップショットの保存に失敗しました：${msg}`,
    exportFailed: (msg) => `書き出しに失敗しました：${msg}`,
    timelineMissing: '音声特徴量の解析データを生成できませんでした',
    unsupportedDrop: (name) =>
      `対応していないファイルです：${name}\n対応形式：音声（mp3 / wav / flac など）または動画（mp4 / mov / webm など）`,
  },

  playback: {
    play: '▶ 再生',
    pause: '⏸ 一時停止',
    volume: '音量',
  },

  exportDialog: {
    title: '動画を書き出し',
    formatLabel: '出力フォーマット',
    formatMp4: 'MP4 (H.264) — 単色背景・軽量・汎用',
    formatProRes: 'ProRes 4444 (.mov) — アルファ対応・Adobe 標準',
    formatPngSeq: 'PNG 連番 — アルファ対応・After Effects 向き',
    pngSeqHint:
      '指定したフォルダに frame_000001.png … が連番で書き出されます。音声は含まれないので、AE 側で別途読み込んでください。',

    encoderLabel: 'エンコーダ',
    encoderRecommended: ' · 推奨',
    encoderHint:
      'GPU を使ったハードウェアエンコードは、4K では CPU の 5〜10 倍ほど高速です。画質は同設定の libx264 と比べて若干劣ります。',
    encoderName: (encoder) => {
      switch (encoder) {
        case 'libx264':
          return 'libx264 (ソフトウェア H.264)';
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

    qualityLabel: '画質',
    qualityDraft: 'ドラフト',
    qualityStandard: '標準',
    qualityHigh: '高画質',
    qualityBest: '最高',
    qualityDraftHint: '高速・小容量 (CRF 23)',
    qualityStandardHint: '高速・適度な容量・推奨 (CRF 20、1080p60 20s で約 25 MB)',
    qualityHighHint: '中速・ほぼロスレス (CRF 17、容量は標準の約 3 倍)',
    qualityBestHint: '低速・視覚的にロスレス (CRF 14、容量は標準の約 6 倍)',

    profileLabel: 'レンダリング設定（GPU 内部の処理経路）',
    profileAuto: '自動',
    profileFast: '高速',
    profileBalanced: 'バランス',
    profileUltra: '最高',
    profileAutoHint: '検出した GPU に応じて自動選択（推奨）',
    profileFastHint: 'PBO を無効化し互換性を最優先（性能の低い GPU 向け）',
    profileBalancedHint: 'PBO 2 スロット + composer 1×（一般的な GPU 向け）',
    profileUltraHint: 'PBO 3 スロット（高性能 GPU 専用）',
    detectedGpu: (label) => `検出された GPU：${label}`,
    detectingGpu: 'GPU を検出しています…',
    actualPath: (desc) => `実行パス：${desc}`,
    profileNote:
      '※「レンダリング設定」は GPU 内部の処理経路を決めるだけで、最終的な出力画質には影響しません。書き出しに失敗した場合は「高速」に下げてください。',

    pipelineDescFast: '高速：PBO 無効 + composer 1×（互換性最優先）',
    pipelineDescBalanced: 'バランス：PBO 2 スロット + composer 1×',
    pipelineDescUltra: '最高：PBO 3 スロット + composer 1×',

    resolutionLabel: '解像度',
    resolutionCustom: 'カスタム',
    resolutionEvenHint: '（H.264 は幅・高さが偶数である必要があります）',

    fpsLabel: 'フレームレート',
    timeRangeLabel: '時間範囲（秒）',
    timeRangeSummary: (durSec, frames) =>
      `合計 ${durSec.toFixed(2)} s · ${frames} フレーム`,

    backgroundLabel: '背景',
    transparentLabel: '透明（アルファチャンネルを含める）',
    transparentNotSupported:
      'MP4 (H.264) はアルファ非対応です。透過したい場合は ProRes 4444 または PNG 連番を選んでください。',

    audioInfo: (name, mb) =>
      `音声：${name} · 1 フレームあたり RGBA ≒ ${mb.toFixed(2)} MB`,
    audioNotLoaded: '未読み込み',

    sizeEstimateLabel: '推定ファイルサイズ',
    sizeEstimateValue: ({ totalMB, videoMB, audioMB, uncertaintyPct, hasAudio }) => {
      const total = formatMBJa(totalMB);
      const v = formatMBJa(videoMB);
      if (hasAudio) {
        const a = formatMBJa(audioMB);
        return `約 ${total}（映像 ${v} + 音声 ${a}、誤差 ± ${uncertaintyPct}%）`;
      }
      return `約 ${total}（誤差 ± ${uncertaintyPct}%）`;
    },
    encoderAutoMatched: (label) => `自動選択：${label}（GPU を検出しました）`,
    encoderCpuFallback: '自動選択：CPU ソフトウェアエンコード（利用可能なハードウェアエンコーダがありません）',
    encoderDetecting: 'GPU を検出しています…',
    advancedToggle: '詳細設定（エンコーダー / レンダリング）',

    cancel: 'キャンセル',
    confirm: '保存先を選んで書き出し',
  },

  exportProgress: {
    titleAnalyzing: '音声を解析しています…',
    titleRendering: 'レンダリング中…',
    analyzingFeatures: '音声特徴量を解析しています…',
    detectingBpm: 'BPM を検出しています…',
    renderingFrames: 'フレームを ffmpeg に送信しています…',
    waitingFfmpeg: 'ffmpeg のエンコード書き出しを待っています…',
    frameStats: (frame, total, fps, eta, inFlight) => {
      const parts = [`フレーム ${frame} / ${total}`];
      if (fps !== null && fps > 0) parts.push(`${fps.toFixed(1)} fps`);
      if (eta !== null && eta > 0) parts.push(`残り約 ${formatEtaJa(eta)}`);
      if (inFlight !== null) parts.push(`送信中 ${inFlight} フレーム`);
      return parts.join(' · ');
    },
    waitingFfmpegHint:
      'レンダリングのパイプラインが埋まり、ffmpeg 側のエンコード書き出しを待っています。\n主な原因：エンコーダの初期化が遅い／CPU エンコードの設定が高すぎる／ディスク書き込みが詰まっている。\n長時間進まない場合は下の ffmpeg ログを確認してください。',
    ffmpegLogPrefix: '[ffmpeg]',
    encoderFallback: (from, to) =>
      `ハードウェアエンコーダ ${from} の起動に失敗したため、自動的に ${to}（CPU ソフトウェアエンコード）に切り替えました。\nGPU ドライバが古い、またはそのエンコーダに対応していないことが主な原因です。最終的な画質には影響しません。`,
    completed: (path) => `書き出しが完了しました：\n${path}\n\nエクスプローラーで開きますか？`,
    cancel: 'キャンセル',
  },

  background: {
    label: '背景',
    transparentLabel: '透過',
    transparentHint:
      '透過背景はアルファ情報を保持できる ProRes 4444 または PNG 連番でのみ有効です。MP4 では常に単色背景になります。',
  },

  presetIO: {
    label: 'パラメータプリセット',
    exportJson: '.json として書き出し',
    importJson: '.json から読み込み',
    invalidFile: 'ファイル形式が正しくありません',
    parseFailed: (msg) => `パラメータファイルの読み込みに失敗しました：${msg}`,
  },

  parameterPanel: {
    paneTitle: 'パラメータ',
  },

  presetSelector: {
    entry: (name, category) => `${name}（${category}）`,
    musicTagsLabel: 'おすすめ',
    allMoods: 'すべて',
    empty: '該当するプリセットがありません',
  },

  presetCategories: {
    spectrum: 'スペクトラム',
    particles: 'パーティクル',
    shader: 'シェーダ',
  },

  presetMoods: {
    energetic: 'エネルギッシュ',
    ambient: 'アンビエント',
    abstract: '抽象',
    minimal: 'ミニマル',
    retro: 'レトロ',
    organic: 'オーガニック',
  },

  musicTags: {
    electronic: 'エレクトロニック',
    pop: 'ポップ',
    hiphop: 'ヒップホップ',
    rock: 'ロック',
    jazz: 'ジャズ',
    classical: 'クラシック',
    piano: 'ピアノ',
    lofi: 'Lo-fi',
    ambient: 'アンビエント',
    chillout: 'チルアウト',
    techno: 'テクノ',
    house: 'ハウス',
    synthwave: 'Synthwave',
    vaporwave: 'Vaporwave',
    experimental: '実験音楽',
    'dark-ambient': 'ダークアンビエント',
    drone: 'Drone',
    'post-rock': 'ポストロック',
    dnb: 'D&B',
    dubstep: 'Dubstep',
    cinematic: 'シネマティック',
    psychedelic: 'サイケデリック',
    '8bit': '8-bit',
  },

  presetNames: {
    'spectrum-bars': 'ミラースペクトラムバー',
    'radial-spectrum': '円環スペクトラム',
    'area-spectrum': 'エリアスペクトラム',
    'wave-line': '光流ウェーブライン',
    'circle-burst': 'ビートサークル',
    'particles-burst': 'ビートパーティクル',
    'gpu-particles': 'GPU パーティクル（数百万）',
    'shader-flow': 'スペクトラムフロー',
    'st-wormhole': 'ワームホール · スペクトラム',
    'st-plasma': 'プラズマ · ビート',
    'st-neon-grid': 'Neon Grid · 80s',
    'st-mercury': 'リキッドメタル',
    'st-kaleido': '万華鏡 · スペクトラム',
    'inversion': '反転グリッド',
    'piano-rain': '落下ノート · Piano Rain',
    'drifting-spirits': '舞い上がる光 · Drifting Spirits',
  },

  presetDescriptions: {
    'spectrum-bars': 'ミラー型スペクトラムバー、最も定番の音楽可視化スタイル',
    'radial-spectrum': '円環状に並んだスペクトラム・バー。リズミカルで対称的',
    'area-spectrum': 'スペクトラムを塗りつぶしたグラデーション。波のように穏やか',
    'wave-line': '時間領域の波形を流光ラインに。シンプルで抽象的',
    'circle-burst': 'ビートで広がる同心円の衝撃波。力強い印象',
    'particles-burst': 'ビートごとに咲く花火のようなパーティクル',
    'gpu-particles': '百万のパーティクルが流場で星雲のようにうねる',
    'shader-flow': 'スペクトラム駆動の液体歪み。呼吸するような動き',
    'st-wormhole': 'ワームホールを進む視点。ビートに合わせて急降下',
    'st-plasma': '古典的なプラズマ効果にビートパルスを重ねた',
    'st-neon-grid': '80 年代風サイバーパンクのネオングリッド',
    'st-mercury': '液体金属の表面反射と流動',
    'st-kaleido': 'スペクトラム駆動の万華鏡パターン',
    'inversion': 'モノクロの数学的グリッドが、ビートごとに反転',
    'piano-rain': 'ミニマル落下ノート：尾を引くノートが判定線で爆ぜる。グラデーションはノートにのみ適用、背景は既定で真っ黒（星空 / 水面は任意で ON）',
    'drifting-spirits': 'ビートで光の粒が下から舞い上がる、蛍のような演出',
  },

  presetParamLabels: {
    'spectrum-bars': {
      barCount: 'バンド数',
      barWidth: 'バー幅比',
      heightScale: '高さ係数',
      smoothing: 'スムージング係数',
      gradient: 'バーグラデーション',
      colorMode: 'グラデーションマッピング',
      baseLightness: '輝度ベース',
      energyBoost: 'エネルギー輝度ゲイン',
      beatPunch: 'ビートインパクト',
      mirror: '左右ミラー',
      cornerRadius: '角丸（頂部）',
      // EXPOSURE_SCHEMA
      exposure: '露出倍率',
      glowFloor: 'グロー下限',
      glowBias: 'グローバイアス',
      softClip: 'オーバー露出カーブ',
    },
    'radial-spectrum': {
      barCount: 'バー本数',
      innerRadius: '内径',
      lengthScale: '長さ係数',
      barWidth: 'バー幅',
      smoothing: 'スムージング',
      rotationSpeed: '回転速度',
      beatPunch: 'ビートインパクト',
      gradient: 'バーグラデーション',
      colorMode: 'グラデーションマッピング',
      baseLightness: '輝度ベース',
      energyBoost: 'エネルギーゲイン',
      mirror: '左右ミラー',
      innerRing: '内側のリングを表示',
      // EXPOSURE_SCHEMA
      exposure: '露出倍率',
      glowFloor: 'グロー下限',
      glowBias: 'グローバイアス',
      softClip: 'オーバー露出カーブ',
    },
    'area-spectrum': {
      resolution: 'サンプル精度',
      width: 'キャンバス幅',
      heightScale: '高さ係数',
      smoothing: '時間スムージング',
      spatialSmoothing: '空間スムージング（隣接）',
      baseY: 'ベース Y',
      fillAlpha: '塗りつぶし透明度',
      edgeIntensity: 'トップエッジ強度',
      beatPunch: 'ビートインパクト',
      mirror: '左右ミラー',
      gradient: '塗りつぶしグラデーション',
      edgeColorMode: 'トップエッジ色',
    },
    'wave-line': {
      resolution: 'サンプル精度',
      width: 'キャンバス幅',
      thickness: '線の太さ',
      amplitude: '波形振幅',
      smoothing: 'スムージング',
      glowSpread: 'グロー半径',
      beatGrow: 'ビート時の太さ増加',
      doubleLine: '二重描画（厚み増し）',
      gradient: '波形グラデーション',
      colorMode: 'グラデーションマッピング',
      centerLine: '中心線を描画',
    },
    'circle-burst': {
      maxRings: '同時生存リング数',
      expandSpeed: '拡散速度',
      ringWidth: 'リング幅',
      fadeRate: 'フェード速度',
      bassTrigger: '低域トリガしきい値',
      triggerCooldownMs: '再トリガ冷却（ms）',
      coreEnabled: '中心コアを表示',
      coreScale: 'コアサイズ',
      gradient: '色',
      colorMode: 'グラデーションマッピング',
    },
    'particles-burst': {
      particleCount: 'パーティクル数',
      particleSize: 'パーティクルサイズ',
      burstStrength: '爆発強度',
      gravity: '重力（中心へ）',
      drag: '減衰',
      lifetime: '寿命（秒）',
      rotationSpeed: '全体回転',
      alphaScale: '不透明度',
      gradient: 'グラデーション',
    },
    'gpu-particles': {
      textureSize: 'パーティクル規模',
      pointSize: 'ドットサイズ',
      drag: '抵抗',
      centerPull: '中心への引力',
      bassKick: 'ベース推力',
      swirl: '渦',
      beatSpawn: 'ビート時に再生成',
      fieldScale: 'フィールドスケール',
      alphaScale: '不透明度',
      gradient: 'グラデーション',
    },
    'inversion': {
      cellSize: 'グリッドサイズ',
      shape: '形状',
      fillRatio: '図形の占有率',
      rotateSpeed: '回転速度',
      beatInvert: 'ビート反転の強さ',
      bassDensity: 'ベース密度変調',
      contrast: 'エッジの硬さ',
      gradient: 'グラデーション',
      accentBoost: 'ビートアクセント強度',
    },
    'shader-flow': {
      speed: '流速',
      scale: 'ノイズスケール',
      warp: '歪み強度',
      fftDrive: 'スペクトラム駆動',
      beatGlow: 'ビートグロー',
      gradient: 'グラデーション',
      vignette: 'ビネット',
    },
    'st-wormhole': {
      speed: '速度',
      intensity: '強度',
      twist: '歪み',
      glow: 'グロー',
      gradient: 'グラデーション',
    },
    'st-plasma': {
      speed: '速度',
      intensity: '強度',
      scale: 'スケール',
      pulse: 'パルス振幅',
      gradient: 'グラデーション',
    },
    'st-neon-grid': {
      speed: '速度',
      intensity: '強度',
      density: '密度',
      horizon: '地平線',
      gradient: 'グラデーション',
    },
    'st-mercury': {
      speed: '速度',
      intensity: '強度',
      thickness: '厚さ',
      shine: 'ハイライト',
      gradient: 'グラデーション',
    },
    'st-kaleido': {
      speed: '速度',
      intensity: '強度',
      slices: '鏡面数',
      zoom: '拡縮',
      gradient: 'グラデーション',
    },
    'piano-rain': {
      notesPerBeat: '1 拍あたりのノート数',
      fallSpeed: '落下速度',
      energyThreshold: 'トリガしきい値',
      beatThreshold: 'ビート RMS しきい値',
      noteWidth: 'ノート幅',
      noteHeight: 'ノートの高さ',
      noteTrail: 'ノートの尾',
      noteGlow: 'ノートのグロー',
      judgeLineY: '判定線の位置',
      judgeLineGlow: '判定線グロー',
      hitBurst: '命中バースト',
      waterSurface: '水面リフレクション',
      waterIntensity: '反射の強さ',
      starfield: '星空の密度',
      bgIntensity: '背景の微光',
      gradient: 'ノートのグラデーション',
    },
    'drifting-spirits': {
      particleCount: 'パーティクル数',
      particleSize: 'パーティクルサイズ',
      beatBurst: 'ビート時の放出数',
      beatThreshold: 'ビートしきい値（RMS）',
      ambientRate: '常時放出レート',
      riseSpeed: '上昇速度',
      drift: '横方向のゆらぎ',
      lifetime: '寿命（秒）',
      spawnSpread: '出現範囲（下端）',
      alphaScale: '不透明度',
      bassPush: 'ベース加速',
      gradient: 'グラデーション',
    },
  },

  presetParamOptions: {
    'spectrum-bars': {
      colorMode: {
        position: '位置順（左→右）',
        energy: 'エネルギー順',
        frequency: '周波数順（低→高）',
      },
      softClip: {
        linear: 'リニア（クリップなし）',
        soft: 'ソフト（推奨）',
        film: 'フィルム（ACES）',
      },
    },
    'radial-spectrum': {
      colorMode: {
        angle: '角度順（一周）',
        frequency: '周波数順（低→高）',
        energy: 'エネルギー順',
      },
      softClip: {
        linear: 'リニア（クリップなし）',
        soft: 'ソフト（推奨）',
        film: 'フィルム（ACES）',
      },
    },
    'area-spectrum': {
      edgeColorMode: {
        'gradient-end': 'グラデーション末端',
        white: '白色グロー',
        'per-bin': 'バンドごと',
      },
    },
    'wave-line': {
      colorMode: {
        horizontal: '横方向（左→右）',
        amplitude: '振幅（中央→ピーク）',
      },
    },
    'circle-burst': {
      colorMode: {
        lifetime: '寿命順（新→旧）',
        radius: '半径順（小→大）',
        random: 'ランダム',
      },
    },
    'gpu-particles': {
      textureSize: {
        '256': '低 65 k (256²)',
        '512': '中 262 k (512²)',
        '1024': '高 1 M (1024²)',
      },
    },
    'inversion': {
      shape: {
        '0': '正方形',
        '1': '三角形',
        '2': '円',
        '3': '十字',
      },
    },
  },

  postFX: {
    enabled: 'ポストエフェクトを有効化',
    bloom: '◆ Bloom',
    bloomStrength: ' 強度',
    bloomRadius: ' 範囲',
    bloomThreshold: ' しきい値',
    bloomBeatBoost: ' ビートゲイン',
    chromatic: '◆ 色収差',
    chromaticOffset: ' オフセット',
    chromaticBeatBoost: ' ビートゲイン',
    glitch: '◆ ビートグリッチ',
    glitchIntensity: ' 強度',
    grain: '◆ グレイン',
    grainIntensity: ' 強度',
    vignette: '◆ ビネット',
    vignetteAmount: ' 強度',
    vignetteSoftness: ' 柔らかさ',
  },

  gradient: {
    custom: 'カスタム',
    advanced: '詳細',
    collapse: '閉じる',
    start: '開始',
    middle: '中間',
    end: '終了',
    addMiddle: '中間色を追加',
    removeMiddle: '削除',
    angle: (deg) => `角度 ${Math.round(deg)}°`,
    horizontalTitle: '水平',
    verticalTitle: '垂直',
    reset: 'リセット',
    groups: {
      mist: '霧系',
      neon: 'ネオン',
      auroraOcean: 'オーロラ・海',
      warm: '暖色',
      mono: 'モノクロ',
      rainbow: 'レインボー',
    },
    presets: {
      'midnight-violet': 'ミッドナイトバイオレット',
      'haze-violet': 'ヘイズバイオレット',
      'silver-mist': 'シルバーミスト',
      charcoal: 'チャコール',
      'twilight-blue': 'トワイライトブルー',
      'sakura-mist': '桜ミスト',
      cyberpunk: 'サイバーパンク',
      'neon-rose': 'ネオンローズ',
      synthwave: 'シンセウェーブ',
      miami: 'マイアミ',
      'electric-violet': 'エレクトリックバイオレット',
      'acid-lime': 'アシッドライム',
      aurora: 'オーロラ',
      'ocean-dive': 'ディープオーシャン',
      'mint-flow': 'ミントフロー',
      glacier: 'グレイシャー',
      emerald: 'エメラルド',
      sunset: 'サンセット',
      fire: 'ファイア',
      'rose-gold': 'ローズゴールド',
      peach: 'ピーチ',
      'amber-glow': 'アンバーグロー',
      monochrome: 'モノクローム',
      moonlight: 'ムーンライト',
      'gold-bar': 'ゴールドバー',
      'pure-white': 'ピュアホワイト',
      'pure-cyan': 'ピュアシアン',
      rainbow: 'レインボー',
      tropical: 'トロピカル',
      vinyl: 'ヴァイナル',
    },
  },

  fileDialog: {
    openTitle: '音声・動画ファイルを選択',
    audioFilter: '音声',
    videoFilter: '動画',
    mediaFilter: '音声 / 動画',
    allFilesFilter: 'すべてのファイル',
    saveExportTitle: '保存先...',
    pngSeqDirTitle: 'PNG 連番の出力フォルダを選択',
    pngSeqFilterName: 'PNG 連番フォルダ（フォルダ名を入力）',
    mp4FilterName: 'MP4 動画',
    proResFilterName: 'QuickTime ProRes 4444',
    snapshotTitle: 'スナップショットを保存',
    snapshotFilterName: 'PNG 画像',
  },

  webDemo: {
    bannerText: 'Web 試用版 · プレビュー専用。動画の書き出しはデスクトップ版が必要です。',
    bannerCta: 'デスクトップ版をダウンロード →',
    exportCtaConfirm:
      '動画の書き出しはデスクトップ版のみ対応です。ダウンロードページを開きますか？',
    exportButtonAlt: 'デスクトップ版へ',
  },
};

function formatEtaJa(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}秒`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

function formatMBJa(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${mb.toFixed(0)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(2)} MB`;
}
