class PaletteAnalyzer {
  constructor() {
    this.colors = new Map();
    this.gradients = new Set();
    this.fonts = new Set();
    this.isSaving = false;
  }

  analyzePage() {
    try {
      document.querySelectorAll('*').forEach(element => {
        const style = window.getComputedStyle(element);
        
        if (this.isDesignElement(element, style)) {
          this.extractColor(style.color, element);
          this.extractColor(style.backgroundColor, element);
          this.extractGradient(style.backgroundImage);
        }
        this.fonts.add(style.fontFamily);
      });

      const frequentColors = this.mergeSimilarColors(
        Array.from(this.colors.entries())
          .filter(([color, count]) => count >= 3 && color !== 'rgba(0,0,0,0)')
          .map(([color, count]) => ({color, count}))
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 7)
      .map(item => item.color);

      chrome.runtime.sendMessage({
        action: 'displayPalette',
        colors: frequentColors,
        gradients: Array.from(this.gradients).map(g => {
          const [, colors] = g.split('|');
          return this.optimizeGradient(colors.split(','));
        })
      });

      chrome.runtime.sendMessage({
        action: 'displayFonts',
        fonts: Array.from(this.fonts)
      });
    } catch (e) {
      console.error('Analyze error:', e);
    }
  }

  isDesignElement(element, style) {
    const tagName = element.tagName.toLowerCase();
    const isContentImage = tagName === 'img' || 
      (style.backgroundImage && style.backgroundImage.includes('url') && !style.backgroundImage.includes('gradient'));
    const isTextContent = tagName === 'p' || tagName === 'span' || tagName === 'a' || tagName === 'li';
    
    const isAccentElement = style.color !== 'rgb(0, 0, 0)' && style.color !== 'rgba(0, 0, 0, 0)' && 
                            (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || 
                             tagName === 'button' || 
                             element.classList.contains('btn') || element.classList.contains('highlight'));

    return !isContentImage && (!isTextContent || isAccentElement) && 
           (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || 
            element.classList.contains('container') || 
            element.classList.contains('header') || 
            element.classList.contains('footer') || 
            element.parentElement === document.body || 
            isAccentElement);
  }

  extractColor(color, element) {
    if (color && (color.startsWith('rgb') || color.startsWith('#'))) {
      const normalized = this.normalizeColor(color);
      if (normalized !== 'rgba(0,0,0,0)') {
        this.colors.set(normalized, (this.colors.get(normalized) || 0) + 1);
      }
    }
  }

  extractGradient(bgImage) {
    if (bgImage && bgImage.includes('gradient')) {
      const colors = bgImage.match(/rgb[a]?\([^)]+\)|#[0-9a-fA-F]{3,6}/g);
      if (colors) {
        const uniqueGradient = `${bgImage}|${colors.join(',')}`;
        this.gradients.add(uniqueGradient);
      }
    }
  }

  normalizeColor(color) {
    if (color.startsWith('rgb')) {
      const rgb = color.match(/\d+\.?\d*/g);
      if (rgb) {
        if (color.startsWith('rgba')) {
          const alpha = parseFloat(rgb[3]);
          if (alpha === 0) return 'rgba(0,0,0,0)';
          if (alpha === 1) {
            return `#${parseInt(rgb[0]).toString(16).padStart(2, '0')}${parseInt(rgb[1]).toString(16).padStart(2, '0')}${parseInt(rgb[2]).toString(16).padStart(2, '0')}`;
          }
          return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${rgb[3]})`;
        }
        return `#${parseInt(rgb[0]).toString(16).padStart(2, '0')}${parseInt(rgb[1]).toString(16).padStart(2, '0')}${parseInt(rgb[2]).toString(16).padStart(2, '0')}`;
      }
    }
    return color;
  }

  optimizeGradient(colors) {
    return colors.reduce((acc, curr) => {
      if (acc.length === 0 || acc[acc.length - 1] !== curr) {
        acc.push(curr);
      }
      return acc;
    }, []);
  }

  mergeSimilarColors(colorEntries) {
    const threshold = 20;
    const result = [];

    while (colorEntries.length > 0) {
      const [base] = colorEntries.splice(0, 1);
      const similar = [base];

      for (let i = colorEntries.length - 1; i >= 0; i--) {
        const candidate = colorEntries[i];
        if (this.areColorsSimilar(base.color, candidate.color, threshold)) {
          similar.push(candidate);
          colorEntries.splice(i, 1);
        }
      }

      const mostFrequent = similar.reduce((prev, curr) => 
        curr.count > prev.count ? curr : prev
      );
      result.push(mostFrequent);
    }

    return result;
  }

  areColorsSimilar(color1, color2, threshold) {
    const rgb1 = this.parseColor(color1);
    const rgb2 = this.parseColor(color2);
    if (!rgb1 || !rgb2) return false;

    const diffR = Math.abs(rgb1.r - rgb2.r);
    const diffG = Math.abs(rgb1.g - rgb2.g);
    const diffB = Math.abs(rgb1.b - rgb2.b);
    
    const distance = Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB);
    return distance <= threshold;
  }

  parseColor(color) {
    if (color.startsWith('#')) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    } else if (color.startsWith('rgba')) {
      const result = /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/.exec(color);
      return result ? {
        r: parseInt(result[1]),
        g: parseInt(result[2]),
        b: parseInt(result[3])
      } : null;
    }
    return null;
  }

  savePalette(format) {
    if (this.isSaving) return;
    this.isSaving = true;

    const frequentColors = this.mergeSimilarColors(
      Array.from(this.colors.entries())
        .filter(([color, count]) => count >= 3 && color !== 'rgba(0,0,0,0)')
        .map(([color, count]) => ({color, count}))
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 7)
    .map(item => item.color);

    const paletteData = {
      colors: frequentColors,
      gradients: Array.from(this.gradients).map(g => {
        const [, colors] = g.split('|');
        return this.optimizeGradient(colors.split(','));
      }),
      fonts: Array.from(this.fonts)
    };

    try {
      if (format === 'txt') {
        const text = `Colors:\n${paletteData.colors.join('\n')}\n\nGradients:\n${paletteData.gradients.map(g => g.join(' -> ')).join('\n')}\n\nFonts:\n${paletteData.fonts.join('\n')}`;
        this.download('palette.txt', text);
      } else if (format === 'png') {
        this.saveAsPng(paletteData);
      }
    } catch (e) {
      console.error('Save error:', e);
    } finally {
      setTimeout(() => { this.isSaving = false; }, 1000);
    }
  }

  saveAsPng(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = (data.colors.length * 40) + (data.gradients.length * 40) + 20;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sortedColors = data.colors.sort((a, b) => {
      const luminanceA = this.getLuminance(a);
      const luminanceB = this.getLuminance(b);
      return luminanceA - luminanceB;
    });

    sortedColors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, i * 40, 125, 37.5);
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText(color, 135, i * 40 + 24);
    });

    data.gradients.forEach((gradient, i) => {
      const y = data.colors.length * 40 + i * 40;
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText(gradient.join(' -> '), 0, y + 24);
    });

    this.download('palette.png', canvas.toDataURL('image/png'));
  }

  getLuminance(color) {
    const rgb = this.parseColor(color);
    if (!rgb) return 0;
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
  }

  download(filename, content) {
    const blob = new Blob([content], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

const analyzer = new PaletteAnalyzer();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({status: 'ready'});
  } else if (message.action === 'analyze') {
    analyzer.analyzePage();
    sendResponse({status: 'analysis complete'});
  } else if (message.action === 'save') {
    analyzer.savePalette(message.format);
    sendResponse({status: 'save initiated'});
  }
});