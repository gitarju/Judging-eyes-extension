(function () {
    const STATE = {
        enabled: true,
        mood: 'judgmental',
        model: 'default',
        scale: 1,
        isVishu: false,
        vishuActive: false,
        vishuEndTime: 0,
        mouseX: window.innerWidth / 2,
        mouseY: window.innerHeight / 2,
        eyes: [], // { container, pupil, rect }
        container: null,
        scaleWrapper: null,
        startTime: window.performance.now(),
        lastActivityTime: window.performance.now(),
        isBlinking: false,
        pokeCount: 0,
        tempExpressionTimeout: null,
        blinkTimeout: null,
        lastScrollY: window.scrollY,
        fatigueLevel: 'alert',
        isDragging: false,
        hasDragged: false,
        dragOffsetX: 0,
        dragOffsetY: 0,
        dragStartX: 0,
        dragStartY: 0,
        isManuallyPositioned: false,
        weatherEnabled: false,
        weatherData: null,
        weatherStartTime: 0
    };

    const CONFIG = {
        eyeRadius: 22,
        pupilRadius: 8,
        blinkRateNormal: [3000, 6000],
        blinkRateSleepy: [1500, 3000]
    };

    function init() {
        chrome.storage.local.get(['eyesEnabled', 'eyesMood', 'eyesModel', 'eyesScale', 'eyesVishu'], (res) => {
            if (res.eyesEnabled !== undefined) STATE.enabled = res.eyesEnabled;
            if (res.eyesMood !== undefined) STATE.mood = res.eyesMood;
            if (res.eyesModel !== undefined) STATE.model = res.eyesModel;
            if (res.eyesScale !== undefined) STATE.scale = res.eyesScale;
            if (res.eyesVishu !== undefined) STATE.isVishu = res.eyesVishu;
            if (res.eyesWeatherEnabled !== undefined) STATE.weatherEnabled = res.eyesWeatherEnabled;
            if (res.weatherData !== undefined) STATE.weatherData = res.weatherData;

            if (STATE.enabled) {
                createEyes();
                applyMood();
                applyModel();
                applyScale();
                applyWeather();
                startTracking();
                scheduleBlink();
                scheduleMove();
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.eyesEnabled) {
                STATE.enabled = changes.eyesEnabled.newValue;
                if (STATE.enabled && !STATE.container) {
                    createEyes();
                    startTracking();
                    scheduleBlink();
                    scheduleMove();
                } else if (!STATE.enabled && STATE.container) {
                    removeEyes();
                }
            }
            if (changes.eyesMood) {
                STATE.mood = changes.eyesMood.newValue;
                applyMood();
            }
            if (changes.eyesModel) {
                STATE.model = changes.eyesModel.newValue;
                applyModel();
            }
            if (changes.eyesScale) {
                STATE.scale = changes.eyesScale.newValue;
                applyScale();
                updateEyeRects(); // Geometry changed
            }
            if (changes.eyesVishu) {
                STATE.isVishu = changes.eyesVishu.newValue;
            }
            if (changes.eyesWeatherEnabled) {
                STATE.weatherEnabled = changes.eyesWeatherEnabled.newValue;
                applyWeather();
            }
            if (changes.weatherData) {
                STATE.weatherData = changes.weatherData.newValue;
                STATE.weatherStartTime = window.performance.now(); // Reset exposure time on weather change
                applyWeather();
            }
        });

        document.addEventListener('mousemove', (e) => {
            STATE.mouseX = e.clientX;
            STATE.mouseY = e.clientY;
            markActivity();

            if (STATE.isDragging) {
                if (Math.abs(e.clientX - STATE.dragStartX) > 5 || Math.abs(e.clientY - STATE.dragStartY) > 5) {
                    STATE.hasDragged = true;
                }
                let newLeft = e.clientX - STATE.dragOffsetX;
                let newTop = e.clientY - STATE.dragOffsetY;

                const padding = 20;
                newLeft = Math.max(padding, Math.min(newLeft, window.innerWidth - padding));
                newTop = Math.max(padding, Math.min(newTop, window.innerHeight - padding));

                STATE.container.style.left = `${newLeft}px`;
                STATE.container.style.top = `${newTop}px`;
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (STATE.isDragging) {
                STATE.isDragging = false;
                STATE.container.classList.remove('je-dragging');
                clearTimeout(STATE.tempExpressionTimeout);

                if (STATE.hasDragged) {
                    triggerAnimation('je-anim-drop', 400);
                    setTempExpression('annoyed', 1500); // Reaction after being dropped
                    STATE.isManuallyPositioned = true; // Stay fixed until poked
                }
                updateEyeRects();
            }
        });

        document.addEventListener('scroll', () => {
            markActivity();
            checkScrollSpeed();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // User switched tabs
            } else {
                markActivity();
                setTempExpression('suspicious', 2000); // suspicious glance when returning
            }
        });

        setInterval(() => {
            if (JE_FEATURES.enableFatigue) evaluateFatigue();
            evaluateWeatherExposure();
        }, 2000);
    }

    function createEyes() {
        if (document.getElementById('je-eyes-container')) return;

        STATE.container = document.createElement('div');
        STATE.container.id = 'je-eyes-container';

        STATE.scaleWrapper = document.createElement('div');
        STATE.scaleWrapper.id = 'je-eyes-scale-wrapper';
        STATE.container.appendChild(STATE.scaleWrapper);

        // Pick random position near a corner but not completely off-screen
        const padding = 100;
        const cornerX = Math.random() > 0.5 ? padding : window.innerWidth - padding;
        const cornerY = Math.random() > 0.5 ? padding : window.innerHeight - padding;
        STATE.container.style.left = `${cornerX}px`;
        STATE.container.style.top = `${cornerY}px`;

        for (let i = 0; i < 2; i++) {
            const eye = document.createElement('div');
            eye.className = 'je-eye';

            const lidTop = document.createElement('div');
            lidTop.className = 'je-lid-top';
            const lidBottom = document.createElement('div');
            lidBottom.className = 'je-lid-bottom';

            const pupil = document.createElement('div');
            pupil.className = 'je-pupil';

            eye.appendChild(lidTop);
            eye.appendChild(lidBottom);
            eye.appendChild(pupil);

            // Drag handler
            eye.addEventListener('mousedown', (e) => {
                if (!JE_FEATURES.enableDragAndDrop) return;
                if (e.button !== 0) return; // Only left click
                e.preventDefault();
                STATE.isDragging = true;
                STATE.hasDragged = false;
                STATE.dragStartX = e.clientX;
                STATE.dragStartY = e.clientY;

                const currentLeft = parseFloat(STATE.container.style.left) || e.clientX;
                const currentTop = parseFloat(STATE.container.style.top) || e.clientY;
                STATE.dragOffsetX = e.clientX - currentLeft;
                STATE.dragOffsetY = e.clientY - currentTop;

                STATE.container.classList.add('je-dragging');
                setTempExpression('surprised', 99999); // Hold surprised expression while dragging
            });

            // Poke handler
            eye.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!JE_FEATURES.enablePoking) return;
                if (STATE.hasDragged) return; // Ignore if this was a drag release
                handlePoke();
            });

            STATE.scaleWrapper.appendChild(eye);
            STATE.eyes.push({ el: eye, pupil: pupil });
        }

        document.body.appendChild(STATE.container);
        updateEyeRects();
        window.addEventListener('resize', handleResize);
    }

    function removeEyes() {
        if (STATE.container) {
            STATE.container.remove();
            STATE.container = null;
            STATE.scaleWrapper = null;
            STATE.eyes = [];
            window.removeEventListener('resize', handleResize);
        }
    }

    function handleResize() {
        clampPosition();
        updateEyeRects();
    }

    function clampPosition() {
        if (!STATE.container) return;

        let currentLeft = parseFloat(STATE.container.style.left);
        let currentTop = parseFloat(STATE.container.style.top);

        if (isNaN(currentLeft) || isNaN(currentTop)) return;

        const padding = 40;
        const maxLeft = Math.max(padding, window.innerWidth - padding);
        const maxTop = Math.max(padding, window.innerHeight - padding);

        let newLeft = Math.max(padding, Math.min(currentLeft, maxLeft));
        let newTop = Math.max(padding, Math.min(currentTop, maxTop));

        if (newLeft !== currentLeft || newTop !== currentTop) {
            // Instant move back into bounds
            STATE.container.classList.add('je-dragging');
            STATE.container.style.left = `${newLeft}px`;
            STATE.container.style.top = `${newTop}px`;

            setTimeout(() => {
                if (STATE.container && !STATE.isDragging) {
                    STATE.container.classList.remove('je-dragging');
                }
            }, 50);
        }
    }

    function updateEyeRects() {
        STATE.eyes.forEach(eye => {
            eye.rect = eye.el.getBoundingClientRect();
        });
    }

    function applyMood() {
        if (!STATE.container) return;
        STATE.container.classList.remove('je-mood-chill', 'je-mood-judgmental', 'je-mood-sleepy');
        STATE.container.classList.add(`je-mood-${STATE.mood}`);
    }

    function applyModel() {
        if (!STATE.container) return;
        STATE.container.classList.remove('je-model-default', 'je-model-anime', 'je-model-cartoon', 'je-model-drunken', 'je-model-psychopathic');
        STATE.container.classList.add(`je-model-${STATE.model}`);
    }

    function applyScale() {
        if (!STATE.scaleWrapper) return;
        STATE.scaleWrapper.style.transform = `scale(${STATE.scale})`;
    }

    function applyWeather() {
        if (!JE_FEATURES.enableWeather || !STATE.container) return;

        // Remove existing weather classes
        STATE.container.classList.forEach(c => {
            if (c.startsWith('je-weather-')) STATE.container.classList.remove(c);
        });

        // Remove decorative elements
        const oldSweat = STATE.container.querySelector('.je-sweat-drop');
        if (oldSweat) oldSweat.remove();

        const oldRain = STATE.container.querySelectorAll('.je-rain-drop');
        oldRain.forEach(drop => drop.remove());

        if (!STATE.weatherEnabled || !STATE.weatherData) return;

        const type = STATE.weatherData.type;
        if (!type || type === 'clear' || type === 'cloudy') return;

        STATE.container.classList.add(`je-weather-${type}`);

        if (type === 'hot') {
            const sweat = document.createElement('div');
            sweat.className = 'je-sweat-drop';
            STATE.container.appendChild(sweat);
            // Record start time to trigger sunburn later
            if (!STATE.weatherStartTime) STATE.weatherStartTime = window.performance.now();
        } else if (type === 'rain') {
            for (let i = 0; i < 3; i++) {
                const drop = document.createElement('div');
                drop.className = 'je-rain-drop';
                drop.style.left = `${20 + Math.random() * 60}%`;
                drop.style.animationDelay = `${Math.random() * 0.5}s`;
                STATE.container.appendChild(drop);
            }
        } else {
            STATE.weatherStartTime = 0;
        }
    }

    function evaluateWeatherExposure() {
        if (!JE_FEATURES.enableWeather || !STATE.container || !STATE.weatherEnabled || !STATE.weatherData) return;

        if (STATE.weatherData.type === 'hot' && STATE.weatherStartTime) {
            const now = window.performance.now();
            const exposureDuration = (now - STATE.weatherStartTime) / 1000; // in seconds

            // If exposed to hot weather for more than 30 seconds, transition to sunburned
            if (exposureDuration > 30 && !STATE.container.classList.contains('je-weather-sunburned')) {
                STATE.container.classList.add('je-weather-sunburned');
            }
        }
    }

    function startTracking() {
        let lastTimestamp = 0;
        function render(timestamp) {
            if (!STATE.enabled || !STATE.container) return;
            if (STATE.container.classList.contains('je-hidden')) {
                requestAnimationFrame(render);
                return;
            }

            // Re-calculate bounds if scroll happens (although fixed position mitigates this largely)
            updateEyeRects();

            // Lerp pupils
            STATE.eyes.forEach(eye => {
                if (!eye.rect) return;

                // Eye center
                const cx = eye.rect.left + eye.rect.width / 2;
                const cy = eye.rect.top + eye.rect.height / 2;

                // Angle to mouse
                const dx = STATE.mouseX - cx;
                const dy = STATE.mouseY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);

                // Constrain distance within eye radius accounting for pupil radius
                const maxDist = CONFIG.eyeRadius - CONFIG.pupilRadius - 4; // 4px padding

                // Easing Factor based on fatigue/mood
                let ease = 0.2;
                if (STATE.fatigueLevel === 'sleepy' || STATE.fatigueLevel === 'verysleepy') ease = 0.05; // sluggish
                if (STATE.mood === 'judgmental') ease = 0.3; // sharp

                // Scale target dist to match local scale space
                const targetDist = Math.min((dist / STATE.scale) * 0.5, maxDist);
                const targetX = Math.cos(angle) * targetDist;
                const targetY = Math.sin(angle) * targetDist;

                // Current translate
                const currentTransform = window.getComputedStyle(eye.pupil).transform;
                let curX = -8, curY = -8; // default to center (translate(-50%, -50%))
                if (eye.pupil.dataset.curX) {
                    curX = parseFloat(eye.pupil.dataset.curX);
                    curY = parseFloat(eye.pupil.dataset.curY);
                }

                // Apply Lerp
                const nx = curX + (targetX - curX) * ease;
                const ny = curY + (targetY - curY) * ease;

                eye.pupil.dataset.curX = nx;
                eye.pupil.dataset.curY = ny;

                // We combine basic centering (-50%, -50%) with movement
                eye.pupil.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
            });

            requestAnimationFrame(render);
        }
        requestAnimationFrame(render);
    }

    function markActivity() {
        STATE.lastActivityTime = window.performance.now();
        // Wake up a bit if asleep
        if (STATE.fatigueLevel === 'asleep' || STATE.fatigueLevel === 'verysleepy') {
            setTempExpression('surprised', 1000);
        }
    }

    // Fatigue Logic
    function evaluateFatigue() {
        if (!STATE.container) return;

        const now = window.performance.now();
        const activeDuration = (now - STATE.startTime) / 1000 / 60; // in minutes
        const idleDuration = (now - STATE.lastActivityTime) / 1000; // in seconds

        let newFatigue = 'alert';
        let effectiveDuration = activeDuration;

        // Idle speeds up sleep
        if (idleDuration > 30) effectiveDuration += 5;
        if (idleDuration > 120) effectiveDuration += 15;

        if (STATE.mood === 'sleepy') effectiveDuration *= 2; // Sleepy mood doubles fatigue rate

        if (effectiveDuration > 20) newFatigue = 'asleep';
        else if (effectiveDuration > 15) newFatigue = 'verysleepy';
        else if (effectiveDuration > 7) newFatigue = 'sleepy';
        else if (effectiveDuration > 3) newFatigue = 'drooping';

        if (STATE.fatigueLevel !== newFatigue) {
            STATE.container.classList.remove(`je-expression-${STATE.fatigueLevel}`);
            STATE.container.classList.add(`je-expression-${newFatigue}`);
            STATE.fatigueLevel = newFatigue;
        }
    }

    function moveRandomly(force = false) {
        if (!JE_FEATURES.enableRandomMove && !force) return;
        if (!STATE.container || STATE.isDragging) return;
        if (STATE.isManuallyPositioned && !force) return;

        const padding = 80;
        const targetX = padding + Math.random() * (window.innerWidth - padding * 2);
        const targetY = padding + Math.random() * (window.innerHeight - padding * 2);
        STATE.container.style.left = `${targetX}px`;
        STATE.container.style.top = `${targetY}px`;
        setTempExpression('surprised', 600); // Wake up slightly when changing position
    }

    function scheduleMove() {
        if (!STATE.enabled) return;
        const delay = 10000 + Math.random() * 20000; // Move every 10-30 seconds
        setTimeout(() => {
            moveRandomly();
            scheduleMove();
        }, delay);
    }

    // Blinking
    function scheduleBlink() {
        if (!STATE.enabled) return;

        let rate = STATE.fatigueLevel.includes('sleepy') || STATE.mood === 'sleepy'
            ? CONFIG.blinkRateSleepy
            : CONFIG.blinkRateNormal;

        const delay = Math.random() * (rate[1] - rate[0]) + rate[0];

        STATE.blinkTimeout = setTimeout(() => {
            doBlink();
            scheduleBlink();
        }, delay);
    }

    function doBlink() {
        if (!STATE.container || STATE.isBlinking) return;
        STATE.isBlinking = true;
        STATE.container.classList.add('je-blink');
        setTimeout(() => {
            STATE.container.classList.remove('je-blink');
            STATE.isBlinking = false;
        }, 150);

        // Occasional double blink
        if (Math.random() > 0.8) {
            setTimeout(() => {
                STATE.container.classList.add('je-blink');
                setTimeout(() => {
                    STATE.container.classList.remove('je-blink');
                }, 150);
            }, 300);
        }
    }

    // Interaction & Temp Expressions
    function setTempExpression(expr, duration) {
        if (!STATE.container) return;
        clearTimeout(STATE.tempExpressionTimeout);

        // Remove old temp classes
        STATE.container.classList.forEach(c => {
            if (c.startsWith('je-temp-')) STATE.container.classList.remove(c);
        });

        STATE.container.classList.add(`je-temp-${expr}`);
        STATE.tempExpressionTimeout = setTimeout(() => {
            STATE.container.classList.remove(`je-temp-${expr}`);
        }, duration);
    }

    function triggerAnimation(animName, duration) {
        if (!STATE.container) return;
        STATE.container.classList.remove(animName);
        void STATE.container.offsetWidth; // trigger reflow
        STATE.container.classList.add(animName);
        setTimeout(() => {
            if (STATE.container) STATE.container.classList.remove(animName);
        }, duration);
    }

    let pokeResetTimeout;
    function handlePoke() {
        STATE.pokeCount++;
        clearTimeout(pokeResetTimeout);
        pokeResetTimeout = setTimeout(() => { STATE.pokeCount = 0; }, 4000); // Reset continuous pokes after 4s

        triggerVishuBurst(); // Poke the eyes triggers crackers too if mode is ON
        markActivity();
        doBlink();

        if (STATE.pokeCount >= 4 && JE_FEATURES.enableEnrageMode) {
            // Really angry! Meme expression for a split second, then hide
            STATE.pokeCount = 0;
            STATE.container.classList.remove('je-anim-recoil'); // Cancel basic recoil
            setTempExpression('enraged', 800);

            setTimeout(() => {
                if (STATE.container) {
                    STATE.container.classList.add('je-hidden');
                }
            }, 800);

            setTimeout(() => {
                if (STATE.container) {
                    STATE.container.classList.remove('je-hidden');
                    STATE.isManuallyPositioned = false;
                    moveRandomly(true);
                    setTempExpression('surprised', 1000);
                }
            }, 10800);
        } else {
            triggerAnimation('je-anim-recoil', 400);
            // Runs away when poked
            setTempExpression('annoyed', 800);
            STATE.isManuallyPositioned = false;

            setTimeout(() => {
                if (STATE.container && !STATE.container.classList.contains('je-hidden')) {
                    moveRandomly(true);
                }
            }, 300);
        }
    }

    let scrollTimeout;
    function checkScrollSpeed() {
        const currentY = window.scrollY;
        const delta = Math.abs(currentY - STATE.lastScrollY);
        STATE.lastScrollY = currentY;

        if (delta > 200) { // Fast scroll
            triggerAnimation('je-anim-dizzy', 600);
            setTempExpression('surprised', 1000);
        }

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => { }, 100);
    }

    function triggerVishuBurst() {
        if (JE_FEATURES.enableVishuSpecial && STATE.isVishu) {
            STATE.vishuEndTime = window.performance.now() + 6000;
            if (!STATE.vishuActive) {
                STATE.vishuActive = true;
                startVishuBurst();
            }
        }
    }

    function startVishuBurst() {
        if (!JE_FEATURES.enableVishuSpecial || !STATE.enabled || !STATE.isVishu || !STATE.vishuActive) return;

        if (window.performance.now() > STATE.vishuEndTime) {
            STATE.vishuActive = false;
            return;
        }

        if (STATE.container && !STATE.container.classList.contains('je-hidden')) {
            // Spawn a tiny firecracker spark
            const cracker = document.createElement('div');
            cracker.className = 'je-cracker';

            // Random offset spread
            const rx = (Math.random() - 0.5) * 160;
            const ry = (Math.random() - 0.5) * 160;

            cracker.style.left = `calc(50% + ${rx}px)`;
            cracker.style.top = `calc(50% + ${ry}px)`;

            STATE.container.appendChild(cracker);

            setTimeout(() => {
                if (cracker && cracker.parentNode) cracker.remove();
            }, 500);
        }

        setTimeout(() => {
            startVishuBurst();
        }, Math.random() * 400 + 100); // Faster spawn for bursts (100-500ms)
    }

    init();
})();
