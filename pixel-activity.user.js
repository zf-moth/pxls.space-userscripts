// ==UserScript==
// @name         Pixel Activity
// @version      0.6
// @description  Shows shrinking circle where new pixel was placed
// @author       MotH
// @match        https://pxls.space/
// @icon         https://pxls.space/favicon.ico
// @downloadURL  https://github.com/zf-moth/pxls.space-userscripts/raw/refs/heads/master/pixel-activity.user.js
// @updateURL    https://github.com/zf-moth/pxls.space-userscripts/raw/refs/heads/master/pixel-activity.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    let ws = new WebSocket("wss://pxls.space/ws");
    const boardMover = document.getElementById('board-mover');
    const board = document.getElementById('board');
    const ui = document.getElementById('ui-top');

    // Check if canvas exists
    if (!boardMover || !board) {
        console.error("Canvas elements with IDs 'board-mover' or 'board' not found.");
        return;
    }

    let isDrawingEnabled = App.ls.get('pixelActivityEnabled') || false;

    // Create an overlay canvas for drawing circles
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.zIndex = '1000';
    overlayCanvas.width = board.width;
    overlayCanvas.height = board.height;
    overlayCanvas.style.pointerEvents = 'none'; // Don't block clicks
    overlayCanvas.style.display = isDrawingEnabled ? 'block' : 'none'; // Set initial visibility
    boardMover.appendChild(overlayCanvas);

    const ctx = overlayCanvas.getContext('2d');

    // Fetch palette information
    let palette = [];
    fetch('https://pxls.space/info')
        .then(response => response.json())
        .then(data => {
            palette = data.palette; // Store the palette array
        })
        .catch(error => console.error('Failed to fetch palette:', error));

    function showToggleNotification(message) {
        // Create the notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '-50px'; // Start off-screen
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.padding = '10px 20px';
        notification.style.zIndex = '2000';
        notification.style.transition = 'top 0.5s ease';
        notification.classList.add('bubble');

        // Add the notification to the document
        ui.appendChild(notification);

        // Slide the notification down
        setTimeout(() => {
            notification.style.top = '10px'; // Slide into view
        }, 10);

        // Slide the notification back up and remove it
        setTimeout(() => {
            notification.style.top = '-50px'; // Slide out of view
            setTimeout(() => {
                notification.remove(); // Remove the element from the DOM
            }, 500); // Wait for the slide-out animation to finish
        }, 2000); // Keep the notification visible for 3 seconds
    }

    // Listen for the "Z" key to toggle the drawing
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'z') {
            isDrawingEnabled = !isDrawingEnabled;
            App.ls.set('pixelActivityEnabled', isDrawingEnabled); // Save the state
            overlayCanvas.style.display = isDrawingEnabled ? 'block' : 'none'; // Show or hide the overlay
            if (!isDrawingEnabled) {
                ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); // Clear the overlay
            }

            // Update the checkbox in the settings panel
            const enableCheckbox = document.getElementById('setting-pixel-activity-enable');
            if (enableCheckbox) {
                enableCheckbox.checked = isDrawingEnabled;
            }

            const message = `Pixel activity is ${isDrawingEnabled ? 'enabled' : 'disabled'}`;
            showToggleNotification(message);
        }
    });

    // Wait for the board to load and resize
    const waitForBoardResize = new Promise((resolve) => {
        if (board.width > 100 && board.height > 100) {
            resolve();
        } else {
            const observer = new MutationObserver(() => {
                if (board.width > 100 && board.height > 100) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(board, { attributes: true, attributeFilter: ['width', 'height'] });
        }
    });

    waitForBoardResize.then(() => {
        overlayCanvas.width = board.width;
        overlayCanvas.height = board.height;
        addKeybindDescription();
        addCustomSettings();

        // Store active circles
        const circles = [];

        function drawCircles() {
            if (!isDrawingEnabled) {
                requestAnimationFrame(drawCircles);
                return;
            }

            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            const opacity = App.ls.get('pixelActivityOpacity') || 0.5; // Get the saved opacity value

            const now = Date.now();
            for (let i = circles.length - 1; i >= 0; i--) {
                const circle = circles[i];
                const elapsed = now - circle.startTime;

                if (elapsed > 1000) {
                    circles.splice(i, 1); // Remove expired circle
                    continue;
                }

                const progress = elapsed / 1000;
                const currentRadius = circle.startRadius * (1 - progress);

                ctx.beginPath();
                ctx.arc(circle.x + 0.5, circle.y + 0.5, currentRadius, 0, 2 * Math.PI);
                ctx.fillStyle = circle.color;
                ctx.globalAlpha = opacity * (1 - progress); // Apply fade-out effect
                ctx.fill();
            }

            requestAnimationFrame(drawCircles);
        }

        drawCircles();

        ws.onmessage = (event) => {
            if (!isDrawingEnabled) return;

            const data = JSON.parse(event.data);
            if (data.type == "pixel") {
                const x = data.pixels[0].x;
                const y = data.pixels[0].y;
                const colorIndex = data.pixels[0].color; // Get the color index
                const urlParams = new URLSearchParams(window.location.hash);
                const scale = 200 / urlParams.get('scale');

                let color;
                if (App.ls.get('pixelActivityColorMode') === 'pixel') {
                    // Use the color from the palette
                    if (palette[colorIndex]) {
                        color = `#${palette[colorIndex].value}`;
                    }
                } else if (App.ls.get('pixelActivityColorMode') === 'custom') {
                    // Use custom color
                    color = App.ls.get('pixelActivityCustomColor') || '#ff0000';
                } else {
                    color = '#ff0000'; // Default to red
                }

                circles.push({
                    x: x,
                    y: y,
                    startRadius: scale / 2,
                    startTime: Date.now(),
                    color: color
                });
            }
        };

        // Retry to reconnect every 5 seconds
        ws.onclose = () => {
            setTimeout(() => {
                ws = new WebSocket("wss://pxls.space/ws");
            }, 5000);
        };
    });

    // Function to add the keybind description to the "General" section
    function addKeybindDescription() {
        const generalSection = document.querySelector('section[data-keywords="general"]');
        if (generalSection) {
            const newKeybind = document.createElement('p');
            newKeybind.setAttribute('data-keywords', 'overlays;pixel activity;toggle;enable;disable');
            newKeybind.innerHTML = '<kbd>Z</kbd> to toggle pixel activity';
            generalSection.appendChild(newKeybind);
        } else {
            console.error('General section not found in the DOM.');
        }
    }

    // Function to add custom settings to the settings panel
    function addCustomSettings() {
        const settingsPanel = document.querySelector('#settings .panel-body');
        if (!settingsPanel) {
            console.error('Settings panel not found.');
            return;
        }

        // Create a new article for Pixel Activity settings
        const customSettingsArticle = document.createElement('article');
        customSettingsArticle.setAttribute('data-id', 'pixel-activity');
        customSettingsArticle.setAttribute('data-keywords', 'pixel activity;settings;customization');
        customSettingsArticle.innerHTML = `
            <header>
                <h3>Pixel Activity Settings</h3>
            </header>
            <div class="pad-wrapper">
                <section data-keywords="pixel activity;settings;customization">
                    <div data-keywords="enable;disable">
                        <label class="input-group">
                            <input id="setting-pixel-activity-enable" type="checkbox" ${isDrawingEnabled ? 'checked' : ''}>
                            <span class="label-text">Enable Pixel Activity</span>
                        </label>
                    </div>
                    <div data-keywords="circle color;custom color;pixel color">
                        <label class="input-group">
                            <span class="label-text">Circle Color:</span>
                            <select id="setting-pixel-activity-color-mode">
                                <option value="pixel" ${App.ls.get('pixelActivityColorMode') === 'pixel' ? 'selected' : ''}>Use Pixel Color</option>
                                <option value="custom" ${App.ls.get('pixelActivityColorMode') === 'custom' ? 'selected' : ''}>Use Custom Color</option>
                            </select>
                        </label>
                    </div>
                    <div data-keywords="custom color;circle color">
                        <label class="input-group">
                            <span class="label-text">Custom Color:</span>
                            <input type="color" id="setting-pixel-activity-custom-color" value="${App.ls.get('pixelActivityCustomColor') || '#ff0000'}">
                        </label>
                    </div>
                    <div data-keywords="opacity;circle opacity;fade">
                        <label class="input-group">
                            <span class="label-text">Circle Opacity:</span>
                            <input type="range" id="setting-pixel-activity-opacity" min="0.1" max="1" step="0.1" value="${App.ls.get('pixelActivityOpacity') || 0.5}">
                            <span class="range-text-value" id="pixel-activity-opacity-value">${(App.ls.get('pixelActivityOpacity') || 0.5) * 100}%</span>
                        </label>
                    </div>
                </section>
            </div>
        `;

        // Append the new section to the settings panel
        settingsPanel.appendChild(customSettingsArticle);

        // Add event listeners for the new settings
        document.getElementById('setting-pixel-activity-enable').addEventListener('change', (event) => {
            isDrawingEnabled = event.target.checked;
            App.ls.set('pixelActivityEnabled', isDrawingEnabled);
        });

        document.getElementById('setting-pixel-activity-color-mode').addEventListener('change', (event) => {
            const colorMode = event.target.value;
            App.ls.set('pixelActivityColorMode', colorMode);
        });

        document.getElementById('setting-pixel-activity-custom-color').addEventListener('input', (event) => {
            const customColor = event.target.value;
            App.ls.set('pixelActivityCustomColor', customColor);
        });

        document.getElementById('setting-pixel-activity-opacity').addEventListener('input', (event) => {
            const opacity = parseFloat(event.target.value);
            App.ls.set('pixelActivityOpacity', opacity);
            document.getElementById('pixel-activity-opacity-value').textContent = `${Math.round(opacity * 100)}%`;
        });
    }
})();