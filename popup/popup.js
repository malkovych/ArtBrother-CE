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

  function sendMessageToContentScript(action, data = {}, button) {
    if (button) button.classList.add('loading');
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) {
        console.error('No active tab found');
        alert('No active tab detected. Please open a webpage.');
        if (button) button.classList.remove('loading');
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url;

      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:')) {
        alert('ArtBrother cannot run on Chrome internal pages.');
        if (button) button.classList.remove('loading');
        return;
      }

      // Безпосередня ін’єкція content script
      console.log('Injecting content script into tab:', tabId);
      chrome.scripting.executeScript({
        target: {tabId: tabId},
        files: ['content/content.js']
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('Injection failed:', chrome.runtime.lastError.message);
          alert('ArtBrother failed to analyze. Page may have restrictions. Please try refreshing or another site.');
          if (button) button.classList.remove('loading');
        } else {
          console.log('Content script injected successfully');
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {action, ...data}, (response) => {
              if (button) button.classList.remove('loading');
              if (chrome.runtime.lastError) {
                console.error('Message failed:', chrome.runtime.lastError.message);
                alert('Analysis unavailable. Page may block extensions.');
              } else {
                console.log('Message sent successfully:', response);
              }
            });
          }, 1000); // Затримка для стабільності
        }
      });
    });
  }

  const analyzeBtn = document.getElementById('analyzePalette');
  const saveTxtBtn = document.getElementById('saveTxt');
  const savePngBtn = document.getElementById('savePng');

  analyzeBtn.addEventListener('click', () => sendMessageToContentScript('analyze', {}, analyzeBtn));
  saveTxtBtn.addEventListener('click', () => sendMessageToContentScript('save', {format: 'txt'}, saveTxtBtn));
  savePngBtn.addEventListener('click', () => sendMessageToContentScript('save', {format: 'png'}, savePngBtn));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'displayPalette') {
    const paletteDisplay = document.getElementById('paletteDisplay');
    paletteDisplay.innerHTML = '';
    const colorsRow = document.createElement('div');
    colorsRow.className = 'colors-row';
    message.colors.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.title = color;
      colorsRow.appendChild(swatch);
    });
    paletteDisplay.appendChild(colorsRow);

    if (message.gradients && message.gradients.length > 0) {
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