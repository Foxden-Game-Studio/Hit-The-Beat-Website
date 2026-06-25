// Main Navigation Tabs Switching
const navTabBtns = document.querySelectorAll('.nav-tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        
        navTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        tabPanels.forEach(panel => {
            if (panel.id === `panel-${targetId}`) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        });
        
        // Pause and reset playback when leaving player tab
        if (targetId === 'player') {
            setTimeout(resizeCanvas, 50); // Resize visualizer canvas when player panel is shown
        } else {
            pauseGame();
            stopSequencer();
        }
    });
});

// Copy Code Blocks helper
document.querySelectorAll('.copy-btn').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        const codeElement = document.getElementById(targetId);
        if (codeElement) {
            navigator.clipboard.writeText(codeElement.textContent).then(() => {
                const originalText = button.textContent;
                button.textContent = "Kopiert!";
                button.style.background = "#22c55e"; // success green
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = "";
                }, 2000);
            }).catch(err => {
                console.error("Fehler beim Kopieren: ", err);
            });
        }
    });
});


// State Variables
let songData = null;
let notes = [];
let audioFile = null;
let audioUrl = null;
let audio = null;
let isPlaying = false;
let playbackTime = 0; // Current playback position in seconds
let lastUpdateTime = 0; // Performance timestamp of the last frame update
let speed = 1.0;
let volume = 0.8;
let autoplayDrums = true;

// Synthesizer Audio Context
let audioCtx = null;
let masterGain = null;

// Dummy Timer for playing without an MP3
let dummyTimerId = null;

// Visualizer Canvas Configuration
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
let hitLineY = 0;
let laneWidth = 0;
const noteSpeed = 350; // Pixels per second
let particles = [];

// Lane definitions
const LANES = [
    { name: 'hi-hat', key: 'H', altKey: 'D', color: '#fbbf24', colorRgb: '251, 191, 38', x: 0 },
    { name: 'snare',  key: 'S', altKey: 'F', color: '#22d3ee', colorRgb: '34, 211, 238',  x: 0 },
    { name: 'kick',   key: 'K', altKey: 'J', color: '#f43f5e', colorRgb: '244, 63, 94',   x: 0 },
    { name: 'tom',    key: 'T', altKey: 'L', color: '#c084fc', colorRgb: '192, 132, 252',  x: 0 }
];

// Map note types to lanes (0: hi-hat, 1: snare, 2: kick, 3: tom)
function mapTypeToLaneIndex(type) {
    if (!type) return 2; // Default to kick
    const t = type.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t.includes('kick') || t.includes('bass') || t === 'drum') {
        return 2; // Kick
    } else if (t.includes('snare')) {
        return 1; // Snare
    } else if (t.includes('hat') || t.includes('cymbal') || t.includes('ride') || t.includes('crash')) {
        return 0; // Hi-hat
    } else if (t.includes('tom')) {
        return 3; // Tom
    }
    return 2; // Default to kick
}

// Web Audio API Synthesizer
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(volume, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSynthDrum(laneIndex) {
    if (!audioCtx) initAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const dest = masterGain;
    const now = audioCtx.currentTime;

    switch (laneIndex) {
        case 0: // Hi-Hat
            playSynthHiHat(now, dest);
            break;
        case 1: // Snare
            playSynthSnare(now, dest);
            break;
        case 2: // Kick
            playSynthKick(now, dest);
            break;
        case 3: // Tom
            playSynthTom(now, dest);
            break;
    }
}

function playSynthKick(time, dest) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(dest);
    
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    osc.start(time);
    osc.stop(time + 0.16);
}

function playSynthSnare(time, dest) {
    // Noise component
    const bufferSize = audioCtx.sampleRate * 0.15;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, time);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);
    
    // Tone snap component
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    oscGain.gain.setValueAtTime(0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
    
    osc.connect(oscGain);
    oscGain.connect(dest);
    
    noise.start(time);
    osc.start(time);
    noise.stop(time + 0.16);
    osc.stop(time + 0.09);
}

function playSynthHiHat(time, dest) {
    const bufferSize = audioCtx.sampleRate * 0.04;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.2, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.04);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);
    
    noise.start(time);
    noise.stop(time + 0.05);
}

function playSynthTom(time, dest) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(dest);
    
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.25);
    
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
    
    osc.start(time);
    osc.stop(time + 0.26);
}

// Particle System for Hit Effects
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8 - 3;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.02;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.alpha -= this.decay;
    }

    draw(c) {
        c.save();
        c.globalAlpha = this.alpha;
        c.shadowBlur = 10;
        c.shadowColor = this.color;
        c.fillStyle = this.color;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
}

function spawnHitEffect(laneIndex) {
    const lane = LANES[laneIndex];
    const x = lane.x + laneWidth / 2;
    const y = hitLineY;
    
    // Spawn particles
    for (let i = 0; i < 12; i++) {
        particles.push(new Particle(x, y, lane.color));
    }
}

