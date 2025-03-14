console.log('ArtBrother content script loaded');

// Функція для конвертації RGB у HEX
function rgbToHex(rgb) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb; // Якщо не RGB, повертаємо як є (можливо, вже HEX)
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

// Функція для обчислення яскравості (luminance)
function getLuminance(hex) {
  const rgb = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!rgb) return 0;
  const r = parseInt(rgb[1], 16);
  const g = parseInt(rgb[2], 16);
  const b = parseInt(rgb[3], 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Функція для обчислення евклідової відстані між двома кольорами в RGB
function colorDistance(hex1, hex2) {
  const rgb1 = hex1.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  const rgb2 = hex2.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!rgb1 || !rgb2) return Infinity;
  const r1 = parseInt(rgb1[1], 16);
  const g1 = parseInt(rgb1[2], 16);
  const b1 = parseInt(rgb1[3], 16);
  const r2 = parseInt(rgb2[1], 16);
  const g2 = parseInt(rgb2[2], 16);
  const b2 = parseInt(rgb2[3], 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Функція для групування схожих кольорів із пріоритетом за частотою
function mergeSimilarColors(colors, colorFrequencies, threshold = 30) {
  const mergedColors = [];
  const used = new Set();

  // Сортуємо кольори за частотою (від більшого до меншого)
  const sortedColors = [...colors].sort((a, b) => (colorFrequencies[b] || 0) - (colorFrequencies[a] || 0));

  sortedColors.forEach((color) => {
    if (used.has(color)) return;
    let group = [color];
    used.add(color);

    for (let otherColor of sortedColors) {
      if (!used.has(otherColor) && colorDistance(color, otherColor) <= threshold) {
        group.push(otherColor);
        used.add(otherColor);
      }
    }

    // Вибираємо колір із найбільшою частотою в групі як представника
    const representative = group.sort((a, b) => (colorFrequencies[b] || 0) - (colorFrequencies[a] || 0))[0];
    mergedColors.push(representative);
  });

  return mergedColors;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('ArtBrother received message:', message);
  
  if (message.action === 'analyze') {
    try {
      const colors = [];
      const colorFrequencies = {}; // Підрахунок частоти
      const gradients = [];
      const fonts = new Set();

      // Збираємо кольори з усіх елементів
      document.querySelectorAll('*').forEach(element => {
        const style = window.getComputedStyle(element);
        if (style.backgroundColor && style.backgroundColor !== 'transparent') {
          const hexColor = rgbToHex(style.backgroundColor);
          colors.push(hexColor);
          colorFrequencies[hexColor] = (colorFrequencies[hexColor] || 0) + 1;
        }
        if (style.color && style.color !== 'transparent') {
          const hexColor = rgbToHex(style.color);
          colors.push(hexColor);
          colorFrequencies[hexColor] = (colorFrequencies[hexColor] || 0) + 1;
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

      // Додаємо білий колір вручну, якщо він є фоном сторінки
      const bodyStyle = window.getComputedStyle(document.body);
      const bodyBgColor = rgbToHex(bodyStyle.backgroundColor);
      if (bodyBgColor === '#FFFFFF' && !colors.includes('#FFFFFF')) {
        colors.push('#FFFFFF');
        colorFrequencies['#FFFFFF'] = colorFrequencies['#FFFFFF'] || 1; // Призначаємо мінімальну частоту
      }

      // Уникаємо дублювання через Set
      const uniqueColorsSet = new Set(colors);
      let uniqueColors = Array.from(uniqueColorsSet);

      // Об'єднуємо схожі кольори з урахуванням частоти
      uniqueColors = mergeSimilarColors(uniqueColors, colorFrequencies, 30);

      // Сортуємо за яскравістю і ділимо на темні та світлі
      const sortedColors = uniqueColors.sort((a, b) => getLuminance(a) - getLuminance(b));
      const darkColors = sortedColors.filter(c => getLuminance(c) < 128); // Темні (luminance < 50%)
      const lightColors = sortedColors.filter(c => getLuminance(c) >= 128); // Світлі (luminance >= 50%)

      // Вибираємо до 7 кольорів: баланс між темними і світлими
      let finalColors = [];
      const maxDark = Math.ceil(7 / 2); // До 4 темних
      const maxLight = Math.floor(7 / 2); // До 3 світлих
      finalColors = [
        ...darkColors.slice(0, maxDark), // Беремо перші темні
        ...lightColors.slice(-maxLight)  // Беремо останні світлі (включаючиa білий, якщо є)
      ].slice(0, 7);

      const limitedGradients = gradients.slice(0, 3);
      const limitedFonts = [...fonts].slice(0, 5);

      chrome.runtime.sendMessage({
        action: 'displayPalette',
        colors: finalColors,
        gradients: limitedGradients
      });
      chrome.runtime.sendMessage({
        action: 'displayFonts',
        fonts: limitedFonts
      });

      window.artBrotherData = {
        colors: finalColors,
        gradients: limitedGradients,
        fonts: limitedFonts
      };

      sendResponse({status: 'analysis complete'});
    } catch (e) {
      console.error('ArtBrother analysis error:', e);
      sendResponse({status: 'error', message: e.message});
    }
    return true;
  }

  if (message.action === 'save') {
    try {
      const data = window.artBrotherData || {colors: [], gradients: [], fonts: []};
      
      if (message.format === 'txt') {
        const txtContent = [
          'Colors:',
          data.colors.join('\n'),
          '\nGradients:',
          data.gradients.map(g => g.join(' -> ')).join('\n'),
          '\nFonts:',
          data.fonts.join('\n')
        ].join('\n');
        
        const blob = new Blob([txtContent], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        chrome.runtime.sendMessage({
          action: 'download',
          url: url,
          filename: 'ArtBrother_palette.txt'
        }, () => URL.revokeObjectURL(url));
        sendResponse({status: 'save complete'});
      } else if (message.format === 'png') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const colorHeight = 100;
        const textHeight = 20;
        const gradientHeight = 30;
        const padding = 10;
        const headerHeight = 30;
        const headerPadding = 15;
        const totalHeight = headerHeight + headerPadding +
          colorHeight +
          textHeight +
          padding +
          headerHeight + headerPadding +
          (data.gradients.length * gradientHeight) +
          padding +
          headerHeight + headerPadding +
          (data.fonts.length * textHeight);

        canvas.width = 400;
        canvas.height = totalHeight + padding * 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#000000';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Palette', padding, headerHeight);

        const colorWidth = canvas.width / data.colors.length;
        data.colors.forEach((color, i) => {
          ctx.fillStyle = color;
          ctx.fillRect(i * colorWidth, headerHeight + headerPadding, colorWidth, colorHeight);
          ctx.fillStyle = '#000000';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(color, (i * colorWidth) + (colorWidth / 2), headerHeight + headerPadding + colorHeight + textHeight);
        });

        const gradientStartY = headerHeight + headerPadding + colorHeight + textHeight + padding;
        ctx.fillStyle = '#000000';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Gradients', padding, gradientStartY + headerHeight);

        const gradientContentY = gradientStartY + headerHeight + headerPadding;
        data.gradients.forEach((gradient, i) => {
          const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
          gradient.forEach((color, j) => {
            grad.addColorStop(j / (gradient.length - 1), color);
          });
          ctx.fillStyle = grad;
          ctx.fillRect(0, gradientContentY + (i * gradientHeight), canvas.width, gradientHeight);
        });

        const fontStartY = gradientContentY + (data.gradients.length * gradientHeight) + padding;
        ctx.fillStyle = '#000000';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Fonts', padding, fontStartY + headerHeight);

        const fontContentY = fontStartY + headerHeight + headerPadding;
        ctx.font = '16px Arial';
        data.fonts.forEach((font, i) => {
          ctx.fillText(font, padding, fontContentY + (i * textHeight));
        });

        const url = canvas.toDataURL('image/png');
        chrome.runtime.sendMessage({
          action: 'download',
          url: url,
          filename: 'ArtBrother_palette.png'
        }, () => URL.revokeObjectURL(url));
        sendResponse({status: 'save complete'});
      }
    } catch (e) {
      console.error('ArtBrother save error:', e);
      sendResponse({status: 'error', message: e.message});
    }
    return true;
  }
});