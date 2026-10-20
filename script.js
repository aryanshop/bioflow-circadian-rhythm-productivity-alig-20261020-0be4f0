document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chronotypeSelect = document.getElementById('chronotype');
    const wakeTimeInput = document.getElementById('wakeTime');
    const workloadSelect = document.getElementById('workload');
    const generateBtn = document.getElementById('generateBtn');
    
    const currentTimeDisplay = document.getElementById('currentTimeDisplay');
    const currentPhaseName = document.getElementById('currentPhaseName');
    const currentPhaseDesc = document.getElementById('currentPhaseDesc');
    const energyPercent = document.getElementById('energyPercent');
    const energyFill = document.getElementById('energyFill');
    
    const taskInput = document.getElementById('taskInput');
    const taskCognitive = document.getElementById('taskCognitive');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const taskList = document.getElementById('taskList');
    
    const canvas = document.getElementById('circadianCanvas');
    const ctx = canvas.getContext('2d');
    const timeScrubber = document.getElementById('timeScrubber');
    const scrubberTimeVal = document.getElementById('scrubberTimeVal');
    const breakdownGrid = document.getElementById('phaseBreakdownGrid');

    // State
    let state = {
        chronotype: 'bear',
        wakeMinutes: 425, // 07:05 default
        workload: 'intensive',
        tasks: [
            { id: 1, name: 'Strategic Architectural Review', cognitive: 'high', optimalMinutes: 0 },
            { id: 2, name: 'Team Sync & 1on1s', cognitive: 'medium', optimalMinutes: 0 },
            { id: 3, name: 'Inbox Zero & Weekly Admin', cognitive: 'low', optimalMinutes: 0 }
        ],
        selectedMinutes: 425
    };

    // Chronotype Offset Profiles (hours offset from wake time)
    const profiles = {
        lion: { peak1Start: 2, peak1End: 5, dipStart: 7, dipEnd: 9, peak2Start: 10, peak2End: 12, windDown: 14 },
        bear: { peak1Start: 3, peak1End: 6, dipStart: 8, dipEnd: 10, peak2Start: 11, peak2End: 14, windDown: 15 },
        wolf: { peak1Start: 5, peak1End: 8, dipStart: 9, dipEnd: 11, peak2Start: 12, peak2End: 17, windDown: 17 },
        dolphin: { peak1Start: 3, peak1End: 5, dipStart: 7, dipEnd: 11, peak2Start: 12, peak2End: 15, windDown: 15 }
    };

    // Helper: Convert 'HH:MM' to total minutes from midnight
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Helper: Convert minutes from midnight to 'HH:MM AM/PM'
    function minutesToTimeStr(totalMins) {
        let normalized = ((totalMins % 1440) + 1440) % 1440;
        let hours = Math.floor(normalized / 60);
        let minutes = Math.floor(normalized % 60);
        let ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        let minStr = minutes < 10 ? '0' + minutes : minutes;
        return `${hours}:${minStr} ${ampm}`;
    }

    // Calculate Energy Level at any minute of the day based on chronotype and wake time
    function getEnergyAtMinute(minute, wakeMins, chronoKey) {
        // Normalize minute relative to wake time
        let relMinute = minute - wakeMins;
        if (relMinute < 0) relMinute += 1440;

        const p = profiles[chronoKey];
        const wakeHour = wakeMins / 60;

        // Base sinusoidal circadian rhythm model
        // Sleep duration assumed ~8 hours (wake + 16 hours awake before deep winddown)
        let hoursAwake = relMinute / 60;
        
        if (hoursAwake > 16.5) {
            // Wind down / Sleep phase
            return 15;
        }

        // Calculate custom curve based on chronotype profile
        let energy = 50;
        
        // Morning rise
        if (hoursAwake >= 0 && hoursAwake < p.peak1Start) {
            energy = 40 + (hoursAwake / p.peak1Start) * 50;
        } 
        // First Peak
        else if (hoursAwake >= p.peak1Start && hoursAwake <= p.peak1End) {
            energy = 90 + Math.sin((hoursAwake - p.peak1Start) * Math.PI) * 10;
        }
        // Afternoon Dip
        else if (hoursAwake > p.peak1End && hoursAwake <= p.dipEnd) {
            let dipProgress = (hoursAwake - p.peak1End) / (p.dipEnd - p.peak1End);
            energy = 90 - Math.sin(dipProgress * Math.PI) * 45;
        }
        // Second Peak / Steady Work
        else if (hoursAwake > p.dipEnd && hoursAwake <= p.peak2End) {
            let recovery = (hoursAwake - p.dipEnd) / (p.peak2End - p.dipEnd);
            energy = 45 + recovery * 45;
        }
        // Evening Fade
        else {
            let fadeProgress = (hoursAwake - p.peak2End) / (16.5 - p.peak2End);
            energy = 90 - fadeProgress * 75;
        }

        return Math.max(10, Math.min(100, Math.round(energy)));
    }

    // Determine phase metadata for a given time
    function getPhaseInfo(energy, hoursAwake) {
        if (hoursAwake > 15.5) {
            return {
                name: 'Melatonin Surge & Wind Down',
                desc: 'Screen light exposure suppresses melatonin. Dim lights, avoid complex problem solving, and prepare for restorative sleep.',
                type: 'winddown',
                color: '#8b5cf6'
            };
        } else if (energy >= 75) {
            return {
                name: 'Peak Cognitive Window',
                desc: 'High alertness and working memory capacity. Ideal for complex coding, deep creative work, and difficult decision-making.',
                type: 'peak',
                color: '#10b981'
            };
        } else if (energy >= 45) {
            return {
                name: 'Steady State & Collaborative Flow',
                desc: 'Balanced alertness. Well-suited for collaborative meetings, communication, reviewing documents, and routine tasks.',
                type: 'steady',
                color: '#3b82f6'
            };
        } else {
            return {
                name: 'Circadian Slump (The Afternoon Dip)',
                desc: 'Natural alertness trough. Perfect for light stretching, hydration, a brief walk, or administrative low-focus chores.',
                type: 'dip',
                color: '#f59e0b'
            };
        }
    }

    // Render Timeline on Canvas
    function drawTimeline() {
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Draw background grid lines & hour markers
        ctx.lineWidth = 1;
        
        for (let m = 0; m < 1440; m += 120) { // every 2 hours
            let x = (m / 1440) * width;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height - 25);
            ctx.stroke();

            ctx.fillStyle = '#64748b';
            ctx.font = '11px sans-serif';
            ctx.fillText(minutesToTimeStr(m), x - 20, height - 8);
        }

        // Draw Energy Wave Curve
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#38bdf8';

        let points = [];
        for (let x = 0; x < width; x++) {
            let minute = Math.round((x / width) * 1440);
            let energy = getEnergyAtMinute(minute, state.wakeMinutes, state.chronotype);
            // Map energy 0-100 to canvas y (padding top/bottom 20px)
            let y = (height - 35) - (energy / 100) * (height - 50);
            points.push({x, y, energy});

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Gradient fill under curve
        ctx.lineTo(width, height - 25);
        ctx.lineTo(0, height - 25);
        ctx.closePath();
        
        let grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Draw Scrubber Indicator Line
        let scrubX = (state.selectedMinutes / 1440) * width;
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(scrubX, 0);
        ctx.lineTo(scrubX, height - 25);
        ctx.stroke();

        // Scrubber handle circle
        let scrubEnergy = getEnergyAtMinute(state.selectedMinutes, state.wakeMinutes, state.chronotype);
        let scrubY = (height - 35) - (scrubEnergy / 100) * (height - 50);
        
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(scrubX, scrubY, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // Update UI based on selected scrubber time
    function updateActiveState() {
        const m = state.selectedMinutes;
        scrubberTimeVal.textContent = minutesToTimeStr(m);
        currentTimeDisplay.textContent = minutesToTimeStr(m);

        let relMinute = m - state.wakeMinutes;
        if (relMinute < 0) relMinute += 1440;
        let hoursAwake = relMinute / 60;

        let energy = getEnergyAtMinute(m, state.wakeMinutes, state.chronotype);
        energyPercent.textContent = energy + '%';
        energyFill.style.width = energy + '%';

        let phase = getPhaseInfo(energy, hoursAwake);
        currentPhaseName.textContent = phase.name;
        currentPhaseDesc.textContent = phase.desc;

        drawTimeline();
    }

    // Match Tasks to Best Energy Windows
    function matchTaskWindows() {
        state.tasks.forEach(task => {
            // Find best minute in the day matching task cognitive demand
            let bestMin = state.wakeMinutes + 120; // default
            let bestScore = -1;

            for (let m = state.wakeMinutes; m < state.wakeMinutes + 960; m += 15) {
                let energy = getEnergyAtMinute(m, state.wakeMinutes, state.chronotype);
                let score = 0;
                if (task.cognitive === 'high') {
                    // High cognitive prefers peak energy (>80)
                    score = energy >= 80 ? energy : -Math.abs(80 - energy);
                } else if (task.cognitive === 'medium') {
                    // Medium cognitive prefers steady energy (50-75)
                    score = (energy >= 50 && energy <= 75) ? 50 : -Math.abs(60 - energy);
                } else {
                    // Low cognitive prefers dip or lower energy
                    score = energy <= 50 ? (50 - energy) : -energy;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMin = m;
                }
            }
            task.optimalMinutes = bestMin;
        });
    }

    // Render Task List
    function renderTasks() {
        taskList.innerHTML = '';
        if (state.tasks.length === 0) {
            taskList.innerHTML = '<li class="task-item" style="justify-content:center; color: var(--text-secondary);">No tasks added yet. Add one above!</li>';
            return;
        }

        state.tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            
            let badgeColorText = task.cognitive === 'high' ? 'High Focus' : task.cognitive === 'medium' ? 'Steady Work' : 'Low Admin';

            li.innerHTML = `
                <span>${escapeHTML(task.name)}</span>
                <div class="task-meta">
                    <span class="task-time-badge">${minutesToTimeStr(task.optimalMinutes)} (${badgeColorText})</span>
                    <button class="delete-btn" data-id="${task.id}">&times;</button>
                </div>
            `;
            taskList.appendChild(li);
        });
    }

    // Render Breakdown Cards
    function renderBreakdown() {
        breakdownGrid.innerHTML = '';
        
        let wake = state.wakeMinutes;
        let p = profiles[state.chronotype];

        const phases = [
            {
                time: `${minutesToTimeStr(wake + p.peak1Start * 60)} - ${minutesToTimeStr(wake + p.peak1End * 60)}`,
                name: 'Morning Peak',
                desc: 'First surge of cortisol and alertness. Excellent for tackling your single most important high-leverage objective.',
                type: 'peak'
            },
            {
                time: `${minutesToTimeStr(wake + p.dipStart * 60)} - ${minutesToTimeStr(wake + p.dipEnd * 60)}`,
                name: 'Afternoon Trough',
                desc: 'Core body temperature dip and alertness decline. Rest, hydrate, and pivot to email triage or administrative reviews.',
                type: 'dip'
            },
            {
                time: `${minutesToTimeStr(wake + p.peak2Start * 60)} - ${minutesToTimeStr(wake + p.peak2End * 60)}`,
                name: 'Secondary Window',
                desc: 'Second wind or steady collaborative state. Ideal for group synchronization, discussions, and creative problem solving.',
                type: 'steady'
            },
            {
                time: `${minutesToTimeStr(wake + 930)} onwards`,
                name: 'Melatonin Onset',
                desc: 'Core circadian deceleration. Disengage from stimulating environments to facilitate rapid sleep onset and deep recovery.',
                type: 'winddown'
            }
        ];

        phases.forEach(ph => {
            const card = document.createElement('div');
            card.className = `breakdown-card ${ph.type}`;
            card.innerHTML = `
                <span class="breakdown-time">${ph.time}</span>
                <div class="breakdown-title">${ph.name}</div>
                <div class="breakdown-desc">${ph.desc}</div>
            `;
            breakdownGrid.appendChild(card);
        });
    }

    // Sanitize user inputs
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    // Event Handlers
    generateBtn.addEventListener('click', () => {
        state.chronotype = chronotypeSelect.value;
        state.wakeMinutes = timeToMinutes(wakeTimeInput.value);
        state.workload = workloadSelect.value;
        state.selectedMinutes = state.wakeMinutes;
        timeScrubber.value = state.selectedMinutes;

        matchTaskWindows();
        renderTasks();
        renderBreakdown();
        updateActiveState();
    });

    timeScrubber.addEventListener('input', (e) => {
        state.selectedMinutes = parseInt(e.target.value, 10);
        updateActiveState();
    });

    addTaskBtn.addEventListener('click', () => {
        const val = taskInput.value.trim();
        if (!val) return;
        
        const newTask = {
            id: Date.now(),
            name: val,
            cognitive: taskCognitive.value,
            optimalMinutes: 0
        };
        
        state.tasks.push(newTask);
        taskInput.value = '';
        
        matchTaskWindows();
        renderTasks();
    });

    taskList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = parseInt(e.target.getAttribute('data-id'), 10);
            state.tasks = state.tasks.filter(t => t.id !== id);
            renderTasks();
        }
    });

    // Initial Load
    state.wakeMinutes = timeToMinutes(wakeTimeInput.value);
    state.selectedMinutes = state.wakeMinutes;
    timeScrubber.value = state.selectedMinutes;
    matchTaskWindows();
    renderTasks();
    renderBreakdown();
    updateActiveState();
});