// Canvas Initialization
function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    hitLineY = rect.height * 0.85;
    laneWidth = rect.width / 4;
    
    // Update lane positions
    LANES.forEach((lane, index) => {
        lane.x = index * laneWidth;
    });
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Render Game Loop
function draw() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);

    // Draw Lane Dividers & Faint Background Stems
    LANES.forEach((lane, index) => {
        // Draw Lane background stream
        const grad = ctx.createLinearGradient(lane.x, 0, lane.x, height);
        grad.addColorStop(0, 'rgba(10, 15, 28, 0)');
        grad.addColorStop(0.85, `rgba(${lane.colorRgb}, 0.05)`);
        grad.addColorStop(1, 'rgba(10, 15, 28, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(lane.x, 0, laneWidth, height);

        // Divider Line
        if (index > 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(lane.x, 0);
            ctx.lineTo(lane.x, height);
            ctx.stroke();
        }
    });

    // Draw Hit Line Receptors
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitLineY);
    ctx.lineTo(width, hitLineY);
    ctx.stroke();

    // Draw Receptor Targets (Glowing circles at intersections)
    LANES.forEach((lane) => {
        const x = lane.x + laneWidth / 2;
        
        ctx.save();
        ctx.strokeStyle = `rgba(${lane.colorRgb}, 0.4)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, hitLineY, 18, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw inner dot
        ctx.fillStyle = `rgba(${lane.colorRgb}, 0.2)`;
        ctx.beginPath();
        ctx.arc(x, hitLineY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Draw Notes
    if (notes.length > 0) {
        notes.forEach((note) => {
            const timeDiff = note.time - playbackTime;
            
            // Draw note if it's on screen: from 0.5 seconds in the past to 2.5 seconds in the future
            if (timeDiff > -0.5 && timeDiff < 2.5) {
                const lane = LANES[note.laneIndex];
                if (!lane) return;
                const x = lane.x + laneWidth / 2;
                const y = hitLineY - (timeDiff * noteSpeed);
                
                // Only render if within vertical bounds
                if (y > -20 && y < height + 20) {
                    ctx.save();
                    
                    // Add glow for active notes
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = lane.color;
                    
                    // Fade out notes that have passed the hit line
                    if (timeDiff < 0) {
                        ctx.globalAlpha = Math.max(0, 1 + timeDiff * 2); // fade out over 0.5s
                    }
                    
                    ctx.fillStyle = lane.color;
                    
                    // Draw rounded pill for note
                    ctx.beginPath();
                    ctx.roundRect(x - 22, y - 8, 44, 16, 8);
                    ctx.fill();
                    
                    // Highlight center core
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.roundRect(x - 14, y - 4, 28, 8, 4);
                    ctx.fill();
                    
                    ctx.restore();
                }
            }
        });
    }

    // Update and draw Particles
    particles = particles.filter(p => p.alpha > 0);
    particles.forEach((p) => {
        p.update();
        p.draw(ctx);
    });

    // Request Next Frame
    requestAnimationFrame(draw);
}

// Trigger Drum Pad Visual State & Sound
const pads = {
    'hi-hat': document.getElementById('pad-hi-hat'),
    'snare': document.getElementById('pad-snare'),
    'kick': document.getElementById('pad-kick'),
    'tom': document.getElementById('pad-tom')
};

function triggerDrumPad(drumName, simulated = false) {
    const pad = pads[drumName];
    if (!pad) return;
    
    // Add active class
    pad.classList.add('active');
    setTimeout(() => {
        pad.classList.remove('active');
    }, 100);

    const laneIndex = LANES.findIndex(l => l.name === drumName);
    
    // Spawn visual effects on canvas
    if (laneIndex !== -1) {
        spawnHitEffect(laneIndex);
        
        // Play synthesizer audio only if triggered by user (simulated = false)
        // or if autoplay is enabled
        if (!simulated || autoplayDrums) {
            playSynthDrum(laneIndex);
        }
    }
}

// Set Up Event Listeners for Drum Pads (Mouse clicks)
Object.keys(pads).forEach((key) => {
    const pad = pads[key];
    if (pad) {
        pad.addEventListener('mousedown', () => {
            initAudioContext();
            triggerDrumPad(key, false);
        });
    }
});

// Playback Logic
const playBtn = document.getElementById('play-btn');
const progressSlider = document.getElementById('progress-slider');
const timeCurrent = document.getElementById('time-current');
const timeDuration = document.getElementById('time-duration');
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');
const volumeSlider = document.getElementById('volume-slider');
const volumeDisplay = document.getElementById('volume-display');
const autoplayCheckbox = document.getElementById('autoplay-drums');

// Audio setup
function createAudioElement(url) {
    if (audio) {
        audio.pause();
        audio.remove();
    }
    audio = new Audio(url);
    audio.playbackRate = speed;
    audio.volume = volume;
    
    audio.addEventListener('play', () => {
        isPlaying = true;
        lastUpdateTime = performance.now();
        updatePlayButtonState();
        startPlaybackLoop();
    });
    
    audio.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayButtonState();
    });
    
    audio.addEventListener('timeupdate', () => {
        if (!audio) return;
        playbackTime = audio.currentTime;
        updateProgressUI();
    });

    audio.addEventListener('durationchange', () => {
        updateDurationUI();
    });
    
    audio.addEventListener('ended', () => {
        isPlaying = false;
        playbackTime = 0;
        audio.currentTime = 0;
        resetNotesTriggerState();
        updatePlayButtonState();
        updateProgressUI();
    });
}

function updatePlayButtonState() {
    if (!playBtn) return;
    const iconPlay = playBtn.querySelector('.icon-play');
    const iconPause = playBtn.querySelector('.icon-pause');
    if (isPlaying) {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    } else {
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
    }
}

function updateProgressUI() {
    if (songData && progressSlider) {
        const totalDuration = getDuration();
        const percent = totalDuration > 0 ? (playbackTime / totalDuration) * 100 : 0;
        progressSlider.value = percent;
        
        // Custom background trail for slider
        progressSlider.style.background = `linear-gradient(90deg, var(--accent-purple) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
        timeCurrent.textContent = formatTime(playbackTime);
    }
}

function updateDurationUI() {
    if (timeDuration) {
        timeDuration.textContent = formatTime(getDuration());
    }
}

function getDuration() {
    if (audio) {
        return audio.duration || 0;
    }
    // Fallback to max note timestamp if dummy playing
    if (notes.length > 0) {
        return notes[notes.length - 1].time + 3.0;
    }
    return 0;
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Reset Note triggers when scrubbing/seeking
function resetNotesTriggerState() {
    notes.forEach(note => {
        note.triggered = false;
    });
}

function seekToPercent(percent) {
    const duration = getDuration();
    const targetTime = (percent / 100) * duration;
    
    playbackTime = targetTime;
    resetNotesTriggerState();
    
    // Re-trigger notes in past so they don't fire again
    notes.forEach(n => {
        if (n.time < targetTime) {
            n.triggered = true;
        }
    });

    if (audio) {
        audio.currentTime = targetTime;
    }
    updateProgressUI();
}

if (progressSlider) {
    progressSlider.addEventListener('input', (e) => {
        seekToPercent(e.target.value);
    });
}

// Volume & Speed slider listeners
if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
        volume = e.target.value / 100;
        volumeDisplay.textContent = `${e.target.value}%`;
        if (audio) {
            audio.volume = volume;
        }
        if (masterGain) {
            masterGain.gain.setValueAtTime(volume, audioCtx.currentTime);
        }
    });
}

if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
        speed = parseFloat(e.target.value);
        speedDisplay.textContent = `${speed.toFixed(2)}x`;
        if (audio) {
            audio.playbackRate = speed;
        }
    });
}

if (autoplayCheckbox) {
    autoplayCheckbox.addEventListener('change', (e) => {
        autoplayDrums = e.target.checked;
    });
}

