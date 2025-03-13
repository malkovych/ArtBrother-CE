console.log('ArtBrother content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('ArtBrother received message:', message);
  
  if (message.action === 'analyze') {
    try {
      const colors = [];
      const gradients = [];
      const fonts = new Set();

      document.querySelectorAll('*').forEach(element => {
        const style = window.getComputedStyle(element);
        if (style.backgroundColor && style.backgroundColor !== 'transparent') {
          colors.push(style.backgroundColor);
        }
        if (style.color && style.color !== 'transparent') {
          colors.push(style.color);
        }
        if (style.backgroundImage && style.backgroundImage.includes('gradient')) {
          const gradientColors = style.backgroundImage.match(/rgb[a]?\([^)]+\)|#[0-9a-fA-F]{3,6}/g) || [];
          if (gradientColors.length > 1) {
            gradients.push(gradientColors);
          }
        }
        if (style.fontFamily) {
          fonts.add(style.fontFamily.split(',')[0].trim());
        }
      });

      chrome.runtime.sendMessage({
        action: 'displayPalette',
        colors: [...new Set(colors)].slice(0, 7),
        gradients: gradients.slice(0, 3)
      });
      chrome.runtime.sendMessage({
        action: 'displayFonts',
        fonts: [...fonts].slice(0, 5)
      });
      sendResponse({status: 'analysis complete'});
    } catch (e) {
      console.error('ArtBrother analysis error:', e);
      sendResponse({status: 'error', message: e.message});
    }
    return true;
  }

  if (message.action === 'save') {
    sendResponse({status: 'save not implemented'});
    return true;
  }
});