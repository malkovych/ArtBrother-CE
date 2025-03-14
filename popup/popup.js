// Функція для показу повідомлення "copied" (переміщена в глобальну область)
function showCopiedMessage(element) {
  const existingMessage = element.querySelector('.copied-message');
  if (existingMessage) existingMessage.remove(); // Видаляємо попереднє повідомлення, якщо є

  const message = document.createElement('span');
  message.textContent = 'copied';
  message.className = 'copied-message';
  message.style.position = 'absolute';
  message.style.backgroundColor = '#394867';
  message.style.color = '#F1F6F9';
  message.style.padding = '4px 8px';
  message.style.borderRadius = '4px';
  message.style.fontSize = '12px';
  message.style.zIndex = '1000';

  // Позиціонування залежно від елемента
  const rect = element.getBoundingClientRect();
  message.style.left = `${rect.width / 2 - 20}px`; // Центруємо горизонтально
  message.style.top = `${rect.height + 5}px`; // Нижче елемента

  element.style.position = 'relative'; // Для правильного позиціонування повідомлення
  element.appendChild(message);

  setTimeout(() => message.remove(), 1500); // Прибираємо через 1.5 секунди
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.EyeDropper) {
    const eyeDropper = new EyeDropper();
    document.getElementById('pickColor').addEventListener('click', async () => {
      try {
        const result = await eyeDropper.open();
        const currentColor = document.getElementById('currentColor');
        const colorCode = document.getElementById('colorCode');
        currentColor.style.backgroundColor = result.sRGBHex;
        colorCode.textContent = result.sRGBHex;

        // Копіювання коду кольору при кліку на currentColor
        currentColor.addEventListener('click', () => {
          navigator.clipboard.writeText(result.sRGBHex)
            .then(() => {
              console.log('Color copied to clipboard:', result.sRGBHex);
              showCopiedMessage(currentColor);
            })
            .catch(err => console.error('Failed to copy color:', err));
        }, { once: true }); // Обробник одноразовий, оновлюється при новому виборі
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
                alert('Action unavailable. Page may block extensions.');
              } else {
                console.log('Message sent successfully:', response);
              }
            });
          }, 1000);
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
      // Копіювання коду кольору при кліку на swatch
      swatch.addEventListener('click', () => {
        navigator.clipboard.writeText(color)
          .then(() => {
            console.log('Color copied to clipboard:', color);
            showCopiedMessage(swatch);
          })
          .catch(err => console.error('Failed to copy color:', err));
      });
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