// Main playback coordination loop (for syncing notes and auto-playing synthesizer)
function startPlaybackLoop() {
    function loop(nowTimestamp) {
        if (!isPlaying) return;
        
        // If playing simulated/dummy (no audio file), we tick the timer using frame timestamps
        if (!audio) {
            const elapsed = (nowTimestamp - lastUpdateTime) / 1000;
            lastUpdateTime = nowTimestamp;
            
            // Advance playbackTime scaled by speed
            playbackTime += elapsed * speed;
            
            const maxDuration = getDuration();
            if (playbackTime >= maxDuration) {
                isPlaying = false;
                playbackTime = 0;
                resetNotesTriggerState();
                updatePlayButtonState();
                updateProgressUI();
                return;
            }
            updateProgressUI();
        }
        
        // Check for note triggers
        notes.forEach((note) => {
            if (!note.triggered && note.time <= playbackTime) {
                // To avoid burst on load or extreme seeking lag, make sure it's within a 0.2s trigger window
                if (playbackTime - note.time < 0.2) {
                    triggerDrumPad(LANES[note.laneIndex].name, true);
                }
                note.triggered = true;
            }
        });
        
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

// Play/Pause Button
if (playBtn) {
    playBtn.addEventListener('click', () => {
        initAudioContext();
        if (isPlaying) {
            pauseGame();
        } else {
            playGame();
        }
    });
}

function playGame() {
    if (!songData) return;
    
    if (audio) {
        audio.play().catch(err => {
            console.error("Audio playback error: ", err);
        });
    } else {
        // Dummy play mode
        isPlaying = true;
        lastUpdateTime = performance.now();
        updatePlayButtonState();
        startPlaybackLoop();
    }
}

function pauseGame() {
    isPlaying = false;
    updatePlayButtonState();
    if (audio) {
        audio.pause();
    }
}

// Spacebar Play/Pause & Keyboard drum pads
window.addEventListener('keydown', (e) => {
    // Ignore keypresses if typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
        e.preventDefault();
        initAudioContext();
        if (isPlaying) {
            pauseGame();
        } else {
            playGame();
        }
        return;
    }

    const key = e.key.toUpperCase();
    
    // Find matching drum pad from LANES keys or altKeys
    const lane = LANES.find(l => l.key === key || l.altKey === key);
    if (lane) {
        initAudioContext();
        triggerDrumPad(lane.name, false);
    }
});

// File upload processing
const jsonInput = document.getElementById('json-input');
const audioInput = document.getElementById('audio-input');
const statusJson = document.getElementById('status-json');
const statusAudio = document.getElementById('status-audio');
const metadataCard = document.getElementById('metadata-card');
const songTitle = document.getElementById('song-title');
const songDifficulty = document.getElementById('song-difficulty');
const songNoteCount = document.getElementById('song-note-count');

if (jsonInput) {
    jsonInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleJsonFile(file);
    });
}

if (audioInput) {
    audioInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleAudioFile(file);
    });
}

function handleJsonFile(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            loadSongData(data);
            
            // Update UI status
            statusJson.innerHTML = `<span class="badge badge-success">GELADEN</span> Noten: ${file.name}`;
            checkReadyState();
        } catch (err) {
            alert("Fehler beim Lesen der JSON-Datei: " + err.message);
        }
    };
    reader.readAsText(file);
}

function handleAudioFile(file) {
    audioFile = file;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    createAudioElement(audioUrl);
    
    statusAudio.innerHTML = `<span class="badge badge-success">GELADEN</span> Audio: ${file.name}`;
    checkReadyState();
}

function checkReadyState() {
    if (songData) {
        if (playBtn) playBtn.disabled = false;
        if (progressSlider) progressSlider.disabled = false;
        updateDurationUI();
    }
}

function loadSongData(data) {
    songData = data;
    
    // Parse note timestamps
    if (data.timestamps && Array.isArray(data.timestamps)) {
        notes = data.timestamps.map(item => ({
            time: parseFloat(item.time),
            type: item.type,
            laneIndex: mapTypeToLaneIndex(item.type),
            triggered: false
        }));
        
        // Sort notes chronologically to be safe
        notes.sort((a, b) => a.time - b.time);
    } else {
        notes = [];
    }

    // Display metadata card
    if (songTitle) songTitle.textContent = data.song_name || "Unbenanntes Lied";
    if (songDifficulty) songDifficulty.textContent = data.difficulty || "medium";
    if (songNoteCount) songNoteCount.textContent = notes.length;
    if (metadataCard) metadataCard.classList.remove('hidden');
    
    // Reset play state
    pauseGame();
    playbackTime = 0;
    resetNotesTriggerState();
    updateProgressUI();
    updateDurationUI();
}

// Drag & Drop Functionality
const dropzone = document.getElementById('dropzone');

if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            let jsonFile = null;
            let audioFileObj = null;

            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                const ext = f.name.split('.').pop().toLowerCase();
                
                if (ext === 'json' || ext === 'jason') {
                    jsonFile = f;
                } else if (f.type.startsWith('audio/') || ext === 'mp3') {
                    audioFileObj = f;
                }
            }

            if (jsonFile) {
                handleJsonFile(jsonFile);
            }
            if (audioFileObj) {
                handleAudioFile(audioFileObj);
            }
        }
    });
}

// Demo Loader (Generates a clean drum beat pattern)
const demoBtn = document.getElementById('demo-btn');
if (demoBtn) {
    demoBtn.addEventListener('click', () => {
        initAudioContext();
        
        // Build a nice synthetic beat sequence (Kick/Snare/Hihat/Tom pattern for 64 seconds)
        const demoTimestamps = [];
        const songLen = 64; // seconds
        const bpm = 120;
        const beatDuration = 60 / bpm; // 0.5 seconds per beat
        
        for (let t = 0; t < songLen; t += beatDuration / 2) { // Eighth notes
            const beatNum = Math.floor(t / beatDuration);
            const fraction = t % beatDuration;
            
            // Constant hi-hat on eighth notes
            demoTimestamps.push({ time: t, type: 'hi-hat' });
            
            // Kick on 1 and 3 beats
            if (beatNum % 4 === 0 && fraction === 0) {
                demoTimestamps.push({ time: t, type: 'kick' });
            }
            if (beatNum % 4 === 2 && fraction === 0) {
                demoTimestamps.push({ time: t, type: 'kick' });
                // Add a double-kick on upbeat of 2.5
                if (Math.random() > 0.5) {
                    demoTimestamps.push({ time: t + beatDuration/2, type: 'kick' });
                }
            }
            
            // Snare on 2 and 4 beats
            if ((beatNum % 4 === 1 || beatNum % 4 === 3) && fraction === 0) {
                demoTimestamps.push({ time: t, type: 'snare' });
            }
            
            // Tom fills occasionally on the 7th/8th beats of a 4-bar phrase
            if (beatNum % 8 === 7 && fraction > 0) {
                demoTimestamps.push({ time: t, type: 'tom' });
            }
        }

        const demoJson = {
            song_name: "Boom-Boom-Clap Demo (Synthetisiert)",
            difficulty: "easy",
            audio_file: "synth",
            timestamps: demoTimestamps
        };

        loadSongData(demoJson);
        
        // Clear custom loaded audio file if loaded, to fallback to dummy sync mode
        if (audio) {
            audio.pause();
            audio.remove();
            audio = null;
            audioFile = null;
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            audioUrl = null;
        }
        
        statusJson.innerHTML = `<span class="badge badge-success">GELADEN</span> Noten: Demo-Song`;
        statusAudio.innerHTML = `<span class="badge badge-success">SYNTH MODE</span> Audio: Synthesizer-Simulation`;
        checkReadyState();
    });
}

