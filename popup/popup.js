document.addEventListener('DOMContentLoaded', () => {
  if (window.EyeDropper) {
    const eyeDropper = new EyeDropper();
    document.getElementById('pickColor').addEventListener('click', async () => {
      try {
        const result = await eyeDropper.open();
        document.getElementById('currentColor').style.backgroundColor = result.sRGBHex;
        document.getElementById('colorCode').textContent = result.sRGBHex;
      } catch (e) {
        console.error('Color picker error:', e);
      }
    });
  }

  function checkContentScriptReady(tabId, action, data, button, callback) {
    chrome.tabs.sendMessage(tabId, {action: 'ping'}, (response) => {
      if (chrome.runtime.lastError || !response) {
        console.warn('Content script not responding, injecting manually...');
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          files: ['content/content.js']
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error('Manual injection failed:', chrome.runtime.lastError.message);
            alert('Failed to initialize analysis. Please refresh the page and try again.');
            if (button) button.classList.remove('loading');
          } else {
            console.log('Injection successful, waiting for initialization...');
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, {action: 'ping'}, (response) => {
                if (response && response.status === 'ready') {
                  console.log('Content script injected and ready');
                  callback(tabId, action, data, button);
                } else {
                  console.warn('Content script still not responding after injection, proceeding anyway...');
                  callback(tabId, action, data, button); // Виконуємо дію навіть без "ping"
                }
              });
            }, 1000); // Дамо час на ініціалізацію
          }
        });
      } else if (response.status === 'ready') {
        console.log('Content script is ready');
        callback(tabId, action, data, button);
      }
    });
  }

  function sendMessageToContentScript(action, data = {}, button) {
    if (button) {
      button.classList.add('loading');
    }
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) {
        console.error('No active tab found');
        alert('No active tab detected. Please open a webpage and try again.');
        if (button) button.classList.remove('loading');
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url;

      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:')) {
        alert('This extension cannot run on Chrome internal pages. Please open a regular webpage.');
        if (button) button.classList.remove('loading');
        return;
      }

      checkContentScriptReady(
        tabId,
        action,
        data,
        button,
        (tabId, action, data, button) => {
          chrome.tabs.sendMessage(tabId, {action, ...data}, (response) => {
            if (button) {
              button.classList.remove('loading');
            }
            if (chrome.runtime.lastError) {
              console.error('Send message failed:', chrome.runtime.lastError.message);
            } else {
              console.log('Message sent successfully:', response);
            }
          });
        }
      );
    });
  }

  const analyzeBtn = document.getElementById('analyzePalette');
  const saveTxtBtn = document.getElementById('saveTxt');
  const savePngBtn = document.getElementById('savePng');

  analyzeBtn.addEventListener('click', () => {
    sendMessageToContentScript('analyze', {}, analyzeBtn);
  });

  saveTxtBtn.addEventListener('click', () => {
    sendMessageToContentScript('save', {format: 'txt'}, saveTxtBtn);
  });

  savePngBtn.addEventListener('click', () => {
    sendMessageToContentScript('save', {format: 'png'}, savePngBtn);
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'displayPalette') {
    const paletteDisplay = document.getElementById('paletteDisplay');
    paletteDisplay.innerHTML = '';
    
    const colorsRow = document.createElement('div');
    colorsRow.className = 'colors-row';

    const sortedColors = message.colors.sort((a, b) => {
      const luminanceA = getLuminance(a);
      const luminanceB = getLuminance(b);
      return luminanceA - luminanceB;
    });

    sortedColors.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.title = color;
      colorsRow.appendChild(swatch);
    });

    paletteDisplay.appendChild(colorsRow);

    if (message.gradients.length > 0) {
      const gradientsSection = document.createElement('div');
      gradientsSection.className = 'gradients-section';

      const gradientsTitle = document.createElement('h4');
      gradientsTitle.textContent = 'Gradients';
      gradientsSection.appendChild(gradientsTitle);

      const gradientsRow = document.createElement('div');
      gradientsRow.className = 'gradients-row';

      message.gradients.forEach(gradient => {
        const gradientDiv = document.createElement('div');
        gradientDiv.className = 'gradient-swatch';
        gradientDiv.style.background = `linear-gradient(to right, ${gradient.join(', ')})`;
        gradientDiv.title = gradient.join(' -> ');
        
        const gradientText = document.createElement('div');
        gradientText.className = 'gradient-text';
        gradientText.textContent = gradient.join(' -> ');
        
        gradientDiv.appendChild(gradientText);
        gradientsRow.appendChild(gradientDiv);
      });

      gradientsSection.appendChild(gradientsRow);
      paletteDisplay.appendChild(gradientsSection);
    }
  }

  if (message.action === 'displayFonts') {
    const fontList = document.getElementById('fontList');
    fontList.innerHTML = '';
    message.fonts.forEach(font => {
      const li = document.createElement('li');
      li.textContent = font;
      fontList.appendChild(li);
    });
  }
});

function getLuminance(color) {
  let rgb;
  if (color.startsWith('#')) {
    rgb = hexToRgb(color);
  } else if (color.startsWith('rgba')) {
    rgb = rgbaToRgb(color);
  }
  if (!rgb) return 0;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbaToRgb(rgba) {
  const result = /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/.exec(rgba);
  return result ? {
    r: parseInt(result[1]),
    g: parseInt(result[2]),
    b: parseInt(result[3])
  } : null;
}