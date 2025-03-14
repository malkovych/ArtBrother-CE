let lastSaveTime = 0; // Зберігається в background script

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    const currentTime = Date.now();
    if (currentTime - lastSaveTime < 1000) { // Запобігаємо збереженню частіше, ніж раз на секунду
      console.log('Download request ignored: too frequent');
      return;
    }
    lastSaveTime = currentTime;

    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError.message);
      } else {
        console.log('Download started:', downloadId);
      }
    });
  }
});