// Start Canvas Draw Loop immediately
if (canvas) {
    requestAnimationFrame(draw);
}

/* ==========================================================================
   DRUM SEQUENCER & EDITOR SECTION
   ========================================================================== */

// Tab switching logic for player vs editor
const tabBtns = document.querySelectorAll('.sub-tab-btn');
const tabContents = document.querySelectorAll('.sub-tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        tabContents.forEach(tc => {
            if (tc.id === `${tabId}-tab-content`) {
                tc.classList.remove('hidden');
            } else {
                tc.classList.add('hidden');
            }
        });
        
        // Stop visualizer playback if switching to editor
        if (tabId === 'editor') {
            pauseGame();
            rebuildSequencerGrid(); // rebuild just in case container dimensions changed
        } else {
            // Stop sequencer loop if switching to player
            stopSequencer();
            setTimeout(resizeCanvas, 50); // resize visualizer canvas
        }
    });
});

// Sequencer Components Mapping
const SEQUENCER_DRUMS = [
    { id: 'kick', label: 'Bass Drum (Kick)', drumType: 'kick' },
    { id: 'snare', label: 'Snare Drum', drumType: 'snare' },
    { id: 'hi-hat-closed', label: 'Hi-Hat (Closed)', drumType: 'hi-hat' },
    { id: 'hi-hat-open', label: 'Hi-Hat (Open)', drumType: 'hi-hat' },
    { id: 'tom1', label: 'Tom High', drumType: 'tom' },
    { id: 'tom2', label: 'Tom Mid', drumType: 'tom' },
    { id: 'floor-tom', label: 'Floor Tom', drumType: 'tom' },
    { id: 'crash', label: 'Crash Cymbal', drumType: 'hi-hat' },
    { id: 'ride', label: 'Ride Cymbal', drumType: 'hi-hat' }
];

// Sequencer State variables
let sequencerGrid = {}; // key: "drumId_col" -> boolean
let sequencerPlaying = false;
let sequencerPlayhead = 0;
let nextNoteTime = 0.0; // AudioContext timeline clock time for next step
const scheduleAheadTime = 0.12; // Schedule notes 120ms ahead
const lookahead = 25.0; // Run scheduler loop every 25ms
let sequencerTimerId = null;

// DOM Elements
const editorSongName = document.getElementById('editor-song-name');
const editorDifficulty = document.getElementById('editor-difficulty');
const editorResolution = document.getElementById('editor-resolution');
const editorBpm = document.getElementById('editor-bpm');
const editorBpmDisplay = document.getElementById('editor-bpm-display');
const editorBars = document.getElementById('editor-bars');
const editorBarsDisplay = document.getElementById('editor-bars-display');
const editorBeats = document.getElementById('editor-beats-per-bar');
const editorBeatsDisplay = document.getElementById('editor-beats-display');
const sequencerGridContainer = document.getElementById('sequencer-grid-container');

const editorPlayBtn = document.getElementById('editor-play-btn');
const editorClearBtn = document.getElementById('editor-clear-btn');
const editorLoadPlayerBtn = document.getElementById('editor-load-player-btn');
const editorExportBtn = document.getElementById('editor-export-btn');
const timingsListEl = document.getElementById('timings-list');

// Sliders and Selects event listeners
if (editorBpm) {
    editorBpm.addEventListener('input', (e) => {
        editorBpmDisplay.textContent = e.target.value;
        calculateSequencerTimings();
    });
}

if (editorBars) {
    editorBars.addEventListener('input', (e) => {
        editorBarsDisplay.textContent = e.target.value;
        rebuildSequencerGrid();
    });
}

if (editorBeats) {
    editorBeats.addEventListener('input', (e) => {
        editorBeatsDisplay.textContent = e.target.value;
        rebuildSequencerGrid();
    });
}

if (editorResolution) {
    editorResolution.addEventListener('change', () => {
        rebuildSequencerGrid();
    });
}

// Generate dynamic Grid layout
function rebuildSequencerGrid() {
    if (!sequencerGridContainer) return;
    
    const beatsPerBar = parseInt(editorBeats.value);
    const bars = parseInt(editorBars.value);
    const resolutionVal = parseInt(editorResolution.value);
    const subdivisions = resolutionVal === 4 ? 1 : (resolutionVal === 8 ? 2 : 4);
    
    const barsPerBlock = 4; // Wrap every 4 bars
    let html = '';
    
    for (let blockStartBar = 1; blockStartBar <= bars; blockStartBar += barsPerBlock) {
        const blockEndBar = Math.min(blockStartBar + barsPerBlock - 1, bars);
        const blockBarsCount = blockEndBar - blockStartBar + 1;
        const blockStartCol = (blockStartBar - 1) * beatsPerBar * subdivisions;
        const blockEndCol = blockEndBar * beatsPerBar * subdivisions;
        
        html += `<div class="sequencer-block" style="margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 1rem; background: rgba(15, 23, 42, 0.35); overflow-x: auto; box-shadow: inset 0 2px 8px rgba(0,0,0,0.2);">`;
        html += `<table class="sequencer-table" style="border-collapse: collapse; width: max-content; min-width: 100%; table-layout: fixed;">`;
        
        // Header Row 1 (Bar numbers)
        html += '<thead><tr><th class="instrument-label" style="border-bottom: none; padding-bottom: 0; position: sticky; left: 0; background: #111625; z-index: 10;">Takt</th>';
        for (let bar = blockStartBar; bar <= blockEndBar; bar++) {
            html += `<th colspan="${beatsPerBar * subdivisions}" class="bar-header-title" style="text-align: center; border-bottom: 2px solid var(--accent-purple); font-weight: 800; font-size: 0.9rem; letter-spacing: 0.05em; color: var(--accent-purple); padding: 0.5rem 0;">Takt ${bar}</th>`;
        }
        html += '</tr>';
        
        // Header Row 2 (Beat numbers & subdivisions)
        html += '<tr><th class="instrument-label" style="padding-top: 0; position: sticky; left: 0; background: #111625; z-index: 10; border-right: 1px solid rgba(255, 255, 255, 0.1);">Instrument</th>';
        for (let col = blockStartCol; col < blockEndCol; col++) {
            const beatInBar = Math.floor((col % (beatsPerBar * subdivisions)) / subdivisions) + 1;
            const subIdx = col % subdivisions;
            
            const isMainBeat = (subIdx === 0);
            const isBarStart = (col % (beatsPerBar * subdivisions) === 0);
            
            let thClass = 'grid-cell';
            if (isBarStart) thClass += ' bar-start';
            else if (isMainBeat) thClass += ' beat-start';
            if (isMainBeat) thClass += ' main-beat';
            
            let label = '';
            if (subdivisions === 1) {
                label = beatInBar.toString();
            } else if (subdivisions === 2) {
                label = subIdx === 0 ? beatInBar.toString() : '+';
            } else if (subdivisions === 4) {
                if (subIdx === 0) label = beatInBar.toString();
                else if (subIdx === 1) label = 'e';
                else if (subIdx === 2) label = '+';
                else if (subIdx === 3) label = 'd';
            }
            
            html += `<th class="${thClass}" data-col="${col}" style="font-weight: 800; font-size: 0.85rem; color: ${isMainBeat ? 'var(--accent-blue)' : 'rgba(255,255,255,0.35)'}; line-height: 1;">${label}</th>`;
        }
        html += '</tr></thead><tbody>';
        
        // Component Rows
        SEQUENCER_DRUMS.forEach((drum) => {
            html += `<tr class="sequencer-row" data-drum-id="${drum.id}">`;
            html += `<td class="instrument-label" style="position: sticky; left: 0; background: #111625; z-index: 10; border-right: 1px solid rgba(255, 255, 255, 0.1);">${drum.label}</td>`;
            
            for (let col = blockStartCol; col < blockEndCol; col++) {
                const subIdx = col % subdivisions;
                const isMainBeat = (subIdx === 0);
                const isBarStart = (col % (beatsPerBar * subdivisions) === 0);
                
                let cellClass = 'grid-cell';
                if (isBarStart) cellClass += ' bar-start';
                else if (isMainBeat) cellClass += ' beat-start';
                
                const cellKey = `${drum.id}_${col}`;
                const checked = sequencerGrid[cellKey] ? 'checked' : '';
                
                html += `<td class="${cellClass}" data-col="${col}">`;
                html += `<input type="checkbox" class="note-trigger" data-drum="${drum.drumType}" data-drum-id="${drum.id}" data-col="${col}" ${checked}>`;
                html += `</td>`;
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table></div>';
    }
    
    sequencerGridContainer.innerHTML = html;
    
    // Wire up events for the generated checkboxes
    const triggers = sequencerGridContainer.querySelectorAll('.note-trigger');
    triggers.forEach(input => {
        input.addEventListener('change', (e) => {
            const drumId = e.target.getAttribute('data-drum-id');
            const col = parseInt(e.target.getAttribute('data-col'));
            const key = `${drumId}_${col}`;
            sequencerGrid[key] = e.target.checked;
            
            // Instantly play the synthesised drum on user check
            if (e.target.checked) {
                const drumType = e.target.getAttribute('data-drum');
                const laneIndex = mapTypeToLaneIndex(drumType);
                initAudioContext();
                playSynthDrum(laneIndex);
            }
            
            calculateSequencerTimings();
        });
    });
    
    calculateSequencerTimings();
}

// Calculate milliseconds timestamps and display list
function calculateSequencerTimings() {
    if (!timingsListEl || !sequencerGridContainer) return;
    
    const bpm = parseInt(editorBpm.value);
    const beatDurationSeconds = 60 / bpm;
    const resolutionVal = parseInt(editorResolution.value);
    const subdivisions = resolutionVal === 4 ? 1 : (resolutionVal === 8 ? 2 : 4);
    const subdivisionDurationSeconds = beatDurationSeconds / subdivisions;
    const beatsPerBar = parseInt(editorBeats.value);
    
    const activeNotes = [];
    
    SEQUENCER_DRUMS.forEach((drum) => {
        const rows = sequencerGridContainer.querySelectorAll(`.note-trigger[data-drum-id="${drum.id}"]`);
        rows.forEach((input) => {
            const col = parseInt(input.getAttribute('data-col'));
            if (input.checked) {
                const timeSec = col * subdivisionDurationSeconds;
                
                const barNum = Math.floor(col / (beatsPerBar * subdivisions)) + 1;
                const beatInBar = Math.floor((col % (beatsPerBar * subdivisions)) / subdivisions) + 1;
                const subBeat = (col % subdivisions) + 1;
                
                let positionStr = '';
                if (subdivisions === 1) {
                    positionStr = `[${barNum}.${beatInBar}]`;
                } else if (subdivisions === 2) {
                    positionStr = subBeat === 1 ? `[${barNum}.${beatInBar}]` : `[${barNum}.${beatInBar}.+]`;
                } else if (subdivisions === 4) {
                    let noteText = '';
                    if (subBeat === 1) noteText = '';
                    else if (subBeat === 2) noteText = '.e';
                    else if (subBeat === 3) noteText = '.+';
                    else if (subBeat === 4) noteText = '.d';
                    positionStr = `[${barNum}.${beatInBar}${noteText}]`;
                }
                
                activeNotes.push({
                    time: timeSec,
                    label: drum.label,
                    position: positionStr
                });
            }
        });
    });
    
    // Sort chronologically
    activeNotes.sort((a, b) => a.time - b.time);
    
    if (activeNotes.length === 0) {
        timingsListEl.innerHTML = '<span class="empty-list-msg">Noch keine Noten gesetzt.</span>';
        return;
    }
    
    let html = '';
    activeNotes.forEach((note) => {
        const mins = Math.floor(note.time / 60);
        const secs = Math.floor(note.time % 60);
        const ms = Math.floor((note.time % 1) * 1000);
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
        
        html += `
            <div class="timing-row">
                <span class="timing-time">${timeStr}</span>
                <span class="timing-component">${note.label}</span>
                <span class="timing-position">${note.position}</span>
            </div>
        `;
    });
    
    timingsListEl.innerHTML = html;
}

// Playback Scheduler using Web Audio API clock
function sequencerScheduler() {
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        schedulePlayhead(sequencerPlayhead, nextNoteTime);
        advancePlayhead();
    }
}

function schedulePlayhead(playheadCol, time) {
    const beatsPerBar = parseInt(editorBeats.value);
    const bars = parseInt(editorBars.value);
    const resolutionVal = parseInt(editorResolution.value);
    const subdivisions = resolutionVal === 4 ? 1 : (resolutionVal === 8 ? 2 : 4);
    const totalCols = bars * beatsPerBar * subdivisions;
    
    // Play active triggers
    SEQUENCER_DRUMS.forEach((drum) => {
        const key = `${drum.id}_${playheadCol}`;
        if (sequencerGrid[key]) {
            const laneIndex = mapTypeToLaneIndex(drum.drumType);
            
            // Scheduling synthesised drum precise audio timestamp
            if (!audioCtx) initAudioContext();
            const dest = masterGain;
            switch (laneIndex) {
                case 0: playSynthHiHat(time, dest); break;
                case 1: playSynthSnare(time, dest); break;
                case 2: playSynthKick(time, dest); break;
                case 3: playSynthTom(time, dest); break;
            }
        }
    });

    // Schedule visual column highlight
    const delayMs = (time - audioCtx.currentTime) * 1000;
    setTimeout(() => {
        if (!sequencerPlaying) return;
        highlightPlayheadColumn(playheadCol);
    }, Math.max(0, delayMs));
}

function advancePlayhead() {
    const beatsPerBar = parseInt(editorBeats.value);
    const bars = parseInt(editorBars.value);
    const resolutionVal = parseInt(editorResolution.value);
    const subdivisions = resolutionVal === 4 ? 1 : (resolutionVal === 8 ? 2 : 4);
    const totalCols = bars * beatsPerBar * subdivisions;
    
    const bpm = parseInt(editorBpm.value);
    const beatDurationSeconds = 60 / bpm;
    const subdivisionDurationSeconds = beatDurationSeconds / subdivisions;

    nextNoteTime += subdivisionDurationSeconds;
    sequencerPlayhead = (sequencerPlayhead + 1) % totalCols;
}

function highlightPlayheadColumn(colIndex) {
    if (!sequencerGridContainer) return;
    
    // Remove previous playhead classes
    const activeCells = sequencerGridContainer.querySelectorAll('.playhead-active');
    activeCells.forEach(cell => cell.classList.remove('playhead-active'));
    
    // Add active highlights to current col
    const cells = sequencerGridContainer.querySelectorAll(`td[data-col="${colIndex}"], th[data-col="${colIndex}"]`);
    cells.forEach(cell => cell.classList.add('playhead-active'));
}

// Start/Stop sequencer Loop
function startSequencer() {
    initAudioContext();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    sequencerPlaying = true;
    sequencerPlayhead = 0;
    nextNoteTime = audioCtx.currentTime + 0.05;
    
    if (editorPlayBtn) {
        editorPlayBtn.querySelector('.icon-play').classList.add('hidden');
        editorPlayBtn.querySelector('.icon-pause').classList.remove('hidden');
    }
    
    sequencerTimerId = setInterval(sequencerScheduler, lookahead);
}

function stopSequencer() {
    sequencerPlaying = false;
    if (sequencerTimerId) {
        clearInterval(sequencerTimerId);
        sequencerTimerId = null;
    }
    
    if (editorPlayBtn) {
        editorPlayBtn.querySelector('.icon-play').classList.remove('hidden');
        editorPlayBtn.querySelector('.icon-pause').classList.add('hidden');
    }
    
    if (sequencerGridContainer) {
        const activeCells = sequencerGridContainer.querySelectorAll('.playhead-active');
        activeCells.forEach(cell => cell.classList.remove('playhead-active'));
    }
}

if (editorPlayBtn) {
    editorPlayBtn.addEventListener('click', () => {
        if (sequencerPlaying) {
            stopSequencer();
        } else {
            startSequencer();
        }
    });
}

// Clear Grid
if (editorClearBtn) {
    editorClearBtn.addEventListener('click', () => {
        if (confirm("Möchtest du das gesamte Sequenzer-Raster leeren?")) {
            sequencerGrid = {};
            rebuildSequencerGrid();
        }
    });
}

// Compile grid state to JSON schema
function gatherSequencerNotes() {
    const bpm = parseInt(editorBpm.value);
    const beatDurationSeconds = 60 / bpm;
    const resolutionVal = parseInt(editorResolution.value);
    const subdivisions = resolutionVal === 4 ? 1 : (resolutionVal === 8 ? 2 : 4);
    const subdivisionDurationSeconds = beatDurationSeconds / subdivisions;
    const beatsPerBar = parseInt(editorBeats.value);
    const bars = parseInt(editorBars.value);
    const totalCols = bars * beatsPerBar * subdivisions;
    
    const outputTimestamps = [];
    
    // Query columns chronologically
    for (let col = 0; col < totalCols; col++) {
        const timeSec = col * subdivisionDurationSeconds;
        const roundedTime = Math.round(timeSec * 1000) / 1000;
        
        SEQUENCER_DRUMS.forEach((drum) => {
            const key = `${drum.id}_${col}`;
            if (sequencerGrid[key]) {
                outputTimestamps.push({
                    time: roundedTime,
                    type: drum.drumType
                });
            }
        });
    }
    
    return {
        song_name: editorSongName.value || "Mein Schlagzeug Beat",
        difficulty: editorDifficulty.value || "medium",
        audio_file: "synth",
        timestamps: outputTimestamps
    };
}

// Download JSON
if (editorExportBtn) {
    editorExportBtn.addEventListener('click', () => {
        const jsonOutput = gatherSequencerNotes();
        if (jsonOutput.timestamps.length === 0) {
            alert("Das Raster ist leer. Bitte setze zuerst einige Schlagzeugnoten!");
            return;
        }
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(jsonOutput, null, 4));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        
        const sanitizedName = jsonOutput.song_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        downloadAnchor.setAttribute("download", `${sanitizedName}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
}

// Bridge to Player
if (editorLoadPlayerBtn) {
    editorLoadPlayerBtn.addEventListener('click', () => {
        const jsonOutput = gatherSequencerNotes();
        if (jsonOutput.timestamps.length === 0) {
            alert("Das Raster ist leer. Bitte setze zuerst einige Schlagzeugnoten!");
            return;
        }
        
        // Copy notes to visualizer state
        loadSongData(jsonOutput);
        
        // Update player statuses to represent synth simulation mode
        statusJson.innerHTML = `<span class="badge badge-success">GELADEN</span> Noten: ${jsonOutput.song_name} (Editor)`;
        statusAudio.innerHTML = `<span class="badge badge-success">SYNTH MODE</span> Audio: Synthesizer-Simulation`;
        checkReadyState();
        
        // Stop sequencer playback
        stopSequencer();
        
        // Swap tab back to Visualizer
        const playerTabBtn = document.querySelector('.sub-tab-btn[data-tab="player"]');
        if (playerTabBtn) {
            playerTabBtn.click();
        }
        
        alert(`Song "${jsonOutput.song_name}" wurde erfolgreich in den Player geladen!`);
    });
}

// Pre-populate with a basic rock loop demo
function prefillSequencerDemo() {
    const totalCols = 4 * 4 * 4; // 4 bars, 4 beats/bar, 4 subdivisions
    for (let col = 0; col < totalCols; col++) {
        const beatNum = Math.floor(col / 4);
        const sub = col % 4;
        
        // Hi-Hat closed on eighth notes (every 2 subdivisions)
        if (sub === 0 || sub === 2) {
            sequencerGrid[`hi-hat-closed_${col}`] = true;
        }
        
        // Kick on 1 and 3 beats
        if ((beatNum % 4 === 0 || beatNum % 4 === 2) && sub === 0) {
            sequencerGrid[`kick_${col}`] = true;
        }
        
        // Snare on 2 and 4 beats
        if ((beatNum % 4 === 1 || beatNum % 4 === 3) && sub === 0) {
            sequencerGrid[`snare_${col}`] = true;
        }
        
        // Tom fills at the end of phrase
        if (col === 60 || col === 61) {
            sequencerGrid[`tom1_${col}`] = true;
        }
        if (col === 62 || col === 63) {
            sequencerGrid[`floor-tom_${col}`] = true;
        }
    }
}

// Initialize sequencer grid
prefillSequencerDemo();
rebuildSequencerGrid();

// Beat Generator (Presets) Logic
const presetSelect = document.getElementById('editor-preset-select');
const presetGenerateBtn = document.getElementById('editor-preset-generate-btn');

if (presetGenerateBtn && presetSelect) {
    presetGenerateBtn.addEventListener('click', () => {
        const selectedPreset = presetSelect.value;
        if (selectedPreset === 'none') {
            alert("Bitte wähle zuerst einen Rhythmus aus!");
            return;
        }
        
        const beatsPerBar = parseInt(editorBeats.value);
        const bars = parseInt(editorBars.value);
        const resolutionVal = parseInt(editorResolution.value);
        const subdivisions = resolutionVal === 4 ? 1 : (resolutionVal === 8 ? 2 : 4);
        const totalCols = bars * beatsPerBar * subdivisions;
        
        // Clear grid
        sequencerGrid = {};
        
        if (selectedPreset === 'rock') {
            const hhStep = subdivisions === 4 ? 2 : 1; // eighth notes
            const kickBeats = [0, 2];
            const snareBeats = [1, 3];
            
            for (let col = 0; col < totalCols; col++) {
                const beatNum = Math.floor(col / subdivisions);
                const sub = col % subdivisions;
                const beatInBar = beatNum % beatsPerBar;
                
                // Hi-hat closed
                if (col % hhStep === 0) {
                    sequencerGrid[`hi-hat-closed_${col}`] = true;
                }
                // Kick
                if (kickBeats.includes(beatInBar) && sub === 0) {
                    sequencerGrid[`kick_${col}`] = true;
                }
                // Snare
                if (snareBeats.includes(beatInBar) && sub === 0) {
                    sequencerGrid[`snare_${col}`] = true;
                }
            }
        } else if (selectedPreset === 'dance') {
            // Four on the Floor dance beat (Kick on every beat, Snare on 2 & 4, Hi-hat off-beats)
            const hhStep = subdivisions === 4 ? 2 : 1; // eighth notes
            const snareBeats = [1, 3];
            
            for (let col = 0; col < totalCols; col++) {
                const beatNum = Math.floor(col / subdivisions);
                const sub = col % subdivisions;
                const beatInBar = beatNum % beatsPerBar;
                
                // Hi-hat closed
                if (col % hhStep === 0) {
                    sequencerGrid[`hi-hat-closed_${col}`] = true;
                }
                // Kick on every beat
                if (sub === 0) {
                    sequencerGrid[`kick_${col}`] = true;
                }
                // Snare on 2 and 4
                if (snareBeats.includes(beatInBar) && sub === 0) {
                    sequencerGrid[`snare_${col}`] = true;
                }
            }
        } else if (selectedPreset === 'stressed') {
            // Stressed Out custom beat (BPM 85, Kick on 1 and 3, Snare on 2 and 4, Hi-hat and off-beat)
            editorBpm.value = 85;
            editorBpmDisplay.textContent = '85';
            
            const hhStep = subdivisions === 4 ? 2 : 1;
            const kickBeats = [0, 2];
            const snareBeats = [1, 3];
            
            for (let col = 0; col < totalCols; col++) {
                const beatNum = Math.floor(col / subdivisions);
                const sub = col % subdivisions;
                const beatInBar = beatNum % beatsPerBar;
                
                // Hi-hat
                if (col % hhStep === 0) {
                    sequencerGrid[`hi-hat-closed_${col}`] = true;
                }
                // Kick
                if (kickBeats.includes(beatInBar) && sub === 0) {
                    sequencerGrid[`kick_${col}`] = true;
                }
                // Snare
                if (snareBeats.includes(beatInBar) && sub === 0) {
                    sequencerGrid[`snare_${col}`] = true;
                }
            }
        } else if (selectedPreset === 'tom_fill') {
            // Tom-tom fill rhythm in the last bar
            const hhStep = subdivisions === 4 ? 2 : 1;
            for (let col = 0; col < totalCols; col++) {
                const beatNum = Math.floor(col / subdivisions);
                const sub = col % subdivisions;
                const currentBar = Math.floor(beatNum / beatsPerBar) + 1;
                
                if (currentBar < bars || (currentBar === bars && beatNum % beatsPerBar < 2)) {
                    // Rock beat
                    if (col % hhStep === 0) sequencerGrid[`hi-hat-closed_${col}`] = true;
                    if ((beatNum % beatsPerBar === 0 || beatNum % beatsPerBar === 2) && sub === 0) sequencerGrid[`kick_${col}`] = true;
                    if ((beatNum % beatsPerBar === 1 || beatNum % beatsPerBar === 3) && sub === 0) sequencerGrid[`snare_${col}`] = true;
                } else {
                    // Tom-Tom Fill-in
                    if (subdivisions === 4) {
                        if (sub === 0 || sub === 1) sequencerGrid[`tom1_${col}`] = true;
                        if (sub === 2 || sub === 3) sequencerGrid[`tom2_${col}`] = true;
                    } else {
                        if (col % 2 === 0) sequencerGrid[`tom1_${col}`] = true;
                        else sequencerGrid[`floor-tom_${col}`] = true;
                    }
                }
            }
        }
        
        rebuildSequencerGrid();
    });
}


/* ==========================================================================
   FEEDBACK PAGE INTERACTIVITY
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const starsContainer = document.getElementById('fb-stars');
    const ratingInput = document.getElementById('fb-rating');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackSuccessMsg = document.getElementById('fb-success-msg');
    const feedbackResetBtn = document.getElementById('fb-reset-btn');
    const feedbackRecentList = document.getElementById('fb-recent-list');
    
    let selectedRating = 0;
    
    // Handle Stars Interaction
    if (starsContainer) {
        const stars = starsContainer.querySelectorAll('.star');
        
        stars.forEach(star => {
            star.addEventListener('mouseover', () => {
                const rating = parseInt(star.getAttribute('data-rating'));
                highlightStars(rating);
            });
            
            star.addEventListener('mouseout', () => {
                highlightStars(selectedRating);
            });
            
            star.addEventListener('click', () => {
                selectedRating = parseInt(star.getAttribute('data-rating'));
                ratingInput.value = selectedRating;
                highlightStars(selectedRating);
            });
        });
    }
    
    function highlightStars(rating) {
        if (!starsContainer) return;
        const stars = starsContainer.querySelectorAll('.star');
        stars.forEach(star => {
            const starRating = parseInt(star.getAttribute('data-rating'));
            if (starRating <= rating) {
                star.style.color = '#fbbf24'; // Golden glow
                star.style.textShadow = '0 0 10px rgba(251, 191, 38, 0.4)';
            } else {
                star.style.color = 'rgba(255, 255, 255, 0.15)';
                star.style.textShadow = 'none';
            }
        });
    }
    
    // Handle Submit
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (selectedRating === 0) {
                alert("Bitte wähle eine Sterne-Bewertung aus!");
                return;
            }
            
            const name = document.getElementById('fb-name').value;
            const email = document.getElementById('fb-email').value;
            const category = document.getElementById('fb-category').value;
            const message = document.getElementById('fb-message').value;
            
            const feedbackData = {
                name,
                email,
                category,
                rating: selectedRating,
                message,
                timestamp: new Date().toISOString()
            };
            
            // Save to LocalStorage (unchanged)
            let list = JSON.parse(localStorage.getItem('htb_feedbacks') || '[]');
            list.unshift(feedbackData); // Add to beginning
            localStorage.setItem('htb_feedbacks', JSON.stringify(list));

            // Save to server (Netlify Function → Blob Storage)
            const submitBtn = document.getElementById('fb-submit-btn');
            if (submitBtn) submitBtn.disabled = true;

            fetch('/api/save-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(feedbackData)
            })
            .catch(() => {
                // Server save failed silently — data is still in localStorage
                console.warn('Feedback konnte nicht auf dem Server gespeichert werden.');
            })
            .finally(() => {
                if (submitBtn) submitBtn.disabled = false;
            });

            // Render list
            renderRecentFeedbacks();
            
            // Show Success
            feedbackForm.classList.add('hidden');
            feedbackSuccessMsg.classList.remove('hidden');
        });
    }
    
    // Reset form
    if (feedbackResetBtn) {
        feedbackResetBtn.addEventListener('click', () => {
            feedbackForm.reset();
            selectedRating = 0;
            ratingInput.value = 0;
            highlightStars(0);
            feedbackSuccessMsg.classList.add('hidden');
            feedbackForm.classList.remove('hidden');
        });
    }
    
    // Category string formatting helper
    function getCategoryName(cat) {
        switch (cat) {
            case 'general': return 'Allgemein';
            case 'hardware': return 'Hardware';
            case 'player': return 'Player/Editor';
            case 'bug': return 'Bug-Report';
            case 'feature': return 'Feature-Wunsch';
            default: return cat;
        }
    }
    
    // Render list
    function renderRecentFeedbacks() {
        if (!feedbackRecentList) return;
        
        const feedbacks = JSON.parse(localStorage.getItem('htb_feedbacks') || '[]');
        
        if (feedbacks.length === 0) {
            feedbackRecentList.innerHTML = '<span class="empty-list-msg" style="color: var(--text-secondary); opacity: 0.6; font-style: italic;">Noch keine Rückmeldungen vorhanden.</span>';
            return;
        }
        
        let html = '';
        feedbacks.forEach(fb => {
            const date = new Date(fb.timestamp).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += `<span style="color: ${i <= fb.rating ? '#fbbf24' : 'rgba(255,255,255,0.15)'};">★</span>`;
            }
            
            html += `
                <div class="feedback-item-card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--surface-border); padding: 1.2rem; border-radius: 12px; border-left: 4px solid var(--accent-purple); margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                        <strong style="color: var(--text-primary); font-size: 0.95rem;">${fb.name}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.8;">${date}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; flex-wrap: wrap; gap: 0.5rem;">
                        <span style="font-size: 0.8rem; padding: 0.25rem 0.5rem; background: rgba(99, 102, 241, 0.1); color: var(--accent-purple); border-radius: 6px; border: 1px solid rgba(99, 102, 241, 0.2); font-weight: 600;">${getCategoryName(fb.category)}</span>
                        <div style="font-size: 1.1rem; line-height: 1;">${starsHtml}</div>
                    </div>
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.4; color: var(--text-secondary); word-break: break-word;">${fb.message}</p>
                </div>
            `;
        });
        
        feedbackRecentList.innerHTML = html;
    }
    
    // Initial rendering
    renderRecentFeedbacks();
});
